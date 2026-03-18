"""
MediConnect Admin Service
=========================
Internal administration API for platform management.
- User management (view, suspend, reactivate)
- System-wide analytics (aggregate stats)
- Audit log viewer (HIPAA compliance)
- Platform health monitoring

Port: 8085
Auth: Cognito JWT (admin group required)
Pattern: Matches dicom-service architecture
"""

import logging
import time
from collections import defaultdict
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from routers import users, analytics, audit, system

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)

app = FastAPI(title="MediConnect Admin Service", version="1.0.0")


# ─── Request Body Size Limit (DoS Prevention) ───────────────────────────
class RequestSizeLimitMiddleware(BaseHTTPMiddleware):
    """Reject request bodies larger than 1MB to prevent DoS attacks."""
    MAX_BODY_SIZE = 1_048_576  # 1MB

    async def dispatch(self, request: Request, call_next):
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > self.MAX_BODY_SIZE:
            raise HTTPException(status_code=413, detail="Request body too large. Maximum 1MB allowed.")
        return await call_next(request)


# ─── Rate Limiting Middleware (DDoS Prevention) ──────────────────────────
class RateLimitMiddleware(BaseHTTPMiddleware):
    """In-memory sliding window rate limiter: 100 requests per 15 minutes per IP."""
    WINDOW_MS = 15 * 60  # 15 minutes in seconds
    MAX_REQUESTS = 100

    def __init__(self, app):
        super().__init__(app)
        self._requests: dict = defaultdict(list)

    async def dispatch(self, request: Request, call_next):
        if request.url.path in ("/health", "/ready"):
            return await call_next(request)

        client_ip = request.client.host if request.client else "unknown"
        now = time.time()
        cutoff = now - self.WINDOW_MS

        # Clean old entries and add current
        self._requests[client_ip] = [t for t in self._requests[client_ip] if t > cutoff]

        if len(self._requests[client_ip]) >= self.MAX_REQUESTS:
            return JSONResponse(
                status_code=429,
                content={"error": "Rate limit exceeded. Maximum 100 requests per 15 minutes."}
            )

        self._requests[client_ip].append(now)
        return await call_next(request)


app.add_middleware(RateLimitMiddleware)
app.add_middleware(RequestSizeLimitMiddleware)

# ─── CORS (Strict: Admin dashboard origins only) ─────────────────────────
import os
allowed_origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]
if os.getenv("NODE_ENV") != "production":
    allowed_origins.extend(["http://localhost:5173", "http://localhost:8080"])

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "x-user-region"],
)

# ─── Routes ──────────────────────────────────────────────────────────────
app.include_router(users.router, prefix="/api/v1/admin/users", tags=["Users"])
app.include_router(analytics.router, prefix="/api/v1/admin/analytics", tags=["Analytics"])
app.include_router(audit.router, prefix="/api/v1/admin/audit", tags=["Audit"])
app.include_router(system.router, prefix="/api/v1/admin/system", tags=["System"])

# ─── Health Checks (unauthenticated for K8s probes) ─────────────────────
@app.get("/health")
def health_check():
    return {"status": "UP", "service": "admin-service"}

@app.get("/ready")
def readiness_check():
    return {"status": "READY", "type": "readiness", "service": "admin-service"}
