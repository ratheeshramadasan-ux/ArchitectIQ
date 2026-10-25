"""Automated test suite for M6 Durable Execution & Orchestration Engine."""
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
def execution_env():
    tenant_id = uuid.uuid4()
    org_id = uuid.uuid4()
    folder_id = uuid.uuid4()
    project_id = uuid.uuid4()
    user_id = uuid.uuid4()
    other_tenant_id = uuid.uuid4()

    with engine.begin() as conn:
        conn.execute(
            text("INSERT INTO public.tenants (id, name, slug, created_at) VALUES (:t, 'Exec Tenant', :slug, clock_timestamp())"),
            {"t": tenant_id, "slug": f"exec-t-{tenant_id.hex[:6]}"},
        )
        conn.execute(
            text("INSERT INTO public.tenants (id, name, slug, created_at) VALUES (:t, 'Other Tenant', :slug, clock_timestamp())"),
            {"t": other_tenant_id, "slug": f"other-t-{other_tenant_id.hex[:6]}"},
        )
        conn.execute(
            text("INSERT INTO public.users (id, display_name, status, created_at) VALUES (:u, 'Execution Tester', 'ACTIVE', clock_timestamp())"),
            {"u": user_id},
        )
        conn.execute(
            text("INSERT INTO public.tenant_memberships (id, user_id, tenant_id, status, created_at) VALUES (:m, :u, :t, 'ACTIVE', clock_timestamp())"),
            {"m": uuid.uuid4(), "u": user_id, "t": tenant_id},
        )
        conn.execute(
            text("INSERT INTO public.organizations (id, tenant_id, name, slug, created_at) VALUES (:o, :t, 'Exec Org', :slug, clock_timestamp())"),
            {"o": org_id, "t": tenant_id, "slug": f"exec-org-{org_id.hex[:6]}"},
        )
        conn.execute(
            text("INSERT INTO public.folders (id, organization_id, name, created_at) VALUES (:f, :o, 'Exec Folder', clock_timestamp())"),
            {"f": folder_id, "o": org_id},
        )
        conn.execute(
            text("INSERT INTO public.projects (id, folder_id, name, lifecycle_status, created_at) VALUES (:p, :f, 'Exec Project', 'ACTIVE', clock_timestamp())"),
            {"p": project_id, "f": folder_id},
        )
        # Assign user as project OWNER
        conn.execute(
            text("INSERT INTO public.project_memberships (id, tenant_id, project_id, user_id, role, created_at) VALUES (:pm, :t, :p, :u, 'OWNER', clock_timestamp())"),
            {"pm": uuid.uuid4(), "t": tenant_id, "p": project_id, "u": user_id},
        )

    return {
        "tenant_id": str(tenant_id),
        "other_tenant_id": str(other_tenant_id),
        "project_id": str(project_id),
        "user_id": user_id,
    }


def test_trigger_workflow_execution_and_step_runs(execution_env):
    tenant_id = execution_env["tenant_id"]
    project_id = execution_env["project_id"]
    authenticate_as(execution_env["user_id"])

    # 1. Create workflow
    res_create = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/workflows",
        json={"name": "Sequential Order Flow"},
    )
    assert res_create.status_code == 201, res_create.text
    wf_id = res_create.json()["id"]

    # 2. Save draft with sequential nodes (Trigger -> Action -> Terminal)
    definition = {
        "nodes": [
            {"id": "node-1", "type": "TRIGGER", "label": "Order Received", "config": {}},
            {"id": "node-2", "type": "ACTION", "label": "Validate Order", "config": {"timeout": 30}},
            {"id": "node-3", "type": "TERMINAL", "label": "Fulfill Order", "config": {}},
        ],
        "edges": [
            {"id": "e-1", "source": "node-1", "target": "node-2"},
            {"id": "e-2", "source": "node-2", "target": "node-3"},
        ],
        "variables": [],
    }
    client.put(
        f"/api/v1/tenants/{tenant_id}/workspace/workflows/{wf_id}/draft",
        json={"definition": definition},
    )

    # 3. Publish v1
    res_pub = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/workflows/{wf_id}/publish",
        json={"change_summary": "Initial pipeline"},
    )
    assert res_pub.status_code == 200

    # 4. Trigger Run
    res_run = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/workflows/{wf_id}/runs",
        json={"trigger_type": "MANUAL", "trigger_payload": {"order_id": "ORD-12345"}},
    )
    assert res_run.status_code == 200, res_run.text
    run_data = res_run.json()

    assert run_data["status"] == "COMPLETED"
    assert run_data["workflow_id"] == wf_id
    assert run_data["workflow_version"] == 1
    assert len(run_data["steps"]) == 3
    assert [s["node_id"] for s in run_data["steps"]] == ["node-1", "node-2", "node-3"]
    assert all(s["status"] == "COMPLETED" for s in run_data["steps"])

    # 5. List runs
    res_list = client.get(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/runs",
    )
    assert res_list.status_code == 200
    assert len(res_list.json()) >= 1

    # 6. Get run detail
    run_id = run_data["id"]
    res_detail = client.get(
        f"/api/v1/tenants/{tenant_id}/workspace/runs/{run_id}",
    )
    assert res_detail.status_code == 200
    assert res_detail.json()["id"] == run_id


