"""
HIPAA Safe Harbor de-identification tests for dicom-service.

HIPAA 164.514(b): Safe Harbor method requires removal of 18 categories
of identifiers. These tests verify that the apply_hipaa_safe_harbor()
function correctly strips PII from DICOM datasets while preserving
clinically relevant data.
"""
from services.deidentify import apply_hipaa_safe_harbor


def test_safe_harbor_removes_patient_name(sample_dicom_dataset):
    """PatientName must be anonymized (not contain original name).

    HIPAA Safe Harbor identifier #1: Names.
    """
    original_name = str(sample_dicom_dataset.PatientName)
    result = apply_hipaa_safe_harbor(sample_dicom_dataset, "secure-user-id")

    assert str(result.PatientName) != original_name
    assert str(result.PatientName) == "ANONYMIZED^PATIENT"


def test_safe_harbor_removes_birth_date(sample_dicom_dataset):
    """PatientBirthDate must be deleted from the dataset.

    HIPAA Safe Harbor identifier #3: Dates (except year) related to an individual.
    """
    assert "PatientBirthDate" in sample_dicom_dataset
    result = apply_hipaa_safe_harbor(sample_dicom_dataset, "secure-user-id")
    assert "PatientBirthDate" not in result


def test_safe_harbor_regenerates_uids(sample_dicom_dataset):
    """StudyInstanceUID must be regenerated to prevent cross-referencing.

    New UIDs prevent correlation with external PACS databases that may
    contain the original patient identity.
    """
    original_study_uid = str(sample_dicom_dataset.StudyInstanceUID)
    result = apply_hipaa_safe_harbor(sample_dicom_dataset, "secure-user-id")

    assert str(result.StudyInstanceUID) != original_study_uid
    # UID must still be a valid DICOM UID (dots and digits)
    assert "." in str(result.StudyInstanceUID)


def test_safe_harbor_preserves_modality(sample_dicom_dataset):
    """Modality tag (CT, MR, etc.) must be preserved -- it is not PII.

    Clinical data needed for diagnosis must survive de-identification.
    """
    result = apply_hipaa_safe_harbor(sample_dicom_dataset, "secure-user-id")
    assert result.Modality == "CT"


def test_safe_harbor_preserves_pixel_data(sample_dicom_dataset_with_pixels):
    """Pixel data must be unchanged by de-identification.

    De-identification targets metadata headers, not imaging data.
    Altering pixel data would compromise diagnostic value.
    """
    original_pixel_data = sample_dicom_dataset_with_pixels.PixelData
    result = apply_hipaa_safe_harbor(sample_dicom_dataset_with_pixels, "secure-user-id")
    assert result.PixelData == original_pixel_data
