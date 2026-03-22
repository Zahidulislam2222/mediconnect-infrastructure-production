
from pydicom.dataset import FileDataset
from datetime import datetime
from services.transfer_syntaxes import get_transfer_syntax_info

def dicom_to_fhir_imaging_study(dataset: FileDataset, patient_id: str, s3_dcm_url: str, s3_thumb_url: str) -> dict:
    """
    Maps native DICOM metadata to an HL7 FHIR R4 'ImagingStudy' Resource.
    Includes transfer syntax information from the original DICOM file.
    """

    # Safely extract tags, defaulting to "UNKNOWN" if missing
    study_uid = str(dataset.get("StudyInstanceUID", f"urn:uuid:{patient_id}-study"))
    modality = str(dataset.get("Modality", "UNKNOWN"))
    body_part = str(dataset.get("BodyPartExamined", "UNSPECIFIED"))
    study_desc = str(dataset.get("StudyDescription", "Medical Imaging Scan"))

    # Parse DICOM Date (YYYYMMDD) to FHIR Date (YYYY-MM-DDThh:mm:ssZ)
    study_date = dataset.get("StudyDate", None)
    started_date = datetime.utcnow().isoformat() + "Z"
    if study_date and len(study_date) == 8:
        started_date = f"{study_date[:4]}-{study_date[4:6]}-{study_date[6:8]}T00:00:00Z"

    # Extract transfer syntax metadata from the DICOM file meta header
    transfer_syntax_uid = ""
    transfer_syntax_name = "Unknown"
    if hasattr(dataset, "file_meta") and hasattr(dataset.file_meta, "TransferSyntaxUID"):
        transfer_syntax_uid = str(dataset.file_meta.TransferSyntaxUID)
        ts_info = get_transfer_syntax_info(transfer_syntax_uid)
        transfer_syntax_name = ts_info.get("name", "Unknown")

    # Build the instance entry with transfer syntax info
    instance_entry = {
        "uid": str(dataset.get("SOPInstanceUID", "UNKNOWN")),
        "sopClass": {
            "system": "urn:ietf:rfc:3986",
            "code": "urn:oid:" + str(dataset.get("SOPClassUID", "UNKNOWN"))
        },
        "title": "Raw DICOM File"
    }

    # Build the series entry
    series_entry = {
        "uid": str(dataset.get("SeriesInstanceUID", "UNKNOWN")),
        "modality": {
            "system": "http://dicom.nema.org/resources/ontology/DCM",
            "code": modality
        },
        "bodySite": {
            "display": body_part
        },
        "instance": [instance_entry]
    }

    fhir_resource = {
        "resourceType": "ImagingStudy",
        "id": study_uid,
        "status": "available",
        "subject": {
            "reference": f"Patient/{patient_id}"
        },
        "started": started_date,
        "description": study_desc,
        "series": [series_entry],
        "endpoint": [
            {
                "reference": s3_dcm_url,
                "display": "S3 Raw DICOM Storage"
            },
            {
                "reference": s3_thumb_url,
                "display": "S3 JPEG Thumbnail"
            }
        ]
    }

    # Add transfer syntax metadata as an extension (FHIR R4 extension pattern)
    if transfer_syntax_uid:
        fhir_resource["extension"] = [
            {
                "url": "http://mediconnect.health/fhir/StructureDefinition/dicom-transfer-syntax",
                "extension": [
                    {
                        "url": "uid",
                        "valueOid": f"urn:oid:{transfer_syntax_uid}",
                    },
                    {
                        "url": "name",
                        "valueString": transfer_syntax_name,
                    },
                ],
            }
        ]

    return fhir_resource