def test_branching_decision_execution(execution_env):
    tenant_id = execution_env["tenant_id"]
    project_id = execution_env["project_id"]
    authenticate_as(execution_env["user_id"])

    # Create workflow
    res_create = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/workflows",
        json={"name": "Risk Evaluation Flow"},
    )
    assert res_create.status_code == 201
    wf_id = res_create.json()["id"]

    # Graph with Decision: field 'risk_score' > 50
    definition = {
        "nodes": [
            {"id": "node-trig", "type": "TRIGGER", "label": "Event Received", "config": {}},
            {"id": "node-dec", "type": "DECISION", "label": "Risk Gate", "config": {"field": "risk_score", "operator": ">", "value": 50}},
            {"id": "node-high", "type": "ACTION", "label": "High Risk Path", "config": {}},
            {"id": "node-low", "type": "ACTION", "label": "Low Risk Path", "config": {}},
        ],
        "edges": [
            {"id": "e-1", "source": "node-trig", "target": "node-dec"},
            {"id": "e-true", "source": "node-dec", "target": "node-high", "label": "true"},
            {"id": "e-false", "source": "node-dec", "target": "node-low", "label": "false"},
        ],
        "variables": [],
    }
    client.put(
        f"/api/v1/tenants/{tenant_id}/workspace/workflows/{wf_id}/draft",
        json={"definition": definition},
    )
    client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/workflows/{wf_id}/publish",
        json={"change_summary": "Risk gate"},
    )

    # Test High Risk: risk_score = 80 -> should execute node-high
    res_high = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/workflows/{wf_id}/runs",
        json={"trigger_type": "MANUAL", "trigger_payload": {"risk_score": 80}},
    )
    assert res_high.status_code == 200
    steps_high = [s["node_id"] for s in res_high.json()["steps"]]
    assert "node-high" in steps_high
    assert "node-low" not in steps_high

    # Test Low Risk: risk_score = 30 -> should execute node-low
    res_low = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/workflows/{wf_id}/runs",
        json={"trigger_type": "MANUAL", "trigger_payload": {"risk_score": 30}},
    )
    assert res_low.status_code == 200
    steps_low = [s["node_id"] for s in res_low.json()["steps"]]
    assert "node-low" in steps_low
    assert "node-high" not in steps_low


def test_human_approval_suspends_and_resumes(execution_env):
    tenant_id = execution_env["tenant_id"]
    project_id = execution_env["project_id"]
    authenticate_as(execution_env["user_id"])

    # Create workflow with Approval node
    res_create = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/workflows",
        json={"name": "Capital Expense Approval"},
    )
    assert res_create.status_code == 201
    wf_id = res_create.json()["id"]

    definition = {
        "nodes": [
            {"id": "n-start", "type": "TRIGGER", "label": "Request Submitted", "config": {}},
            {"id": "n-gate", "type": "APPROVAL", "label": "Manager Signoff", "config": {"required_role": "ADMIN"}},
            {"id": "n-end", "type": "TERMINAL", "label": "Disburse Funds", "config": {}},
        ],
        "edges": [
            {"id": "e-1", "source": "n-start", "target": "n-gate"},
            {"id": "e-2", "source": "n-gate", "target": "n-end"},
        ],
        "variables": [],
    }
    client.put(
        f"/api/v1/tenants/{tenant_id}/workspace/workflows/{wf_id}/draft",
        json={"definition": definition},
    )
    client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/workflows/{wf_id}/publish",
        json={"change_summary": "Approval workflow"},
    )

    # Trigger run -> should enter SUSPENDED state
    res_run = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/workflows/{wf_id}/runs",
        json={"trigger_type": "MANUAL", "trigger_payload": {"amount": 25000}},
    )
    assert res_run.status_code == 200
    run_id = res_run.json()["id"]
    assert res_run.json()["status"] == "SUSPENDED"

    # Resume with approval resolution
    res_resume = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/runs/{run_id}/resume",
        json={"approved": True, "approver_notes": "Budget verified"},
    )
    assert res_resume.status_code == 200
    assert res_resume.json()["status"] == "COMPLETED"
    assert res_resume.json()["execution_context"]["resume_signal"]["approved"] is True


