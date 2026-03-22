"""
Shared pytest fixtures for admin-service tests.

Provides mock AWS clients, authenticated admin users, and DynamoDB table
stubs so that no real AWS calls are made during testing.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

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
def mock_admin_user():
    """Mock authenticated admin user."""
    return {
        "id": "admin-test-123",
        "sub": "admin-test-123",
        "email": "admin@mediconnect.test",
        "fhir_id": "admin-test-123",
        "region": "us-east-1",
        "is_doctor": False,
        "is_patient": False,
        "groups": ["admin"],
    }


@pytest.fixture
def mock_require_admin(mock_admin_user):
    """Override require_admin dependency to bypass Cognito JWT verification."""
    from middleware.auth import require_admin
    app.dependency_overrides[require_admin] = lambda: mock_admin_user
    yield mock_admin_user
    app.dependency_overrides.clear()


@pytest.fixture
def mock_dynamo_table():
    """Mock DynamoDB table for testing."""
    mock_table = MagicMock()
    mock_table.scan = MagicMock(return_value={"Items": [], "Count": 0})
    mock_table.get_item = MagicMock(return_value={})
    mock_table.put_item = MagicMock(return_value={})
    mock_table.update_item = MagicMock(return_value={})
    return mock_table
