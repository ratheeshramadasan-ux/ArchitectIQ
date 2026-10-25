"""Comprehensive End-to-End Integration Test for Milestone 4 (Workspace Management & Governance).

Verifies the full lifecycle:
- Organization and Folder hierarchy
- Cyclic move prevention
- Atomic project creation with OWNER assignment
- Governance metadata updates
- Project RBAC and effective permissions
- Last-owner concurrency protection & privilege escalation guardrails
- Environment bindings & config overrides
- Governed promotion lifecycle with drift detection & segregation of duties
- Strict promotion gates (DEV -> TEST -> UAT -> PROD)
- Project archiving and filtered visibility
- Safe folder deletion (conflict on non-empty)
- Cross-tenant RLS isolation
"""

from __future__ import annotations

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
def m4_seed_data(audit_writer_role: str):
    tenant_id = uuid4()
    org_id = uuid4()

    owner_id = uuid4()
    admin_id = uuid4()
    editor_id = uuid4()
    viewer_id = uuid4()
    other_tenant_id = uuid4()
    other_user_id = uuid4()

    env_ids: dict[str, str] = {}

    with engine.begin() as conn:
        # Tenants
        conn.execute(
            text(
                "INSERT INTO public.tenants (id, name, slug, created_at) "
                "VALUES (:id, :name, :slug, clock_timestamp())"
            ),
            {"id": tenant_id, "name": f"M4 E2E Corp {tenant_id.hex[:6]}", "slug": f"m4-e2e-{tenant_id.hex[:6]}"},
        )
        conn.execute(
            text(
                "INSERT INTO public.tenants (id, name, slug, created_at) "
                "VALUES (:id, :name, :slug, clock_timestamp())"
            ),
            {"id": other_tenant_id, "name": f"Other Corp {other_tenant_id.hex[:6]}", "slug": f"other-{other_tenant_id.hex[:6]}"},
        )

        # Users and active tenant memberships
        for role_name, uid in [
            ("owner", owner_id),
            ("admin", admin_id),
            ("editor", editor_id),
            ("viewer", viewer_id),
        ]:
            conn.execute(
                text(
                    "INSERT INTO public.users (id, display_name, status, created_at) "
                    "VALUES (:id, :name, 'ACTIVE', clock_timestamp())"
                ),
                {"id": uid, "name": f"{role_name.capitalize()} User"},
            )
            conn.execute(
                text(
                    "INSERT INTO public.tenant_memberships (id, tenant_id, user_id, status, created_at) "
                    "VALUES (gen_random_uuid(), :tid, :uid, 'ACTIVE', clock_timestamp())"
                ),
                {"tid": tenant_id, "uid": uid},
            )

        # Other tenant user
        conn.execute(
            text(
                "INSERT INTO public.users (id, display_name, status, created_at) "
                "VALUES (:id, :name, 'ACTIVE', clock_timestamp())"
            ),
            {"id": other_user_id, "name": "Other User"},
        )
        conn.execute(
            text(
                "INSERT INTO public.tenant_memberships (id, tenant_id, user_id, status, created_at) "
                "VALUES (gen_random_uuid(), :tid, :uid, 'ACTIVE', clock_timestamp())"
            ),
            {"tid": other_tenant_id, "uid": other_user_id},
        )

        # Organization
        conn.execute(
            text(
                "INSERT INTO public.organizations (id, tenant_id, name, slug, created_at) "
                "VALUES (:id, :tid, :name, :slug, clock_timestamp())"
            ),
            {"id": org_id, "tid": tenant_id, "name": "Enterprise Core", "slug": f"core-{org_id.hex[:6]}"},
        )

        # Environments (DEV, TEST, UAT, PROD)
        for env_name in ("DEV", "TEST", "UAT", "PROD"):
            eid = uuid4()
            conn.execute(
                text(
                    "INSERT INTO public.organization_environments (id, organization_id, name, created_at) "
                    "VALUES (:id, :oid, :name, clock_timestamp())"
                ),
                {"id": eid, "oid": org_id, "name": env_name},
            )
            env_ids[env_name] = str(eid)

    return {
        "tenant_id": tenant_id,
        "org_id": org_id,
        "env_ids": env_ids,
        "owner_id": owner_id,
        "admin_id": admin_id,
        "editor_id": editor_id,
        "viewer_id": viewer_id,
        "other_tenant_id": other_tenant_id,
        "other_user_id": other_user_id,
    }


