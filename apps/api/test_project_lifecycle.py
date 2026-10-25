"""Automated test suite for M4.2 Project Lifecycle & Governance Metadata."""

from uuid import uuid4
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from database import engine
from main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def clean_auth_override():
    """Ensure any dependency overrides are cleanly cleared after each test."""
    yield
    app.dependency_overrides.clear()


@pytest.fixture
def lifecycle_seed_data():
    """Create a test tenant, org, folder, and test users for lifecycle testing."""
    tenant_id = uuid4()
    org_id = uuid4()
    folder_id = uuid4()

    owner_id = uuid4()
    editor_id = uuid4()
    viewer_id = uuid4()

    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO public.tenants (id, name, slug, created_at) VALUES (:id, :name, :slug, clock_timestamp())"
            ),
            {"id": tenant_id, "name": "Lifecycle Test Tenant", "slug": f"lc-tenant-{tenant_id}"},
        )
        conn.execute(
            text(
                "INSERT INTO public.organizations (id, tenant_id, name, slug, created_at) VALUES (:id, :tid, :name, :slug, clock_timestamp())"
            ),
            {"id": org_id, "tid": tenant_id, "name": "Lifecycle Org", "slug": f"lc-org-{org_id}"},
        )
        conn.execute(
            text(
                "INSERT INTO public.folders (id, organization_id, name, created_at) VALUES (:id, :oid, :name, clock_timestamp())"
            ),
            {"id": folder_id, "oid": org_id, "name": "Root Folder"},
        )

        for uid, name in [
            (owner_id, "Project Owner"),
            (editor_id, "Project Editor"),
            (viewer_id, "Project Viewer"),
        ]:
            conn.execute(
                text(
                    "INSERT INTO public.users (id, display_name, status, created_at) VALUES (:id, :name, 'ACTIVE', clock_timestamp())"
                ),
                {"id": uid, "name": name},
            )
            conn.execute(
                text(
                    "INSERT INTO public.tenant_memberships (id, user_id, tenant_id, status, created_at) "
                    "VALUES (gen_random_uuid(), :uid, :tid, 'ACTIVE', clock_timestamp())"
                ),
                {"uid": uid, "tid": tenant_id},
            )

    return {
        "tenant_id": tenant_id,
        "org_id": org_id,
        "folder_id": folder_id,
        "owner_id": owner_id,
        "editor_id": editor_id,
        "viewer_id": viewer_id,
    }


from authentication import VerifiedIdentity, get_verified_identity

def authenticate_as(user_id):
    app.dependency_overrides[get_verified_identity] = lambda: VerifiedIdentity(
        issuer="architectiq-native", subject=str(user_id)
    )


def test_project_creation_and_metadata_defaults(lifecycle_seed_data):
    """Verify project creation records metadata and assigns defaults."""
    data = lifecycle_seed_data
    tenant_id = data["tenant_id"]
    owner_id = data["owner_id"]

    authenticate_as(owner_id)

    # 1. Create project with metadata
    res = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/projects",
        json={
            "folder_id": str(data["folder_id"]),
            "name": "Governed Financial Engine",
            "description": "High-throughput deterministic payment batch processing",
            "tags": ["finance", "batch", "audit"],
            "criticality": "HIGH",
            "data_classification": "CONFIDENTIAL",
            "cost_center": "CC-9042",
        },
    )
    assert res.status_code == 201, res.text
    project = res.json()
    assert project["name"] == "Governed Financial Engine"
    assert project["description"] == "High-throughput deterministic payment batch processing"
    assert project["tags"] == ["finance", "batch", "audit"]
    assert project["criticality"] == "HIGH"
    assert project["data_classification"] == "CONFIDENTIAL"
    assert project["cost_center"] == "CC-9042"
    assert project["lifecycle_status"] == "ACTIVE"
    assert project["archived_at"] is None
    assert project["archived_by"] is None


def test_get_project_details_and_permissions(lifecycle_seed_data):
    """Verify GET /projects/{id} returns full metadata and enforces permissions."""
    data = lifecycle_seed_data
    tenant_id = data["tenant_id"]
    owner_id = data["owner_id"]
    viewer_id = data["viewer_id"]

    authenticate_as(owner_id)

    res = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/projects",
        json={
            "folder_id": str(data["folder_id"]),
            "name": "Audit Service Project",
            "description": "Immutable ledger tracking",
            "criticality": "CRITICAL",
        },
    )
    assert res.status_code == 201
    project_id = res.json()["id"]

    # Assign viewer role to viewer_id
    client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/members",
        json={"user_id": str(viewer_id), "role": "VIEWER"},
    )

    # Viewer can read project details
    authenticate_as(viewer_id)
    get_res = client.get(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}"
    )
    assert get_res.status_code == 200
    details = get_res.json()
    assert details["id"] == project_id
    assert details["name"] == "Audit Service Project"
    assert details["criticality"] == "CRITICAL"
    assert details["lifecycle_status"] == "ACTIVE"


