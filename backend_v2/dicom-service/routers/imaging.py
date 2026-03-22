
import io
import uuid
import logging
from typing import Dict, Any
from fastapi import APIRouter, UploadFile, File, Header, HTTPException, Depends
from pydicom import dcmread
from services.deidentify import apply_hipaa_safe_harbor
from services.pixel_processor import extract_thumbnail
from services.dicom_store import send_to_pacs
from services.fhir_mapper import dicom_to_fhir_imaging_study
from services.structured_report import is_structured_report, extract_sr_content, sr_to_fhir_diagnostic_report
from utils.s3_client import upload_to_s3
from utils.audit import write_audit_log
from middleware.auth import require_auth
from services.metadata_store import store_study_metadata

logger = logging.getLogger("dicom-imaging")

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

        # 2. HIPAA De-identification (applies to both images and SRs)
        safe_dataset = apply_hipaa_safe_harbor(dataset, x_user_id)

        # 3. Check if this is a Structured Report
        if is_structured_report(safe_dataset):
            return await _process_structured_report(safe_dataset, scan_id, x_user_id, x_user_region)

        # ─── Standard Image Pipeline ─────────────────────────────────────

        # 4. Pixel Processing (Thumbnails for frontend)
        try:
            jpeg_bytes = extract_thumbnail(safe_dataset)
        except Exception as e:
            jpeg_bytes = b"" # Fallback if pixel data is corrupted

        # 5. Storage (S3 + PACS)
        s3_dcm_key = f"patient/{x_user_id}/scans/{scan_id}.dcm"
        s3_jpg_key = f"patient/{x_user_id}/scans/{scan_id}.jpg"

        # Save raw anonymized DICOM
        s3_dcm_url = upload_to_s3(safe_dataset.to_json_dict(), s3_dcm_key, "application/dicom", x_user_region)
        s3_jpg_url = upload_to_s3(jpeg_bytes, s3_jpg_key, "image/jpeg", x_user_region) if jpeg_bytes else ""

        # Send to Orthanc
        send_to_pacs(safe_dataset)

        # 6. Map to FHIR R4
        fhir_resource = dicom_to_fhir_imaging_study(safe_dataset, x_user_id, s3_dcm_url, s3_jpg_url)

        # 7. Store metadata in DynamoDB (enables QIDO-RS search)
        study_uid = str(safe_dataset.get("StudyInstanceUID", "UNKNOWN"))
        series_uid = str(safe_dataset.get("SeriesInstanceUID", "UNKNOWN"))
        instance_uid = str(safe_dataset.get("SOPInstanceUID", "UNKNOWN"))
        modality = str(safe_dataset.get("Modality", "UNKNOWN"))
        study_desc = str(safe_dataset.get("StudyDescription", "Medical Imaging Scan"))

        try:
            await store_study_metadata(
                patient_id=x_user_id,
                study_uid=study_uid,
                metadata={
                    "modality": modality,
                    "studyDate": fhir_resource.get("started", "")[:10],
                    "studyDescription": study_desc,
                    "seriesCount": 1,
                    "instanceCount": 1,
                    "s3Keys": [s3_dcm_key],
                    "fhirResource": fhir_resource,
                    "seriesUIDs": [series_uid],
                    "instanceUIDs": [instance_uid],
                },
                region=x_user_region,
            )
        except Exception:
            pass  # Non-fatal: metadata indexing failure should not block upload

        # 8. Audit
        await write_audit_log(x_user_id, x_user_id, "CREATE_DICOM", f"Processed DICOM {scan_id}", x_user_region)

        return {"success": True, "fhirResource": fhir_resource}

    except HTTPException:
        raise  # Re-raise auth errors as-is
    except Exception as e:
        await write_audit_log(x_user_id, x_user_id, "DICOM_UPLOAD_FAILED", str(e), x_user_region)
        raise HTTPException(status_code=500, detail=f"DICOM Processing Failed: {str(e)}")


async def _process_structured_report(
    safe_dataset,
    scan_id: str,
    x_user_id: str,
    x_user_region: str,
) -> Dict[str, Any]:
    """
    Process a DICOM Structured Report (SR).
    SR documents contain clinical findings, measurements, and coded observations
    instead of pixel data, so thumbnail extraction is skipped.

    Pipeline: de-identify (already done) -> S3 storage -> PACS send -> FHIR mapping
    """
    try:
        # 1. S3 Storage (no thumbnail — SR has no pixel data)
        s3_dcm_key = f"patient/{x_user_id}/reports/{scan_id}.dcm"
        s3_dcm_url = upload_to_s3(safe_dataset.to_json_dict(), s3_dcm_key, "application/dicom", x_user_region)

        # 2. Send to Orthanc (C-STORE supports SR SOP classes)
        send_to_pacs(safe_dataset)

        # 3. Extract SR content tree
        sr_content = extract_sr_content(safe_dataset)
        study_uid = str(getattr(safe_dataset, "StudyInstanceUID", f"urn:uuid:{scan_id}"))

        # 4. Map to FHIR DiagnosticReport + Observations
        fhir_result = sr_to_fhir_diagnostic_report(sr_content, x_user_id, study_uid)

        # 5. Store metadata in DynamoDB (enables QIDO-RS search for SRs)
        instance_uid = str(getattr(safe_dataset, "SOPInstanceUID", "UNKNOWN"))
        series_uid = str(getattr(safe_dataset, "SeriesInstanceUID", "UNKNOWN"))

        try:
            await store_study_metadata(
                patient_id=x_user_id,
                study_uid=study_uid,
                metadata={
                    "modality": "SR",
                    "studyDate": sr_content.get("content_date", "")[:10] if sr_content.get("content_date") else "",
                    "studyDescription": sr_content.get("document_title", "Structured Report"),
                    "seriesCount": 1,
                    "instanceCount": 1,
                    "s3Keys": [s3_dcm_key],
                    "fhirResource": fhir_result["report"],
                    "seriesUIDs": [series_uid],
                    "instanceUIDs": [instance_uid],
                },
                region=x_user_region,
            )
        except Exception:
            pass  # Non-fatal: metadata indexing failure should not block upload

        # 6. Audit
        finding_count = len(sr_content.get("findings", []))
        measurement_count = len(sr_content.get("measurements", []))
        await write_audit_log(
            x_user_id, x_user_id, "CREATE_DICOM_SR",
            f"Processed DICOM SR {scan_id} ({finding_count} findings, {measurement_count} measurements)",
            x_user_region,
        )

        logger.info(f"SR processed: scan={scan_id[:8]}... findings={finding_count} measurements={measurement_count}")

        return {
            "success": True,
            "type": "structured_report",
            "fhirResource": fhir_result["report"],
            "observations": fhir_result["observations"],
            "srContent": sr_content,
            "s3Url": s3_dcm_url,
        }

    except Exception as e:
        await write_audit_log(x_user_id, x_user_id, "DICOM_SR_FAILED", str(e), x_user_region)
        raise HTTPException(status_code=500, detail=f"DICOM SR Processing Failed: {str(e)}")
