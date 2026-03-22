"""
Admin Analytics Router
=======================
System-wide aggregate analytics for admin dashboard.
All data is anonymized — no PII is exposed.
"""

import logging
from typing import Dict, Any
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, Query
from boto3.dynamodb.conditions import Attr

from middleware.auth import require_admin
from utils.dynamo import get_table, TABLE_PATIENTS, TABLE_DOCTORS, TABLE_APPOINTMENTS, TABLE_TRANSACTIONS
from utils.audit import write_audit_log

logger = logging.getLogger("admin-analytics")
router = APIRouter()


@router.get("/overview")
async def platform_overview(
    region: str = Query("us-east-1"),
    admin: Dict[str, Any] = Depends(require_admin),
):
    """
    Platform-wide statistics overview.
    Returns aggregate counts — no PII exposed.
    """
    patient_table = get_table(TABLE_PATIENTS, region)
    doctor_table = get_table(TABLE_DOCTORS, region)
    appt_table = get_table(TABLE_APPOINTMENTS, region)

    # Count patients (active vs total)
    patient_scan = patient_table.scan(
        Select="COUNT",
    )
    total_patients = patient_scan.get("Count", 0)

    # Count verified patients
    verified_scan = patient_table.scan(
        Select="COUNT",
        FilterExpression=Attr("isIdentityVerified").eq(True),
    )
    verified_patients = verified_scan.get("Count", 0)

    # Count doctors by verification status
    doctor_scan = doctor_table.scan(Select="COUNT")
    total_doctors = doctor_scan.get("Count", 0)

    approved_scan = doctor_table.scan(
        Select="COUNT",
        FilterExpression=Attr("verificationStatus").eq("APPROVED"),
    )
    approved_doctors = approved_scan.get("Count", 0)

    pending_scan = doctor_table.scan(
        Select="COUNT",
        FilterExpression=Attr("verificationStatus").eq("PENDING"),
    )
    pending_doctors = pending_scan.get("Count", 0)

    # Count appointments
    appt_scan = appt_table.scan(Select="COUNT")
    total_appointments = appt_scan.get("Count", 0)

    await write_audit_log(
        admin["id"], "SYSTEM", "ADMIN_VIEW_OVERVIEW",
        "Admin viewed platform overview analytics", region
    )

    return {
        "patients": {
            "total": total_patients,
            "verified": verified_patients,
            "unverified": total_patients - verified_patients,
        },
        "doctors": {
            "total": total_doctors,
            "approved": approved_doctors,
            "pending": pending_doctors,
            "suspended": total_doctors - approved_doctors - pending_doctors,
        },
        "appointments": {
            "total": total_appointments,
        },
        "generatedAt": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/revenue")
async def revenue_summary(
    region: str = Query("us-east-1"),
    period: str = Query("30d", regex="^(7d|30d|90d|1y|all)$"),
    admin: Dict[str, Any] = Depends(require_admin),
):
    """
    Aggregate revenue summary for the platform.
    No individual transaction details — just totals.
    """
    tx_table = get_table(TABLE_TRANSACTIONS, region)

    # Calculate cutoff date
    cutoff = None
    if period != "all":
        days_map = {"7d": 7, "30d": 30, "90d": 90, "1y": 365}
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days_map[period])).isoformat()

    # Paginated scan for revenue calculation
    all_txs = []
    scan_kwargs = {}
    if cutoff:
        scan_kwargs["FilterExpression"] = Attr("createdAt").gte(cutoff)

    last_key = None
    while True:
        if last_key:
            scan_kwargs["ExclusiveStartKey"] = last_key
        response = tx_table.scan(**scan_kwargs)
        all_txs.extend(response.get("Items", []))
        last_key = response.get("LastEvaluatedKey")
        if not last_key:
            break

    # Aggregate
    total_revenue = sum(float(t.get("amount", 0)) for t in all_txs if t.get("type") == "BOOKING_FEE")
    total_refunds = sum(abs(float(t.get("amount", 0))) for t in all_txs if t.get("type") == "REFUND")
    net_revenue = total_revenue - total_refunds

    await write_audit_log(
        admin["id"], "SYSTEM", "ADMIN_VIEW_REVENUE",
        f"Admin viewed revenue summary (period={period})", region
    )

    return {
        "period": period,
        "totalRevenue": round(total_revenue, 2),
        "totalRefunds": round(total_refunds, 2),
        "netRevenue": round(net_revenue, 2),
        "transactionCount": len(all_txs),
        "generatedAt": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/appointments")
async def appointment_stats(
    region: str = Query("us-east-1"),
    admin: Dict[str, Any] = Depends(require_admin),
):
    """Appointment status breakdown."""
    appt_table = get_table(TABLE_APPOINTMENTS, region)

    all_appts = []
    last_key = None
    while True:
        scan_kwargs = {"ProjectionExpression": "#s", "ExpressionAttributeNames": {"#s": "status"}}
        if last_key:
            scan_kwargs["ExclusiveStartKey"] = last_key
        response = appt_table.scan(**scan_kwargs)
        all_appts.extend(response.get("Items", []))
        last_key = response.get("LastEvaluatedKey")
        if not last_key:
            break

    # Count by status
    status_counts: Dict[str, int] = {}
    for appt in all_appts:
        status = appt.get("status", "UNKNOWN")
        status_counts[status] = status_counts.get(status, 0) + 1

    await write_audit_log(
        admin["id"], "SYSTEM", "ADMIN_VIEW_APPT_STATS",
        "Admin viewed appointment statistics", region
    )

    return {
        "total": len(all_appts),
        "byStatus": status_counts,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
    }
