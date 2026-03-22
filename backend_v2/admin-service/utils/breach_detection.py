"""
Breach Detection -- Python port of shared/breach-detection.ts
===============================================================
Rate-based anomaly detection (50 PHI accesses in 5 minutes) plus
9 known security event types. Publishes alerts via SNS and the
SQS event bus. All operations are non-throwing (graceful degradation).
"""

import os
import time
import json
import logging
from datetime import datetime, timezone
from typing import Optional

import boto3
from botocore.config import Config

from utils.event_bus import publish_event, EventType

logger = logging.getLogger("breach-detection")

_aws_config = Config(retries={"max_attempts": 3, "mode": "standard"})

# --- Configuration ---

BREACH_THRESHOLD = 50  # More than 50 PHI accesses in 5 minutes is suspicious
WINDOW_MS = 5 * 60 * 1000  # 5 minutes in milliseconds

BREACH_ACTIONS = {
    "HIPAA_VIOLATION_ATTEMPT",
    "HIJACK_ATTEMPT",
    "FRAUD_ATTEMPT",
    "SPOOF_ATTEMPT",
    "UNAUTHORIZED_BILLING_ACCESS",
    "ILLEGAL_ANALYTICS_ACCESS",
    "ILLEGAL_ACCESS_ATTEMPT",
    "AUTH_FAILURE",
    "EMERGENCY_ACCESS_GRANTED",
}

# In-memory rate tracking for breach detection
_access_counts: dict = {}  # {actor_id: {"count": int, "first_seen": float (ms)}}


# --- SNS Client Cache ---

_sns_clients: dict = {}


def _get_sns_client(region: str = "us-east-1"):
    """Returns a cached boto3 SNS client for the given region."""
    normalized = _normalize_region(region)
    if normalized not in _sns_clients:
        _sns_clients[normalized] = boto3.client(
            "sns", region_name=normalized, config=_aws_config
        )
    return _sns_clients[normalized]


def _normalize_region(region: str = "us-east-1") -> str:
    """Normalize region string to AWS region."""
    r = (region or "us-east-1").upper()
    return "eu-central-1" if r in ("EU", "EU-CENTRAL-1") else "us-east-1"


# --- Core Functions ---

async def check_for_breach(
    actor_id: str,
    action: str,
    details: str,
    region: Optional[str] = None,
) -> None:
    """
    Check if an action constitutes a breach or rate anomaly.

    1. If action is a known security event -> immediate SNS alert + event bus publish
    2. Otherwise, track PHI access rate per actor. If threshold exceeded -> alert.

    Non-throwing: all errors are logged and swallowed.
    """
    try:
        # 1. Check if action is a known security event
        if action in BREACH_ACTIONS:
            await _send_breach_alert(actor_id, action, details, "SECURITY_EVENT", region)
            try:
                await publish_event(
                    EventType.BREACH_ALERT,
                    {
                        "actorId": actor_id,
                        "action": action,
                        "details": details,
                        "alertType": "SECURITY_EVENT",
                    },
                    region or "us-east-1",
                )
            except Exception:
                pass
            return

        # 2. Rate-based anomaly detection
        now = int(time.time() * 1000)  # milliseconds
        entry = _access_counts.get(actor_id)

        if entry:
            if now - entry["first_seen"] > WINDOW_MS:
                # Reset window
                _access_counts[actor_id] = {"count": 1, "first_seen": now}
            else:
                entry["count"] += 1
                if entry["count"] >= BREACH_THRESHOLD:
                    elapsed_s = round((now - entry["first_seen"]) / 1000)
                    await _send_breach_alert(
                        actor_id,
                        action,
                        f"Excessive PHI access: {entry['count']} operations in {elapsed_s}s",
                        "RATE_ANOMALY",
                        region,
                    )
                    try:
                        await publish_event(
                            EventType.PHI_ACCESS,
                            {
                                "actorId": actor_id,
                                "action": action,
                                "accessCount": entry["count"],
                                "alertType": "RATE_ANOMALY",
                            },
                            region or "us-east-1",
                        )
                    except Exception:
                        pass
                    # Reset after alert
                    del _access_counts[actor_id]
        else:
            _access_counts[actor_id] = {"count": 1, "first_seen": now}

    except Exception as e:
        logger.error(f"[BREACH DETECTION] Error checking for breach: {e}")


async def _send_breach_alert(
    actor_id: str,
    action: str,
    details: str,
    alert_type: str,
    region: Optional[str] = None,
) -> None:
    """
    Send a breach alert via SNS. Non-throwing: logs and returns on failure.
    Uses SNS_BREACH_ARN or BREACH_NOTIFICATION_SNS_ARN env var.
    """
    sns_topic_arn = os.getenv("SNS_BREACH_ARN") or os.getenv("BREACH_NOTIFICATION_SNS_ARN")
    if not sns_topic_arn:
        logger.error(
            f"[BREACH ALERT] SNS not configured. Alert: "
            f"actor={actor_id[:8] if actor_id else 'unknown'}... "
            f"action={action} type={alert_type} details={details}"
        )
        return

    try:
        target_region = _normalize_region(region) if region else (
            os.getenv("AWS_REGION", "us-east-1")
        )
        sns = _get_sns_client(target_region)

        severity = "CRITICAL" if action in BREACH_ACTIONS else "HIGH"

        sns.publish(
            TopicArn=sns_topic_arn,
            Subject=f"[MediConnect BREACH ALERT] {alert_type}: {action}",
            Message=json.dumps(
                {
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "alertType": alert_type,
                    "actorId": (actor_id[:8] + "...") if actor_id else "unknown",
                    "action": action,
                    "details": details,
                    "region": region or "unknown",
                    "severity": severity,
                },
                indent=2,
            ),
        )
    except Exception as e:
        logger.error(f"[BREACH ALERT] Failed to send SNS notification: {e}")
