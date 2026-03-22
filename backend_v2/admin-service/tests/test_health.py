"""
Health and readiness endpoint tests for admin-service.

These endpoints are unauthenticated by design for Kubernetes liveness
and readiness probes. They must always return 200 with service identity.
"""


def test_health_returns_200(client):
    """GET /health returns 200 with status UP for K8s liveness probe."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "UP"
    assert data["service"] == "admin-service"


def test_ready_returns_200(client):
    """GET /ready returns 200 with status READY for K8s readiness probe."""
    response = client.get("/ready")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "READY"
    assert data["type"] == "readiness"
    assert data["service"] == "admin-service"
