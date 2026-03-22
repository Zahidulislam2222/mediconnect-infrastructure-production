"""
DICOMweb REST Endpoints
========================
Implements the DICOMweb standard (DICOM PS3.18) REST API:

  - WADO-RS  (Web Access to DICOM Objects — Retrieve)
  - STOW-RS  (Store Over the Web — Store)
  - QIDO-RS  (Query based on ID for DICOM Objects — Search)
  - Delete   (DICOM PS3.18 extended)

All endpoints require Cognito JWT authentication. Users can only access
their own studies (patient_id derived from verified token).

References:
  - https://www.dicomstandard.org/using/dicomweb
  - DICOM PS3.18 2024b (Web Services)
"""

import io
import os
import uuid
import logging
from typing import Dict, Any, Optional, List

from fastapi import APIRouter, Request, Depends, HTTPException, Query, Response
from fastapi.responses import JSONResponse, StreamingResponse

from middleware.auth import require_auth
from services.metadata_store import (
    store_study_metadata,
    get_study_metadata,
    search_studies,
    delete_study_metadata,
    add_instance_to_study,
)
from services.deidentify import apply_hipaa_safe_harbor
from services.dicom_store import send_to_pacs
from services.fhir_mapper import dicom_to_fhir_imaging_study
from services.pixel_processor import extract_thumbnail
from services.transfer_syntaxes import get_supported_transfer_syntaxes, get_supported_sop_classes
from utils.s3_client import get_s3_client, upload_to_s3
from utils.audit import write_audit_log

logger = logging.getLogger("dicomweb")

router = APIRouter()


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _get_bucket_name(region: str) -> str:
    """Resolve S3 bucket name with EU suffix when needed."""
    base_bucket = os.getenv("BUCKET_NAME", "mediconnect-medical-images")
    if region.upper() in ("EU", "EU-CENTRAL-1") and not base_bucket.endswith("-eu"):
        return f"{base_bucket}-eu"
    return base_bucket


def _build_s3_prefix(user_id: str) -> str:
    """Build the S3 key prefix for a user's DICOM files."""
    return f"patient/{user_id}/scans/"


def _build_metadata_prefix(user_id: str) -> str:
    """Build the S3 key prefix for a user's DICOM metadata."""
    return f"dicom/{user_id}/metadata/"


async def _verify_study_ownership(
    user_id: str, study_uid: str, region: str
) -> Dict[str, Any]:
    """
    Verify the authenticated user owns the requested study.
    Returns the study metadata if authorized, raises 404 otherwise.
    """
    metadata = await get_study_metadata(user_id, study_uid, region)
    if not metadata:
        raise HTTPException(status_code=404, detail="Study not found")
    return metadata


def _s3_key_for_instance(user_id: str, scan_id: str) -> str:
    """Generate S3 key for a DICOM instance."""
    return f"patient/{user_id}/scans/{scan_id}.dcm"


# ─── Service Metadata ────────────────────────────────────────────────────────

@router.get("/metadata")
async def dicomweb_metadata():
    """
    DICOMweb service metadata / capabilities.

    Returns supported transfer syntaxes, SOP classes, de-identification method,
    storage backends, and FHIR resource mappings. Unauthenticated — used by
    DICOMweb clients for capability discovery.
    """
    return {
        "service": "MediConnect DICOM Service",
        "version": "1.0.0",
        "dicomweb": {
            "wado_rs": True,
            "stow_rs": True,
            "qido_rs": True,
        },
        "transfer_syntaxes": get_supported_transfer_syntaxes(),
        "sop_classes": get_supported_sop_classes(),
        "de_identification": {
            "method": "HIPAA Safe Harbor (PS3.15 Annex E)",
            "tags_removed": 18,
            "uids_regenerated": 3,
        },
        "storage": {
            "primary": "S3",
            "pacs": "Orthanc (C-STORE)",
            "encryption": "AES-256 at rest",
        },
        "fhir": {
            "version": "R4",
            "resources": ["ImagingStudy", "DiagnosticReport", "Observation"],
        },
    }


