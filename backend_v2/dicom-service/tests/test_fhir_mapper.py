"""
FHIR ImagingStudy mapping tests for dicom-service.

Validates that DICOM metadata is correctly mapped to HL7 FHIR R4
ImagingStudy resources. The output must conform to the FHIR R4
ImagingStudy structure for interoperability with EHR systems.
"""
from pydicom.dataset import Dataset
from pydicom.uid import generate_uid
from services.fhir_mapper import dicom_to_fhir_imaging_study


def test_imaging_study_resource_type(sample_dicom_dataset):
    """Output must have resourceType 'ImagingStudy' per FHIR R4 spec."""
    result = dicom_to_fhir_imaging_study(
        sample_dicom_dataset, "patient-123",
        "s3://bucket/scan.dcm", "s3://bucket/thumb.jpg"
    )
    assert result["resourceType"] == "ImagingStudy"


def test_imaging_study_patient_reference(sample_dicom_dataset):
    """subject.reference must be 'Patient/{id}' per FHIR reference format."""
    patient_id = "patient-abc-456"
    result = dicom_to_fhir_imaging_study(
        sample_dicom_dataset, patient_id,
        "s3://bucket/scan.dcm", "s3://bucket/thumb.jpg"
    )
    assert result["subject"]["reference"] == f"Patient/{patient_id}"


def test_imaging_study_modality(sample_dicom_dataset):
    """Modality must be mapped to series[0].modality.code."""
    sample_dicom_dataset.Modality = "MR"
    result = dicom_to_fhir_imaging_study(
        sample_dicom_dataset, "patient-123",
        "s3://bucket/scan.dcm", "s3://bucket/thumb.jpg"
    )
    series = result["series"][0]
    assert series["modality"]["code"] == "MR"
    assert series["modality"]["system"] == "http://dicom.nema.org/resources/ontology/DCM"


def test_imaging_study_missing_tags_defaults():
    """Missing DICOM tags must produce safe defaults, not exceptions.

    Real-world DICOM files often have missing optional tags. The mapper
    must handle this gracefully for robustness.
    """
    # Create a minimal dataset with almost no tags
    ds = Dataset()
    ds.SOPClassUID = "1.2.840.10008.5.1.4.1.1.2"
    ds.is_little_endian = True
    ds.is_implicit_VR = False

    result = dicom_to_fhir_imaging_study(
        ds, "patient-sparse",
        "s3://bucket/scan.dcm", ""
    )

    assert result["resourceType"] == "ImagingStudy"
    assert result["subject"]["reference"] == "Patient/patient-sparse"
    # Modality should default to UNKNOWN when not present
    series = result["series"][0]
    assert series["modality"]["code"] == "UNKNOWN"
    # Body site should default gracefully
    assert series["bodySite"]["display"] == "UNSPECIFIED"
