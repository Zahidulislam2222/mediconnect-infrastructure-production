
"""
Cognito JWT Authentication Middleware for DICOM Service
=======================================================
Security Fix: The DICOM /api/v1/upload endpoint previously accepted
unauthenticated requests with only header-based identity (x-user-id).
This middleware verifies Cognito JWT tokens to match the auth pattern
used by all other Node.js microservices.

Pattern Reference: patient-service/src/middleware/auth.middleware.ts
"""

import os
import time
import json
import logging
from typing import Optional, Dict, Any
from functools import lru_cache

import httpx
from jose import jwt, JWTError, jwk
from jose.utils import base64url_decode
from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger("dicom-auth")

# ─── Cognito Configuration (matches shared/aws-config.ts COGNITO_CONFIG) ───

def _get_cognito_config() -> Dict[str, Dict[str, str]]:
    """
    Load Cognito config from env vars at runtime (not at import time).
    Matches the Node.js pattern: COGNITO_CONFIG[regionKey].
    """
    return {
        "US": {
            "REGION": "us-east-1",
            "USER_POOL_ID": os.getenv("COGNITO_USER_POOL_ID_US", os.getenv("COGNITO_USER_POOL_ID", "")),
            "CLIENT_PATIENT": os.getenv("COGNITO_CLIENT_ID_US_PATIENT", os.getenv("COGNITO_CLIENT_ID", "")),
            "CLIENT_DOCTOR": os.getenv("COGNITO_CLIENT_ID_US_DOCTOR", os.getenv("COGNITO_CLIENT_ID", "")),
        },
        "EU": {
            "REGION": "eu-central-1",
            "USER_POOL_ID": os.getenv("COGNITO_USER_POOL_ID_EU", ""),
            "CLIENT_PATIENT": os.getenv("COGNITO_CLIENT_ID_EU_PATIENT", ""),
            "CLIENT_DOCTOR": os.getenv("COGNITO_CLIENT_ID_EU_DOCTOR", ""),
        },
    }


# ─── JWKS Cache (per region, matches Node.js CognitoJwtVerifier cache) ───

_jwks_cache: Dict[str, Dict[str, Any]] = {}
_jwks_cache_ttl: Dict[str, float] = {}
JWKS_CACHE_DURATION = 3600  # 1 hour (same as aws-jwt-verify default)


def _normalize_region(region: str) -> str:
    """Matches shared/aws-config.ts normalizeRegion()"""
    r = (region or "us-east-1").upper()
    return "EU" if r in ("EU", "EU-CENTRAL-1") else "US"


async def _get_jwks(region_key: str, user_pool_id: str, aws_region: str) -> Dict[str, Any]:
    """
    Fetch and cache JWKS (JSON Web Key Set) from Cognito.
    Uses the standard /.well-known/jwks.json endpoint.
    """
    cache_key = f"{region_key}:{user_pool_id}"
    now = time.time()

    # Return cached if valid
    if cache_key in _jwks_cache and now < _jwks_cache_ttl.get(cache_key, 0):
        return _jwks_cache[cache_key]

    jwks_url = f"https://cognito-idp.{aws_region}.amazonaws.com/{user_pool_id}/.well-known/jwks.json"

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(jwks_url)
            response.raise_for_status()
            jwks_data = response.json()

        # Index keys by kid for fast lookup
        keys_by_kid = {}
        for key in jwks_data.get("keys", []):
            keys_by_kid[key["kid"]] = key

        _jwks_cache[cache_key] = keys_by_kid
        _jwks_cache_ttl[cache_key] = now + JWKS_CACHE_DURATION

        logger.info(f"🔐 JWKS loaded for {region_key} ({len(keys_by_kid)} keys)")
        return keys_by_kid

    except Exception as e:
        logger.error(f"❌ Failed to fetch JWKS for {region_key}: {e}")
        # Return stale cache if available (better than failing)
        if cache_key in _jwks_cache:
            logger.warning(f"⚠️ Using stale JWKS cache for {region_key}")
            return _jwks_cache[cache_key]
        raise HTTPException(status_code=503, detail="Authentication service unavailable")


