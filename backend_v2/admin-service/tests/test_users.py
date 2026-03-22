"""
User management endpoint tests for admin-service.

Validates the admin user management API: listing, suspending, and
reactivating patient and doctor accounts. All endpoints require admin
group membership (HIPAA administrative safeguard -- access control).
"""
import pytest
from unittest.mock import patch, MagicMock, AsyncMock


# ---------------------------------------------------------------------------
# AUTH GUARD TESTS
# ---------------------------------------------------------------------------

def test_list_patients_requires_admin(client):
    """GET /api/v1/admin/users/patients without auth returns 401.

    HIPAA requirement: All admin endpoints must enforce authentication.
    """
    response = client.get("/api/v1/admin/users/patients")
    assert response.status_code in (401, 403)


# ---------------------------------------------------------------------------
# PATIENT MANAGEMENT
# ---------------------------------------------------------------------------

@patch("routers.users.write_audit_log", new_callable=AsyncMock)
@patch("routers.users.get_table")
def test_list_patients_returns_list(mock_get_table, mock_audit, client, mock_require_admin):
    """GET /api/v1/admin/users/patients returns paginated patient list."""
    mock_table = MagicMock()
    mock_table.scan.return_value = {
        "Items": [
            {"patientId": "p1", "email": "p1@test.com", "status": "ACTIVE"},
            {"patientId": "p2", "email": "p2@test.com", "status": "ACTIVE"},
        ],
        "Count": 2,
    }
    mock_get_table.return_value = mock_table

    response = client.get("/api/v1/admin/users/patients")
    assert response.status_code == 200
    data = response.json()
    assert "patients" in data
    assert data["count"] == 2
    assert len(data["patients"]) == 2


@patch("routers.users.write_audit_log", new_callable=AsyncMock)
@patch("routers.users.get_table")
def test_get_patient_not_found(mock_get_table, mock_audit, client, mock_require_admin):
    """GET /api/v1/admin/users/patients/<id> returns 404 for nonexistent patient."""
    mock_table = MagicMock()
    mock_table.get_item.return_value = {}  # No "Item" key
    mock_get_table.return_value = mock_table

    response = client.get("/api/v1/admin/users/patients/nonexistent-id")
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


def test_suspend_patient_requires_reason(client, mock_require_admin):
    """POST suspend without reason body returns 422 (Pydantic validation).

    Administrative actions must include justification for HIPAA audit trail.
    """
    response = client.post(
        "/api/v1/admin/users/patients/p1/suspend",
        json={},
    )
    assert response.status_code == 422


@patch("routers.users.write_audit_log", new_callable=AsyncMock)
@patch("routers.users.get_table")
def test_suspend_patient_success(mock_get_table, mock_audit, client, mock_require_admin):
    """POST suspend with valid reason succeeds and returns confirmation."""
    mock_table = MagicMock()
    mock_table.get_item.return_value = {
        "Item": {"patientId": "p1", "status": "ACTIVE"}
    }
    mock_table.update_item.return_value = {}
    mock_get_table.return_value = mock_table

    response = client.post(
        "/api/v1/admin/users/patients/p1/suspend",
        json={"reason": "Suspicious activity detected"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["patientId"] == "p1"
    assert "suspended" in data["message"].lower()


@patch("routers.users.write_audit_log", new_callable=AsyncMock)
@patch("routers.users.get_table")
def test_reactivate_patient_success(mock_get_table, mock_audit, client, mock_require_admin):
    """POST reactivate a suspended patient account returns 200."""
    mock_table = MagicMock()
    mock_table.get_item.return_value = {
        "Item": {"patientId": "p1", "status": "SUSPENDED"}
    }
    mock_table.update_item.return_value = {}
    mock_get_table.return_value = mock_table

    response = client.post(
        "/api/v1/admin/users/patients/p1/reactivate",
        json={"reason": "Investigation complete, account cleared"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["patientId"] == "p1"
    assert "reactivated" in data["message"].lower()


# ---------------------------------------------------------------------------
# DOCTOR MANAGEMENT
# ---------------------------------------------------------------------------

@patch("routers.users.write_audit_log", new_callable=AsyncMock)
@patch("routers.users.get_table")
def test_list_doctors_returns_list(mock_get_table, mock_audit, client, mock_require_admin):
    """GET /api/v1/admin/users/doctors returns paginated doctor list."""
    mock_table = MagicMock()
    mock_table.scan.return_value = {
        "Items": [
            {"doctorId": "d1", "verificationStatus": "APPROVED"},
        ],
        "Count": 1,
    }
    mock_get_table.return_value = mock_table

    response = client.get("/api/v1/admin/users/doctors")
    assert response.status_code == 200
    data = response.json()
    assert "doctors" in data
    assert data["count"] == 1


@patch("routers.users.write_audit_log", new_callable=AsyncMock)
@patch("routers.users.get_table")
def test_suspend_doctor_success(mock_get_table, mock_audit, client, mock_require_admin):
    """POST suspend doctor with valid reason succeeds."""
    mock_table = MagicMock()
    mock_table.get_item.return_value = {
        "Item": {"doctorId": "d1", "verificationStatus": "APPROVED"}
    }
    mock_table.update_item.return_value = {}
    mock_get_table.return_value = mock_table

    response = client.post(
        "/api/v1/admin/users/doctors/d1/suspend",
        json={"reason": "License revoked by medical board"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["doctorId"] == "d1"
    assert "suspended" in data["message"].lower()
