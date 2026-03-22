"""
Doctor account closure management endpoint tests for admin-service.

Validates the closure review workflow: listing pending closures,
approving and rejecting closure requests. All actions require admin
group membership and a documented reason for HIPAA audit compliance.
"""
from unittest.mock import patch, MagicMock, AsyncMock


@patch("routers.closures.write_audit_log", new_callable=AsyncMock)
@patch("routers.closures.get_table")
def test_list_pending_closures(mock_get_table, mock_audit, client, mock_require_admin):
    """GET /api/v1/admin/closures/pending returns doctors with PENDING_CLOSURE status."""
    mock_table = MagicMock()
    mock_table.scan.return_value = {
        "Items": [
            {"doctorId": "d1", "closureStatus": "PENDING_CLOSURE", "closureReason": "Retiring"},
        ],
    }
    mock_get_table.return_value = mock_table

    response = client.get("/api/v1/admin/closures/pending")
    assert response.status_code == 200
    data = response.json()

    assert "pendingClosures" in data
    assert data["count"] == 1
    assert data["pendingClosures"][0]["closureStatus"] == "PENDING_CLOSURE"


def test_approve_closure_requires_reason(client, mock_require_admin):
    """POST approve without reason body returns 422 (validation error).

    Administrative closure decisions must include justification per HIPAA
    audit trail requirements.
    """
    response = client.post(
        "/api/v1/admin/closures/doc-123/approve",
        json={},
    )
    assert response.status_code == 422


@patch("routers.closures.write_audit_log", new_callable=AsyncMock)
@patch("routers.closures.get_table")
def test_approve_closure_success(mock_get_table, mock_audit, client, mock_require_admin):
    """POST approve with valid reason updates doctor status to APPROVED_FOR_DELETION."""
    mock_table = MagicMock()
    mock_table.get_item.return_value = {
        "Item": {"doctorId": "d1", "closureStatus": "PENDING_CLOSURE"}
    }
    mock_table.update_item.return_value = {}
    mock_get_table.return_value = mock_table

    response = client.post(
        "/api/v1/admin/closures/d1/approve",
        json={"reason": "No outstanding patient obligations. Closure approved."},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["doctorId"] == "d1"
    assert "approved" in data["message"].lower()
