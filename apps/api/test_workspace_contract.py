"""Fast, isolated workspace API contract checks; DB security tests run separately."""
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_workspace_requires_authentication():
    for path in ("tree", "summary"):
        response = client.get(f"/api/v1/tenants/11111111-1111-4111-8111-111111111111/workspace/{path}")
        assert response.status_code == 401

def test_workspace_mutations_require_authentication():
    response = client.post("/api/v1/tenants/11111111-1111-4111-8111-111111111111/workspace/organizations", json={"name":"Blocked","slug":"blocked"})
    assert response.status_code == 401
