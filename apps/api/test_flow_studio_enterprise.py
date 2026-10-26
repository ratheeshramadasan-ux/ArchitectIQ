"""Tests for Milestone M13 / Flow Studio Enterprise baseline (Option A).

Covers:
- FS-04 & FS-05: AI Model Gateway routes catalog and auto-seeding defaults
- FS-03 & FS-05: AI Agent node execution with model routes and token metric tracking
- FS-08: Human approval task creation on workflow suspension and task resolution
- FS-13: OpenTelemetry span hierarchy and telemetry waterfall retrieval
"""

import uuid
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


def authenticate_as(user_id: uuid.UUID):
    app.dependency_overrides[get_verified_identity] = lambda: VerifiedIdentity(
        issuer="architectiq-native", subject=str(user_id)
    )


@pytest.fixture
def flow_env():
    tenant_id = uuid.uuid4()
    org_id = uuid.uuid4()
    folder_id = uuid.uuid4()
    project_id = uuid.uuid4()
    user_id = uuid.uuid4()

    with engine.begin() as conn:
        conn.execute(
            text("INSERT INTO public.tenants (id, name, slug, created_at) VALUES (:t, 'Flow Tenant', :slug, clock_timestamp())"),
            {"t": tenant_id, "slug": f"flow-t-{tenant_id.hex[:6]}"},
        )
        conn.execute(
            text("INSERT INTO public.users (id, display_name, status, created_at) VALUES (:u, 'Flow Engineer', 'ACTIVE', clock_timestamp())"),
            {"u": user_id},
        )
        conn.execute(
            text("INSERT INTO public.tenant_memberships (id, user_id, tenant_id, status, created_at) VALUES (:m, :u, :t, 'ACTIVE', clock_timestamp())"),
            {"m": uuid.uuid4(), "u": user_id, "t": tenant_id},
        )
        conn.execute(
            text("INSERT INTO public.organizations (id, tenant_id, name, slug, created_at) VALUES (:o, :t, 'Flow Org', :slug, clock_timestamp())"),
            {"o": org_id, "t": tenant_id, "slug": f"flow-org-{org_id.hex[:6]}"},
        )
        conn.execute(
            text("INSERT INTO public.folders (id, organization_id, name, created_at) VALUES (:f, :o, 'Flow Folder', clock_timestamp())"),
            {"f": folder_id, "o": org_id},
        )
        conn.execute(
            text("INSERT INTO public.projects (id, folder_id, name, lifecycle_status, created_at) VALUES (:p, :f, 'Claims Engine', 'ACTIVE', clock_timestamp())"),
            {"p": project_id, "f": folder_id},
        )
        conn.execute(
            text("INSERT INTO public.project_memberships (id, tenant_id, project_id, user_id, role, created_at) VALUES (:pm, :t, :p, :u, 'OWNER', clock_timestamp())"),
            {"pm": uuid.uuid4(), "t": tenant_id, "p": project_id, "u": user_id},
        )

    return {
        "tenant_id": str(tenant_id),
        "project_id": str(project_id),
        "user_id": user_id,
    }


def test_ai_model_routes_auto_seed_and_custom(flow_env):
    tenant_id = flow_env["tenant_id"]
    authenticate_as(flow_env["user_id"])

    # 1. List AI Model Routes -> auto-seeds default enterprise models
    res = client.get(f"/api/v1/tenants/{tenant_id}/workspace/ai-model-routes")
    assert res.status_code == 200
    routes = res.json()
    assert len(routes) >= 4
    route_keys = [r["route_key"] for r in routes]
    assert "claims-classifier-prod" in route_keys
    assert "fast-cheap" in route_keys
    assert "complex-reasoning" in route_keys

    # 2. Register custom model route
    custom_route = {
        "route_key": "fraud-detection-ensemble",
        "display_name": "Fraud Detection Multi-Model Ensemble",
        "primary_provider": "google",
        "primary_model": "gemini-1.5-pro",
        "fallback_provider": "anthropic",
        "fallback_model": "claude-3-5-sonnet",
        "timeout_ms": 20000,
        "max_retries": 3,
        "cost_limit_daily": 75.0,
        "is_active": True,
    }
    res_create = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/ai-model-routes",
        json=custom_route,
    )
    assert res_create.status_code == 201
    created = res_create.json()
    assert created["route_key"] == "fraud-detection-ensemble"
    assert created["fallback_model"] == "claude-3-5-sonnet"


