"""
Admin Doctor Closure Management Router
=======================================
Allows admins to review, approve, or reject doctor account closure requests.
All endpoints require admin Cognito group membership.
"""

import logging
from typing import Dict, Any
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from middleware.auth import require_admin
from utils.dynamo import get_table, TABLE_DOCTORS, TABLE_APPOINTMENTS
from utils.audit import write_audit_log

logger = logging.getLogger("admin-closures")
router = APIRouter()


class ClosureDecisionRequest(BaseModel):
    reason: str


@router.get("/pending")
async def list_pending_closures(
    region: str = Query("us-east-1"),
    admin: Dict[str, Any] = Depends(require_admin),
):
    """List all doctors with PENDING_CLOSURE status."""
    table = get_table(TABLE_DOCTORS, region)

    response = table.scan(
        FilterExpression="closureStatus = :status",
        ExpressionAttributeValues={":status": "PENDING_CLOSURE"},
    )

    write_audit_log(
        admin["id"], "SYSTEM", "ADMIN_LIST_PENDING_CLOSURES",
        f"Listed {len(response.get('Items', []))} pending closures",
        region,
    )

    return {
        "pendingClosures": response.get("Items", []),
        "count": len(response.get("Items", [])),
    }


@router.get("/{doctor_id}")
async def get_closure_details(
    doctor_id: str,
    region: str = Query("us-east-1"),
    admin: Dict[str, Any] = Depends(require_admin),
):
    """Get doctor details and their pending appointments for closure review."""
    doctor_table = get_table(TABLE_DOCTORS, region)
    appt_table = get_table(TABLE_APPOINTMENTS, region)

    doctor_resp = doctor_table.get_item(Key={"doctorId": doctor_id})
    if "Item" not in doctor_resp:
        raise HTTPException(status_code=404, detail="Doctor not found")

    doctor = doctor_resp["Item"]
    if doctor.get("closureStatus") != "PENDING_CLOSURE":
        raise HTTPException(status_code=400, detail="Doctor does not have a pending closure request")

    appt_resp = appt_table.scan(
        FilterExpression="doctorId = :did AND #s <> :cancelled",
        ExpressionAttributeNames={"#s": "status"},
        ExpressionAttributeValues={
            ":did": doctor_id,
            ":cancelled": "CANCELLED",
        },
    )

    write_audit_log(
        admin["id"], doctor_id, "ADMIN_VIEW_CLOSURE_DETAILS",
        "Admin reviewed doctor closure request", region,
    )

    return {
        "doctor": doctor,
        "pendingAppointments": appt_resp.get("Items", []),
        "appointmentCount": len(appt_resp.get("Items", [])),
    }


@router.post("/{doctor_id}/approve")
async def approve_closure(
    doctor_id: str,
    body: ClosureDecisionRequest,
    region: str = Query("us-east-1"),
    admin: Dict[str, Any] = Depends(require_admin),
):
    """Approve a doctor's closure request. Doctor can then finalize deletion."""
    table = get_table(TABLE_DOCTORS, region)

    response = table.get_item(Key={"doctorId": doctor_id})
    if "Item" not in response:
        raise HTTPException(status_code=404, detail="Doctor not found")

    if response["Item"].get("closureStatus") != "PENDING_CLOSURE":
        raise HTTPException(status_code=400, detail="Doctor does not have a pending closure request")

    table.update_item(
        Key={"doctorId": doctor_id},
        UpdateExpression="SET closureStatus = :s, closureApprovedAt = :now, closureApprovedBy = :admin, closureReason = :reason",
        ExpressionAttributeValues={
            ":s": "APPROVED_FOR_DELETION",
            ":now": datetime.now(timezone.utc).isoformat(),
            ":admin": admin["id"],
            ":reason": body.reason,
        },
    )

    write_audit_log(
        admin["id"], doctor_id, "ADMIN_APPROVE_CLOSURE",
        f"Doctor closure approved: {body.reason}", region,
    )

    return {
        "message": "Doctor closure approved. Doctor can now finalize account deletion.",
        "doctorId": doctor_id,
    }


@router.post("/{doctor_id}/reject")
async def reject_closure(
    doctor_id: str,
    body: ClosureDecisionRequest,
    region: str = Query("us-east-1"),
    admin: Dict[str, Any] = Depends(require_admin),
):
    """Reject a doctor's closure request. Reactivates the account."""
    table = get_table(TABLE_DOCTORS, region)

    response = table.get_item(Key={"doctorId": doctor_id})
    if "Item" not in response:
        raise HTTPException(status_code=404, detail="Doctor not found")

    if response["Item"].get("closureStatus") != "PENDING_CLOSURE":
        raise HTTPException(status_code=400, detail="Doctor does not have a pending closure request")

    table.update_item(
        Key={"doctorId": doctor_id},
        UpdateExpression="SET closureStatus = :removed, verificationStatus = :s, closureRejectedAt = :now, closureRejectedBy = :admin, closureRejectionReason = :reason REMOVE closureApprovedAt, closureApprovedBy",
        ExpressionAttributeValues={
            ":removed": "REJECTED",
            ":s": "APPROVED",
            ":now": datetime.now(timezone.utc).isoformat(),
            ":admin": admin["id"],
            ":reason": body.reason,
        },
    )

    write_audit_log(
        admin["id"], doctor_id, "ADMIN_REJECT_CLOSURE",
        f"Doctor closure rejected: {body.reason}", region,
    )

    return {
        "message": "Closure request rejected. Doctor account reactivated.",
        "doctorId": doctor_id,
    }
