"""
Admin User Management Router
=============================
Provides admin-level CRUD for patients and doctors.
All endpoints require admin Cognito group membership.
"""

import logging
from typing import Dict, Any, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from middleware.auth import require_admin
from utils.dynamo import get_table, TABLE_PATIENTS, TABLE_DOCTORS, TABLE_APPOINTMENTS
from utils.audit import write_audit_log

logger = logging.getLogger("admin-users")
router = APIRouter()


# ─── Request / Response Models ────────────────────────────────────────────

class SuspendRequest(BaseModel):
    reason: str

class ReactivateRequest(BaseModel):
    reason: str


# ─── PATIENT MANAGEMENT ──────────────────────────────────────────────────

@router.get("/patients")
async def list_patients(
    region: str = Query("us-east-1"),
    limit: int = Query(50, ge=1, le=100),
    start_key: Optional[str] = None,
    admin: Dict[str, Any] = Depends(require_admin),
):
    """List all patients with pagination."""
    table = get_table(TABLE_PATIENTS, region)

    scan_kwargs = {"Limit": limit}
    if start_key:
        import json
        try:
            scan_kwargs["ExclusiveStartKey"] = json.loads(start_key)
        except Exception:
            pass

    response = table.scan(**scan_kwargs)

    write_audit_log(
        admin["id"], "SYSTEM", "ADMIN_LIST_PATIENTS",
        f"Listed {len(response.get('Items', []))} patients",
        region, {"limit": limit}
    )

    return {
        "patients": response.get("Items", []),
        "count": len(response.get("Items", [])),
        "lastEvaluatedKey": response.get("LastEvaluatedKey"),
    }


@router.get("/patients/{patient_id}")
async def get_patient(
    patient_id: str,
    region: str = Query("us-east-1"),
    admin: Dict[str, Any] = Depends(require_admin),
):
    """Get detailed patient profile."""
    table = get_table(TABLE_PATIENTS, region)
    response = table.get_item(Key={"patientId": patient_id})

    if "Item" not in response:
        raise HTTPException(status_code=404, detail="Patient not found")

    write_audit_log(
        admin["id"], patient_id, "ADMIN_VIEW_PATIENT",
        "Admin viewed patient record", region
    )

    return response["Item"]


@router.post("/patients/{patient_id}/suspend")
async def suspend_patient(
    patient_id: str,
    body: SuspendRequest,
    region: str = Query("us-east-1"),
    admin: Dict[str, Any] = Depends(require_admin),
):
    """Suspend a patient account. Sets status to SUSPENDED."""
    table = get_table(TABLE_PATIENTS, region)

    response = table.get_item(Key={"patientId": patient_id})
    if "Item" not in response:
        raise HTTPException(status_code=404, detail="Patient not found")

    if response["Item"].get("status") == "DELETED":
        raise HTTPException(status_code=400, detail="Cannot suspend a deleted account")

    table.update_item(
        Key={"patientId": patient_id},
        UpdateExpression="SET #s = :s, suspendedAt = :now, suspendedBy = :admin, suspendReason = :reason",
        ExpressionAttributeNames={"#s": "status"},
        ExpressionAttributeValues={
            ":s": "SUSPENDED",
            ":now": datetime.now(timezone.utc).isoformat(),
            ":admin": admin["id"],
            ":reason": body.reason,
        },
    )

    write_audit_log(
        admin["id"], patient_id, "ADMIN_SUSPEND_PATIENT",
        f"Patient suspended: {body.reason}", region
    )

    return {"message": "Patient account suspended", "patientId": patient_id}


@router.post("/patients/{patient_id}/reactivate")
async def reactivate_patient(
    patient_id: str,
    body: ReactivateRequest,
    region: str = Query("us-east-1"),
    admin: Dict[str, Any] = Depends(require_admin),
):
    """Reactivate a suspended patient account."""
    table = get_table(TABLE_PATIENTS, region)

    response = table.get_item(Key={"patientId": patient_id})
    if "Item" not in response:
        raise HTTPException(status_code=404, detail="Patient not found")

    if response["Item"].get("status") != "SUSPENDED":
        raise HTTPException(status_code=400, detail="Patient is not suspended")

    table.update_item(
        Key={"patientId": patient_id},
        UpdateExpression="SET #s = :s, reactivatedAt = :now, reactivatedBy = :admin REMOVE suspendedAt, suspendedBy, suspendReason",
        ExpressionAttributeNames={"#s": "status"},
        ExpressionAttributeValues={
            ":s": "ACTIVE",
            ":now": datetime.now(timezone.utc).isoformat(),
            ":admin": admin["id"],
        },
    )

    write_audit_log(
        admin["id"], patient_id, "ADMIN_REACTIVATE_PATIENT",
        f"Patient reactivated: {body.reason}", region
    )

    return {"message": "Patient account reactivated", "patientId": patient_id}


