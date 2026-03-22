"""
Health endpoint tests for dicom-service.

The /health endpoint is unauthenticated by design for Kubernetes
liveness probes and must always return 200.
"""


def test_health_returns_200(client):
    """GET /health returns 200 with status UP for K8s liveness probe."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "UP"
    assert data["service"] == "dicom-worker"
