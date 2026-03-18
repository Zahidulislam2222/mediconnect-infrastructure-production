
import io
import uuid
from typing import Dict, Any
from fastapi import APIRouter, UploadFile, File, Header, HTTPException, Depends
from pydicom import dcmread
from services.deidentify import apply_hipaa_safe_harbor
from services.pixel_processor import extract_thumbnail
from services.dicom_store import send_to_pacs
from services.fhir_mapper import dicom_to_fhir_imaging_study
from utils.s3_client import upload_to_s3
from utils.audit import write_audit_log
from middleware.auth import require_auth

router = APIRouter()

# ─── ORIGINAL CODE (before security fix) ───────────────────────────────────
# The upload endpoint previously accepted unauthenticated requests using only
# header-based identity: x_user_id: str = Header(...), x_user_region: str = Header(...),
# x_user_role: str = Header(...). This was a CRITICAL security vulnerability
# (CVSS 9.1) as headers can be trivially spoofed.
#
# FIX: Added Cognito JWT verification via Depends(require_auth). The user's
# identity is now extracted from the verified token, not from raw headers.
# ────────────────────────────────────────────────────────────────────────────

@router.post("/upload")
async def process_dicom(
    file: UploadFile = File(...),
    user: Dict[str, Any] = Depends(require_auth),
):
    # Extract verified identity from JWT (replaces raw header trust)
    x_user_id = user["id"]
    x_user_region = user["region"]

    try:
        # 1. Read File Stream into Memory safely (or tempfile for massive files)
        file_bytes = await file.read()
        dataset = dcmread(io.BytesIO(file_bytes))
        scan_id = str(uuid.uuid4())

        # 2. HIPAA De-identification
        safe_dataset = apply_hipaa_safe_harbor(dataset, x_user_id)

        # 3. Pixel Processing (Thumbnails for frontend)
        try:
            jpeg_bytes = extract_thumbnail(safe_dataset)
        except Exception as e:
            jpeg_bytes = b"" # Fallback if pixel data is corrupted

        # 4. Storage (S3 + PACS)
        s3_dcm_key = f"patient/{x_user_id}/scans/{scan_id}.dcm"
        s3_jpg_key = f"patient/{x_user_id}/scans/{scan_id}.jpg"

        # Save raw anonymized DICOM
        s3_dcm_url = upload_to_s3(safe_dataset.to_json_dict(), s3_dcm_key, "application/dicom", x_user_region)
        s3_jpg_url = upload_to_s3(jpeg_bytes, s3_jpg_key, "image/jpeg", x_user_region) if jpeg_bytes else ""

        # Send to Orthanc
        send_to_pacs(safe_dataset)

        # 5. Map to FHIR R4
        fhir_resource = dicom_to_fhir_imaging_study(safe_dataset, x_user_id, s3_dcm_url, s3_jpg_url)

        # 6. Audit
        write_audit_log(x_user_id, x_user_id, "CREATE_DICOM", f"Processed DICOM {scan_id}", x_user_region)

        return {"success": True, "fhirResource": fhir_resource}

    except HTTPException:
        raise  # Re-raise auth errors as-is
    except Exception as e:
        write_audit_log(x_user_id, x_user_id, "DICOM_UPLOAD_FAILED", str(e), x_user_region)
        raise HTTPException(status_code=500, detail=f"DICOM Processing Failed: {str(e)}")