"""
Admin System Router
====================
Platform health monitoring and system management endpoints.
"""

import os
import logging
from typing import Dict, Any
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Query

from middleware.auth import require_admin
from utils.audit import write_audit_log

logger = logging.getLogger("admin-system")
router = APIRouter()

# ─── Service Registry (matches K8s service discovery) ────────────────────
SERVICES = [
    {"name": "patient-service", "port": 8081, "type": "node"},
    {"name": "doctor-service", "port": 8082, "type": "node"},
    {"name": "booking-service", "port": 8083, "type": "node"},
    {"name": "communication-service", "port": 8084, "type": "node"},
    {"name": "admin-service", "port": 8085, "type": "python"},
    {"name": "staff-service", "port": 8086, "type": "node"},
    {"name": "dicom-service", "port": 8005, "type": "python"},
]


@router.get("/services")
async def list_services(
    admin: Dict[str, Any] = Depends(require_admin),
):
    """List all registered microservices."""
    return {
        "services": SERVICES,
        "count": len(SERVICES),
    }


@router.get("/health-check")
async def check_all_services(
    admin: Dict[str, Any] = Depends(require_admin),
):
    """
    Check health of all internal services.
    Uses K8s internal DNS for service discovery.
    """
    import httpx

    results = []
    for svc in SERVICES:
        # K8s internal URL: http://<service-name>.<namespace>.svc.cluster.local/health
        # Fallback to localhost for development
        base_url = os.getenv(
            f"{svc['name'].upper().replace('-', '_')}_URL",
            f"http://{svc['name']}:{ svc['port']}"
        )

        status = "UNKNOWN"
        latency_ms = 0

        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                start = datetime.now(timezone.utc)
                resp = await client.get(f"{base_url}/health")
                latency_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)

                if resp.status_code == 200:
                    status = "UP"
                else:
                    status = "DEGRADED"
        except Exception:
            status = "DOWN"

        results.append({
            "name": svc["name"],
            "port": svc["port"],
            "status": status,
            "latencyMs": latency_ms,
        })

    write_audit_log(
        admin["id"], "SYSTEM", "ADMIN_HEALTH_CHECK",
        "Admin ran platform-wide health check", "us-east-1"
    )

    return {
        "services": results,
        "checkedAt": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/config")
async def get_platform_config(
    admin: Dict[str, Any] = Depends(require_admin),
):
    """
    Returns non-sensitive platform configuration.
    Secrets are NEVER exposed — only feature flags and metadata.
    """
    return {
        "environment": os.getenv("NODE_ENV", "development"),
        "region": os.getenv("AWS_REGION", "us-east-1"),
        "features": {
            "gdprEnabled": True,
            "hipaaCompliant": True,
            "multiRegion": bool(os.getenv("COGNITO_USER_POOL_ID_EU")),
            "redisRateLimiting": bool(os.getenv("REDIS_URL")),
            "dicomProcessing": True,
            "aiAssistant": True,
            "googleCalendar": bool(os.getenv("GOOGLE_CLIENT_ID")),
        },
        "versions": {
            "adminService": "1.0.0",
        },
    }