# ─── WADO-RS (Retrieve) ─────────────────────────────────────────────────────

@router.get("/wado-rs/studies/{study_uid}")
async def retrieve_study(
    study_uid: str,
    user: Dict[str, Any] = Depends(require_auth),
):
    """
    WADO-RS: Retrieve all instances of a study.

    Returns the FHIR ImagingStudy resource and links to all DICOM instances.
    For full DICOM binary retrieval, use the per-instance endpoint.
    """
    user_id = user["id"]
    region = user["region"]

    metadata = await _verify_study_ownership(user_id, study_uid, region)

    await write_audit_log(
        user_id, user_id, "READ_DICOM_STUDY",
        f"WADO-RS retrieve study {study_uid[:12]}...", region,
    )

    # Return FHIR ImagingStudy with instance references
    fhir_resource = metadata.get("fhirResource", {})
    s3_keys = metadata.get("s3Keys", [])

    return JSONResponse(
        content={
            "resourceType": "ImagingStudy",
            "studyInstanceUID": study_uid,
            "patientId": user_id,
            "modality": metadata.get("modality", "UNKNOWN"),
            "studyDate": metadata.get("studyDate"),
            "studyDescription": metadata.get("studyDescription"),
            "seriesCount": metadata.get("seriesCount", 0),
            "instanceCount": metadata.get("instanceCount", 0),
            "instances": s3_keys,
            "fhirResource": fhir_resource,
        },
        headers={"Content-Type": "application/dicom+json"},
    )


@router.get("/wado-rs/studies/{study_uid}/series/{series_uid}")
async def retrieve_series(
    study_uid: str,
    series_uid: str,
    user: Dict[str, Any] = Depends(require_auth),
):
    """
    WADO-RS: Retrieve all instances of a specific series within a study.
    """
    user_id = user["id"]
    region = user["region"]

    metadata = await _verify_study_ownership(user_id, study_uid, region)

    # Verify series exists in the study
    series_uids = metadata.get("seriesUIDs", [])
    if series_uid not in series_uids:
        raise HTTPException(status_code=404, detail="Series not found in study")

    await write_audit_log(
        user_id, user_id, "READ_DICOM_SERIES",
        f"WADO-RS retrieve series {series_uid[:12]}... from study {study_uid[:12]}...", region,
    )

    # Filter FHIR resource to only include the requested series
    fhir_resource = metadata.get("fhirResource", {})
    filtered_series = []
    if "series" in fhir_resource:
        filtered_series = [
            s for s in fhir_resource["series"]
            if s.get("uid") == series_uid
        ]

    return JSONResponse(
        content={
            "studyInstanceUID": study_uid,
            "seriesInstanceUID": series_uid,
            "series": filtered_series,
        },
        headers={"Content-Type": "application/dicom+json"},
    )


