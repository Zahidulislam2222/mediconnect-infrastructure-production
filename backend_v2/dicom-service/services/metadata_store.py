"""
DICOMweb Metadata Store
========================
DynamoDB-backed DICOM study metadata index for QIDO-RS search queries.
Table: mediconnect-dicom-studies (PK: patientId, SK: studyInstanceUID).

Stores study-level metadata on upload so that QIDO-RS can query by
patient, date range, modality, and description without scanning S3.
"""

import os
import logging
import time
from typing import Optional, Dict, Any, List

import boto3
from boto3.dynamodb.conditions import Key, Attr
from botocore.config import Config
from datetime import datetime, timezone

logger = logging.getLogger("dicom-metadata-store")

_aws_config = Config(retries={"max_attempts": 3, "mode": "standard"})

# --- DynamoDB Client Cache ---

_dynamo_resources: Dict[str, Any] = {}


def _normalize_region(region: str = "us-east-1") -> str:
    """Normalize region string to AWS region."""
    r = (region or "us-east-1").upper()
    return "eu-central-1" if r in ("EU", "EU-CENTRAL-1") else "us-east-1"


def _get_table(region: str):
    """Returns the DynamoDB Table resource for DICOM studies."""
    target = _normalize_region(region)
    if target not in _dynamo_resources:
        _dynamo_resources[target] = boto3.resource(
            "dynamodb", region_name=target, config=_aws_config
        )
    table_name = os.getenv("TABLE_DICOM_STUDIES", "mediconnect-dicom-studies")
    return _dynamo_resources[target].Table(table_name)


async def store_study_metadata(
    patient_id: str,
    study_uid: str,
    metadata: Dict[str, Any],
    region: str = "us-east-1",
) -> Dict[str, Any]:
    """
    Store or update DICOM study metadata in DynamoDB.

    Args:
        patient_id: MediConnect patient UUID (after de-identification)
        study_uid: DICOM StudyInstanceUID
        metadata: Dict with keys: modality, studyDate, studyDescription,
                  seriesUIDs, s3Keys, fhirResource, etc.
        region: User region for multi-region routing

    Returns:
        The stored item dict
    """
    table = _get_table(region)
    now = datetime.now(timezone.utc).isoformat()
    ttl = int(time.time()) + (7 * 365 * 24 * 60 * 60)  # 7-year retention

    item = {
        "patientId": patient_id,
        "studyInstanceUID": study_uid,
        "modality": metadata.get("modality", "UNKNOWN"),
        "studyDate": metadata.get("studyDate", now[:10]),
        "studyDescription": metadata.get("studyDescription", "Medical Imaging Scan"),
        "seriesCount": metadata.get("seriesCount", 1),
        "instanceCount": metadata.get("instanceCount", 1),
        "s3Keys": metadata.get("s3Keys", []),
        "fhirResource": metadata.get("fhirResource", {}),
        "seriesUIDs": metadata.get("seriesUIDs", []),
        "instanceUIDs": metadata.get("instanceUIDs", []),
        "createdAt": now,
        "updatedAt": now,
        "region": _normalize_region(region),
        "ttl": ttl,
    }

    try:
        table.put_item(Item=item)
        logger.info(f"Stored DICOM metadata: study={study_uid[:12]}... patient={patient_id[:8]}...")
        return item
    except Exception as e:
        logger.error(f"Failed to store DICOM metadata: {e}")
        raise


async def get_study_metadata(
    patient_id: str,
    study_uid: str,
    region: str = "us-east-1",
) -> Optional[Dict[str, Any]]:
    """
    Get a single study's metadata by patient ID and study UID.

    Returns:
        The study metadata dict, or None if not found
    """
    table = _get_table(region)

    try:
        response = table.get_item(
            Key={"patientId": patient_id, "studyInstanceUID": study_uid}
        )
        return response.get("Item")
    except Exception as e:
        logger.error(f"Failed to get DICOM metadata: {e}")
        raise


