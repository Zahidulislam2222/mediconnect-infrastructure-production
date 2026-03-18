"""
Audit Logger for Admin Service
================================
Matches the Node.js shared/audit.ts writeAuditLog() pattern.
All admin actions are logged for HIPAA compliance.
"""

import os
import uuid
import logging
from datetime import datetime, timezone
import boto3

logger = logging.getLogger("admin-audit")

TABLE_AUDIT = os.getenv("TABLE_AUDIT", "mediconnect-audit-logs")


def write_audit_log(
    actor_id: str,
    target_id: str,
    action: str,
    description: str,
    region: str = "us-east-1",
    metadata: dict = None,
):
    """Write an audit log entry to DynamoDB."""
    try:
        normalized = "eu-central-1" if region.upper() in ("EU", "EU-CENTRAL-1") else "us-east-1"
        db = boto3.resource("dynamodb", region_name=normalized)
        table = db.Table(TABLE_AUDIT)

        item = {
            "logId": str(uuid.uuid4()),
            "actorId": actor_id,
            "targetId": target_id,
            "action": action,
            "description": description,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "service": "admin-service",
            "region": region,
        }

        if metadata:
            item["metadata"] = metadata

        table.put_item(Item=item)
        logger.info(f"[AUDIT] {action}: {actor_id} -> {target_id}")

    except Exception as e:
        logger.error(f"Audit log write failed: {e}")
