"""Automated test suite for M7 Human Approvals & Business Rules Engine."""
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
def approvals_rules_env():
    tenant_id = uuid.uuid4()
    org_id = uuid.uuid4()
    folder_id = uuid.uuid4()
    project_id = uuid.uuid4()
    owner_id = uuid.uuid4()
    admin_id = uuid.uuid4()
    other_tenant_id = uuid.uuid4()

    with engine.begin() as conn:
        conn.execute(
            text("INSERT INTO public.tenants (id, name, slug, created_at) VALUES (:t, 'Approval Tenant', :slug, clock_timestamp())"),
            {"t": tenant_id, "slug": f"appr-t-{tenant_id.hex[:6]}"},
        )
        conn.execute(
            text("INSERT INTO public.tenants (id, name, slug, created_at) VALUES (:t, 'Other Tenant', :slug, clock_timestamp())"),
            {"t": other_tenant_id, "slug": f"other-t-{other_tenant_id.hex[:6]}"},
        )
        conn.execute(
            text("INSERT INTO public.users (id, display_name, status, created_at) VALUES (:u, 'Approval Owner', 'ACTIVE', clock_timestamp())"),
            {"u": owner_id},
        )
        conn.execute(
            text("INSERT INTO public.users (id, display_name, status, created_at) VALUES (:u, 'Approval Admin', 'ACTIVE', clock_timestamp())"),
            {"u": admin_id},
        )
        conn.execute(
            text("INSERT INTO public.tenant_memberships (id, user_id, tenant_id, status, created_at) VALUES (:m, :u, :t, 'ACTIVE', clock_timestamp())"),
            {"m": uuid.uuid4(), "u": owner_id, "t": tenant_id},
        )
        conn.execute(
            text("INSERT INTO public.tenant_memberships (id, user_id, tenant_id, status, created_at) VALUES (:m, :u, :t, 'ACTIVE', clock_timestamp())"),
            {"m": uuid.uuid4(), "u": admin_id, "t": tenant_id},
        )
        conn.execute(
            text("INSERT INTO public.organizations (id, tenant_id, name, slug, created_at) VALUES (:o, :t, 'Approval Org', :slug, clock_timestamp())"),
            {"o": org_id, "t": tenant_id, "slug": f"appr-org-{org_id.hex[:6]}"},
        )
        conn.execute(
            text("INSERT INTO public.folders (id, organization_id, name, created_at) VALUES (:f, :o, 'Approval Folder', clock_timestamp())"),
            {"f": folder_id, "o": org_id},
        )
        conn.execute(
            text("INSERT INTO public.projects (id, folder_id, name, lifecycle_status, created_at) VALUES (:p, :f, 'Approval Project', 'ACTIVE', clock_timestamp())"),
            {"p": project_id, "f": folder_id},
        )
        # Memberships: Owner & Admin
        conn.execute(
            text("INSERT INTO public.project_memberships (id, tenant_id, project_id, user_id, role, created_at) VALUES (:pm, :t, :p, :u, 'OWNER', clock_timestamp())"),
            {"pm": uuid.uuid4(), "t": tenant_id, "p": project_id, "u": owner_id},
        )
        conn.execute(
            text("INSERT INTO public.project_memberships (id, tenant_id, project_id, user_id, role, created_at) VALUES (:pm, :t, :p, :u, 'ADMIN', clock_timestamp())"),
            {"pm": uuid.uuid4(), "t": tenant_id, "p": project_id, "u": admin_id},
        )

    return {
        "tenant_id": str(tenant_id),
        "other_tenant_id": str(other_tenant_id),
        "project_id": str(project_id),
        "owner_id": owner_id,
        "admin_id": admin_id,
    }


def test_create_and_list_approval_tasks(approvals_rules_env):
    tenant_id = approvals_rules_env["tenant_id"]
    project_id = approvals_rules_env["project_id"]
    authenticate_as(approvals_rules_env["owner_id"])

    # 1. Create task
    res = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/approvals",
        json={
            "title": "Vendor Contract Signoff",
            "description": "Annual cloud hosting agreement renewal",
            "priority": "HIGH",
            "required_role": "ADMIN",
            "sla_hours": 24,
            "payload": {"vendor": "CloudProvider Inc", "amount": 120000},
        },
    )
    assert res.status_code == 200, res.text
    task = res.json()
    assert task["title"] == "Vendor Contract Signoff"
    assert task["priority"] == "HIGH"
    assert task["status"] == "PENDING"
    assert task["sla_deadline"] is not None
    task_id = task["id"]

    # 2. List in project
    res_list = client.get(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/approvals",
    )
    assert res_list.status_code == 200
    assert len(res_list.json()) >= 1

    # 3. List in tenant inbox
    res_inbox = client.get(
        f"/api/v1/tenants/{tenant_id}/workspace/approvals",
    )
    assert res_inbox.status_code == 200
    assert any(t["id"] == task_id for t in res_inbox.json())


