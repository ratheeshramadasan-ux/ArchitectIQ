"""Comprehensive automated tests for Integration Registry, Tools, and Project Packaging (Milestone M10).

Covers:
- INT-01: Connectors, Credential Vault references, Governed Tool Registry, and Tool Invocation.
- WS-04: Workspace Packaging, Export Bundles, Template Marketplace, and Project Cloning.
"""
from __future__ import annotations

import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from authentication import VerifiedIdentity, get_verified_identity
from database import engine
from main import app

client = TestClient(app)


def authenticate_as(user_id: uuid.UUID):
    app.dependency_overrides[get_verified_identity] = lambda: VerifiedIdentity(
        issuer="architectiq-native", subject=str(user_id)
    )


@pytest.fixture
def integration_env():
    tenant_id = uuid.uuid4()
    org_id = uuid.uuid4()
    folder_id = uuid.uuid4()
    project_id = uuid.uuid4()
    owner_id = uuid.uuid4()
    other_tenant_id = uuid.uuid4()
    other_user_id = uuid.uuid4()
    other_project_id = uuid.uuid4()
    other_org_id = uuid.uuid4()
    other_folder_id = uuid.uuid4()

    suffix = uuid.uuid4().hex[:6]

    with engine.begin() as conn:
        conn.execute(
            text("INSERT INTO public.tenants (id, name, slug, created_at) VALUES (:t, 'Integration Tenant', :slug, clock_timestamp())"),
            {"t": tenant_id, "slug": f"int-t-{suffix}"},
        )
        conn.execute(
            text("INSERT INTO public.tenants (id, name, slug, created_at) VALUES (:t, 'Other Tenant', :slug, clock_timestamp())"),
            {"t": other_tenant_id, "slug": f"other-t-{suffix}"},
        )
        conn.execute(
            text("INSERT INTO public.users (id, display_name, status, created_at) VALUES (:u, 'Integration Admin', 'ACTIVE', clock_timestamp())"),
            {"u": owner_id},
        )
        conn.execute(
            text("INSERT INTO public.users (id, display_name, status, created_at) VALUES (:u, 'Other User', 'ACTIVE', clock_timestamp())"),
            {"u": other_user_id},
        )
        conn.execute(
            text("INSERT INTO public.tenant_memberships (id, user_id, tenant_id, status, created_at) VALUES (:m, :u, :t, 'ACTIVE', clock_timestamp())"),
            {"m": uuid.uuid4(), "u": owner_id, "t": tenant_id},
        )
        conn.execute(
            text("INSERT INTO public.tenant_memberships (id, user_id, tenant_id, status, created_at) VALUES (:m, :u, :t, 'ACTIVE', clock_timestamp())"),
            {"m": uuid.uuid4(), "u": other_user_id, "t": other_tenant_id},
        )
        conn.execute(
            text("INSERT INTO public.organizations (id, tenant_id, name, slug, created_at) VALUES (:o, :t, 'Integration Org', :slug, clock_timestamp())"),
            {"o": org_id, "t": tenant_id, "slug": f"int-org-{suffix}"},
        )
        conn.execute(
            text("INSERT INTO public.organizations (id, tenant_id, name, slug, created_at) VALUES (:o, :t, 'Other Org', :slug, clock_timestamp())"),
            {"o": other_org_id, "t": other_tenant_id, "slug": f"other-org-{suffix}"},
        )
        conn.execute(
            text("INSERT INTO public.folders (id, organization_id, name, created_at) VALUES (:f, :o, 'Int Folder', clock_timestamp())"),
            {"f": folder_id, "o": org_id},
        )
        conn.execute(
            text("INSERT INTO public.folders (id, organization_id, name, created_at) VALUES (:f, :o, 'Other Folder', clock_timestamp())"),
            {"f": other_folder_id, "o": other_org_id},
        )
        conn.execute(
            text("INSERT INTO public.projects (id, folder_id, name, lifecycle_status, created_at) VALUES (:p, :f, 'Core Integration Hub', 'ACTIVE', clock_timestamp())"),
            {"p": project_id, "f": folder_id},
        )
        conn.execute(
            text("INSERT INTO public.projects (id, folder_id, name, lifecycle_status, created_at) VALUES (:p, :f, 'Other Project', 'ACTIVE', clock_timestamp())"),
            {"p": other_project_id, "f": other_folder_id},
        )
        conn.execute(
            text("INSERT INTO public.project_memberships (id, tenant_id, project_id, user_id, role, created_at) VALUES (:pm, :t, :p, :u, 'OWNER', clock_timestamp())"),
            {"pm": uuid.uuid4(), "t": tenant_id, "p": project_id, "u": owner_id},
        )
        conn.execute(
            text("INSERT INTO public.project_memberships (id, tenant_id, project_id, user_id, role, created_at) VALUES (:pm, :t, :p, :u, 'OWNER', clock_timestamp())"),
            {"pm": uuid.uuid4(), "t": other_tenant_id, "p": other_project_id, "u": other_user_id},
        )

    return {
        "tenant_id": str(tenant_id),
        "project_id": str(project_id),
        "owner_id": owner_id,
        "other_tenant_id": str(other_tenant_id),
        "other_project_id": str(other_project_id),
        "other_user_id": other_user_id,
    }


