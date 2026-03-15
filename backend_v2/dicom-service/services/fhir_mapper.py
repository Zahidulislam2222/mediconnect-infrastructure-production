
from pydicom.dataset import FileDataset
from datetime import datetime

def dicom_to_fhir_imaging_study(dataset: FileDataset, patient_id: str, s3_dcm_url: str, s3_thumb_url: str) -> dict:
    """
    Maps native DICOM metadata to an HL7 FHIR R4 'ImagingStudy' Resource.
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

    fhir_resource = {
        "resourceType": "ImagingStudy",
        "id": study_uid,
        "status": "available",
        "subject": {
            "reference": f"Patient/{patient_id}"
        },
        "started": started_date,
        "description": study_desc,
        "series":[
            {
                "uid": str(dataset.get("SeriesInstanceUID", "UNKNOWN")),
                "modality": {
                    "system": "http://dicom.nema.org/resources/ontology/DCM",
                    "code": modality
                },
                "bodySite": {
                    "display": body_part
                },
                "instance":[
                    {
                        "uid": str(dataset.get("SOPInstanceUID", "UNKNOWN")),
                        "sopClass": {
                            "system": "urn:ietf:rfc:3986",
                            "code": "urn:oid:" + str(dataset.get("SOPClassUID", "UNKNOWN"))
                        },
                        "title": "Raw DICOM File"
                    }
                ]
            }
        ],
        "endpoint":[
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
    
    return fhir_resource