def test_ai_agent_workflow_execution_and_telemetry(flow_env):
    tenant_id = flow_env["tenant_id"]
    project_id = flow_env["project_id"]
    authenticate_as(flow_env["user_id"])

    # 1. Create Workflow with AI_AGENT and MCP_TOOL nodes
    res_create = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/workflows",
        json={"name": "Claims Processing Graph"},
    )
    assert res_create.status_code == 201
    wf_id = res_create.json()["id"]

    definition = {
        "nodes": [
            {"id": "n-trigger", "type": "TRIGGER", "label": "Incoming Claim", "config": {}},
            {
                "id": "n-agent",
                "type": "AI_AGENT",
                "label": "Coverage Adjudicator",
                "config": {
                    "route_key": "claims-classifier-prod",
                    "model": "gemini-1.5-pro",
                    "system_prompt": "Adjudicate claim coverage based on policy limits.",
                    "tools": ["sql_db_query", "vector_policy_search"],
                },
            },
            {
                "id": "n-tool",
                "type": "MCP_TOOL",
                "label": "Fetch Policy Ledger",
                "config": {"tool_name": "fetch_policy_balance"},
            },
            {"id": "n-end", "type": "TERMINAL", "label": "Finalize", "config": {}},
        ],
        "edges": [
            {"id": "e-1", "source": "n-trigger", "target": "n-agent"},
            {"id": "e-2", "source": "n-agent", "target": "n-tool"},
            {"id": "e-3", "source": "n-tool", "target": "n-end"},
        ],
        "variables": [],
    }

    client.put(
        f"/api/v1/tenants/{tenant_id}/workspace/workflows/{wf_id}/draft",
        json={"definition": definition},
    )
    client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/workflows/{wf_id}/publish",
        json={"change_summary": "Initial AI Agent workflow"},
    )

    # 2. Trigger run
    res_run = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/workflows/{wf_id}/runs",
        json={"trigger_type": "MANUAL", "trigger_payload": {"claim_id": "CLM-99120", "amount": 4250.0}},
    )
    assert res_run.status_code == 200
    run_data = res_run.json()
    assert run_data["status"] == "COMPLETED"
    run_id = run_data["id"]

    # 3. Fetch Telemetry
    res_telem = client.get(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/workflows/{wf_id}/runs/{run_id}/telemetry"
    )
    assert res_telem.status_code == 200
    telem = res_telem.json()
    assert telem["run_id"] == run_id
    assert telem["status"] == "COMPLETED"
    assert telem["otel_trace_id"] is not None
    assert telem["metrics"]["total_tokens"] > 0
    assert len(telem["spans"]) == 4

    agent_span = next(s for s in telem["spans"] if s["node_type"] == "AI_AGENT")
    assert agent_span["status"] == "COMPLETED"
    assert agent_span["output_payload"]["route_key"] == "claims-classifier-prod"
    assert agent_span["metrics"]["tokens"] > 0


def test_human_approval_task_lifecycle(flow_env):
    tenant_id = flow_env["tenant_id"]
    project_id = flow_env["project_id"]
    authenticate_as(flow_env["user_id"])

    # 1. Create workflow with APPROVAL node
    res_create = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/workflows",
        json={"name": "Executive Expense Approval"},
    )
    assert res_create.status_code == 201
    wf_id = res_create.json()["id"]

    definition = {
        "nodes": [
            {"id": "t1", "type": "TRIGGER", "label": "Expense Incurred", "config": {}},
            {"id": "gate", "type": "APPROVAL", "label": "VP Approval Gate", "config": {"required_role": "ADMIN", "description": "VP sign-off for expenses > $5,000"}},
            {"id": "pay", "type": "TERMINAL", "label": "Initiate Wire", "config": {}},
        ],
        "edges": [
            {"id": "e1", "source": "t1", "target": "gate"},
            {"id": "e2", "source": "gate", "target": "pay"},
        ],
        "variables": [],
    }

    client.put(
        f"/api/v1/tenants/{tenant_id}/workspace/workflows/{wf_id}/draft",
        json={"definition": definition},
    )
    client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/workflows/{wf_id}/publish",
        json={"change_summary": "Expense gate"},
    )

    # 2. Trigger run -> enters SUSPENDED
    res_run = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/workflows/{wf_id}/runs",
        json={"trigger_type": "MANUAL", "trigger_payload": {"amount": 15000, "vendor": "Acme Cloud"}},
    )
    assert res_run.status_code == 200
    assert res_run.json()["status"] == "SUSPENDED"
    run_id = res_run.json()["id"]

    # 3. Retrieve pending Human Tasks
    res_tasks = client.get(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/workflows/{wf_id}/runs/{run_id}/tasks"
    )
    assert res_tasks.status_code == 200
    tasks = res_tasks.json()
    assert len(tasks) == 1
    task = tasks[0]
    assert task["status"] == "PENDING"
    assert task["title"] == "VP Approval Gate"
    task_id = task["id"]

    # 4. Resolve the Human Task -> advances workflow to COMPLETED
    res_resolve = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/runs/{run_id}/tasks/{task_id}/resolve",
        json={"decision": "APPROVED", "notes": "Approved in accordance with Q4 budget limits"},
    )
    assert res_resolve.status_code == 200
    assert res_resolve.json()["status"] == "COMPLETED"

    # Verify task status is now APPROVED
    res_tasks_after = client.get(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/workflows/{wf_id}/runs/{run_id}/tasks"
    )
    assert res_tasks_after.json()[0]["status"] == "APPROVED"