def test_credential_vault_creation_and_masking(integration_env):
    env = integration_env
    tenant_id = env["tenant_id"]
    authenticate_as(env["owner_id"])

    headers = {"Authorization": "Bearer test-token"}

    # Create Vault Credential Reference
    payload = {
        "name": "Datadog Production API Key",
        "vault_provider": "CYBERARK",
        "vault_path": "secret/data/production/datadog",
        "secret_key": "prod_api_key_4812",
        "environment": "PROD",
    }
    res = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/credentials",
        json=payload,
        headers=headers,
    )
    assert res.status_code == 201, res.text
    cred = res.json()
    assert cred["name"] == "Datadog Production API Key"
    assert "CYB****4812" in cred["masked_preview"]
    cred_id = cred["id"]

    # List credentials
    list_res = client.get(
        f"/api/v1/tenants/{tenant_id}/workspace/credentials?environment=PROD",
        headers=headers,
    )
    assert list_res.status_code == 200
    assert len(list_res.json()) == 1
    assert list_res.json()[0]["id"] == cred_id


def test_connector_creation_and_test_handshake(integration_env):
    env = integration_env
    tenant_id = env["tenant_id"]
    project_id = env["project_id"]
    authenticate_as(env["owner_id"])

    headers = {"Authorization": "Bearer test-token"}

    # Create Connector
    payload = {
        "name": "Stripe Payments Gateway",
        "slug": "stripe-payments-gw",
        "connector_type": "REST",
        "base_url": "https://api.stripe.com/v1",
        "auth_type": "BEARER_TOKEN",
        "headers_template": {"Stripe-Version": "2024-06-20"},
        "timeout_seconds": 25,
    }
    res = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/connectors",
        json=payload,
        headers=headers,
    )
    assert res.status_code == 201, res.text
    connector = res.json()
    assert connector["slug"] == "stripe-payments-gw"
    conn_id = connector["id"]

    # Test Handshake
    test_res = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/connectors/{conn_id}/test",
        headers=headers,
    )
    assert test_res.status_code == 200, test_res.text
    test_data = test_res.json()
    assert test_data["status"] == "ONLINE"
    assert test_data["handshake_latency_ms"] > 0
    assert test_data["auth_verified"] is True