def test_update_project_metadata(lifecycle_seed_data):
    """Verify PATCH /projects/{id} allows editing metadata for editors and rejects viewers."""
    data = lifecycle_seed_data
    tenant_id = data["tenant_id"]
    owner_id = data["owner_id"]
    editor_id = data["editor_id"]
    viewer_id = data["viewer_id"]

    authenticate_as(owner_id)
    res = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/projects",
        json={"folder_id": str(data["folder_id"]), "name": "Editable Project"},
    )
    assert res.status_code == 201
    project_id = res.json()["id"]

    # Assign roles
    client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/members",
        json={"user_id": str(editor_id), "role": "EDITOR"},
    )
    client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/members",
        json={"user_id": str(viewer_id), "role": "VIEWER"},
    )

    # Viewer cannot edit metadata
    authenticate_as(viewer_id)
    viewer_patch = client.patch(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}",
        json={"description": "Hacked description"},
    )
    assert viewer_patch.status_code == 403

    # Editor can update metadata
    authenticate_as(editor_id)
    editor_patch = client.patch(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}",
        json={
            "name": "Updated Project Name",
            "description": "Refined description",
            "tags": ["prod", "v2"],
            "criticality": "HIGH",
            "cost_center": "CC-101",
        },
    )
    assert editor_patch.status_code == 200
    updated = editor_patch.json()
    assert updated["name"] == "Updated Project Name"
    assert updated["description"] == "Refined description"
    assert updated["tags"] == ["prod", "v2"]
    assert updated["criticality"] == "HIGH"
    assert updated["cost_center"] == "CC-101"


def test_archive_and_restore_lifecycle_transitions(lifecycle_seed_data):
    """Verify archive/restore transitions, actor tracking, and role enforcement."""
    data = lifecycle_seed_data
    tenant_id = data["tenant_id"]
    owner_id = data["owner_id"]
    editor_id = data["editor_id"]

    authenticate_as(owner_id)
    res = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/projects",
        json={"folder_id": str(data["folder_id"]), "name": "Lifecycle Transition Project"},
    )
    assert res.status_code == 201
    project_id = res.json()["id"]

    client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/members",
        json={"user_id": str(editor_id), "role": "EDITOR"},
    )

    # 1. Editor cannot archive project (requires can_admin)
    authenticate_as(editor_id)
    editor_archive = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/archive"
    )
    assert editor_archive.status_code == 403

    # 2. Owner can archive project
    authenticate_as(owner_id)
    owner_archive = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/archive"
    )
    assert owner_archive.status_code == 200
    archived = owner_archive.json()
    assert archived["lifecycle_status"] == "ARCHIVED"
    assert archived["archived_at"] is not None
    assert archived["archived_by"] == str(owner_id)

    # 3. Double archive is rejected
    double_archive = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/archive"
    )
    assert double_archive.status_code == 400

    # 4. Restore project
    owner_restore = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/restore"
    )
    assert owner_restore.status_code == 200
    restored = owner_restore.json()
    assert restored["lifecycle_status"] == "ACTIVE"
    assert restored["archived_at"] is None
    assert restored["archived_by"] is None

    # 5. Double restore is rejected
    double_restore = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/restore"
    )
    assert double_restore.status_code == 400


def test_tree_filters_archived_projects(lifecycle_seed_data):
    """Verify tree endpoint filters archived projects by default, but includes them with flag."""
    data = lifecycle_seed_data
    tenant_id = data["tenant_id"]
    owner_id = data["owner_id"]

    authenticate_as(owner_id)

    # Create active project
    res1 = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/projects",
        json={"folder_id": str(data["folder_id"]), "name": "Active Tree Project"},
    )
    active_id = res1.json()["id"]

    # Create archived project
    res2 = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/projects",
        json={"folder_id": str(data["folder_id"]), "name": "Archived Tree Project"},
    )
    archived_id = res2.json()["id"]
    client.post(f"/api/v1/tenants/{tenant_id}/workspace/projects/{archived_id}/archive")

    # Default tree excludes archived project
    tree_res = client.get(f"/api/v1/tenants/{tenant_id}/workspace/tree")
    assert tree_res.status_code == 200
    tree_nodes = tree_res.json()
    folder_children = tree_nodes[0]["children"][0]["children"]
    child_ids = [c["id"] for c in folder_children]
    assert active_id in child_ids
    assert archived_id not in child_ids

    # Tree with include_archived=true includes both
    tree_all_res = client.get(
        f"/api/v1/tenants/{tenant_id}/workspace/tree?include_archived=true"
    )
    assert tree_all_res.status_code == 200
    folder_all_children = tree_all_res.json()[0]["children"][0]["children"]
    all_child_ids = [c["id"] for c in folder_all_children]
    assert active_id in all_child_ids
    assert archived_id in all_child_ids

    # Verify summary counts
    summary_res = client.get(f"/api/v1/tenants/{tenant_id}/workspace/summary")
    assert summary_res.status_code == 200
    summary = summary_res.json()
    assert summary["active_projects"] >= 1
    assert summary["archived_projects"] >= 1


