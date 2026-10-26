"""Automated test suite for M14 Hierarchy De-duplication, Configurable Environments & Artifacts."""
from uuid import uuid4
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from authentication import VerifiedIdentity, get_verified_identity
from database import engine
from main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def clean_auth_override():
    yield
    app.dependency_overrides.clear()


def authenticate_as(user_id):
    app.dependency_overrides[get_verified_identity] = lambda: VerifiedIdentity(
        issuer="architectiq-native", subject=str(user_id)
    )


@pytest.fixture
def dedup_env():
    tenant_id = uuid4()
    org_id = uuid4()
    folder_id = uuid4()
    user_id = uuid4()

    with engine.begin() as conn:
        conn.execute(
            text("INSERT INTO public.tenants (id, name, slug, created_at) VALUES (:t, 'Core Tenant', :slug, clock_timestamp())"),
            {"t": tenant_id, "slug": f"cten-{tenant_id.hex[:6]}"},
        )
        conn.execute(
            text("INSERT INTO public.organizations (id, tenant_id, name, slug, created_at) VALUES (:o, :t, 'Global Org', :slug, clock_timestamp())"),
            {"o": org_id, "t": tenant_id, "slug": f"gorg-{org_id.hex[:6]}"},
        )
        conn.execute(
            text("UPDATE public.tenants SET organization_id = :o WHERE id = :t"),
            {"o": org_id, "t": tenant_id},
        )
        conn.execute(
            text("INSERT INTO public.users (id, display_name, status, created_at) VALUES (:u, 'Arch Tester', 'ACTIVE', clock_timestamp())"),
            {"u": user_id},
        )
        conn.execute(
            text("INSERT INTO public.tenant_memberships (id, user_id, tenant_id, status, created_at) VALUES (:m, :u, :t, 'ACTIVE', clock_timestamp())"),
            {"m": uuid4(), "u": user_id, "t": tenant_id},
        )
        conn.execute(
            text("INSERT INTO public.folders (id, organization_id, tenant_id, name, environment_name, created_at) VALUES (:f, :o, :t, 'Claims Folder', 'DEV', clock_timestamp())"),
            {"f": folder_id, "o": org_id, "t": tenant_id},
        )

    return {
        "tenant_id": str(tenant_id),
        "org_id": str(org_id),
        "folder_id": str(folder_id),
        "user_id": user_id,
    }


def test_tenant_configurable_environments(dedup_env):
    tenant_id = dedup_env["tenant_id"]
    authenticate_as(dedup_env["user_id"])

    # 1. List tenant environments -> should return DEV, UAT, CANARY, PROD
    res = client.get(f"/api/v1/tenants/{tenant_id}/workspace/tenant-environments")
    assert res.status_code == 200
    envs = res.json()
    assert len(envs) == 4
    env_names = [e["name"] for e in envs]
    assert "DEV" in env_names
    assert "UAT" in env_names
    assert "CANARY" in env_names
    assert "PROD" in env_names

    # 2. Toggle Canary environment disabled
    res_toggle = client.put(
        f"/api/v1/tenants/{tenant_id}/workspace/tenant-environments/CANARY",
        json={"is_enabled": False},
    )
    assert res_toggle.status_code == 200
    assert res_toggle.json()["is_enabled"] is False

    # 3. Toggle back
    res_toggle_back = client.put(
        f"/api/v1/tenants/{tenant_id}/workspace/tenant-environments/CANARY",
        json={"is_enabled": True},
    )
    assert res_toggle_back.status_code == 200
    assert res_toggle_back.json()["is_enabled"] is True


def test_folder_dependencies_lifecycle(dedup_env):
    tenant_id = dedup_env["tenant_id"]
    folder_id = dedup_env["folder_id"]
    authenticate_as(dedup_env["user_id"])

    # 1. Register a dependency
    res_add = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/folders/{folder_id}/dependencies",
        json={
            "name": "@architectiq/claims-core",
            "dependency_type": "PACKAGE",
            "version": "2.4.0",
            "source_url": "https://npm.architectiq.io/@architectiq/claims-core",
            "metadata": {"license": "Commercial", "author": "Enterprise Automation"},
        },
    )
    assert res_add.status_code == 201
    dep_id = res_add.json()["id"]

    # 2. List dependencies
    res_list = client.get(f"/api/v1/tenants/{tenant_id}/workspace/folders/{folder_id}/dependencies")
    assert res_list.status_code == 200
    deps = res_list.json()
    assert len(deps) == 1
    assert deps[0]["name"] == "@architectiq/claims-core"

    # 3. Delete dependency
    res_del = client.delete(f"/api/v1/tenants/{tenant_id}/workspace/folders/{folder_id}/dependencies/{dep_id}")
    assert res_del.status_code == 204


def test_polymorphic_artifacts_registry(dedup_env):
    tenant_id = dedup_env["tenant_id"]
    folder_id = dedup_env["folder_id"]
    authenticate_as(dedup_env["user_id"])

    # 1. Create Folder-level Artifact
    res_create = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/artifacts",
        json={
            "scope_level": "FOLDER",
            "scope_id": folder_id,
            "name": "Claims Validation Schema",
            "artifact_type": "SCHEMA",
            "version": "1.0.0",
            "content": '{"type": "object", "properties": {"claimId": {"type": "string"}}}',
            "metadata": {"department": "Underwriting"},
        },
    )
    assert res_create.status_code == 201
    art_id = res_create.json()["id"]

    # 2. List artifacts for this folder
    res_list = client.get(f"/api/v1/tenants/{tenant_id}/workspace/artifacts?scope_level=FOLDER&scope_id={folder_id}")
    assert res_list.status_code == 200
    arts = res_list.json()
    assert len(arts) == 1
    assert arts[0]["name"] == "Claims Validation Schema"