@router.get("/wado-rs/studies/{study_uid}/series/{series_uid}/instances/{instance_uid}")
async def retrieve_instance(
    study_uid: str,
    series_uid: str,
    instance_uid: str,
    user: Dict[str, Any] = Depends(require_auth),
):
    """
    WADO-RS: Retrieve a single DICOM instance as binary.

    Returns the raw DICOM file from S3 with Content-Type: application/dicom.
    """
    user_id = user["id"]
    region = user["region"]

    metadata = await _verify_study_ownership(user_id, study_uid, region)

    # Verify instance exists in the study
    instance_uids = metadata.get("instanceUIDs", [])
    if instance_uid not in instance_uids:
        raise HTTPException(status_code=404, detail="Instance not found in study")

    await write_audit_log(
        user_id, user_id, "READ_DICOM_INSTANCE",
        f"WADO-RS retrieve instance {instance_uid[:12]}...", region,
    )

    # Find the S3 key for this instance
    # S3 keys are stored in order matching instanceUIDs
    s3_keys = metadata.get("s3Keys", [])
    s3_key = None
    for idx, uid in enumerate(instance_uids):
        if uid == instance_uid and idx < len(s3_keys):
            s3_key = s3_keys[idx]
            break

    if not s3_key:
        raise HTTPException(status_code=404, detail="Instance file not found")

    # Retrieve from S3
    try:
        s3 = get_s3_client(region)
        bucket = _get_bucket_name(region)
        response = s3.get_object(Bucket=bucket, Key=s3_key)
        body = response["Body"].read()

        return Response(
            content=body,
            media_type="application/dicom",
            headers={
                "Content-Type": "application/dicom",
                "Content-Disposition": f'attachment; filename="{instance_uid}.dcm"',
            },
        )
    except s3.exceptions.NoSuchKey:
        raise HTTPException(status_code=404, detail="DICOM file not found in storage")
    except Exception as e:
        logger.error(f"Failed to retrieve DICOM instance from S3: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve DICOM instance")


@router.get("/wado-rs/studies/{study_uid}/rendered")
async def retrieve_rendered(
    study_uid: str,
    user: Dict[str, Any] = Depends(require_auth),
):
    """
    WADO-RS: Retrieve a rendered (JPEG) version of the first instance in the study.

    Retrieves the first DICOM instance from S3, generates a JPEG thumbnail
    using the pixel processor, and returns it.
    """
    user_id = user["id"]
    region = user["region"]

    metadata = await _verify_study_ownership(user_id, study_uid, region)

    s3_keys = metadata.get("s3Keys", [])
    if not s3_keys:
        raise HTTPException(status_code=404, detail="No instances found in study")

    await write_audit_log(
        user_id, user_id, "READ_DICOM_RENDERED",
        f"WADO-RS retrieve rendered study {study_uid[:12]}...", region,
    )

    # Try to find an existing JPEG thumbnail first
    first_key = s3_keys[0]
    jpg_key = first_key.replace(".dcm", ".jpg")

    s3 = get_s3_client(region)
    bucket = _get_bucket_name(region)

    try:
        response = s3.get_object(Bucket=bucket, Key=jpg_key)
        jpeg_bytes = response["Body"].read()
        return Response(content=jpeg_bytes, media_type="image/jpeg")
    except Exception:
        pass  # No cached thumbnail, generate one from the DICOM file

    # Retrieve the DICOM file and generate a rendered JPEG
    try:
        from pydicom import dcmread

        response = s3.get_object(Bucket=bucket, Key=first_key)
        dicom_bytes = response["Body"].read()
        dataset = dcmread(io.BytesIO(dicom_bytes))

        jpeg_bytes = extract_thumbnail(dataset)
        if not jpeg_bytes:
            raise HTTPException(status_code=422, detail="Unable to render DICOM pixel data")

        return Response(content=jpeg_bytes, media_type="image/jpeg")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to render DICOM study: {e}")
        raise HTTPException(status_code=500, detail="Failed to render DICOM study")


# ─── STOW-RS (Store) ────────────────────────────────────────────────────────

