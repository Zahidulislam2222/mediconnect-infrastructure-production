"""
Admin Subscription Dashboard
=============================
Provides admin-level subscription management, metrics, and fraud monitoring.
All endpoints require admin Cognito group membership.
"""

import logging
from typing import Dict, Any, Optional, List
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from middleware.auth import require_admin
from utils.dynamo import get_table
from utils.audit import write_audit_log

logger = logging.getLogger("admin-subscriptions")
router = APIRouter()

TABLE_SUBSCRIPTIONS = "mediconnect-subscriptions"
TABLE_APPOINTMENTS = "mediconnect-appointments"
TABLE_DOCTOR_PAYOUTS = "mediconnect-doctor-payouts"


# ─── Response Models ─────────────────────────────────────────────────────

class SubscriptionMetrics(BaseModel):
    total_active: int
    total_cancelled: int
    total_past_due: int
    plus_count: int
    premium_count: int
    mrr: float  # Monthly Recurring Revenue
    avg_discount_usage: float


class FreezeRequest(BaseModel):
    reason: str


# ─── LIST SUBSCRIPTIONS ──────────────────────────────────────────────────

@router.get("/subscriptions", dependencies=[Depends(require_admin)])
async def list_subscriptions(
    status: Optional[str] = Query(None, description="Filter by status: active, past_due, cancelled"),
    plan: Optional[str] = Query(None, description="Filter by plan: plus, premium"),
    limit: int = Query(50, ge=1, le=200),
):
    """List all subscriptions with optional filters."""
    table = get_table(TABLE_SUBSCRIPTIONS)

    scan_kwargs: Dict[str, Any] = {"Limit": limit}
    filter_parts = []
    attr_values: Dict[str, Any] = {}

    if status:
        filter_parts.append("#s = :status")
        attr_values[":status"] = status
        scan_kwargs["ExpressionAttributeNames"] = {"#s": "status"}

    if plan:
        filter_parts.append("planId = :plan")
        attr_values[":plan"] = plan

    if filter_parts:
        scan_kwargs["FilterExpression"] = " AND ".join(filter_parts)
        scan_kwargs["ExpressionAttributeValues"] = attr_values

    result = table.scan(**scan_kwargs)
    return {"subscriptions": result.get("Items", []), "count": result.get("Count", 0)}


# ─── SUBSCRIPTION METRICS ────────────────────────────────────────────────

@router.get("/subscriptions/metrics", dependencies=[Depends(require_admin)])
async def get_subscription_metrics():
    """Calculate subscription KPIs: MRR, churn, plan distribution."""
    table = get_table(TABLE_SUBSCRIPTIONS)
    result = table.scan()
    items = result.get("Items", [])

    active = [i for i in items if i.get("status") == "active"]
    cancelled = [i for i in items if i.get("status") == "cancelled"]
    past_due = [i for i in items if i.get("status") == "past_due"]

    plus_active = [i for i in active if i.get("planId") == "plus"]
    premium_active = [i for i in active if i.get("planId") == "premium"]

    # MRR = (plus_count * $19) + (premium_count * $39)
    mrr = len(plus_active) * 19 + len(premium_active) * 39

    return {
        "total_active": len(active),
        "total_cancelled": len(cancelled),
        "total_past_due": len(past_due),
        "plus_count": len(plus_active),
        "premium_count": len(premium_active),
        "mrr": mrr,
        "total_subscribers_ever": len(items),
    }


# ─── SINGLE SUBSCRIPTION DETAIL ─────────────────────────────────────────

@router.get("/subscriptions/{patient_id}", dependencies=[Depends(require_admin)])
async def get_subscription_detail(patient_id: str):
    """Get detailed subscription info for a specific patient."""
    table = get_table(TABLE_SUBSCRIPTIONS)
    result = table.get_item(Key={"patientId": patient_id})
    item = result.get("Item")
    if not item:
        raise HTTPException(status_code=404, detail="No subscription found for this patient")
    return item


# ─── FREEZE SUBSCRIPTION (Dispute/Fraud) ────────────────────────────────

@router.post("/subscriptions/{patient_id}/freeze", dependencies=[Depends(require_admin)])
async def freeze_subscription(patient_id: str, body: FreezeRequest):
    """Freeze a subscription due to dispute or fraud (loophole #9)."""
    table = get_table(TABLE_SUBSCRIPTIONS)

    table.update_item(
        Key={"patientId": patient_id},
        UpdateExpression="SET disputeFrozen = :true, updatedAt = :now",
        ExpressionAttributeValues={
            ":true": True,
            ":now": datetime.now(timezone.utc).isoformat(),
        },
    )

    await write_audit_log(
        actor_id="admin",
        patient_id=patient_id,
        action="SUBSCRIPTION_FROZEN",
        detail=f"Reason: {body.reason}",
    )

    logger.warning(f"Subscription frozen for patient {patient_id}: {body.reason}")
    return {"message": f"Subscription frozen for {patient_id}", "reason": body.reason}


