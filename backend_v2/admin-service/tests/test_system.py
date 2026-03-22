"""
System management endpoint tests for admin-service.

Validates the service registry and platform configuration endpoints.
The config endpoint must never expose secrets (HIPAA technical safeguard).
"""
from unittest.mock import patch


def test_services_list(client, mock_require_admin):
    """GET /api/v1/admin/system/services returns all 7 registered microservices."""
    response = client.get("/api/v1/admin/system/services")
    assert response.status_code == 200
    data = response.json()

    assert data["count"] == 7
    service_names = [s["name"] for s in data["services"]]
    assert "patient-service" in service_names
    assert "doctor-service" in service_names
    assert "booking-service" in service_names
    assert "communication-service" in service_names
    assert "admin-service" in service_names
    assert "staff-service" in service_names
    assert "dicom-service" in service_names


def test_config_no_secrets(client, mock_require_admin):
    """GET /api/v1/admin/system/config returns config without secret values.

    HIPAA 164.312(a)(1): Access control -- secrets must never be exposed,
    even to admin users. Only feature flags and non-sensitive metadata.
    """
    response = client.get("/api/v1/admin/system/config")
    assert response.status_code == 200
    data = response.json()

    # Verify expected structure
    assert "environment" in data
    assert "features" in data
    assert "versions" in data

    # Verify boolean feature flags
    features = data["features"]
    assert features["gdprEnabled"] is True
    assert features["hipaaCompliant"] is True

    # Verify no secrets are leaked in the response
    response_str = str(data).lower()
    forbidden_keys = ["password", "secret", "token", "private_key", "api_key"]
    for key in forbidden_keys:
        assert key not in response_str, f"Config response may contain secret: {key}"
