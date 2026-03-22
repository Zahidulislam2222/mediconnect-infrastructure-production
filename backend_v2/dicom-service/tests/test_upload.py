"""
DICOM upload endpoint tests for dicom-service.

Validates that the /api/v1/upload endpoint enforces authentication
and handles invalid DICOM files gracefully. The upload endpoint was
previously a CVSS 9.1 vulnerability (unauthenticated header-based
identity) and must now require Cognito JWT verification.
"""
import io
from unittest.mock import patch, MagicMock, AsyncMock


def test_upload_requires_auth(client):
    """POST /api/v1/upload without auth returns 401.

    Critical security test: this endpoint previously accepted
    unauthenticated requests using spoofable headers. The Cognito
    JWT requirement is the fix for that vulnerability.
    """
    fake_file = io.BytesIO(b"not-a-dicom-file")
    response = client.post(
        "/api/v1/upload",
        files={"file": ("test.dcm", fake_file, "application/dicom")},
    )
    assert response.status_code == 401


@patch("routers.imaging.write_audit_log", new_callable=AsyncMock)
def test_upload_invalid_dicom(mock_audit, client, mock_require_auth):
    """POST /api/v1/upload with non-DICOM file returns 500 (parse error).

    The service must reject files that cannot be parsed as valid DICOM.
    The error is caught and logged for audit purposes.
    """
    fake_file = io.BytesIO(b"this is not a valid DICOM file at all")
    response = client.post(
        "/api/v1/upload",
        files={"file": ("bad_file.dcm", fake_file, "application/dicom")},
    )
    assert response.status_code == 500
    assert "dicom" in response.json()["detail"].lower() or \
           "processing" in response.json()["detail"].lower()
