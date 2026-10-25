"""Automated test suite for Milestone M5: Workflow Designer & Canonical Schema."""

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


@pytest.fixture
def workflow_seed_data(audit_writer_role: str):
    tenant_a = uuid4()
    tenant_b = uuid4()
    org_a = uuid4()
    folder_a = uuid4()
    project_a = uuid4()

    owner_id = uuid4()
    editor_id = uuid4()
    viewer_id = uuid4()
    user_b = uuid4()

    with engine.begin() as conn:
        # Tenants
        conn.execute(
            text("INSERT INTO public.tenants (id, name, slug, created_at) VALUES (:id, :name, :slug, clock_timestamp())"),
            {"id": tenant_a, "name": f"Workflow Tenant A {tenant_a.hex[:6]}", "slug": f"wf-a-{tenant_a.hex[:6]}"},
        )
        conn.execute(
            text("INSERT INTO public.tenants (id, name, slug, created_at) VALUES (:id, :name, :slug, clock_timestamp())"),
            {"id": tenant_b, "name": f"Workflow Tenant B {tenant_b.hex[:6]}", "slug": f"wf-b-{tenant_b.hex[:6]}"},
        )

        # Users
        for uid, name in [
            (owner_id, "Workflow Owner"),
            (editor_id, "Workflow Editor"),
            (viewer_id, "Workflow Viewer"),
            (user_b, "Tenant B User"),
        ]:
            conn.execute(
                text("INSERT INTO public.users (id, display_name, status, created_at) VALUES (:id, :name, 'ACTIVE', clock_timestamp())"),
                {"id": uid, "name": name},
            )

        # Tenant Memberships
        for uid in (owner_id, editor_id, viewer_id):
            conn.execute(
                text("INSERT INTO public.tenant_memberships (id, user_id, tenant_id, status, created_at) VALUES (gen_random_uuid(), :uid, :tid, 'ACTIVE', clock_timestamp())"),
                {"uid": uid, "tid": tenant_a},
            )
        conn.execute(
            text("INSERT INTO public.tenant_memberships (id, user_id, tenant_id, status, created_at) VALUES (gen_random_uuid(), :uid, :tid, 'ACTIVE', clock_timestamp())"),
            {"uid": user_b, "tid": tenant_b},
        )

        # Org, Folder, Project in Tenant A
        conn.execute(
            text("INSERT INTO public.organizations (id, tenant_id, name, slug, created_at) VALUES (:id, :tid, 'Engineering Org', :slug, clock_timestamp())"),
            {"id": org_a, "tid": tenant_a, "slug": f"eng-{org_a.hex[:6]}"},
        )
        conn.execute(
            text("INSERT INTO public.folders (id, organization_id, name, created_at) VALUES (:id, :oid, 'Automation Core', clock_timestamp())"),
            {"id": folder_a, "oid": org_a},
        )
        conn.execute(
            text("INSERT INTO public.projects (id, folder_id, name, lifecycle_status, created_at) VALUES (:id, :fid, 'Core Orchestrations', 'ACTIVE', clock_timestamp())"),
            {"id": project_a, "fid": folder_a},
        )

        # Project Memberships
        conn.execute(
            text("INSERT INTO public.project_memberships (id, tenant_id, project_id, user_id, role, created_at) VALUES (gen_random_uuid(), :tid, :pid, :uid, 'OWNER', clock_timestamp())"),
            {"tid": tenant_a, "pid": project_a, "uid": owner_id},
        )
        conn.execute(
            text("INSERT INTO public.project_memberships (id, tenant_id, project_id, user_id, role, created_at) VALUES (gen_random_uuid(), :tid, :pid, :uid, 'EDITOR', clock_timestamp())"),
            {"tid": tenant_a, "pid": project_a, "uid": editor_id},
        )
        conn.execute(
            text("INSERT INTO public.project_memberships (id, tenant_id, project_id, user_id, role, created_at) VALUES (gen_random_uuid(), :tid, :pid, :uid, 'VIEWER', clock_timestamp())"),
            {"tid": tenant_a, "pid": project_a, "uid": viewer_id},
        )

    return {
        "tenant_a": tenant_a,
        "tenant_b": tenant_b,
        "project_a": project_a,
        "owner_id": owner_id,
        "editor_id": editor_id,
        "viewer_id": viewer_id,
        "user_b": user_b,
    }


def authenticate_as(user_id):
    app.dependency_overrides[get_verified_identity] = lambda: VerifiedIdentity(
        issuer="architectiq-native", subject=str(user_id)
    )


def test_create_workflow_and_get_details(workflow_seed_data):
    data = workflow_seed_data
    authenticate_as(data["owner_id"])

    # Create workflow
    res = client.post(
        f"/api/v1/tenants/{data['tenant_a']}/workspace/projects/{data['project_a']}/workflows",
        json={"name": "Claims Processing Flow", "description": "Automated claims intake and validation"},
    )
    assert res.status_code == 201, res.text
    wf = res.json()
    assert wf["name"] == "Claims Processing Flow"
    assert wf["slug"] == "claims-processing-flow"
    assert wf["current_version"] == 1
    assert wf["status"] == "DRAFT"
    assert len(wf["definition"]["nodes"]) == 1
    assert wf["definition"]["nodes"][0]["type"] == "TRIGGER"
    wf_id = wf["id"]

    # Retrieve workflow
    get_res = client.get(
        f"/api/v1/tenants/{data['tenant_a']}/workspace/workflows/{wf_id}"
    )
    assert get_res.status_code == 200
    assert get_res.json()["id"] == wf_id