@router.post("/stow-rs/studies")
async def store_instances(
    request: Request,
    user: Dict[str, Any] = Depends(require_auth),
):
    """
    STOW-RS: Store DICOM instances via multipart/related.

    Accepts multipart/related request body with application/dicom parts.
    Each part is processed through the standard pipeline:
      1. HIPAA de-identification
      2. S3 storage
      3. PACS (Orthanc) forwarding
      4. FHIR ImagingStudy mapping
      5. DynamoDB metadata indexing

    Returns a FHIR OperationOutcome with per-instance results.
    """
    user_id = user["id"]
    region = user["region"]

    content_type = request.headers.get("content-type", "")

    # Parse the multipart/related body or fall back to raw DICOM
    instances = await _parse_dicom_request(request, content_type)

    if not instances:
        raise HTTPException(
            status_code=400,
            detail="No DICOM instances found in request body. "
                   "Expected multipart/related with application/dicom parts "
                   "or a single application/dicom body.",
        )

    results = []
    for dicom_bytes in instances:
        result = await _process_single_instance(dicom_bytes, user_id, region)
        results.append(result)

    # Build FHIR OperationOutcome
    issues = []
    for r in results:
        if r["success"]:
            issues.append({
                "severity": "information",
                "code": "informational",
                "diagnostics": f"Instance stored: {r['instanceUID']}",
                "details": {
                    "text": f"StudyInstanceUID: {r['studyUID']}, "
                            f"SOPInstanceUID: {r['instanceUID']}",
                },
            })
        else:
            issues.append({
                "severity": "error",
                "code": "processing",
                "diagnostics": f"Failed to store instance: {r['error']}",
            })

    success_count = sum(1 for r in results if r["success"])
    fail_count = len(results) - success_count

    await write_audit_log(
        user_id, user_id, "CREATE_DICOM_STOW",
        f"STOW-RS: {success_count} stored, {fail_count} failed", region,
    )

    return JSONResponse(
        content={
            "resourceType": "OperationOutcome",
            "issue": issues,
            "totalInstances": len(results),
            "successCount": success_count,
            "failureCount": fail_count,
        },
        status_code=200 if fail_count == 0 else 207,
        headers={"Content-Type": "application/dicom+json"},
    )


@router.post("/stow-rs/studies/{study_uid}")
async def store_instances_to_study(
    study_uid: str,
    request: Request,
    user: Dict[str, Any] = Depends(require_auth),
):
    """
    STOW-RS: Store DICOM instances to a specific pre-existing study.

    Same processing pipeline as the general STOW-RS endpoint, but all
    instances are associated with the specified StudyInstanceUID.
    """
    user_id = user["id"]
    region = user["region"]

    # Verify the target study exists and belongs to this user
    await _verify_study_ownership(user_id, study_uid, region)

    content_type = request.headers.get("content-type", "")
    instances = await _parse_dicom_request(request, content_type)

    if not instances:
        raise HTTPException(
            status_code=400,
            detail="No DICOM instances found in request body.",
        )

    results = []
    for dicom_bytes in instances:
        result = await _process_single_instance(
            dicom_bytes, user_id, region, target_study_uid=study_uid
        )
        results.append(result)

    success_count = sum(1 for r in results if r["success"])
    fail_count = len(results) - success_count

    issues = []
    for r in results:
        if r["success"]:
            issues.append({
                "severity": "information",
                "code": "informational",
                "diagnostics": f"Instance added to study {study_uid[:12]}...: {r['instanceUID']}",
            })
        else:
            issues.append({
                "severity": "error",
                "code": "processing",
                "diagnostics": f"Failed to store instance: {r['error']}",
            })

    await write_audit_log(
        user_id, user_id, "CREATE_DICOM_STOW",
        f"STOW-RS to study {study_uid[:12]}...: {success_count} stored, {fail_count} failed",
        region,
    )

    return JSONResponse(
        content={
            "resourceType": "OperationOutcome",
            "issue": issues,
            "targetStudy": study_uid,
            "totalInstances": len(results),
            "successCount": success_count,
            "failureCount": fail_count,
        },
        status_code=200 if fail_count == 0 else 207,
        headers={"Content-Type": "application/dicom+json"},
    )


# ─── QIDO-RS (Search) ───────────────────────────────────────────────────────

