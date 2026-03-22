"""
SQS Event Bus -- Python port of shared/event-bus.ts
=====================================================
Cross-service event publishing via SQS with DLQ support.
Graceful degradation: logs locally if SQS queue unavailable.

Usage:
    from utils.event_bus import publish_event, EventType
    await publish_event(EventType.AUDIT_LOG, {"actorId": ..., "action": ...}, region)
"""

import os
import json
import time
import uuid
import logging
from enum import Enum
from typing import Optional, Dict, Any, List

import boto3
from botocore.config import Config

logger = logging.getLogger("event-bus")


# --- SQS Client Factory (follows same pattern as dynamo.py) ---

_sqs_clients: Dict[str, Any] = {}

_aws_config = Config(
    retries={"max_attempts": 3, "mode": "standard"},
    connect_timeout=5,
    read_timeout=5,
)


def _normalize_region(region: str = "us-east-1") -> str:
    """Normalize region string to AWS region. Same logic as Node.js normalizeRegion()."""
    r = (region or "us-east-1").upper()
    return "eu-central-1" if r in ("EU", "EU-CENTRAL-1") else "us-east-1"


def _get_sqs_client(region: str = "us-east-1"):
    """Returns a cached boto3 SQS client for the given region."""
    target = _normalize_region(region)
    if target not in _sqs_clients:
        _sqs_clients[target] = boto3.client(
            "sqs", region_name=target, config=_aws_config
        )
    return _sqs_clients[target]


# --- Event Types ---

class EventType(str, Enum):
    """Event types matching Node.js EventType enum values."""
    # Audit & Compliance
    AUDIT_LOG = "audit.log"
    BREACH_ALERT = "security.breach_alert"
    PHI_ACCESS = "security.phi_access"

    # Clinical Events
    PRESCRIPTION_ISSUED = "clinical.prescription_issued"
    PRESCRIPTION_DISPENSED = "clinical.prescription_dispensed"
    PRESCRIPTION_CANCELLED = "clinical.prescription_cancelled"
    DRUG_INTERACTION_DETECTED = "clinical.drug_interaction"
    LAB_RESULT_READY = "clinical.lab_result"
    VITAL_ALERT = "clinical.vital_alert"

    # Appointment Events
    APPOINTMENT_BOOKED = "appointment.booked"
    APPOINTMENT_CANCELLED = "appointment.cancelled"
    APPOINTMENT_COMPLETED = "appointment.completed"
    APPOINTMENT_REMINDER = "appointment.reminder"

    # Patient Events
    PATIENT_REGISTERED = "patient.registered"
    PATIENT_UPDATED = "patient.updated"
    PATIENT_DELETED = "patient.deleted"
    CONSENT_UPDATED = "consent.updated"

    # HL7 Integration
    HL7_MESSAGE_RECEIVED = "hl7.message_received"
    HL7_MESSAGE_PROCESSED = "hl7.message_processed"

    # Doctor Events
    DOCTOR_REGISTERED = "patient.doctor_registered"
    DOCTOR_DELETED = "patient.doctor_deleted"

    # System Events
    SERVICE_HEALTH_CHANGE = "system.health_change"
    FAILOVER_TRIGGERED = "system.failover"


# --- Queue Configuration ---

QUEUE_MAP = {
    "audit": {
        "queueName": "mediconnect-audit-events",
        "envVar": "SQS_AUDIT_QUEUE_URL",
        "dlqName": "mediconnect-audit-events-dlq",
    },
    "clinical": {
        "queueName": "mediconnect-clinical-events",
        "envVar": "SQS_CLINICAL_QUEUE_URL",
        "dlqName": "mediconnect-clinical-events-dlq",
    },
    "appointment": {
        "queueName": "mediconnect-appointment-events",
        "envVar": "SQS_APPOINTMENT_QUEUE_URL",
        "dlqName": "mediconnect-appointment-events-dlq",
    },
    "patient": {
        "queueName": "mediconnect-patient-events",
        "envVar": "SQS_PATIENT_QUEUE_URL",
        "dlqName": "mediconnect-patient-events-dlq",
    },
    "security": {
        "queueName": "mediconnect-security-events",
        "envVar": "SQS_SECURITY_QUEUE_URL",
        "dlqName": "mediconnect-security-events-dlq",
    },
    "system": {
        "queueName": "mediconnect-system-events",
        "envVar": "SQS_SYSTEM_QUEUE_URL",
        "dlqName": "mediconnect-system-events-dlq",
    },
}


