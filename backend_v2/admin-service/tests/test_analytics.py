"""
Analytics endpoint tests for admin-service.

All analytics endpoints return aggregate, anonymized data -- no PII is
exposed. This is critical for HIPAA minimum necessary standard compliance.
"""
from unittest.mock import patch, MagicMock, AsyncMock


@patch("routers.analytics.write_audit_log", new_callable=AsyncMock)
@patch("routers.analytics.get_table")
def test_overview_returns_stats(mock_get_table, mock_audit, client, mock_require_admin):
    """GET /api/v1/admin/analytics/overview returns patient/doctor/appointment counts.

    Validates that aggregate statistics are returned without PII.
    """
    mock_table = MagicMock()
    # patient scans (total, verified)
    mock_table.scan.side_effect = [
        {"Count": 100},  # total patients
        {"Count": 75},   # verified patients
        {"Count": 30},   # total doctors
        {"Count": 20},   # approved doctors
        {"Count": 5},    # pending doctors
        {"Count": 250},  # total appointments
    ]
    mock_get_table.return_value = mock_table

    response = client.get("/api/v1/admin/analytics/overview")
    assert response.status_code == 200
    data = response.json()

    assert "patients" in data
    assert "doctors" in data
    assert "appointments" in data
    assert data["patients"]["total"] == 100
    assert data["patients"]["verified"] == 75
    assert data["doctors"]["total"] == 30
    assert data["appointments"]["total"] == 250
    assert "generatedAt" in data


@patch("routers.analytics.write_audit_log", new_callable=AsyncMock)
@patch("routers.analytics.get_table")
def test_revenue_default_period(mock_get_table, mock_audit, client, mock_require_admin):
    """GET /api/v1/admin/analytics/revenue returns revenue data for default 30d period."""
    mock_table = MagicMock()
    mock_table.scan.return_value = {
        "Items": [
            {"amount": "150.00", "type": "BOOKING_FEE", "createdAt": "2026-03-01T00:00:00Z"},
            {"amount": "200.00", "type": "BOOKING_FEE", "createdAt": "2026-03-02T00:00:00Z"},
            {"amount": "50.00", "type": "REFUND", "createdAt": "2026-03-03T00:00:00Z"},
        ],
    }
    mock_get_table.return_value = mock_table

    response = client.get("/api/v1/admin/analytics/revenue")
    assert response.status_code == 200
    data = response.json()

    assert data["period"] == "30d"
    assert data["totalRevenue"] == 350.00
    assert data["totalRefunds"] == 50.00
    assert data["netRevenue"] == 300.00
    assert data["transactionCount"] == 3
    assert "generatedAt" in data


@patch("routers.analytics.write_audit_log", new_callable=AsyncMock)
@patch("routers.analytics.get_table")
def test_appointments_breakdown(mock_get_table, mock_audit, client, mock_require_admin):
    """GET /api/v1/admin/analytics/appointments returns status breakdown."""
    mock_table = MagicMock()
    mock_table.scan.return_value = {
        "Items": [
            {"status": "CONFIRMED"},
            {"status": "CONFIRMED"},
            {"status": "CANCELLED"},
            {"status": "COMPLETED"},
        ],
    }
    mock_get_table.return_value = mock_table

    response = client.get("/api/v1/admin/analytics/appointments")
    assert response.status_code == 200
    data = response.json()

    assert data["total"] == 4
    assert "byStatus" in data
    assert data["byStatus"]["CONFIRMED"] == 2
    assert data["byStatus"]["CANCELLED"] == 1
    assert data["byStatus"]["COMPLETED"] == 1
    assert "generatedAt" in data
