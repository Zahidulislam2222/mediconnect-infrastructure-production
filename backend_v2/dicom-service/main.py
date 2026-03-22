
from utils.safe_logger import setup_safe_logging
setup_safe_logging()

import os
import logging
import time
from collections import defaultdict
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from routers import imaging
from routers.dicomweb import router as dicomweb_router

# ─── Security hardened DICOM Service ──────────────────────────────────────
# Added: Rate limiting, request body size limit, strict CORS, logging.
# The /health endpoint remains public (no auth) for k8s probes.
# ────────────────────────────────────────────────────────────────────────────

logger = logging.getLogger("dicom-service")

app = FastAPI(title="MediConnect DICOM Service", version="1.0.0")


# ─── Redis Rate Limit Store (distributed) ────────────────────────────────
_redis_client = None
_redis_available = False

def _init_redis():
    """Try to connect to Redis for distributed rate limiting. Falls back to in-memory."""
    global _redis_client, _redis_available
    redis_url = os.getenv("REDIS_URL")
    if not redis_url:
        logger.info("REDIS_URL not set — using in-memory rate limiting (per-instance)")
        return
    try:
        import redis
        _redis_client = redis.from_url(redis_url, decode_responses=True, socket_connect_timeout=3)
        _redis_client.ping()
        _redis_available = True
        logger.info("Redis connected — using distributed rate limiting")
    except Exception as e:
        _redis_client = None
        _redis_available = False
        logger.warning(f"Redis unavailable ({e}) — falling back to in-memory rate limiting")

_init_redis()


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
    """
    Sliding window rate limiter: 30 requests per 15 minutes per IP.
    Uses Redis for distributed rate limiting when available, falls back to in-memory.
    """
    WINDOW_SECONDS = 15 * 60
    MAX_REQUESTS = 30
    REDIS_PREFIX = "rl:dicom:"

    def __init__(self, app):
        super().__init__(app)
        # In-memory fallback store
        self._requests: dict = defaultdict(list)

    def _check_redis(self, client_ip: str, now: float) -> bool | None:
        """Check rate limit via Redis. Returns True if limited, False if OK, None if Redis failed."""
        global _redis_available
        if not _redis_available or _redis_client is None:
            return None
        try:
            key = f"{self.REDIS_PREFIX}{client_ip}"
            cutoff = now - self.WINDOW_SECONDS
            pipe = _redis_client.pipeline()
            pipe.zremrangebyscore(key, 0, cutoff)
            pipe.zcard(key)
            pipe.zadd(key, {str(now): now})
            pipe.expire(key, self.WINDOW_SECONDS)
            results = pipe.execute()
            count = results[1]
            return count >= self.MAX_REQUESTS
        except Exception as e:
            logger.warning(f"Redis rate-limit error ({e}) — falling back to in-memory")
            _redis_available = False
            return None

    async def dispatch(self, request: Request, call_next):
        if request.url.path in ("/health", "/dicomweb/metadata"):
            return await call_next(request)

        client_ip = request.client.host if request.client else "unknown"
        now = time.time()

        # Try Redis first
        redis_result = self._check_redis(client_ip, now)
        if redis_result is True:
            return JSONResponse(
                status_code=429,
                content={"error": "Rate limit exceeded. Maximum 30 requests per 15 minutes."}
            )
        elif redis_result is False:
            return await call_next(request)

        # Fallback: in-memory sliding window
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
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "x-user-region"],
)

# ─── Routes ──────────────────────────────────────────────────────────────
app.include_router(imaging.router, prefix="/api/v1")
app.include_router(dicomweb_router, prefix="/dicomweb", tags=["DICOMweb"])

@app.get("/health")
def health_check():
    """Health check - intentionally unauthenticated for k8s liveness/readiness probes."""
    return {"status": "UP", "service": "dicom-worker"}