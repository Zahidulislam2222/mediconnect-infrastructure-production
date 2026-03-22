"""
Audit Logger for Admin Service
================================
Matches the Node.js shared/audit.ts writeAuditLog() pattern.
All admin actions are logged for HIPAA compliance.
Integrated with SQS event bus and breach detection.
"""

import os
import uuid
import asyncio
import logging
from datetime import datetime, timezone
import boto3

from utils.event_bus import publish_event, EventType
from utils.breach_detection import check_for_breach

logger = logging.getLogger("admin-audit")

TABLE_AUDIT = os.getenv("TABLE_AUDIT", "mediconnect-audit-logs")


async def write_audit_log(
    actor_id: str,
    target_id: str,
    action: str,
    description: str,
    region: str = "us-east-1",
    metadata: dict = None,
):
    """Write an audit log entry to DynamoDB, then publish to event bus and check for breaches."""
    try:
        normalized = "eu-central-1" if region.upper() in ("EU", "EU-CENTRAL-1") else "us-east-1"
        db = boto3.resource("dynamodb", region_name=normalized)
        table = db.Table(TABLE_AUDIT)

        log_id = str(uuid.uuid4())
        timestamp = datetime.now(timezone.utc).isoformat()

        item = {
            "logId": log_id,
            "actorId": actor_id,
            "targetId": target_id,
            "action": action,
            "description": description,
            "timestamp": timestamp,
            "service": "admin-service",
            "region": region,
        }

        if metadata:
            item["metadata"] = metadata

        table.put_item(Item=item)
        logger.info(f"[AUDIT] {action}: {actor_id} -> {target_id}")

        # Fire-and-forget: publish to SQS event bus
        asyncio.ensure_future(
            publish_event(
                EventType.AUDIT_LOG,
                {
                    "logId": log_id,
                    "actorId": actor_id,
                    "targetId": target_id,
                    "action": action,
                    "description": description,
                    "timestamp": timestamp,
                    "service": "admin-service",
                },
                region,
                {"source": "admin-service", "userId": actor_id},
            )
        )

        # Fire-and-forget: check for breach patterns
        asyncio.ensure_future(
            check_for_breach(actor_id, action, description, region)
        )

    except Exception as e:
        logger.error(f"Audit log write failed: {e}")
