"""Automated Test Suite for Milestone M12 (GOV-01, OPS-01, OPS-02).

Validates:
- Compliance policies creation, retention enforcement, and Responsible AI safety rules.
- Real-time compliance audit reports generation (Responsible AI, SOC2 Access Review).
- Disaster recovery resilience health checks (RPO, RTO, standby replication).
- Strict PostgreSQL RLS and tenant isolation boundaries.
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
def gov_env():
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
            text("INSERT INTO public.tenants (id, name, slug, created_at) VALUES (:t, 'Gov Tenant', :slug, clock_timestamp())"),
            {"t": tenant_id, "slug": f"gov-t-{suffix}"},
        )
        conn.execute(
            text("INSERT INTO public.tenants (id, name, slug, created_at) VALUES (:t, 'Other Tenant', :slug, clock_timestamp())"),
            {"t": other_tenant_id, "slug": f"other-t-{suffix}"},
        )
        conn.execute(
            text("INSERT INTO public.users (id, display_name, status, created_at) VALUES (:u, 'Gov Admin', 'ACTIVE', clock_timestamp())"),
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
            text("INSERT INTO public.organizations (id, tenant_id, name, slug, created_at) VALUES (:o, :t, 'Gov Org', :slug, clock_timestamp())"),
            {"o": org_id, "t": tenant_id, "slug": f"gov-org-{suffix}"},
        )
        conn.execute(
            text("INSERT INTO public.organizations (id, tenant_id, name, slug, created_at) VALUES (:o, :t, 'Other Org', :slug, clock_timestamp())"),
            {"o": other_org_id, "t": other_tenant_id, "slug": f"other-org-{suffix}"},
        )
        conn.execute(
            text("INSERT INTO public.folders (id, organization_id, name, created_at) VALUES (:f, :o, 'Gov Folder', clock_timestamp())"),
            {"f": folder_id, "o": org_id},
        )
        conn.execute(
            text("INSERT INTO public.folders (id, organization_id, name, created_at) VALUES (:f, :o, 'Other Folder', clock_timestamp())"),
            {"f": other_folder_id, "o": other_org_id},
        )
        conn.execute(
            text("INSERT INTO public.projects (id, folder_id, name, lifecycle_status, created_at) VALUES (:p, :f, 'Core Gov Hub', 'ACTIVE', clock_timestamp())"),
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
        "tenant_id": tenant_id,
        "owner_id": owner_id,
        "project_id": project_id,
        "other_tenant_id": other_tenant_id,
        "other_user_id": other_user_id,
        "other_project_id": other_project_id,
    }


def test_create_and_list_compliance_policy(gov_env):
    authenticate_as(gov_env["owner_id"])
    t_id = gov_env["tenant_id"]

    # 1. Create Data Retention Policy
    res = client.post(
        f"/api/v1/tenants/{t_id}/workspace/governance/policies",
        headers={"Authorization": "Bearer token"},
        json={
            "name": "Audit Log Retention 365D",
            "policy_type": "DATA_RETENTION",
            "retention_days": 365,
            "rules": {"archive_cold_storage_after_days": 90, "immutable": True},
            "is_active": True,
        },
    )
    assert res.status_code == 201
    policy = res.json()
    assert policy["name"] == "Audit Log Retention 365D"
    assert policy["retention_days"] == 365

    # 2. Query policies
    res_list = client.get(
        f"/api/v1/tenants/{t_id}/workspace/governance/policies?policy_type=DATA_RETENTION",
        headers={"Authorization": "Bearer token"},
    )
    assert res_list.status_code == 200
    policies = res_list.json()
    assert len(policies) >= 1
    assert policies[0]["name"] == "Audit Log Retention 365D"


def test_generate_responsible_ai_safety_audit(gov_env):
    authenticate_as(gov_env["owner_id"])
    t_id = gov_env["tenant_id"]
    p_id = gov_env["project_id"]

    # Seed an AI agent with budget limit and system guardrail
    with engine.begin() as conn:
        conn.execute(
            text("""
                INSERT INTO public.ai_agents (
                    id, tenant_id, project_id, name, slug, system_prompt, model_provider, model_name, budget_limit_usd, status, created_at, updated_at
                ) VALUES (
                    :aid, :tid, :pid, 'Governed Audit Agent', 'gov-audit-agent',
                    'You are an authoritative system assistant governed by enterprise rules.',
                    'ollama', 'qwen3-coder:30b', 50.0, 'ACTIVE', clock_timestamp(), clock_timestamp()
                )
            """),
            {"aid": uuid.uuid4(), "tid": t_id, "pid": p_id},
        )

    # Generate Responsible AI safety assessment
    res = client.post(
        f"/api/v1/tenants/{t_id}/workspace/governance/reports/generate",
        headers={"Authorization": "Bearer token"},
        json={"report_type": "RESPONSIBLE_AI_SAFETY"},
    )
    assert res.status_code == 201
    rep = res.json()
    assert rep["report_type"] == "RESPONSIBLE_AI_SAFETY"
    assert rep["verdict"] in ("COMPLIANT", "FLAGGED_FOR_REVIEW")
    assert rep["score_pct"] >= 90.0


def test_generate_soc2_access_review(gov_env):
    authenticate_as(gov_env["owner_id"])
    t_id = gov_env["tenant_id"]

    # Generate SOC2 access review
    res = client.post(
        f"/api/v1/tenants/{t_id}/workspace/governance/reports/generate",
        headers={"Authorization": "Bearer token"},
        json={"report_type": "SOC2_ACCESS_REVIEW"},
    )
    assert res.status_code == 201
    rep = res.json()
    assert rep["report_type"] == "SOC2_ACCESS_REVIEW"
    assert rep["verdict"] == "COMPLIANT"
    assert rep["score_pct"] == 100.0


def test_disaster_recovery_health_diagnostics(gov_env):
    authenticate_as(gov_env["owner_id"])
    t_id = gov_env["tenant_id"]

    res = client.get(
        f"/api/v1/tenants/{t_id}/workspace/governance/disaster-recovery/health",
        headers={"Authorization": "Bearer token"},
    )
    assert res.status_code == 200
    dr = res.json()
    assert dr["status"] == "OPERATIONAL"
    assert dr["database_replication"] == "SYNCHRONOUS_STANDBY_ACTIVE"
    assert dr["active_recovery_point_objective_sec"] <= 60
    assert dr["active_recovery_time_objective_sec"] <= 300
    assert dr["system_resilience_verdict"] == "PASSED_ENTERPRISE_DR_SLA"


def test_compliance_cross_tenant_isolation(gov_env):
    authenticate_as(gov_env["owner_id"])
    t_id_a = gov_env["tenant_id"]
    t_id_b = gov_env["other_tenant_id"]

    # Tenant A creates policy
    res_create = client.post(
        f"/api/v1/tenants/{t_id_a}/workspace/governance/policies",
        headers={"Authorization": "Bearer token"},
        json={
            "name": "Tenant A Secret Retention",
            "policy_type": "DATA_RETENTION",
            "retention_days": 180,
        },
    )
    assert res_create.status_code == 201

    # Tenant B queries policies - must be empty
    authenticate_as(gov_env["other_user_id"])
    res_b = client.get(
        f"/api/v1/tenants/{t_id_b}/workspace/governance/policies",
        headers={"Authorization": "Bearer token"},
    )
    assert res_b.status_code == 200
    assert len(res_b.json()) == 0