# ─── DOCTOR MANAGEMENT ───────────────────────────────────────────────────

@router.get("/doctors")
async def list_doctors(
    region: str = Query("us-east-1"),
    limit: int = Query(50, ge=1, le=100),
    start_key: Optional[str] = None,
    admin: Dict[str, Any] = Depends(require_admin),
):
    """List all doctors with pagination."""
    table = get_table(TABLE_DOCTORS, region)

    scan_kwargs = {"Limit": limit}
    if start_key:
        import json
        try:
            scan_kwargs["ExclusiveStartKey"] = json.loads(start_key)
        except Exception:
            pass

    response = table.scan(**scan_kwargs)

    write_audit_log(
        admin["id"], "SYSTEM", "ADMIN_LIST_DOCTORS",
        f"Listed {len(response.get('Items', []))} doctors",
        region, {"limit": limit}
    )

    return {
        "doctors": response.get("Items", []),
        "count": len(response.get("Items", [])),
        "lastEvaluatedKey": response.get("LastEvaluatedKey"),
    }


@router.get("/doctors/{doctor_id}")
async def get_doctor(
    doctor_id: str,
    region: str = Query("us-east-1"),
    admin: Dict[str, Any] = Depends(require_admin),
):
    """Get detailed doctor profile."""
    table = get_table(TABLE_DOCTORS, region)
    response = table.get_item(Key={"doctorId": doctor_id})

    if "Item" not in response:
        raise HTTPException(status_code=404, detail="Doctor not found")

    write_audit_log(
        admin["id"], doctor_id, "ADMIN_VIEW_DOCTOR",
        "Admin viewed doctor record", region
    )

    return response["Item"]


@router.post("/doctors/{doctor_id}/suspend")
async def suspend_doctor(
    doctor_id: str,
    body: SuspendRequest,
    region: str = Query("us-east-1"),
    admin: Dict[str, Any] = Depends(require_admin),
):
    """Suspend a doctor account."""
    table = get_table(TABLE_DOCTORS, region)

    response = table.get_item(Key={"doctorId": doctor_id})
    if "Item" not in response:
        raise HTTPException(status_code=404, detail="Doctor not found")

    table.update_item(
        Key={"doctorId": doctor_id},
        UpdateExpression="SET verificationStatus = :s, suspendedAt = :now, suspendedBy = :admin, suspendReason = :reason",
        ExpressionAttributeValues={
            ":s": "SUSPENDED",
            ":now": datetime.now(timezone.utc).isoformat(),
            ":admin": admin["id"],
            ":reason": body.reason,
        },
    )

    write_audit_log(
        admin["id"], doctor_id, "ADMIN_SUSPEND_DOCTOR",
        f"Doctor suspended: {body.reason}", region
    )

    return {"message": "Doctor account suspended", "doctorId": doctor_id}


@router.post("/doctors/{doctor_id}/reactivate")
async def reactivate_doctor(
    doctor_id: str,
    body: ReactivateRequest,
    region: str = Query("us-east-1"),
    admin: Dict[str, Any] = Depends(require_admin),
):
    """Reactivate a suspended doctor account."""
    table = get_table(TABLE_DOCTORS, region)

    response = table.get_item(Key={"doctorId": doctor_id})
    if "Item" not in response:
        raise HTTPException(status_code=404, detail="Doctor not found")

    table.update_item(
        Key={"doctorId": doctor_id},
        UpdateExpression="SET verificationStatus = :s, reactivatedAt = :now, reactivatedBy = :admin REMOVE suspendedAt, suspendedBy, suspendReason",
        ExpressionAttributeValues={
            ":s": "APPROVED",
            ":now": datetime.now(timezone.utc).isoformat(),
            ":admin": admin["id"],
        },
    )

    write_audit_log(
        admin["id"], doctor_id, "ADMIN_REACTIVATE_DOCTOR",
        f"Doctor reactivated: {body.reason}", region
    )

    return {"message": "Doctor account reactivated", "doctorId": doctor_id}