async def verify_cognito_token(token: str, user_region: str) -> Dict[str, Any]:
    """
    Verify a Cognito JWT ID token.
    Matches the Node.js auth middleware verification logic:
    1. Normalize region
    2. Load Cognito config
    3. Fetch JWKS
    4. Verify signature + expiry + audience
    5. Extract user claims
    """
    region_key = _normalize_region(user_region)
    config = _get_cognito_config()[region_key]

    user_pool_id = config["USER_POOL_ID"]
    if not user_pool_id:
        raise HTTPException(status_code=500, detail=f"AUTH_CRITICAL: Missing Cognito Config for {region_key}")

    # Allowed client IDs (patient + doctor apps, matching Node.js filter(Boolean))
    allowed_clients = [c for c in [config["CLIENT_PATIENT"], config["CLIENT_DOCTOR"]] if c]

    if not allowed_clients:
        raise HTTPException(status_code=500, detail=f"AUTH_CRITICAL: No client IDs configured for {region_key}")

    # 1. Decode header without verification to get kid
    try:
        unverified_header = jwt.get_unverified_header(token)
    except JWTError:
        raise HTTPException(status_code=401, detail="Unauthorized: Malformed token")

    kid = unverified_header.get("kid")
    if not kid:
        raise HTTPException(status_code=401, detail="Unauthorized: Missing key ID")

    # 2. Fetch JWKS and find matching key
    aws_region = config["REGION"]
    jwks = await _get_jwks(region_key, user_pool_id, aws_region)

    if kid not in jwks:
        # Key rotation: force refresh and retry once
        _jwks_cache_ttl.pop(f"{region_key}:{user_pool_id}", None)
        jwks = await _get_jwks(region_key, user_pool_id, aws_region)
        if kid not in jwks:
            raise HTTPException(status_code=401, detail="Unauthorized: Unknown signing key")

    signing_key = jwks[kid]

    # 3. Verify token (signature + expiry + issuer + audience)
    issuer = f"https://cognito-idp.{aws_region}.amazonaws.com/{user_pool_id}"

    try:
        payload = jwt.decode(
            token,
            signing_key,
            algorithms=["RS256"],
            audience=allowed_clients,
            issuer=issuer,
            options={
                "verify_exp": True,
                "verify_aud": True,
                "verify_iss": True,
            }
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Unauthorized: Token expired")
    except jwt.JWTClaimsError as e:
        raise HTTPException(status_code=401, detail=f"Unauthorized: Invalid claims - {e}")
    except JWTError as e:
        raise HTTPException(status_code=401, detail="Unauthorized: Invalid or expired token")

    # 4. Validate token_use is "id" (matching Node.js tokenUse: "id")
    if payload.get("token_use") != "id":
        raise HTTPException(status_code=401, detail="Unauthorized: Not an ID token")

    # 5. Extract user context (matches Node.js req.user shape)
    groups = payload.get("cognito:groups", [])
    is_doctor = any(g.lower() == "doctor" for g in groups)

    return {
        "id": payload.get("sub"),
        "sub": payload.get("sub"),
        "email": payload.get("email"),
        "fhir_id": payload.get("custom:fhir_id", payload.get("sub")),
        "region": user_region,
        "is_doctor": is_doctor,
        "is_patient": not is_doctor,
    }


# ─── FastAPI Dependency for Route-Level Auth ───

async def require_auth(request: Request) -> Dict[str, Any]:
    """
    FastAPI dependency that extracts and verifies the Cognito JWT.
    Usage: user = Depends(require_auth)

    Matches the Node.js pattern:
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) { ... 401 }
      const token = authHeader.split(' ')[1];
    """
    auth_header = request.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized: Missing token")

    token = auth_header.split(" ", 1)[1]

    # Get region from header (same as Node.js: req.headers['x-user-region'])
    user_region = request.headers.get("x-user-region", "us-east-1")

    user = await verify_cognito_token(token, user_region)

    # Log auth success for audit trail
    logger.info(f"🔐 Auth OK: user={user['id'][:8]}... region={user_region}")

    return user