def test_segregation_of_duties_self_approval(approvals_rules_env):
    tenant_id = approvals_rules_env["tenant_id"]
    project_id = approvals_rules_env["project_id"]
    admin_id = approvals_rules_env["admin_id"]
    owner_id = approvals_rules_env["owner_id"]

    # Admin creates a HIGH priority task
    authenticate_as(admin_id)
    res_task = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/approvals",
        json={
            "title": "Emergency Budget Increase",
            "priority": "HIGH",
            "required_role": "ADMIN",
        },
    )
    assert res_task.status_code == 200
    task_id = res_task.json()["id"]

    # Admin attempts to self-approve -> must be 403 Forbidden
    res_self = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/approvals/{task_id}/resolve",
        json={"decision": "APPROVED", "resolution_notes": "Self approved"},
    )
    assert res_self.status_code == 403
    assert "Segregation of duties" in res_self.json()["detail"]

    # Owner resolves task -> 200 OK
    authenticate_as(owner_id)
    res_owner = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/approvals/{task_id}/resolve",
        json={"decision": "APPROVED", "resolution_notes": "Approved by Project Owner"},
    )
    assert res_owner.status_code == 200
    assert res_owner.json()["status"] == "APPROVED"


def test_resolve_approval_synchronizes_workflow_run(approvals_rules_env):
    tenant_id = approvals_rules_env["tenant_id"]
    project_id = approvals_rules_env["project_id"]
    owner_id = approvals_rules_env["owner_id"]
    authenticate_as(owner_id)

    # 1. Create and trigger a workflow that suspends on approval
    res_create = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/workflows",
        json={"name": "Hire Candidate Flow"},
    )
    assert res_create.status_code == 201
    wf_id = res_create.json()["id"]

    definition = {
        "nodes": [
            {"id": "t", "type": "TRIGGER", "label": "Start", "config": {}},
            {"id": "a", "type": "APPROVAL", "label": "Offer Gate", "config": {}},
        ],
        "edges": [{"id": "e", "source": "t", "target": "a"}],
        "variables": [],
    }
    client.put(f"/api/v1/tenants/{tenant_id}/workspace/workflows/{wf_id}/draft", json={"definition": definition})
    client.post(f"/api/v1/tenants/{tenant_id}/workspace/workflows/{wf_id}/publish", json={"change_summary": "v1"})

    res_run = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/workflows/{wf_id}/runs",
        json={"trigger_type": "MANUAL", "trigger_payload": {"candidate": "Jane Doe"}},
    )
    assert res_run.status_code == 200
    run_id = res_run.json()["id"]
    assert res_run.json()["status"] == "SUSPENDED"

    # 2. Create approval task linked to run_id
    res_task = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/approvals",
        json={
            "title": "Signoff Offer for Jane Doe",
            "priority": "MEDIUM",
            "run_id": run_id,
        },
    )
    task_id = res_task.json()["id"]

    # 3. Approve task -> linked run transitions to COMPLETED
    res_resolve = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/approvals/{task_id}/resolve",
        json={"decision": "APPROVED", "resolution_notes": "Offer letter ratified"},
    )
    assert res_resolve.status_code == 200
    assert res_resolve.json()["status"] == "APPROVED"

    # Verify run completed
    res_run_detail = client.get(
        f"/api/v1/tenants/{tenant_id}/workspace/runs/{run_id}",
    )
    assert res_run_detail.status_code == 200
    assert res_run_detail.json()["status"] == "COMPLETED"