def _get_queue_category(event_type: EventType) -> str:
    """Map event type to queue category. Same logic as Node.js getQueueCategory()."""
    value = event_type.value
    if value.startswith("audit."):
        return "audit"
    if value.startswith("security."):
        return "security"
    if value.startswith("clinical."):
        return "clinical"
    if value.startswith("appointment."):
        return "appointment"
    if value.startswith("patient.") or value.startswith("consent."):
        return "patient"
    if value.startswith("hl7."):
        return "clinical"
    return "system"


# --- Queue URL Resolution (cached) ---

_queue_url_cache: Dict[str, str] = {}


async def _resolve_queue_url(category: str, region: str) -> Optional[str]:
    """Resolve the SQS queue URL for a given category and region."""
    config = QUEUE_MAP.get(category)
    if not config:
        return None

    # Check env var first
    env_url = os.getenv(config["envVar"])
    if env_url:
        return env_url

    # Check cache
    cache_key = f"{region}:{category}"
    if cache_key in _queue_url_cache:
        return _queue_url_cache[cache_key]

    # Resolve from SQS
    try:
        sqs = _get_sqs_client(region)
        result = sqs.get_queue_url(QueueName=config["queueName"])
        url = result.get("QueueUrl")
        if url:
            _queue_url_cache[cache_key] = url
            return url
    except Exception:
        # Queue may not exist yet -- graceful degradation
        pass

    return None


# --- Helpers ---

def _generate_correlation_id() -> str:
    """Generate a correlation ID matching the Node.js pattern."""
    return f"evt-{int(time.time() * 1000)}-{uuid.uuid4().hex[:8]}"


# --- Core Event Publisher ---

async def publish_event(
    event_type: EventType,
    payload: Dict[str, Any],
    region: str = "us-east-1",
    meta: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Publish an event to the SQS event pipeline.
    Gracefully degrades: if SQS is unavailable, logs locally.

    Returns:
        {"published": True, "messageId": ..., "queueCategory": ...} on success
        {"published": False, "queueCategory": ..., "fallback": "local_log"|"error"} on failure
    """
    category = _get_queue_category(event_type)
    normalized_region = _normalize_region(region)
    meta = meta or {}

    message = {
        "eventType": event_type.value,
        "category": category,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime()),
        "region": normalized_region,
        "source": meta.get("source") or os.getenv("SERVICE_NAME", "unknown"),
        "correlationId": meta.get("correlationId") or _generate_correlation_id(),
        "payload": payload,
        "meta": {
            "ipAddress": meta.get("ipAddress"),
            "userId": meta.get("userId"),
        },
    }

    try:
        queue_url = await _resolve_queue_url(category, normalized_region)
        if not queue_url:
            # Graceful degradation: log locally
            logger.info(
                f"[EVENT_BUS] No queue for {category}. Event logged locally: {event_type.value}"
            )
            return {"published": False, "queueCategory": category, "fallback": "local_log"}

        sqs = _get_sqs_client(normalized_region)

        send_kwargs: Dict[str, Any] = {
            "QueueUrl": queue_url,
            "MessageBody": json.dumps(message),
            "MessageAttributes": {
                "eventType": {"DataType": "String", "StringValue": event_type.value},
                "category": {"DataType": "String", "StringValue": category},
                "region": {"DataType": "String", "StringValue": normalized_region},
                "source": {"DataType": "String", "StringValue": message["source"]},
            },
        }

        # FIFO queue support
        if queue_url.endswith(".fifo"):
            send_kwargs["MessageGroupId"] = category
            send_kwargs["MessageDeduplicationId"] = (
                f"{message['correlationId']}-{int(time.time() * 1000)}"
            )

        result = sqs.send_message(**send_kwargs)

        return {
            "published": True,
            "messageId": result.get("MessageId"),
            "queueCategory": category,
        }

    except Exception as e:
        logger.error(f"[EVENT_BUS] Publish failed for {event_type.value}: {e}")
        return {"published": False, "queueCategory": category, "fallback": "error"}


async def publish_events(
    events: List[Dict[str, Any]],
    region: str = "us-east-1",
    meta: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    """
    Publish multiple events (convenience wrapper).
    Each item should have {"type": EventType, "payload": dict}.
    """
    results = []
    for event in events:
        result = await publish_event(event["type"], event["payload"], region, meta)
        results.append(result)
    return results


def get_queue_configs() -> Dict[str, Any]:
    """Get queue configuration for infrastructure provisioning."""
    return {**QUEUE_MAP}