def test_cancel_workflow_run(execution_env):
    tenant_id = execution_env["tenant_id"]
    project_id = execution_env["project_id"]
    authenticate_as(execution_env["user_id"])

    # Create suspended run
    res_create = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/workflows",
        json={"name": "Cancelable Flow"},
    )
    assert res_create.status_code == 201
    wf_id = res_create.json()["id"]
    definition = {
        "nodes": [
            {"id": "t1", "type": "TRIGGER", "label": "Start", "config": {}},
            {"id": "a1", "type": "APPROVAL", "label": "Hold", "config": {}},
        ],
        "edges": [{"id": "e1", "source": "t1", "target": "a1"}],
        "variables": [],
    }
    client.put(f"/api/v1/tenants/{tenant_id}/workspace/workflows/{wf_id}/draft", json={"definition": definition})
    client.post(f"/api/v1/tenants/{tenant_id}/workspace/workflows/{wf_id}/publish", json={"change_summary": "Hold flow"})

    res_run = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/workflows/{wf_id}/runs",
        json={"trigger_type": "MANUAL"},
    )
    run_id = res_run.json()["id"]
    assert res_run.json()["status"] == "SUSPENDED"

    # Cancel run
    res_cancel = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/runs/{run_id}/cancel",
    )
    assert res_cancel.status_code == 200
    assert res_cancel.json()["status"] == "CANCELLED"


def test_cross_tenant_execution_isolation(execution_env):
    tenant_id = execution_env["tenant_id"]
    other_tenant_id = execution_env["other_tenant_id"]
    project_id = execution_env["project_id"]
    authenticate_as(execution_env["user_id"])

    # Create workflow and run in tenant_id
    res_create = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/workflows",
        json={"name": "Secret Workflow"},
    )
    assert res_create.status_code == 201
    wf_id = res_create.json()["id"]
    definition = {
        "nodes": [{"id": "t", "type": "TRIGGER", "label": "Start", "config": {}}],
        "edges": [],
        "variables": [],
    }
    client.put(f"/api/v1/tenants/{tenant_id}/workspace/workflows/{wf_id}/draft", json={"definition": definition})
    client.post(f"/api/v1/tenants/{tenant_id}/workspace/workflows/{wf_id}/publish", json={"change_summary": "v1"})
    res_run = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/workflows/{wf_id}/runs",
        json={"trigger_type": "MANUAL"},
    )
    run_id = res_run.json()["id"]

    # Attempt cross-tenant access using other_tenant_id prefix
    res_bad = client.get(
        f"/api/v1/tenants/{other_tenant_id}/workspace/runs/{run_id}",
    )
    # User is not a member of other_tenant_id -> 403 or 404
    assert res_bad.status_code in (403, 404)


def test_retry_and_queues_listing(execution_env):
    tenant_id = execution_env["tenant_id"]
    project_id = execution_env["project_id"]
    authenticate_as(execution_env["user_id"])

    # Create workflow
    res_create = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/workflows",
        json={"name": "Retryable Flow"},
    )
    wf_id = res_create.json()["id"]
    definition = {
        "nodes": [{"id": "t1", "type": "TRIGGER", "label": "Start", "config": {}}],
        "edges": [],
        "variables": [],
    }
    client.put(f"/api/v1/tenants/{tenant_id}/workspace/workflows/{wf_id}/draft", json={"definition": definition})
    client.post(f"/api/v1/tenants/{tenant_id}/workspace/workflows/{wf_id}/publish", json={"change_summary": "v1"})

    # Trigger run
    res_run = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/workflows/{wf_id}/runs",
        json={"trigger_type": "MANUAL"},
    )
    assert res_run.status_code == 200
    run_id = res_run.json()["id"]

    # Manually transition run to FAILED to test retry logic
    with engine.begin() as conn:
        conn.execute(
            text("UPDATE public.workflow_runs SET status = 'FAILED', error_message = 'Simulated timeout' WHERE id = :rid"),
            {"rid": run_id},
        )

    # Retry the failed run
    res_retry = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/runs/{run_id}/retry",
    )
    assert res_retry.status_code == 200
    assert res_retry.json()["status"] == "COMPLETED"

    # Verify queues endpoint
    res_queues = client.get(
        f"/api/v1/tenants/{tenant_id}/workspace/queues",
    )
    assert res_queues.status_code == 200
    assert len(res_queues.json()) >= 1

