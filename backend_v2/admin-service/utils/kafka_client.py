"""
Kafka Client for Python Services (Admin + DICOM)

Feature-flagged: KAFKA_ENABLED=true activates Kafka path.
Production: MSK Serverless with IAM auth.
Local dev: Plain Kafka on localhost:9092.
"""

import os
import json
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any

logger = logging.getLogger("kafka-client")

KAFKA_ENABLED = os.environ.get("KAFKA_ENABLED", "false").lower() == "true"
KAFKA_BROKER = os.environ.get("KAFKA_BROKER", "localhost:9092")
IS_PRODUCTION = os.environ.get("NODE_ENV", "") == "production"

# Topic mapping (matches Node.js shared/kafka.ts)
KAFKA_TOPICS = {
    "APPOINTMENTS": "mediconnect.appointments",
    "CLINICAL": "mediconnect.clinical",
    "VITALS": "mediconnect.vitals",
    "PAYMENTS": "mediconnect.payments",
    "PATIENTS": "mediconnect.patients",
    "AUDIT": "mediconnect.audit",
    "SUBSCRIPTIONS": "mediconnect.subscriptions",
}

EVENT_TOPIC_MAP = {
    "audit.": "AUDIT",
    "security.": "AUDIT",
    "clinical.": "CLINICAL",
    "appointment.": "APPOINTMENTS",
    "patient.": "PATIENTS",
    "consent.": "PATIENTS",
    "subscription.": "SUBSCRIPTIONS",
    "payout.": "PAYMENTS",
}

_producer = None


def _get_topic(event_type: str) -> str:
    """Map event type to Kafka topic."""
    for prefix, topic_key in EVENT_TOPIC_MAP.items():
        if event_type.startswith(prefix):
            return KAFKA_TOPICS[topic_key]
    return KAFKA_TOPICS["AUDIT"]


async def publish_to_kafka(
    event_type: str,
    payload: Dict[str, Any],
    region: str = "us-east-1",
) -> bool:
    """
    Publish event to Kafka topic.
    Returns True if published, False if Kafka disabled or failed.
    """
    if not KAFKA_ENABLED:
        return False

    try:
        from aiokafka import AIOKafkaProducer

        global _producer
        if _producer is None:
            _producer = AIOKafkaProducer(
                bootstrap_servers=KAFKA_BROKER,
                value_serializer=lambda v: json.dumps(v).encode("utf-8"),
                key_serializer=lambda k: k.encode("utf-8") if k else None,
            )
            await _producer.start()

        topic = _get_topic(event_type)
        key = payload.get("patientId") or payload.get("doctorId") or event_type
        message = {
            "eventType": event_type,
            "payload": payload,
            "_metadata": {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "region": region,
                "source": "mediconnect-python",
            },
        }

        await _producer.send_and_wait(topic, value=message, key=key)
        logger.info(f"Kafka published: {event_type} → {topic}")
        return True

    except Exception as e:
        logger.error(f"Kafka publish failed for {event_type}: {e}")
        return False


async def disconnect_kafka():
    """Graceful shutdown."""
    global _producer
    if _producer:
        await _producer.stop()
        _producer = None
