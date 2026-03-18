
import os
import logging
import time
from collections import defaultdict
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from routers import imaging

# ─── Security hardened DICOM Service ──────────────────────────────────────
# Added: Rate limiting, request body size limit, strict CORS, logging.
# The /health endpoint remains public (no auth) for k8s probes.
# ────────────────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)

app = FastAPI(title="MediConnect DICOM Service", version="1.0.0")


# ─── Request Body Size Limit (DoS Prevention) ───────────────────────────
class RequestSizeLimitMiddleware(BaseHTTPMiddleware):
    """Reject request bodies larger than 50MB (DICOM files can be large)."""
    MAX_BODY_SIZE = 50 * 1_048_576  # 50MB

    async def dispatch(self, request: Request, call_next):
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > self.MAX_BODY_SIZE:
            raise HTTPException(status_code=413, detail="Request body too large. Maximum 50MB allowed.")
        return await call_next(request)


# ─── Rate Limiting Middleware (DDoS Prevention) ──────────────────────────
class RateLimitMiddleware(BaseHTTPMiddleware):
    """In-memory sliding window rate limiter: 30 requests per 15 minutes per IP."""
    WINDOW_SECONDS = 15 * 60
    MAX_REQUESTS = 30

    def __init__(self, app):
        super().__init__(app)
        self._requests: dict = defaultdict(list)

    async def dispatch(self, request: Request, call_next):
        if request.url.path == "/health":
            return await call_next(request)

        client_ip = request.client.host if request.client else "unknown"
        now = time.time()
        cutoff = now - self.WINDOW_SECONDS

        self._requests[client_ip] = [t for t in self._requests[client_ip] if t > cutoff]

        if len(self._requests[client_ip]) >= self.MAX_REQUESTS:
            return JSONResponse(
                status_code=429,
                content={"error": "Rate limit exceeded. Maximum 30 requests per 15 minutes."}
            )

        self._requests[client_ip].append(now)
        return await call_next(request)


app.add_middleware(RateLimitMiddleware)
app.add_middleware(RequestSizeLimitMiddleware)

# ─── CORS (Strict: Only allowed origins) ─────────────────────────────────
allowed_origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]
if os.getenv("NODE_ENV") != "production":
    allowed_origins.extend(["http://localhost:5173", "http://localhost:8080"])

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "x-user-region"],
)

# ─── Routes ──────────────────────────────────────────────────────────────
app.include_router(imaging.router, prefix="/api/v1")

@app.get("/health")
def health_check():
    """Health check - intentionally unauthenticated for k8s liveness/readiness probes."""
    return {"status": "UP", "service": "dicom-worker"}