async def search_studies(
    patient_id: str,
    filters: Optional[Dict[str, Any]] = None,
    region: str = "us-east-1",
    limit: int = 50,
    offset: int = 0,
) -> List[Dict[str, Any]]:
    """
    Query studies by patient ID with optional filters.

    Filters:
        - studyDate: ISO date string (exact match or range with "YYYYMMDD-YYYYMMDD")
        - modality: DICOM modality code (CT, MR, US, etc.)
        - studyDescription: Partial match (contains)

    Returns:
        List of study metadata dicts
    """
    table = _get_table(region)
    filters = filters or {}

    try:
        # Base query on patientId partition key
        key_condition = Key("patientId").eq(patient_id)

        # Build filter expression from optional params
        filter_expr = None

        if filters.get("modality"):
            modality_filter = Attr("modality").eq(filters["modality"])
            filter_expr = modality_filter if filter_expr is None else filter_expr & modality_filter

        if filters.get("studyDate"):
            date_val = filters["studyDate"]
            # Support DICOM date range format: YYYYMMDD-YYYYMMDD
            if "-" in date_val and len(date_val) > 8:
                parts = date_val.split("-", 1)
                start_date = parts[0]
                end_date = parts[1]
                # Normalize to ISO format for DynamoDB comparison
                if len(start_date) == 8:
                    start_date = f"{start_date[:4]}-{start_date[4:6]}-{start_date[6:8]}"
                if len(end_date) == 8:
                    end_date = f"{end_date[:4]}-{end_date[4:6]}-{end_date[6:8]}"
                date_filter = Attr("studyDate").between(start_date, end_date)
            else:
                # Exact date match — normalize YYYYMMDD to YYYY-MM-DD
                if len(date_val) == 8 and date_val.isdigit():
                    date_val = f"{date_val[:4]}-{date_val[4:6]}-{date_val[6:8]}"
                date_filter = Attr("studyDate").eq(date_val)
            filter_expr = date_filter if filter_expr is None else filter_expr & date_filter

        if filters.get("studyDescription"):
            desc_filter = Attr("studyDescription").contains(filters["studyDescription"])
            filter_expr = desc_filter if filter_expr is None else filter_expr & desc_filter

        query_kwargs: Dict[str, Any] = {
            "KeyConditionExpression": key_condition,
        }
        if filter_expr is not None:
            query_kwargs["FilterExpression"] = filter_expr

        response = table.query(**query_kwargs)
        items = response.get("Items", [])

        # Sort by studyDate descending (most recent first)
        items.sort(key=lambda x: x.get("studyDate", ""), reverse=True)

        # Apply offset and limit
        return items[offset : offset + limit]

    except Exception as e:
        logger.error(f"Failed to search DICOM studies: {e}")
        raise


async def delete_study_metadata(
    patient_id: str,
    study_uid: str,
    region: str = "us-east-1",
) -> bool:
    """
    Delete a study's metadata from DynamoDB.

    Returns:
        True if deletion succeeded
    """
    table = _get_table(region)

    try:
        table.delete_item(
            Key={"patientId": patient_id, "studyInstanceUID": study_uid}
        )
        logger.info(f"Deleted DICOM metadata: study={study_uid[:12]}... patient={patient_id[:8]}...")
        return True
    except Exception as e:
        logger.error(f"Failed to delete DICOM metadata: {e}")
        raise


async def add_instance_to_study(
    patient_id: str,
    study_uid: str,
    series_uid: str,
    instance_uid: str,
    s3_key: str,
    region: str = "us-east-1",
) -> None:
    """
    Add a new instance (series UID, instance UID, S3 key) to an existing study.
    Used when STOW-RS adds instances to a pre-existing study.
    """
    table = _get_table(region)
    now = datetime.now(timezone.utc).isoformat()

    try:
        table.update_item(
            Key={"patientId": patient_id, "studyInstanceUID": study_uid},
            UpdateExpression=(
                "SET updatedAt = :now, "
                "instanceCount = if_not_exists(instanceCount, :zero) + :one, "
                "s3Keys = list_append(if_not_exists(s3Keys, :empty_list), :new_key), "
                "seriesUIDs = list_append(if_not_exists(seriesUIDs, :empty_list), :new_series), "
                "instanceUIDs = list_append(if_not_exists(instanceUIDs, :empty_list), :new_instance)"
            ),
            ExpressionAttributeValues={
                ":now": now,
                ":zero": 0,
                ":one": 1,
                ":empty_list": [],
                ":new_key": [s3_key],
                ":new_series": [series_uid],
                ":new_instance": [instance_uid],
            },
        )
    except Exception as e:
        logger.error(f"Failed to add instance to study: {e}")
        raise
