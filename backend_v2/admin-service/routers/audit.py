"""
Admin Audit Log Viewer
=======================
HIPAA compliance: Provides read-only access to audit logs.
Only admin users can view audit trails.
"""

import logging
from typing import Dict, Any, Optional
from fastapi import APIRouter, Depends, Query, HTTPException
from boto3.dynamodb.conditions import Attr

from middleware.auth import require_admin
from utils.dynamo import get_table, TABLE_AUDIT
from utils.audit import write_audit_log

logger = logging.getLogger("admin-audit")
router = APIRouter()


@router.get("/logs")
async def get_audit_logs(
    region: str = Query("us-east-1"),
    actor_id: Optional[str] = Query(None, description="Filter by actor ID"),
    action: Optional[str] = Query(None, description="Filter by action type"),
    limit: int = Query(50, ge=1, le=200),
    start_key: Optional[str] = None,
    admin: Dict[str, Any] = Depends(require_admin),
):
    """
    Query audit logs with optional filters.
    Returns most recent entries first.
    """
    table = get_table(TABLE_AUDIT, region)

    scan_kwargs = {"Limit": limit}

    # Build filter expression
    filter_parts = []
    if actor_id:
        filter_parts.append(Attr("actorId").eq(actor_id))
    if action:
        filter_parts.append(Attr("action").eq(action))

    if filter_parts:
        combined = filter_parts[0]
        for fp in filter_parts[1:]:
            combined = combined & fp
        scan_kwargs["FilterExpression"] = combined

    if start_key:
        import json
        try:
            scan_kwargs["ExclusiveStartKey"] = json.loads(start_key)
        except Exception:
            pass

    response = table.scan(**scan_kwargs)

    # Sort by timestamp descending (DynamoDB scan doesn't guarantee order)
    items = response.get("Items", [])
    items.sort(key=lambda x: x.get("timestamp", ""), reverse=True)

    await write_audit_log(
        admin["id"], "SYSTEM", "ADMIN_VIEW_AUDIT_LOGS",
        f"Admin queried audit logs (filters: actor={actor_id}, action={action})",
        region
    )

    return {
        "logs": items,
        "count": len(items),
        "lastEvaluatedKey": response.get("LastEvaluatedKey"),
    }


@router.get("/logs/actions")
async def get_audit_action_types(
    admin: Dict[str, Any] = Depends(require_admin),
):
    """
    Returns all known audit action types for filter dropdown.
    """
    return {
        "actions": [
            "CREATE_PROFILE", "UPDATE_PROFILE", "DELETE_PROFILE",
            "READ_PROFILE", "READ_PATIENT_BY_ID",
            "IDENTITY_VERIFIED", "CONSENT_FAILURE",
            "CREATE_BOOKING", "CANCEL_BOOKING", "UPDATE_APPOINTMENT",
            "PATIENT_CHECK_IN", "APPOINTMENT_STATUS_CHANGE",
            "READ_APPOINTMENTS", "READ_SCHEDULE", "READ_BILLING",
            "PAYMENT_SUBMITTED", "HIPAA_VIOLATION_ATTEMPT",
            "HIJACK_ATTEMPT", "FRAUD_ATTEMPT", "SPOOF_ATTEMPT",
            "UNAUTHORIZED_BILLING_ACCESS", "ILLEGAL_ANALYTICS_ACCESS",
            "AUTH_FAILURE", "SYMPTOM_CHECK", "IMAGE_ANALYSIS",
            "ADMIN_SUSPEND_PATIENT", "ADMIN_SUSPEND_DOCTOR",
            "ADMIN_REACTIVATE_PATIENT", "ADMIN_REACTIVATE_DOCTOR",
            "ADMIN_VIEW_OVERVIEW", "ADMIN_VIEW_REVENUE",
        ]
    }


@router.get("/logs/user/{user_id}")
async def get_user_audit_trail(
    user_id: str,
    region: str = Query("us-east-1"),
    limit: int = Query(100, ge=1, le=500),
    admin: Dict[str, Any] = Depends(require_admin),
):
    """
    Get complete audit trail for a specific user.
    Used for HIPAA compliance investigations.
    """
    table = get_table(TABLE_AUDIT, region)

    # Search both actorId and targetId
    response = table.scan(
        FilterExpression=Attr("actorId").eq(user_id) | Attr("targetId").eq(user_id),
        Limit=limit,
    )

    items = response.get("Items", [])
    items.sort(key=lambda x: x.get("timestamp", ""), reverse=True)

    await write_audit_log(
        admin["id"], user_id, "ADMIN_VIEW_USER_AUDIT_TRAIL",
        f"Admin viewed audit trail for user {user_id[:8]}...",
        region
    )

    return {
        "userId": user_id,
        "logs": items,
        "count": len(items),
    }