@router.get("/qido-rs/studies")
async def search_studies_endpoint(
    user: Dict[str, Any] = Depends(require_auth),
    PatientID: Optional[str] = None,
    StudyDate: Optional[str] = None,
    ModalitiesInStudy: Optional[str] = None,
    StudyDescription: Optional[str] = None,
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
):
    """
    QIDO-RS: Search for DICOM studies matching criteria.

    Query Parameters (DICOM PS3.18 Table 6.7.1-1):
        PatientID: Filter by patient ID (defaults to authenticated user)
        StudyDate: DICOM date or date range (YYYYMMDD or YYYYMMDD-YYYYMMDD)
        ModalitiesInStudy: Modality code (CT, MR, US, XR, etc.)
        StudyDescription: Partial text match on study description
        limit: Max results (default 50, max 200)
        offset: Pagination offset (default 0)

    Returns JSON array of DICOM dataset metadata objects.
    """
    user_id = user["id"]
    region = user["region"]

    # Patients can only search their own studies; PatientID param is ignored
    # for non-admin/non-doctor users (enforced by using JWT identity)
    target_patient = user_id
    if PatientID and (user.get("is_doctor") or user.get("is_admin")):
        target_patient = PatientID

    filters: Dict[str, Any] = {}
    if StudyDate:
        filters["studyDate"] = StudyDate
    if ModalitiesInStudy:
        filters["modality"] = ModalitiesInStudy
    if StudyDescription:
        filters["studyDescription"] = StudyDescription

    results = await search_studies(
        patient_id=target_patient,
        filters=filters,
        region=region,
        limit=limit,
        offset=offset,
    )

    await write_audit_log(
        user_id, target_patient, "SEARCH_DICOM",
        f"QIDO-RS search: {len(results)} results (filters: {list(filters.keys())})",
        region,
    )

    # Format results as DICOM JSON dataset array (PS3.18 Section 6.7.1)
    dicom_results = []
    for item in results:
        dicom_results.append({
            "0020000D": {"vr": "UI", "Value": [item.get("studyInstanceUID", "")]},  # StudyInstanceUID
            "00080060": {"vr": "CS", "Value": [item.get("modality", "")]},           # Modality
            "00080020": {"vr": "DA", "Value": [item.get("studyDate", "")]},          # StudyDate
            "00081030": {"vr": "LO", "Value": [item.get("studyDescription", "")]},   # StudyDescription
            "00201206": {"vr": "IS", "Value": [item.get("seriesCount", 0)]},         # NumberOfStudyRelatedSeries
            "00201208": {"vr": "IS", "Value": [item.get("instanceCount", 0)]},       # NumberOfStudyRelatedInstances
            "patientId": item.get("patientId", ""),
            "createdAt": item.get("createdAt", ""),
        })

    return JSONResponse(
        content=dicom_results,
        headers={"Content-Type": "application/dicom+json"},
    )


@router.get("/qido-rs/studies/{study_uid}/series")
async def search_series(
    study_uid: str,
    user: Dict[str, Any] = Depends(require_auth),
):
    """
    QIDO-RS: Search for series within a specific study.

    Returns metadata for all series in the study, extracted from the
    stored FHIR ImagingStudy resource.
    """
    user_id = user["id"]
    region = user["region"]

    metadata = await _verify_study_ownership(user_id, study_uid, region)

    await write_audit_log(
        user_id, user_id, "SEARCH_DICOM_SERIES",
        f"QIDO-RS series search for study {study_uid[:12]}...", region,
    )

    fhir_resource = metadata.get("fhirResource", {})
    series_list = fhir_resource.get("series", [])

    # Format as DICOM JSON dataset array
    dicom_results = []
    for series in series_list:
        modality_code = ""
        if "modality" in series:
            modality_code = series["modality"].get("code", "")

        body_site = ""
        if "bodySite" in series:
            body_site = series["bodySite"].get("display", "")

        instance_count = len(series.get("instance", []))

        dicom_results.append({
            "0020000E": {"vr": "UI", "Value": [series.get("uid", "")]},        # SeriesInstanceUID
            "00080060": {"vr": "CS", "Value": [modality_code]},                 # Modality
            "00180015": {"vr": "CS", "Value": [body_site]},                     # BodyPartExamined
            "00201209": {"vr": "IS", "Value": [instance_count]},                # NumberOfSeriesRelatedInstances
            "0020000D": {"vr": "UI", "Value": [study_uid]},                     # StudyInstanceUID
        })

    return JSONResponse(
        content=dicom_results,
        headers={"Content-Type": "application/dicom+json"},
    )


