"""
Shared pytest fixtures for dicom-service tests.

Provides mock AWS clients, authenticated users, and pydicom dataset
factories so that no real AWS calls or PACS connections are made.
"""
import pytest
import numpy as np
from unittest.mock import AsyncMock, MagicMock, patch
from pydicom.dataset import Dataset, FileDataset
from pydicom.uid import generate_uid, ExplicitVRLittleEndian

# Mock boto3 before importing app to prevent real AWS connections at module load
with patch("boto3.resource") as mock_resource, \
     patch("boto3.client") as mock_client:
    from main import app

from fastapi.testclient import TestClient


@pytest.fixture
def client():
    """FastAPI test client."""
    return TestClient(app)


@pytest.fixture
def mock_auth_user():
    """Mock authenticated user (patient or doctor)."""
    return {
        "id": "user-test-456",
        "sub": "user-test-456",
        "email": "user@mediconnect.test",
        "fhir_id": "user-test-456",
        "region": "us-east-1",
        "is_doctor": False,
        "is_patient": True,
    }


@pytest.fixture
def mock_require_auth(mock_auth_user):
    """Override require_auth dependency to bypass Cognito JWT verification."""
    from middleware.auth import require_auth
    app.dependency_overrides[require_auth] = lambda: mock_auth_user
    yield mock_auth_user
    app.dependency_overrides.clear()


@pytest.fixture
def sample_dicom_dataset():
    """Create a minimal valid DICOM dataset for testing.

    Includes the tags that the de-identification and FHIR mapper expect.
    """
    ds = Dataset()
    ds.PatientName = "DOE^JOHN"
    ds.PatientID = "original-patient-id"
    ds.PatientBirthDate = "19800115"
    ds.PatientSex = "M"
    ds.StudyInstanceUID = generate_uid()
    ds.SeriesInstanceUID = generate_uid()
    ds.SOPInstanceUID = generate_uid()
    ds.SOPClassUID = "1.2.840.10008.5.1.4.1.1.2"  # CT Image Storage
    ds.Modality = "CT"
    ds.BodyPartExamined = "CHEST"
    ds.StudyDescription = "CT Chest with Contrast"
    ds.InstitutionName = "Test Hospital"
    ds.ReferringPhysicianName = "DR^SMITH"
    ds.is_little_endian = True
    ds.is_implicit_VR = False
    return ds


@pytest.fixture
def sample_dicom_dataset_with_pixels(sample_dicom_dataset):
    """DICOM dataset with an 8x8 pixel array for thumbnail extraction tests."""
    ds = sample_dicom_dataset
    ds.Rows = 8
    ds.Columns = 8
    ds.BitsAllocated = 16
    ds.BitsStored = 12
    ds.HighBit = 11
    ds.PixelRepresentation = 0
    ds.SamplesPerPixel = 1
    ds.PhotometricInterpretation = "MONOCHROME2"
    # Create an 8x8 pixel array with values 0-63
    pixel_data = np.arange(64, dtype=np.uint16).reshape(8, 8)
    ds.PixelData = pixel_data.tobytes()
    ds._pixel_array = pixel_data  # Cache for pixel_array property
    return ds