def test_workflow_draft_and_validation_rules(workflow_seed_data):
    data = workflow_seed_data
    authenticate_as(data["editor_id"])

    # Create workflow
    create_res = client.post(
        f"/api/v1/tenants/{data['tenant_a']}/workspace/projects/{data['project_a']}/workflows",
        json={"name": "Invoice Pipeline"},
    )
    wf_id = create_res.json()["id"]

    # 1. Update draft with valid multi-step pipeline
    valid_graph = {
        "nodes": [
            {"id": "trig-1", "type": "TRIGGER", "label": "Invoice Arrived", "config": {"event": "upload"}, "position": {"x": 50, "y": 100}},
            {"id": "doc-1", "type": "DOCUMENT_AI", "label": "Extract Invoice Fields", "config": {"model": "invoice-v2"}, "position": {"x": 250, "y": 100}},
            {"id": "dec-1", "type": "DECISION", "label": "Amount > 10,000?", "config": {"threshold": 10000}, "position": {"x": 450, "y": 100}},
            {"id": "appr-1", "type": "APPROVAL", "label": "Finance Manager Review", "config": {"role": "FIN_MGR"}, "position": {"x": 650, "y": 50}},
            {"id": "term-1", "type": "TERMINAL", "label": "Auto-Approve & Pay", "config": {}, "position": {"x": 650, "y": 200}},
        ],
        "edges": [
            {"id": "e1", "source": "trig-1", "target": "doc-1"},
            {"id": "e2", "source": "doc-1", "target": "dec-1"},
            {"id": "e3", "source": "dec-1", "target": "appr-1", "label": "Yes"},
            {"id": "e4", "source": "dec-1", "target": "term-1", "label": "No"},
        ],
        "variables": [
            {"name": "invoice_total", "type": "number", "default_value": 0.0},
            {"name": "vendor_id", "type": "string", "default_value": ""},
        ],
    }

    draft_res = client.put(
        f"/api/v1/tenants/{data['tenant_a']}/workspace/workflows/{wf_id}/draft",
        json={"definition": valid_graph, "change_summary": "Added document extraction and approval branching"},
    )
    assert draft_res.status_code == 200, draft_res.text
    draft_body = draft_res.json()
    assert draft_body["validation"]["is_valid"] is True
    assert draft_body["validation"]["stats"]["node_count"] == 5

    # 2. Test server-side validation on invalid graph: Missing trigger and dangling edge
    invalid_graph = {
        "nodes": [
            {"id": "action-only", "type": "ACTION", "label": "Process", "config": {}, "position": {"x": 100, "y": 100}}
        ],
        "edges": [
            {"id": "e_dangling", "source": "action-only", "target": "non-existent-target"}
        ],
        "variables": [{"name": "123_invalid_var_name"}],
    }

    val_res = client.post(
        f"/api/v1/tenants/{data['tenant_a']}/workspace/workflows/{wf_id}/validate",
        json=invalid_graph,
    )
    assert val_res.status_code == 200
    val_body = val_res.json()
    assert val_body["is_valid"] is False
    assert any("at least one TRIGGER" in err for err in val_body["errors"])
    assert any("non-existent target" in err for err in val_body["errors"])
    assert any("Invalid variable name" in err for err in val_body["errors"])


