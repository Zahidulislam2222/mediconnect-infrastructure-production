"""
Cognito JWT Authentication Middleware for Admin Service
=======================================================
Reuses the same auth pattern as DICOM service, with an additional
requirement: the user must belong to the "admin" Cognito group.

Pattern Reference: dicom-service/middleware/auth.py
"""

import os
import time
import logging
from typing import Optional, Dict, Any
from jose import jwt, JWTError
from fastapi import Request, HTTPException

logger = logging.getLogger("admin-auth")

# ─── Cognito Configuration (matches shared/aws-config.ts COGNITO_CONFIG) ───

def _get_cognito_config() -> Dict[str, Dict[str, str]]:
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

# ─── JWKS Cache ──────────────────────────────────────────────────────────

_jwks_cache: Dict[str, Dict[str, Any]] = {}
_jwks_cache_ttl: Dict[str, float] = {}
JWKS_CACHE_DURATION = 3600

def _normalize_region(region: str) -> str:
    r = (region or "us-east-1").upper()
    return "EU" if r in ("EU", "EU-CENTRAL-1") else "US"

import httpx

async def _get_jwks(region_key: str, user_pool_id: str, aws_region: str) -> Dict[str, Any]:
    cache_key = f"{region_key}:{user_pool_id}"
    now = time.time()

    if cache_key in _jwks_cache and now < _jwks_cache_ttl.get(cache_key, 0):
        return _jwks_cache[cache_key]

    jwks_url = f"https://cognito-idp.{aws_region}.amazonaws.com/{user_pool_id}/.well-known/jwks.json"

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(jwks_url)
            response.raise_for_status()
            jwks_data = response.json()

        keys_by_kid = {key["kid"]: key for key in jwks_data.get("keys", [])}
        _jwks_cache[cache_key] = keys_by_kid
        _jwks_cache_ttl[cache_key] = now + JWKS_CACHE_DURATION

        logger.info(f"JWKS loaded for {region_key} ({len(keys_by_kid)} keys)")
        return keys_by_kid

    except Exception as e:
        logger.error(f"Failed to fetch JWKS for {region_key}: {e}")
        if cache_key in _jwks_cache:
            return _jwks_cache[cache_key]
        raise HTTPException(status_code=503, detail="Authentication service unavailable")


async def verify_cognito_token(token: str, user_region: str) -> Dict[str, Any]:
    region_key = _normalize_region(user_region)
    config = _get_cognito_config()[region_key]

    user_pool_id = config["USER_POOL_ID"]
    if not user_pool_id:
        raise HTTPException(status_code=500, detail=f"AUTH_CRITICAL: Missing Cognito Config for {region_key}")

    allowed_clients = [c for c in [config["CLIENT_PATIENT"], config["CLIENT_DOCTOR"]] if c]
    if not allowed_clients:
        raise HTTPException(status_code=500, detail=f"AUTH_CRITICAL: No client IDs configured for {region_key}")

    try:
        unverified_header = jwt.get_unverified_header(token)
    except JWTError:
        raise HTTPException(status_code=401, detail="Unauthorized: Malformed token")

    kid = unverified_header.get("kid")
    if not kid:
        raise HTTPException(status_code=401, detail="Unauthorized: Missing key ID")

    aws_region = config["REGION"]
    jwks = await _get_jwks(region_key, user_pool_id, aws_region)

    if kid not in jwks:
        _jwks_cache_ttl.pop(f"{region_key}:{user_pool_id}", None)
        jwks = await _get_jwks(region_key, user_pool_id, aws_region)
        if kid not in jwks:
            raise HTTPException(status_code=401, detail="Unauthorized: Unknown signing key")

    signing_key = jwks[kid]
    issuer = f"https://cognito-idp.{aws_region}.amazonaws.com/{user_pool_id}"

    try:
        payload = jwt.decode(
            token, signing_key, algorithms=["RS256"],
            audience=allowed_clients, issuer=issuer,
            options={"verify_exp": True, "verify_aud": True, "verify_iss": True}
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Unauthorized: Token expired")
    except jwt.JWTClaimsError as e:
        raise HTTPException(status_code=401, detail=f"Unauthorized: Invalid claims - {e}")
    except JWTError:
        raise HTTPException(status_code=401, detail="Unauthorized: Invalid or expired token")

    if payload.get("token_use") != "id":
        raise HTTPException(status_code=401, detail="Unauthorized: Not an ID token")

    groups = payload.get("cognito:groups", [])
    is_doctor = any(g.lower() == "doctor" for g in groups)

    return {
        "id": payload.get("sub"),
        "sub": payload.get("sub"),
        "email": payload.get("email"),
        "region": user_region,
        "is_doctor": is_doctor,
        "is_patient": not is_doctor,
        "groups": groups,
    }


# ─── FastAPI Dependencies ────────────────────────────────────────────────

async def require_auth(request: Request) -> Dict[str, Any]:
    """Basic JWT auth — any authenticated user."""
    auth_header = request.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized: Missing token")

    token = auth_header.split(" ", 1)[1]
    user_region = request.headers.get("x-user-region", "us-east-1")
    user = await verify_cognito_token(token, user_region)

    logger.info(f"Auth OK: user={user['id'][:8]}... region={user_region}")
    return user


async def require_admin(request: Request) -> Dict[str, Any]:
    """
    Admin-only auth gate. User must belong to the 'admin' Cognito group.
    This is the primary security boundary for all admin endpoints.
    """
    user = await require_auth(request)

    groups = [g.lower() for g in user.get("groups", [])]
    if "admin" not in groups:
        logger.warning(f"Admin access DENIED for user={user['id'][:8]}... groups={user.get('groups')}")
        raise HTTPException(
            status_code=403,
            detail="Forbidden: Admin group membership required"
        )

    logger.info(f"Admin access GRANTED: user={user['id'][:8]}...")
    return user
