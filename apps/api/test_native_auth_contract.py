from native_auth import router, validate_native_token
from fastapi.testclient import TestClient
from fastapi import FastAPI

def test_native_routes_exist():
    paths = {r.path for r in router.routes}
    assert '/api/v1/auth/native/login' in paths
    assert '/api/v1/auth/native/logout' in paths

def test_login_rejects_invalid_payload_without_db():
    app = FastAPI(); app.include_router(router)
    response = TestClient(app).post('/api/v1/auth/native/login',json={'email':'invalid','password':'x'})
    assert response.status_code == 422