def test_integration_tool_creation_and_governed_invocation(integration_env):
    env = integration_env
    tenant_id = env["tenant_id"]
    project_id = env["project_id"]
    authenticate_as(env["owner_id"])

    headers = {"Authorization": "Bearer test-token"}

    # 1. Create Connector
    conn_res = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/connectors",
        json={
            "name": "Salesforce CRM Connector",
            "slug": "salesforce-crm",
            "base_url": "https://na101.salesforce.com/services/data/v58.0",
        },
        headers=headers,
    )
    conn_id = conn_res.json()["id"]

    # 2. Register Tool
    tool_payload = {
        "connector_id": conn_id,
        "name": "Create Account Contact",
        "slug": "create-account-contact",
        "description": "Creates a new contact record linked to an account",
        "method": "POST",
        "endpoint_path": "/sobjects/Contact",
        "parameters_schema": {
            "type": "object",
            "properties": {
                "FirstName": {"type": "string"},
                "LastName": {"type": "string"},
                "Email": {"type": "string"},
            },
            "required": ["LastName", "Email"],
        },
        "rate_limit_per_minute": 120,
        "is_governed": True,
    }
    tool_res = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/tools",
        json=tool_payload,
        headers=headers,
    )
    assert tool_res.status_code == 201, tool_res.text
    tool_id = tool_res.json()["id"]

    # 3. Governed Tool Invocation
    invoke_res = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/tools/{tool_id}/invoke",
        json={
            "arguments": {
                "FirstName": "Jane",
                "LastName": "Doe",
                "Email": "jane.doe@enterprise.corp",
            }
        },
        headers=headers,
    )
    assert invoke_res.status_code == 200, invoke_res.text
    invoke_data = invoke_res.json()
    assert invoke_data["status"] == "SUCCESS"
    assert invoke_data["http_status"] == 200
    assert invoke_data["response_payload"]["args_received"]["Email"] == "jane.doe@enterprise.corp"
    assert invoke_data["latency_ms"] > 0


def test_project_packaging_export_and_cloning(integration_env):
    env = integration_env
    tenant_id = env["tenant_id"]
    project_id = env["project_id"]
    authenticate_as(env["owner_id"])

    headers = {"Authorization": "Bearer test-token"}

    # 1. Export Project Manifest Bundle
    export_res = client.get(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/export",
        headers=headers,
    )
    assert export_res.status_code == 200, export_res.text
    bundle = export_res.json()
    assert bundle["format"] == "architectiq.package.v1"
    assert bundle["project"]["name"] == "Core Integration Hub"

    # 2. Register as Reusable Template
    tpl_payload = {
        "name": "Enterprise Core Hub Template",
        "slug": "enterprise-core-hub-template",
        "category": "INTEGRATION",
        "package_bundle": bundle,
    }
    tpl_res = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/project-templates",
        json=tpl_payload,
        headers=headers,
    )
    assert tpl_res.status_code == 201, tpl_res.text
    tpl_id = tpl_res.json()["id"]

    # List templates
    list_tpl_res = client.get(
        f"/api/v1/tenants/{tenant_id}/workspace/project-templates",
        headers=headers,
    )
    assert list_tpl_res.status_code == 200
    assert any(t["id"] == tpl_id for t in list_tpl_res.json())

    # 3. Clone Project
    clone_res = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/clone?new_name=Cloned+Production+Replica",
        headers=headers,
    )
    assert clone_res.status_code == 200, clone_res.text
    clone_data = clone_res.json()
    assert clone_data["cloned_name"] == "Cloned Production Replica"
    assert clone_data["cloned_project_id"] != project_id


def test_integrations_cross_tenant_isolation(integration_env):
    env = integration_env
    tenant_1 = env["tenant_id"]
    proj_1 = env["project_id"]
    tenant_2 = env["other_tenant_id"]

    authenticate_as(env["owner_id"])
    headers_1 = {"Authorization": "Bearer test-token"}

    # Create connector in Tenant 1
    c_res = client.post(
        f"/api/v1/tenants/{tenant_1}/workspace/projects/{proj_1}/connectors",
        json={
            "name": "Internal Vault Gateway",
            "slug": "internal-vault-gw",
            "base_url": "https://vault.internal.net",
        },
        headers=headers_1,
    )
    assert c_res.status_code == 201
    conn_id = c_res.json()["id"]

    # Switch to User in Tenant 2
    authenticate_as(env["other_user_id"])
    headers_2 = {"Authorization": "Bearer test-token"}

    # Tenant 2 cannot test Tenant 1 connector
    test_res = client.post(
        f"/api/v1/tenants/{tenant_2}/workspace/connectors/{conn_id}/test",
        headers=headers_2,
    )
    assert test_res.status_code == 404
