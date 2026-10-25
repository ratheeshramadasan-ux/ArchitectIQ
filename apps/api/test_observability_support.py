"""Automated Test Suite for Milestone M11 (OBS-01, SUP-01).

Validates:
- System metrics telemetry ingestion and observability overview aggregations.
- Incident ticket management, severity assignment, and lifecycle state transitions.
- SLA breach event recording and filtering.
- Automated runbook creation and remediation execution logs.
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
def obs_env():
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
            text("INSERT INTO public.tenants (id, name, slug, created_at) VALUES (:t, 'Obs Tenant', :slug, clock_timestamp())"),
            {"t": tenant_id, "slug": f"obs-t-{suffix}"},
        )
        conn.execute(
            text("INSERT INTO public.tenants (id, name, slug, created_at) VALUES (:t, 'Other Tenant', :slug, clock_timestamp())"),
            {"t": other_tenant_id, "slug": f"other-t-{suffix}"},
        )
        conn.execute(
            text("INSERT INTO public.users (id, display_name, status, created_at) VALUES (:u, 'Obs Admin', 'ACTIVE', clock_timestamp())"),
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
            text("INSERT INTO public.organizations (id, tenant_id, name, slug, created_at) VALUES (:o, :t, 'Obs Org', :slug, clock_timestamp())"),
            {"o": org_id, "t": tenant_id, "slug": f"obs-org-{suffix}"},
        )
        conn.execute(
            text("INSERT INTO public.organizations (id, tenant_id, name, slug, created_at) VALUES (:o, :t, 'Other Org', :slug, clock_timestamp())"),
            {"o": other_org_id, "t": other_tenant_id, "slug": f"other-org-{suffix}"},
        )
        conn.execute(
            text("INSERT INTO public.folders (id, organization_id, name, created_at) VALUES (:f, :o, 'Obs Folder', clock_timestamp())"),
            {"f": folder_id, "o": org_id},
        )
        conn.execute(
            text("INSERT INTO public.folders (id, organization_id, name, created_at) VALUES (:f, :o, 'Other Folder', clock_timestamp())"),
            {"f": other_folder_id, "o": other_org_id},
        )
        conn.execute(
            text("INSERT INTO public.projects (id, folder_id, name, lifecycle_status, created_at) VALUES (:p, :f, 'Core Obs Hub', 'ACTIVE', clock_timestamp())"),
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


def test_ingest_system_metric_and_get_overview(obs_env):
    authenticate_as(obs_env["owner_id"])
    t_id = obs_env["tenant_id"]

    # Ingest custom metric
    res = client.post(
        f"/api/v1/tenants/{t_id}/workspace/observability/metrics",
        headers={"Authorization": "Bearer token"},
        json={
            "metric_name": "worker.cpu_usage_pct",
            "metric_value": 42.5,
            "dimensions": {"host": "worker-01", "region": "us-east-1"},
        },
    )
    assert res.status_code == 201
    data = res.json()
    assert data["metric_name"] == "worker.cpu_usage_pct"
    assert data["metric_value"] == 42.5

    # Query metrics
    res_list = client.get(
        f"/api/v1/tenants/{t_id}/workspace/observability/metrics?metric_name=worker.cpu_usage_pct",
        headers={"Authorization": "Bearer token"},
    )
    assert res_list.status_code == 200
    metrics = res_list.json()
    assert len(metrics) >= 1
    assert metrics[0]["dimensions"]["host"] == "worker-01"

    # Get aggregated overview
    res_ov = client.get(
        f"/api/v1/tenants/{t_id}/workspace/observability/overview",
        headers={"Authorization": "Bearer token"},
    )
    assert res_ov.status_code == 200
    overview = res_ov.json()
    assert overview["throughput_24h"] >= 1420
    assert overview["sla_health_pct"] >= 90.0
    assert "open_incidents" in overview


def test_incident_lifecycle_transitions(obs_env):
    authenticate_as(obs_env["owner_id"])
    t_id = obs_env["tenant_id"]

    # 1. Create Incident Ticket
    res = client.post(
        f"/api/v1/tenants/{t_id}/workspace/observability/incidents",
        headers={"Authorization": "Bearer token"},
        json={
            "title": "Payment Gateway Timeout Spike",
            "severity": "SEV-1",
            "summary": "Downstream payment webhook returning 504 Gateway Timeout across high-volume reconciliation pipeline.",
            "affected_resource_id": "conn-stripe-core",
            "assigned_to": "sre-lead@architectiq.test",
        },
    )
    assert res.status_code == 201
    inc = res.json()
    inc_id = inc["id"]
    assert inc["severity"] == "SEV-1"
    assert inc["status"] == "OPEN"

    # 2. Update to INVESTIGATING
    res_patch1 = client.patch(
        f"/api/v1/tenants/{t_id}/workspace/observability/incidents/{inc_id}",
        headers={"Authorization": "Bearer token"},
        json={"status": "INVESTIGATING", "assigned_to": "alice@architectiq.test"},
    )
    assert res_patch1.status_code == 200
    assert res_patch1.json()["status"] == "INVESTIGATING"
    assert res_patch1.json()["assigned_to"] == "alice@architectiq.test"

    # 3. Resolve incident with notes
    res_patch2 = client.patch(
        f"/api/v1/tenants/{t_id}/workspace/observability/incidents/{inc_id}",
        headers={"Authorization": "Bearer token"},
        json={
            "status": "RESOLVED",
            "resolution_notes": "Upstream circuit breaker tripped and reset successfully. Error rate returned to 0.02%.",
        },
    )
    assert res_patch2.status_code == 200
    assert res_patch2.json()["status"] == "RESOLVED"
    assert "circuit breaker" in res_patch2.json()["resolution_notes"]


def test_sla_breach_tracking_and_query(obs_env):
    authenticate_as(obs_env["owner_id"])
    t_id = obs_env["tenant_id"]

    # Record SLA breach
    res = client.post(
        f"/api/v1/tenants/{t_id}/workspace/observability/sla-breaches",
        headers={"Authorization": "Bearer token"},
        json={
            "target_type": "APPROVAL_TASK",
            "target_id": "appr-exec-901",
            "expected_sla_seconds": 3600,
            "actual_duration_seconds": 7450,
            "breach_severity": "HIGH",
            "status": "ACTIVE",
        },
    )
    assert res.status_code == 201
    breach = res.json()
    assert breach["target_type"] == "APPROVAL_TASK"
    assert breach["actual_duration_seconds"] == 7450

    # Query SLA breaches
    res_list = client.get(
        f"/api/v1/tenants/{t_id}/workspace/observability/sla-breaches?status=ACTIVE",
        headers={"Authorization": "Bearer token"},
    )
    assert res_list.status_code == 200
    breaches = res_list.json()
    assert len(breaches) == 1
    assert breaches[0]["target_id"] == "appr-exec-901"


def test_runbook_creation_and_execution(obs_env):
    authenticate_as(obs_env["owner_id"])
    t_id = obs_env["tenant_id"]

    # 1. Create Runbook
    res = client.post(
        f"/api/v1/tenants/{t_id}/workspace/observability/runbooks",
        headers={"Authorization": "Bearer token"},
        json={
            "name": "Stalled Queue Drain & Worker Refresh",
            "slug": "stalled-queue-drain",
            "category": "WORKER_DRAIN",
            "description": "Flushes hung leasing locks, evicts failed workers, and restores redis stream consumers.",
            "steps": [
                {"name": "Check Queue Depth", "command": "architectiq queue status --depth"},
                {"name": "Evict Dead Workers", "command": "architectiq workers prune --stale-seconds 120"},
                {"name": "Restart Consumer Pools", "command": "systemctl restart architectiq-worker-pool"},
            ],
            "is_automated": True,
        },
    )
    assert res.status_code == 201
    runbook = res.json()
    rb_id = runbook["id"]
    assert runbook["slug"] == "stalled-queue-drain"
    assert len(runbook["steps"]) == 3

    # 2. Execute Runbook
    res_exec = client.post(
        f"/api/v1/tenants/{t_id}/workspace/observability/runbooks/{rb_id}/execute",
        headers={"Authorization": "Bearer token"},
    )
    assert res_exec.status_code == 200
    exec_result = res_exec.json()
    assert exec_result["status"] == "COMPLETED"
    assert exec_result["duration_ms"] > 0
    assert len(exec_result["logs"]) >= 4
    assert any("Evict Dead Workers" in log for log in exec_result["logs"])


def test_observability_cross_tenant_isolation(obs_env):
    # User A creates incident in Tenant A
    authenticate_as(obs_env["owner_id"])
    t_id_a = obs_env["tenant_id"]
    t_id_b = obs_env["other_tenant_id"]

    res_create = client.post(
        f"/api/v1/tenants/{t_id_a}/workspace/observability/incidents",
        headers={"Authorization": "Bearer token"},
        json={
            "title": "Tenant A Confidential Infrastructure Alert",
            "severity": "SEV-2",
            "summary": "Tenant A isolated operational anomaly.",
        },
    )
    assert res_create.status_code == 201
    inc_id = res_create.json()["id"]

    # User B queries Tenant B incidents - must not see Tenant A incident
    authenticate_as(obs_env["other_user_id"])
    res_b_list = client.get(
        f"/api/v1/tenants/{t_id_b}/workspace/observability/incidents",
        headers={"Authorization": "Bearer token"},
    )
    assert res_b_list.status_code == 200
    assert len(res_b_list.json()) == 0

    # User B attempts to patch Tenant A incident directly - must be rejected with 404
    res_b_patch = client.patch(
        f"/api/v1/tenants/{t_id_b}/workspace/observability/incidents/{inc_id}",
        headers={"Authorization": "Bearer token"},
        json={"status": "RESOLVED"},
    )
    assert res_b_patch.status_code == 404