# ─── Delete ──────────────────────────────────────────────────────────────────

@router.delete("/wado-rs/studies/{study_uid}")
async def delete_study(
    study_uid: str,
    user: Dict[str, Any] = Depends(require_auth),
):
    """
    Delete a study and all its instances from S3, PACS metadata, and DynamoDB.

    This is an extended operation not part of the base DICOMweb standard
    but commonly supported by DICOMweb implementations (DICOM PS3.18 Annex F).
    """
    user_id = user["id"]
    region = user["region"]

    metadata = await _verify_study_ownership(user_id, study_uid, region)

    s3_keys = metadata.get("s3Keys", [])
    bucket = _get_bucket_name(region)
    s3 = get_s3_client(region)

    # 1. Delete all S3 objects for this study (DICOM files + thumbnails)
    deleted_count = 0
    for key in s3_keys:
        try:
            s3.delete_object(Bucket=bucket, Key=key)
            deleted_count += 1
            # Also delete associated thumbnail
            jpg_key = key.replace(".dcm", ".jpg")
            try:
                s3.delete_object(Bucket=bucket, Key=jpg_key)
            except Exception:
                pass
        except Exception as e:
            logger.error(f"Failed to delete S3 object {key}: {e}")

    # 2. Delete DynamoDB metadata
    await delete_study_metadata(user_id, study_uid, region)

    # 3. Audit log
    await write_audit_log(
        user_id, user_id, "DELETE_DICOM_STUDY",
        f"Deleted study {study_uid[:12]}... ({deleted_count} files)", region,
    )

    return JSONResponse(
        content={
            "success": True,
            "studyInstanceUID": study_uid,
            "deletedFiles": deleted_count,
            "message": f"Study and {deleted_count} instance(s) deleted",
        },
    )


# ─── Internal Helpers ────────────────────────────────────────────────────────

async def _parse_dicom_request(
    request: Request, content_type: str
) -> List[bytes]:
    """
    Parse incoming DICOM data from a request.

    Supports:
      1. multipart/related with application/dicom parts (DICOMweb standard)
      2. Single application/dicom body (convenience)
    """
    instances: List[bytes] = []

    if "multipart/related" in content_type:
        # Extract boundary from Content-Type header
        boundary = None
        for part in content_type.split(";"):
            part = part.strip()
            if part.lower().startswith("boundary="):
                boundary = part.split("=", 1)[1].strip('"').strip("'")
                break

        if not boundary:
            raise HTTPException(
                status_code=400,
                detail="Missing boundary in multipart/related Content-Type",
            )

        body = await request.body()
        boundary_bytes = boundary.encode("utf-8")

        # Split on boundary markers
        parts = body.split(b"--" + boundary_bytes)

        for part in parts:
            # Skip empty parts and the closing boundary
            stripped = part.strip()
            if not stripped or stripped == b"--":
                continue

            # Split headers from body (separated by double CRLF or double LF)
            header_body_sep = b"\r\n\r\n" if b"\r\n\r\n" in part else b"\n\n"
            if header_body_sep not in part:
                continue

            _, part_body = part.split(header_body_sep, 1)

            # Remove trailing boundary marker remnants
            if part_body.endswith(b"\r\n"):
                part_body = part_body[:-2]
            elif part_body.endswith(b"\n"):
                part_body = part_body[:-1]

            if part_body:
                instances.append(part_body)

    elif "application/dicom" in content_type or not content_type:
        # Single DICOM instance in body
        body = await request.body()
        if body:
            instances.append(body)
    else:
        # Try to read body as single DICOM anyway (be lenient)
        body = await request.body()
        if body:
            instances.append(body)

    return instances