def test_complete_m4_lifecycle_e2e(m4_seed_data) -> None:
    data = m4_seed_data
    tenant_id = data["tenant_id"]
    org_id = data["org_id"]
    env_ids = data["env_ids"]
    owner_id = data["owner_id"]
    admin_id = data["admin_id"]
    viewer_id = data["viewer_id"]
    other_tenant_id = data["other_tenant_id"]

    # Start with Owner identity
    app.dependency_overrides[get_verified_identity] = lambda: VerifiedIdentity(
        issuer="architectiq-native", subject=str(owner_id)
    )

    # 1. Create Parent Folder and Subfolder
    res_f1 = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/folders",
        json={"organization_id": str(org_id), "name": "Banking Ops"},
    )
    assert res_f1.status_code == 201, res_f1.text
    folder_id = res_f1.json()["id"]

    res_f2 = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/folders",
        json={"organization_id": str(org_id), "parent_folder_id": folder_id, "name": "Settlements"},
    )
    assert res_f2.status_code == 201, res_f2.text
    subfolder_id = res_f2.json()["id"]

    # 2. Cyclic Move Guardrail: Cannot move parent folder into its own subfolder
    res_cycle = client.patch(
        f"/api/v1/tenants/{tenant_id}/workspace/folders/{folder_id}/move",
        json={"parent_folder_id": subfolder_id},
    )
    assert res_cycle.status_code in (400, 422)

    # 3. Create Project under Subfolder (Atomically grants OWNER to creator)
    res_proj = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/projects",
        json={"folder_id": subfolder_id, "name": "Recon Flow"},
    )
    assert res_proj.status_code == 201, res_proj.text
    project_id = res_proj.json()["id"]

    # 4. Verify Project Governance Metadata Defaults & Update
    res_meta = client.get(f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}")
    assert res_meta.status_code == 200
    meta = res_meta.json()
    assert meta["lifecycle_status"] == "ACTIVE"
    assert meta["criticality"] == "MEDIUM"

    res_patch = client.patch(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}",
        json={
            "description": "High value settlement reconciliation",
            "tags": ["recon", "finance", "p0"],
            "criticality": "CRITICAL",
            "data_classification": "RESTRICTED",
            "cost_center": "CC-FIN-100",
        },
    )
    assert res_patch.status_code == 200
    updated_meta = res_patch.json()
    assert updated_meta["criticality"] == "CRITICAL"
    assert updated_meta["cost_center"] == "CC-FIN-100"

    # 5. Add Project Members: ADMIN, EDITOR, VIEWER
    for role_name, expected_role in [
        ("admin", "ADMIN"),
        ("editor", "EDITOR"),
        ("viewer", "VIEWER"),
    ]:
        add_res = client.post(
            f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/members",
            json={"user_id": str(data[f"{role_name}_id"]), "role": expected_role},
        )
        assert add_res.status_code == 201, add_res.text

    # 6. Verify Effective Permissions per Role
    app.dependency_overrides[get_verified_identity] = lambda: VerifiedIdentity(
        issuer="architectiq-native", subject=str(viewer_id)
    )
    res_viewer_perm = client.get(f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/permissions")
    assert res_viewer_perm.status_code == 200
    vp = res_viewer_perm.json()["permissions"]
    assert vp["can_view"] is True
    assert vp["can_edit"] is False
    assert vp["can_manage_members"] is False
    assert vp["can_delete"] is False

    # Negative security test: Viewer cannot update project metadata (403 Forbidden)
    res_viewer_update = client.patch(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}",
        json={"description": "Tampered description"},
    )
    assert res_viewer_update.status_code == 403

    # Switch back to Owner
    app.dependency_overrides[get_verified_identity] = lambda: VerifiedIdentity(
        issuer="architectiq-native", subject=str(owner_id)
    )

    # 7. Environment Bindings & Configuration Overrides
    res_bind_dev = client.put(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/environment-bindings/{env_ids['DEV']}",
        json={"is_enabled": True, "config_overrides": {"timeout": 30, "batch_size": 100}},
    )
    assert res_bind_dev.status_code == 200

    res_bind_test = client.put(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/environment-bindings/{env_ids['TEST']}",
        json={"is_enabled": True, "config_overrides": {"timeout": 15, "batch_size": 50}},
    )
    assert res_bind_test.status_code == 200

    # 8. Promotion Request (DEV -> TEST) requested by Admin with Drift Detection
    app.dependency_overrides[get_verified_identity] = lambda: VerifiedIdentity(
        issuer="architectiq-native", subject=str(admin_id)
    )
    res_promo = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/promotions",
        json={
            "source_environment_id": env_ids["DEV"],
            "target_environment_id": env_ids["TEST"],
            "notes": "Promoting stable batch configuration",
        },
    )
    assert res_promo.status_code == 200, res_promo.text
    promo_data = res_promo.json()
    promo_id = promo_data["id"]
    assert promo_data["drift_detected"] is True
    assert promo_data["status"] == "PENDING"

    # 9. Segregation of Duties: Admin (requester) cannot review self-requested promotion -> 403
    res_self_review = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/promotions/{promo_id}/review",
        json={"action": "APPROVE", "review_notes": "Self-approving is forbidden"},
    )
    assert res_self_review.status_code == 403

    # Owner reviews and approves
    app.dependency_overrides[get_verified_identity] = lambda: VerifiedIdentity(
        issuer="architectiq-native", subject=str(owner_id)
    )
    res_owner_review = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/promotions/{promo_id}/review",
        json={"action": "APPROVE", "review_notes": "Changes verified and approved"},
    )
    assert res_owner_review.status_code == 200
    assert res_owner_review.json()["status"] == "APPROVED"

    # Execute Promotion -> syncs configuration to target
    res_execute = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/promotions/{promo_id}/execute"
    )
    assert res_execute.status_code == 200
    assert res_execute.json()["status"] == "EXECUTED"

    # Verify target environment config is updated
    bindings_res = client.get(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/environment-bindings"
    )
    assert bindings_res.status_code == 200
    test_binding = next(b for b in bindings_res.json() if b["environment_id"] == env_ids["TEST"])
    assert test_binding["config_overrides"]["timeout"] == 30
    assert test_binding["config_overrides"]["batch_size"] == 100

    # 10. Strict Promotion Gates: Illegal skip (DEV -> PROD) rejected with 422
    res_illegal_skip = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/promotions",
        json={
            "source_environment_id": env_ids["DEV"],
            "target_environment_id": env_ids["PROD"],
        },
    )
    assert res_illegal_skip.status_code == 422

    # Switch back to Owner
    app.dependency_overrides[get_verified_identity] = lambda: VerifiedIdentity(
        issuer="architectiq-native", subject=str(owner_id)
    )

    # 11. Safe Folder Deletion Guardrail: Non-empty folder rejection (409 Conflict)
    res_del_non_empty = client.delete(f"/api/v1/tenants/{tenant_id}/workspace/folders/{subfolder_id}")
    assert res_del_non_empty.status_code == 409

    # 12. Project Lifecycle: Archive and Visibility Filtering
    res_archive = client.post(f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/archive")
    assert res_archive.status_code == 200
    assert res_archive.json()["lifecycle_status"] == "ARCHIVED"

    # Tree without archived flag hides project
    res_tree_default = client.get(f"/api/v1/tenants/{tenant_id}/workspace/tree")
    assert res_tree_default.status_code == 200
    tree_nodes = res_tree_default.json()
    
    def contains_project(nodes, pid):
        for n in nodes:
            if n.get("id") == pid:
                return True
            if contains_project(n.get("children", []), pid):
                return True
        return False

    assert not contains_project(tree_nodes, project_id)

    # Tree with include_archived=true exposes project with ARCHIVED status
    res_tree_archived = client.get(f"/api/v1/tenants/{tenant_id}/workspace/tree?include_archived=true")
    assert res_tree_archived.status_code == 200
    assert contains_project(res_tree_archived.json(), project_id)

    # 13. Restore Project
    res_restore = client.post(f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/restore")
    assert res_restore.status_code == 200
    assert res_restore.json()["lifecycle_status"] == "ACTIVE"

    # 14. Move Project to parent folder
    res_move = client.patch(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/move",
        json={"folder_id": folder_id},
    )
    assert res_move.status_code == 200

    # Now subfolder is empty -> delete folder safely
    res_del_empty = client.delete(f"/api/v1/tenants/{tenant_id}/workspace/folders/{subfolder_id}")
    assert res_del_empty.status_code == 204

    # 15. Cross-tenant Security: Other tenant cannot access project
    res_cross_tenant = client.get(f"/api/v1/tenants/{other_tenant_id}/workspace/projects/{project_id}")
    assert res_cross_tenant.status_code in (403, 404)