def test_reject_approval_fails_workflow_run(approvals_rules_env):
    tenant_id = approvals_rules_env["tenant_id"]
    project_id = approvals_rules_env["project_id"]
    owner_id = approvals_rules_env["owner_id"]
    authenticate_as(owner_id)

    # 1. Create and trigger a workflow that suspends on approval
    res_create = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/workflows",
        json={"name": "Expense Claim"},
    )
    assert res_create.status_code == 201
    wf_id = res_create.json()["id"]
    definition = {
        "nodes": [
            {"id": "t", "type": "TRIGGER", "label": "Start", "config": {}},
            {"id": "a", "type": "APPROVAL", "label": "Finance Audit", "config": {}},
        ],
        "edges": [{"id": "e", "source": "t", "target": "a"}],
        "variables": [],
    }
    client.put(f"/api/v1/tenants/{tenant_id}/workspace/workflows/{wf_id}/draft", json={"definition": definition})
    client.post(f"/api/v1/tenants/{tenant_id}/workspace/workflows/{wf_id}/publish", json={"change_summary": "v1"})
    res_run = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/workflows/{wf_id}/runs",
        json={"trigger_type": "MANUAL"},
    )
    run_id = res_run.json()["id"]

    # 2. Link task to run_id
    res_task = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/approvals",
        json={"title": "Expense Audit", "priority": "LOW", "run_id": run_id},
    )
    task_id = res_task.json()["id"]

    # 3. Reject task -> run becomes FAILED
    res_reject = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/approvals/{task_id}/resolve",
        json={"decision": "REJECTED", "resolution_notes": "Receipts invalid"},
    )
    assert res_reject.status_code == 200
    assert res_reject.json()["status"] == "REJECTED"

    res_run_detail = client.get(f"/api/v1/tenants/{tenant_id}/workspace/runs/{run_id}")
    assert res_run_detail.json()["status"] == "FAILED"
    assert "Approval rejected" in res_run_detail.json()["error_message"]


def test_business_rule_decision_table_evaluation(approvals_rules_env):
    tenant_id = approvals_rules_env["tenant_id"]
    project_id = approvals_rules_env["project_id"]
    authenticate_as(approvals_rules_env["owner_id"])

    # 1. Create Decision Table Rule
    conditions = [
        {
            "row_id": "tier-1",
            "conditions": [
                {"field": "amount", "operator": ">=", "value": 10000},
                {"field": "country", "operator": "==", "value": "US"},
            ],
        },
        {
            "row_id": "tier-2",
            "conditions": [
                {"field": "amount", "operator": "<", "value": 10000},
            ],
        },
    ]
    actions = [
        {"row_id": "tier-1", "action": {"route": "MANUAL_REVIEW", "sla_hours": 12, "tier": "ENTERPRISE"}},
        {"row_id": "tier-2", "action": {"route": "FAST_TRACK", "sla_hours": 1, "tier": "STANDARD"}},
    ]

    res_rule = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/rules",
        json={
            "name": "Payment Routing Matrix",
            "description": "Multi-tier transaction routing rules",
            "rule_type": "DECISION_TABLE",
            "conditions_schema": conditions,
            "actions_schema": actions,
        },
    )
    assert res_rule.status_code == 201, res_rule.text
    rule_id = res_rule.json()["id"]

    # 2. Evaluate Tier 1 (amount = 15000, country = "US")
    res_eval1 = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/rules/{rule_id}/evaluate",
        json={"payload": {"amount": 15000, "country": "US"}},
    )
    assert res_eval1.status_code == 200
    eval1_data = res_eval1.json()
    assert eval1_data["matched"] is True
    assert eval1_data["results"][0]["route"] == "MANUAL_REVIEW"
    assert eval1_data["results"][0]["tier"] == "ENTERPRISE"

    # 3. Evaluate Tier 2 (amount = 450)
    res_eval2 = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/rules/{rule_id}/evaluate",
        json={"payload": {"amount": 450, "country": "CA"}},
    )
    assert res_eval2.status_code == 200
    eval2_data = res_eval2.json()
    assert eval2_data["matched"] is True
    assert eval2_data["results"][0]["route"] == "FAST_TRACK"


def test_approvals_and_rules_cross_tenant_isolation(approvals_rules_env):
    tenant_id = approvals_rules_env["tenant_id"]
    other_tenant_id = approvals_rules_env["other_tenant_id"]
    project_id = approvals_rules_env["project_id"]
    authenticate_as(approvals_rules_env["owner_id"])

    # Create task in tenant_id
    res_task = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/approvals",
        json={"title": "Internal Memo Signoff", "priority": "LOW"},
    )
    task_id = res_task.json()["id"]

    # Cross-tenant access attempt
    res_bad = client.get(
        f"/api/v1/tenants/{other_tenant_id}/workspace/approvals/{task_id}",
    )
    assert res_bad.status_code in (403, 404)