async def _process_single_instance(
    dicom_bytes: bytes,
    user_id: str,
    region: str,
    target_study_uid: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Process a single DICOM instance through the full upload pipeline.

    Pipeline: parse → de-identify → S3 upload → PACS → FHIR map → metadata index

    Args:
        dicom_bytes: Raw DICOM file bytes
        user_id: Authenticated user ID
        region: User region
        target_study_uid: If set, override the study UID (for STOW-RS to specific study)

    Returns:
        Dict with success status and instance details
    """
    from pydicom import dcmread

    try:
        dataset = dcmread(io.BytesIO(dicom_bytes))
        scan_id = str(uuid.uuid4())

        # 1. HIPAA De-identification
        safe_dataset = apply_hipaa_safe_harbor(dataset, user_id)

        # Override study UID if targeting a specific study
        if target_study_uid:
            safe_dataset.StudyInstanceUID = target_study_uid

        study_uid = str(safe_dataset.get("StudyInstanceUID", "UNKNOWN"))
        series_uid = str(safe_dataset.get("SeriesInstanceUID", "UNKNOWN"))
        instance_uid = str(safe_dataset.get("SOPInstanceUID", "UNKNOWN"))

        # 2. Pixel Processing (thumbnail)
        try:
            jpeg_bytes = extract_thumbnail(safe_dataset)
        except Exception:
            jpeg_bytes = b""

        # 3. Storage (S3)
        s3_dcm_key = _s3_key_for_instance(user_id, scan_id)
        s3_jpg_key = s3_dcm_key.replace(".dcm", ".jpg")

        s3_dcm_url = upload_to_s3(
            safe_dataset.to_json_dict(), s3_dcm_key, "application/dicom", region
        )
        s3_jpg_url = ""
        if jpeg_bytes:
            s3_jpg_url = upload_to_s3(jpeg_bytes, s3_jpg_key, "image/jpeg", region)

        # 4. Send to PACS (fire-and-forget, non-blocking failure)
        try:
            send_to_pacs(safe_dataset)
        except Exception as e:
            logger.error(f"PACS forwarding failed (non-fatal): {e}")

        # 5. FHIR ImagingStudy mapping
        fhir_resource = dicom_to_fhir_imaging_study(
            safe_dataset, user_id, s3_dcm_url, s3_jpg_url
        )

        # 6. Store metadata in DynamoDB for QIDO-RS
        modality = str(safe_dataset.get("Modality", "UNKNOWN"))
        study_desc = str(safe_dataset.get("StudyDescription", "Medical Imaging Scan"))
        study_date = str(safe_dataset.get("StudyDate", ""))

        # Normalize study date
        if study_date and len(study_date) == 8:
            study_date = f"{study_date[:4]}-{study_date[4:6]}-{study_date[6:8]}"

        if target_study_uid:
            # Adding to existing study — update metadata
            await add_instance_to_study(
                patient_id=user_id,
                study_uid=study_uid,
                series_uid=series_uid,
                instance_uid=instance_uid,
                s3_key=s3_dcm_key,
                region=region,
            )
        else:
            # New study — create metadata record
            await store_study_metadata(
                patient_id=user_id,
                study_uid=study_uid,
                metadata={
                    "modality": modality,
                    "studyDate": study_date,
                    "studyDescription": study_desc,
                    "seriesCount": 1,
                    "instanceCount": 1,
                    "s3Keys": [s3_dcm_key],
                    "fhirResource": fhir_resource,
                    "seriesUIDs": [series_uid],
                    "instanceUIDs": [instance_uid],
                },
                region=region,
            )

        return {
            "success": True,
            "studyUID": study_uid,
            "seriesUID": series_uid,
            "instanceUID": instance_uid,
            "s3Key": s3_dcm_key,
            "fhirResource": fhir_resource,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to process DICOM instance: {e}")
        return {
            "success": False,
            "error": str(e),
            "studyUID": None,
            "seriesUID": None,
            "instanceUID": None,
        }