def test_safe_folder_deletion(lifecycle_seed_data):
    """Verify folder deletion rejects non-empty folders with 409 and deletes empty folders."""
    data = lifecycle_seed_data
    tenant_id = data["tenant_id"]
    owner_id = data["owner_id"]
    org_id = data["org_id"]

    authenticate_as(owner_id)

    # Create a parent folder and subfolder
    subfolder_res = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/folders",
        json={"organization_id": str(org_id), "parent_folder_id": str(data["folder_id"]), "name": "Child Folder"},
    )
    assert subfolder_res.status_code == 201
    child_folder_id = subfolder_res.json()["id"]

    # 1. Attempting to delete parent folder when it has a subfolder fails with 409
    del_parent = client.delete(
        f"/api/v1/tenants/{tenant_id}/workspace/folders/{data['folder_id']}"
    )
    assert del_parent.status_code == 409
    assert "Cannot delete folder with contents" in del_parent.json()["detail"]

    # Create project in child folder
    proj_res = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/projects",
        json={"folder_id": str(child_folder_id), "name": "Project In Child"},
    )
    assert proj_res.status_code == 201

    # 2. Attempting to delete child folder when it contains a project fails with 409
    del_child = client.delete(
        f"/api/v1/tenants/{tenant_id}/workspace/folders/{child_folder_id}"
    )
    assert del_child.status_code == 409

    # 3. Create a truly empty folder and delete it
    empty_folder_res = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/folders",
        json={"organization_id": str(org_id), "name": "Empty Folder To Delete"},
    )
    assert empty_folder_res.status_code == 201
    empty_id = empty_folder_res.json()["id"]

    del_empty = client.delete(
        f"/api/v1/tenants/{tenant_id}/workspace/folders/{empty_id}"
    )
    assert del_empty.status_code == 204

    # Confirm it is gone
    confirm_del = client.delete(
        f"/api/v1/tenants/{tenant_id}/workspace/folders/{empty_id}"
    )
    assert confirm_del.status_code == 404


def test_cross_tenant_project_operations_rejected(lifecycle_seed_data):
    """Verify that a user from another tenant cannot access or modify project lifecycle."""
    data = lifecycle_seed_data
    tenant_a = data["tenant_id"]
    owner_a = data["owner_id"]

    # Create Tenant B and User B
    tenant_b = uuid4()
    user_b = uuid4()
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO public.tenants (id, name, slug, created_at) VALUES (:id, 'Tenant B', :slug, now())"
            ),
            {"id": tenant_b, "slug": f"tb-{tenant_b}"},
        )
        conn.execute(
            text(
                "INSERT INTO public.users (id, display_name, status, created_at) VALUES (:id, 'User B', 'ACTIVE', now())"
            ),
            {"id": user_b},
        )
        conn.execute(
            text(
                "INSERT INTO public.tenant_memberships (id, user_id, tenant_id, status, created_at) "
                "VALUES (gen_random_uuid(), :uid, :tid, 'ACTIVE', now())"
            ),
            {"uid": user_b, "tid": tenant_b},
        )

    # Owner A creates project in Tenant A
    authenticate_as(owner_a)
    proj_res = client.post(
        f"/api/v1/tenants/{tenant_a}/workspace/projects",
        json={"folder_id": str(data["folder_id"]), "name": "Tenant A Secret Project"},
    )
    assert proj_res.status_code == 201
    project_id = proj_res.json()["id"]

    # Authenticate as User B
    authenticate_as(user_b)

    # 1. User B cannot read Tenant A project under Tenant B
    cross_read = client.get(
        f"/api/v1/tenants/{tenant_b}/workspace/projects/{project_id}"
    )
    assert cross_read.status_code in (403, 404)

    # 2. User B cannot update Tenant A project
    cross_patch = client.patch(
        f"/api/v1/tenants/{tenant_b}/workspace/projects/{project_id}",
        json={"name": "Hijacked Project"},
    )
    assert cross_patch.status_code in (403, 404)

    # 3. User B cannot archive Tenant A project
    cross_archive = client.post(
        f"/api/v1/tenants/{tenant_b}/workspace/projects/{project_id}/archive"
    )
    assert cross_archive.status_code in (403, 404)