def test_workflow_publish_and_version_diffing(workflow_seed_data):
    data = workflow_seed_data

    # Owner creates workflow
    authenticate_as(data["owner_id"])
    wf_res = client.post(
        f"/api/v1/tenants/{data['tenant_a']}/workspace/projects/{data['project_a']}/workflows",
        json={"name": "Recon Flow"},
    )
    wf_id = wf_res.json()["id"]

    # 1. Negative test: Attempt to publish invalid graph (e.g. empty nodes) -> 422
    client.put(
        f"/api/v1/tenants/{data['tenant_a']}/workspace/workflows/{wf_id}/draft",
        json={"definition": {"nodes": [], "edges": [], "variables": []}},
    )
    pub_fail = client.post(
        f"/api/v1/tenants/{data['tenant_a']}/workspace/workflows/{wf_id}/publish",
        json={"change_summary": "Publish empty"},
    )
    assert pub_fail.status_code == 422

    # 2. Update to valid v1 graph and publish
    v1_graph = {
        "nodes": [
            {"id": "trig-start", "type": "TRIGGER", "label": "Start", "config": {"mode": "auto"}, "position": {"x": 100, "y": 100}},
            {"id": "act-fetch", "type": "ACTION", "label": "Fetch Records", "config": {"timeout": 30}, "position": {"x": 300, "y": 100}},
        ],
        "edges": [{"id": "e1", "source": "trig-start", "target": "act-fetch"}],
        "variables": [],
    }
    client.put(
        f"/api/v1/tenants/{data['tenant_a']}/workspace/workflows/{wf_id}/draft",
        json={"definition": v1_graph},
    )

    pub_res = client.post(
        f"/api/v1/tenants/{data['tenant_a']}/workspace/workflows/{wf_id}/publish",
        json={"change_summary": "Initial release of v1 Recon Flow"},
    )
    assert pub_res.status_code == 200, pub_res.text
    assert pub_res.json()["status"] == "PUBLISHED"
    assert pub_res.json()["version"] == 1

    # 3. Modify draft -> automatically creates v2 draft
    v2_graph = {
        "nodes": [
            {"id": "trig-start", "type": "TRIGGER", "label": "Start", "config": {"mode": "auto"}, "position": {"x": 100, "y": 100}},
            {"id": "act-fetch", "type": "ACTION", "label": "Fetch Records", "config": {"timeout": 60}, "position": {"x": 300, "y": 100}},
            {"id": "agent-classify", "type": "AI_AGENT", "label": "Classify Anomaly", "config": {"model": "gemini-flash"}, "position": {"x": 500, "y": 100}},
        ],
        "edges": [
            {"id": "e1", "source": "trig-start", "target": "act-fetch"},
            {"id": "e2", "source": "act-fetch", "target": "agent-classify"},
        ],
        "variables": [{"name": "anomaly_score", "type": "number", "default_value": 0.5}],
    }
    draft_v2 = client.put(
        f"/api/v1/tenants/{data['tenant_a']}/workspace/workflows/{wf_id}/draft",
        json={"definition": v2_graph, "change_summary": "Added anomaly classification agent"},
    )
    assert draft_v2.status_code == 200
    assert draft_v2.json()["current_version"] == 2
    assert draft_v2.json()["status"] == "DRAFT"

    # Publish v2
    client.post(
        f"/api/v1/tenants/{data['tenant_a']}/workspace/workflows/{wf_id}/publish",
        json={"change_summary": "Release v2 with AI agent"},
    )

    # 4. Check historical versions list
    versions_res = client.get(
        f"/api/v1/tenants/{data['tenant_a']}/workspace/workflows/{wf_id}/versions"
    )
    assert versions_res.status_code == 200
    versions = versions_res.json()
    assert len(versions) == 2
    assert versions[0]["version"] == 2
    assert versions[1]["version"] == 1

    # 5. Compute graph diff between v1 and v2
    diff_res = client.get(
        f"/api/v1/tenants/{data['tenant_a']}/workspace/workflows/{wf_id}/diff?v1=1&v2=2"
    )
    assert diff_res.status_code == 200, diff_res.text
    diff = diff_res.json()
    assert diff["summary"]["nodes_added_count"] == 1
    assert diff["nodes_added"][0]["id"] == "agent-classify"
    assert diff["summary"]["nodes_modified_count"] == 1
    assert diff["nodes_modified"][0]["id"] == "act-fetch"
    assert diff["summary"]["edges_added_count"] == 1


def test_workflow_rbac_and_cross_tenant_isolation(workflow_seed_data):
    data = workflow_seed_data

    # Owner creates workflow
    authenticate_as(data["owner_id"])
    wf_res = client.post(
        f"/api/v1/tenants/{data['tenant_a']}/workspace/projects/{data['project_a']}/workflows",
        json={"name": "Protected Flow"},
    )
    wf_id = wf_res.json()["id"]

    # 1. Viewer can view, but cannot edit or publish
    authenticate_as(data["viewer_id"])
    assert client.get(f"/api/v1/tenants/{data['tenant_a']}/workspace/workflows/{wf_id}").status_code == 200
    assert client.put(f"/api/v1/tenants/{data['tenant_a']}/workspace/workflows/{wf_id}/draft", json={"definition": {"nodes": []}}).status_code == 403
    assert client.post(f"/api/v1/tenants/{data['tenant_a']}/workspace/workflows/{wf_id}/publish", json={"change_summary": "fail"}).status_code == 403

    # 2. Editor can edit draft, but cannot publish
    authenticate_as(data["editor_id"])
    valid_graph = {
        "nodes": [{"id": "trig-1", "type": "TRIGGER", "label": "Start", "config": {}, "position": {"x": 0, "y": 0}}],
        "edges": [],
        "variables": [],
    }
    assert client.put(f"/api/v1/tenants/{data['tenant_a']}/workspace/workflows/{wf_id}/draft", json={"definition": valid_graph}).status_code == 200
    assert client.post(f"/api/v1/tenants/{data['tenant_a']}/workspace/workflows/{wf_id}/publish", json={"change_summary": "editor publish"}).status_code == 403

    # 3. Cross-tenant access rejection: Tenant B user cannot access Tenant A workflow
    authenticate_as(data["user_b"])
    res_b = client.get(f"/api/v1/tenants/{data['tenant_b']}/workspace/workflows/{wf_id}")
    assert res_b.status_code in (403, 404)