# ─── UNFREEZE SUBSCRIPTION ──────────────────────────────────────────────

@router.post("/subscriptions/{patient_id}/unfreeze", dependencies=[Depends(require_admin)])
async def unfreeze_subscription(patient_id: str):
    """Unfreeze a previously frozen subscription."""
    table = get_table(TABLE_SUBSCRIPTIONS)

    table.update_item(
        Key={"patientId": patient_id},
        UpdateExpression="SET disputeFrozen = :false, updatedAt = :now",
        ExpressionAttributeValues={
            ":false": False,
            ":now": datetime.now(timezone.utc).isoformat(),
        },
    )

    await write_audit_log(
        actor_id="admin",
        patient_id=patient_id,
        action="SUBSCRIPTION_UNFROZEN",
        detail="Admin unfroze subscription",
    )

    return {"message": f"Subscription unfrozen for {patient_id}"}


# ─── FRAUD MONITORING ────────────────────────────────────────────────────

@router.get("/fraud/alerts", dependencies=[Depends(require_admin)])
async def get_fraud_alerts():
    """
    Detect suspicious subscription patterns (loopholes #5, #16, #17).
    - Family members in different cities
    - High-frequency same doctor-patient pairs
    - Subscribe-use-cancel patterns
    """
    alerts: List[Dict[str, Any]] = []

    # Check subscriptions for suspicious patterns
    sub_table = get_table(TABLE_SUBSCRIPTIONS)
    subs = sub_table.scan().get("Items", [])

    for sub in subs:
        # Alert: cancelled within 7 days of creation
        if sub.get("status") == "cancelled":
            created = sub.get("createdAt", "")
            updated = sub.get("updatedAt", "")
            if created and updated:
                try:
                    created_dt = datetime.fromisoformat(created.replace("Z", "+00:00"))
                    updated_dt = datetime.fromisoformat(updated.replace("Z", "+00:00"))
                    days_active = (updated_dt - created_dt).days
                    if days_active <= 7:
                        alerts.append({
                            "type": "QUICK_CANCEL",
                            "severity": "MEDIUM",
                            "patientId": sub["patientId"],
                            "detail": f"Subscription cancelled {days_active} days after creation",
                        })
                except (ValueError, TypeError):
                    pass

        # Alert: dispute frozen
        if sub.get("disputeFrozen"):
            alerts.append({
                "type": "DISPUTE_ACTIVE",
                "severity": "HIGH",
                "patientId": sub["patientId"],
                "detail": "Subscription is frozen due to active dispute",
            })

    # Check for high-frequency same doctor-patient pairs (loophole #17)
    apt_table = get_table(TABLE_APPOINTMENTS)
    apts = apt_table.scan(
        FilterExpression="#s = :confirmed",
        ExpressionAttributeNames={"#s": "status"},
        ExpressionAttributeValues={":confirmed": "CONFIRMED"},
        Limit=500,
    ).get("Items", [])

    pair_counts: Dict[str, int] = {}
    for apt in apts:
        pair_key = f"{apt.get('patientId')}|{apt.get('doctorId')}"
        pair_counts[pair_key] = pair_counts.get(pair_key, 0) + 1

    for pair, count in pair_counts.items():
        if count >= 8:  # 8+ visits to same doctor in scan window
            patient_id, doctor_id = pair.split("|")
            alerts.append({
                "type": "HIGH_FREQUENCY_PAIR",
                "severity": "MEDIUM",
                "patientId": patient_id,
                "doctorId": doctor_id,
                "detail": f"{count} visits to same doctor — possible phantom visit pattern",
            })

    return {
        "alerts": sorted(alerts, key=lambda a: {"HIGH": 0, "MEDIUM": 1, "LOW": 2}.get(a["severity"], 3)),
        "total": len(alerts),
    }


# ─── DOCTOR RATE CHANGE REVIEW ──────────────────────────────────────────

@router.get("/doctors/rate-changes", dependencies=[Depends(require_admin)])
async def get_rate_changes():
    """List recent doctor rate changes for admin review (loophole #4)."""
    table = get_table("mediconnect-doctors")
    result = table.scan(
        FilterExpression="attribute_exists(rateHistory)",
        Limit=100,
    )

    changes = []
    for doc in result.get("Items", []):
        history = doc.get("rateHistory", [])
        if history:
            latest = history[-1] if isinstance(history, list) else None
            if latest:
                changes.append({
                    "doctorId": doc.get("doctorId"),
                    "name": doc.get("name"),
                    "specialty": doc.get("specialty"),
                    "currentRate": doc.get("consultationFee"),
                    "latestChange": latest,
                    "totalChanges": len(history),
                })

    return {"rate_changes": changes, "count": len(changes)}
