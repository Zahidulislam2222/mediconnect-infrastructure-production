"""
Audit log endpoint tests for admin-service.

HIPAA compliance requirement: All access to PHI must be logged and
audit logs must be accessible to compliance officers. These tests
verify the audit log viewer and the underlying write_audit_log function.
"""
import asyncio
from unittest.mock import patch, MagicMock, AsyncMock
import uuid


@patch("routers.audit.write_audit_log", new_callable=AsyncMock)
@patch("routers.audit.get_table")
def test_list_audit_logs(mock_get_table, mock_audit, client, mock_require_admin):
    """GET /api/v1/admin/audit/logs returns audit log entries.

    HIPAA 164.312(b): Audit controls -- mechanism to examine activity.
    """
    mock_table = MagicMock()
    mock_table.scan.return_value = {
        "Items": [
            {
                "logId": str(uuid.uuid4()),
                "actorId": "admin-1",
                "action": "ADMIN_VIEW_PATIENT",
                "timestamp": "2026-03-20T10:00:00Z",
            },
            {
                "logId": str(uuid.uuid4()),
                "actorId": "admin-1",
                "action": "ADMIN_SUSPEND_PATIENT",
                "timestamp": "2026-03-20T09:00:00Z",
            },
        ],
    }
    mock_get_table.return_value = mock_table

    response = client.get("/api/v1/admin/audit/logs")
    assert response.status_code == 200
    data = response.json()

    assert "logs" in data
    assert data["count"] == 2
    # Verify logs are sorted by timestamp descending
    assert data["logs"][0]["timestamp"] >= data["logs"][1]["timestamp"]


def test_audit_actions_list(client, mock_require_admin):
    """GET /api/v1/admin/audit/logs/actions returns known action types.

    Used by the frontend filter dropdown for audit log queries.
    """
    response = client.get("/api/v1/admin/audit/logs/actions")
    assert response.status_code == 200
    data = response.json()

    assert "actions" in data
    actions = data["actions"]
    assert len(actions) > 0
    # Verify critical security actions are included
    assert "HIPAA_VIOLATION_ATTEMPT" in actions
    assert "ADMIN_SUSPEND_PATIENT" in actions
    assert "ADMIN_SUSPEND_DOCTOR" in actions
    assert "CREATE_PROFILE" in actions


@patch("routers.audit.write_audit_log", new_callable=AsyncMock)
@patch("routers.audit.get_table")
def test_user_audit_trail(mock_get_table, mock_audit, client, mock_require_admin):
    """GET /api/v1/admin/audit/logs/user/{id} returns audit trail for a specific user.

    HIPAA compliance investigation support: admins must be able to pull
    complete activity history for any user during a security incident.
    """
    target_user_id = "patient-abc-123"
    mock_table = MagicMock()
    mock_table.scan.return_value = {
        "Items": [
            {
                "logId": str(uuid.uuid4()),
                "actorId": target_user_id,
                "action": "CREATE_PROFILE",
                "timestamp": "2026-03-01T10:00:00Z",
            },
        ],
    }
    mock_get_table.return_value = mock_table

    response = client.get(f"/api/v1/admin/audit/logs/user/{target_user_id}")
    assert response.status_code == 200
    data = response.json()

    assert data["userId"] == target_user_id
    assert "logs" in data
    assert data["count"] == 1


@patch("utils.audit.publish_event", new_callable=AsyncMock)
@patch("utils.audit.check_for_breach", new_callable=AsyncMock)
@patch("boto3.resource")
def test_audit_write_function(mock_boto_resource, mock_breach, mock_event):
    """Test write_audit_log creates a DynamoDB item with required fields.

    HIPAA 164.312(b): Every audit entry must contain actor, target, action,
    timestamp, and service identity for non-repudiation.
    """
    from utils.audit import write_audit_log

    mock_table = MagicMock()
    mock_db = MagicMock()
    mock_db.Table.return_value = mock_table
    mock_boto_resource.return_value = mock_db

    asyncio.run(
        write_audit_log(
            actor_id="admin-1",
            target_id="patient-1",
            action="ADMIN_VIEW_PATIENT",
            description="Admin viewed patient record",
            region="us-east-1",
        )
    )

    mock_table.put_item.assert_called_once()
    item = mock_table.put_item.call_args[1]["Item"]
    assert item["actorId"] == "admin-1"
    assert item["targetId"] == "patient-1"
    assert item["action"] == "ADMIN_VIEW_PATIENT"
    assert item["service"] == "admin-service"
    assert "timestamp" in item
    assert "logId" in item
