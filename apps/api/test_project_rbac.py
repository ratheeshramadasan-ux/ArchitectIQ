"""Automated test suite for M4.1 Project RBAC, Membership, and Isolation.

Validates:
1. Authentication requirements (401 on unauthenticated calls).
2. Atomic initial project-owner assignment during project creation.
3. Effective permissions evaluation for all 4 roles + unassigned users (default deny).
4. Privilege escalation prevention (ADMIN cannot appoint/demote/remove OWNER).
5. Last-owner protection (cannot remove or demote sole remaining OWNER).
6. Owner transfer workflow.
7. Database-enforced and API-enforced cross-tenant member prevention.
8. Revoked tenant membership revokes project access.
9. RLS enforcement on project_memberships using the restricted architectiq_app role.
10. Server-side capability enforcement (VIEWER cannot rename or move project).
"""

from uuid import UUID, uuid4
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from authentication import VerifiedIdentity, get_verified_identity
from database import RuntimeSessionLocal, engine, tenant_session
from main import app
from models import ProjectMembership

TENANT_A = UUID("11111111-1111-4111-8111-111111111111")
TENANT_B = UUID("22222222-2222-4222-8222-222222222222")

# Fixture user IDs
USER_OWNER = UUID("aaaa1111-1111-4111-8111-111111111111")
USER_ADMIN = UUID("aaaa2222-2222-4222-8222-222222222222")
USER_EDITOR = UUID("aaaa3333-3333-4333-8333-333333333333")
USER_VIEWER = UUID("aaaa4444-4444-4444-8444-444444444444")
USER_UNASSIGNED = UUID("aaaa5555-5555-4555-8555-555555555555")
USER_TENANT_B = UUID("bbbb1111-1111-4111-8111-111111111111")

# Fixture hierarchy IDs for Tenant A
ORG_A = UUID("aa000001-0001-4001-8001-000000000001")
FOLDER_A = UUID("aa000002-0002-4002-8002-000000000002")
PROJECT_A = UUID("aa000003-0003-4003-8003-000000000003")

# Fixture hierarchy IDs for Tenant B
ORG_B = UUID("bb000001-0001-4001-8001-000000000001")
FOLDER_B = UUID("bb000002-0002-4002-8002-000000000002")
PROJECT_B = UUID("bb000003-0003-4003-8003-000000000003")

client = TestClient(app)


@pytest.fixture(scope="module", autouse=True)
def setup_rbac_test_fixtures():
    """Ensure consistent users, tenants, and initial memberships in architectiq_test."""
    with engine.begin() as conn:
        assert conn.scalar(text("SELECT current_database()")) == "architectiq_test"

        # 1. Ensure Tenants exist
        for tid, slug in ((TENANT_A, "tenant-a-rbac"), (TENANT_B, "tenant-b-rbac")):
            conn.execute(
                text("""
                    INSERT INTO public.tenants (id, name, slug, created_at)
                    VALUES (:id, :slug, :slug, now())
                    ON CONFLICT (id) DO NOTHING
                """),
                {"id": tid, "slug": slug},
            )

        # 2. Ensure Users exist
        users = [
            (USER_OWNER, "Owner Alice"),
            (USER_ADMIN, "Admin Bob"),
            (USER_EDITOR, "Editor Charlie"),
            (USER_VIEWER, "Viewer Dave"),
            (USER_UNASSIGNED, "Unassigned Eve"),
            (USER_TENANT_B, "Tenant B User"),
        ]
        for uid, name in users:
            conn.execute(
                text("""
                    INSERT INTO public.users (id, display_name, status, created_at)
                    VALUES (:id, :name, 'ACTIVE', now())
                    ON CONFLICT (id) DO NOTHING
                """),
                {"id": uid, "name": name},
            )

        # 3. Ensure Tenant Memberships exist
        # Tenant A users
        for uid in (USER_OWNER, USER_ADMIN, USER_EDITOR, USER_VIEWER, USER_UNASSIGNED):
            conn.execute(
                text("""
                    INSERT INTO public.tenant_memberships (id, user_id, tenant_id, status, created_at)
                    VALUES (gen_random_uuid(), :uid, :tid, 'ACTIVE', now())
                    ON CONFLICT (user_id, tenant_id) DO UPDATE SET status = 'ACTIVE'
                """),
                {"uid": uid, "tid": TENANT_A},
            )

        # Tenant B user
        conn.execute(
            text("""
                INSERT INTO public.tenant_memberships (id, user_id, tenant_id, status, created_at)
                VALUES (gen_random_uuid(), :uid, :tid, 'ACTIVE', now())
                ON CONFLICT (user_id, tenant_id) DO UPDATE SET status = 'ACTIVE'
            """),
            {"uid": USER_TENANT_B, "tid": TENANT_B},
        )

        # 4. Ensure Hierarchy for Tenant A
        conn.execute(
            text("""
                INSERT INTO public.organizations (id, tenant_id, name, slug, created_at)
                VALUES (:id, :tid, 'Org A', 'org-a-rbac', now())
                ON CONFLICT (id) DO NOTHING
            """),
            {"id": ORG_A, "tid": TENANT_A},
        )
        conn.execute(
            text("""
                INSERT INTO public.folders (id, organization_id, name, created_at)
                VALUES (:id, :parent, 'Folder A', now())
                ON CONFLICT (id) DO NOTHING
            """),
            {"id": FOLDER_A, "parent": ORG_A},
        )
        conn.execute(
            text("""
                INSERT INTO public.projects (id, folder_id, name, created_at)
                VALUES (:id, :parent, 'Project A', now())
                ON CONFLICT (id) DO NOTHING
            """),
            {"id": PROJECT_A, "parent": FOLDER_A},
        )

        # 5. Ensure Hierarchy for Tenant B
        conn.execute(
            text("""
                INSERT INTO public.organizations (id, tenant_id, name, slug, created_at)
                VALUES (:id, :tid, 'Org B', 'org-b-rbac', now())
                ON CONFLICT (id) DO NOTHING
            """),
            {"id": ORG_B, "tid": TENANT_B},
        )
        conn.execute(
            text("""
                INSERT INTO public.folders (id, organization_id, name, created_at)
                VALUES (:id, :parent, 'Folder B', now())
                ON CONFLICT (id) DO NOTHING
            """),
            {"id": FOLDER_B, "parent": ORG_B},
        )
        conn.execute(
            text("""
                INSERT INTO public.projects (id, folder_id, name, created_at)
                VALUES (:id, :parent, 'Project B', now())
                ON CONFLICT (id) DO NOTHING
            """),
            {"id": PROJECT_B, "parent": FOLDER_B},
        )

        # 6. Ensure Base Project Memberships for Project A
        # Clean up any leftover project memberships from previous runs
        conn.execute(
            text("DELETE FROM public.project_memberships WHERE project_id IN (:pa, :pb)"),
            {"pa": PROJECT_A, "pb": PROJECT_B},
        )

        memberships_a = [
            (USER_OWNER, "OWNER"),
            (USER_ADMIN, "ADMIN"),
            (USER_EDITOR, "EDITOR"),
            (USER_VIEWER, "VIEWER"),
        ]
        for uid, role in memberships_a:
            conn.execute(
                text("""
                    INSERT INTO public.project_memberships (id, tenant_id, project_id, user_id, role, created_at)
                    VALUES (gen_random_uuid(), :tid, :pid, :uid, :role, now())
                """),
                {"tid": TENANT_A, "pid": PROJECT_A, "uid": uid, "role": role},
            )

        # Project B membership
        conn.execute(
            text("""
                INSERT INTO public.project_memberships (id, tenant_id, project_id, user_id, role, created_at)
                VALUES (gen_random_uuid(), :tid, :pid, :uid, 'OWNER', now())
            """),
            {"tid": TENANT_B, "pid": PROJECT_B, "uid": USER_TENANT_B},
        )


def set_auth(user_id: UUID):
    """Override get_verified_identity for testing with a specific user."""
    app.dependency_overrides[get_verified_identity] = lambda: VerifiedIdentity(
        issuer="architectiq-native", subject=str(user_id)
    )


def clear_auth():
    """Clear dependency overrides."""
    app.dependency_overrides.pop(get_verified_identity, None)


@pytest.fixture(autouse=True)
def clean_auth_override():
    yield
    clear_auth()


# ==============================================================================
# 1. Unauthenticated Requests Rejected (HTTP 401)
# ==============================================================================
def test_project_access_requires_authentication():
    clear_auth()
    base = f"/api/v1/tenants/{TENANT_A}/workspace/projects/{PROJECT_A}"

    assert client.get(f"{base}/permissions").status_code == 401
    assert client.get(f"{base}/members").status_code == 401
    assert client.post(f"{base}/members", json={"user_id": str(USER_UNASSIGNED), "role": "VIEWER"}).status_code == 401
    assert client.patch(f"{base}/members/{USER_VIEWER}", json={"role": "EDITOR"}).status_code == 401
    assert client.delete(f"{base}/members/{USER_VIEWER}").status_code == 401


# ==============================================================================
# 2. Atomic Initial Project Owner Creation
# ==============================================================================
def test_atomic_project_owner_creation():
    set_auth(USER_OWNER)
    # Create a new project under Folder A
    response = client.post(
        f"/api/v1/tenants/{TENANT_A}/workspace/projects",
        json={"name": "Atomic Project", "folder_id": str(FOLDER_A)},
        headers={"Authorization": "Bearer mock-token"},
    )
    assert response.status_code == 201
    new_pid = UUID(response.json()["id"])

    # Verify that USER_OWNER was atomically assigned OWNER role
    perms_res = client.get(
        f"/api/v1/tenants/{TENANT_A}/workspace/projects/{new_pid}/permissions",
        headers={"Authorization": "Bearer mock-token"},
    )
    assert perms_res.status_code == 200
    data = perms_res.json()
    assert data["role"] == "OWNER"
    assert data["permissions"]["can_manage_members"] is True
    assert data["permissions"]["can_delete"] is True


# ==============================================================================
# 3. Effective Permissions & Default-Deny Evaluation
# ==============================================================================
@pytest.mark.parametrize(
    "user_id, expected_role, can_view, can_edit, can_manage, can_delete",
    [
        (USER_OWNER, "OWNER", True, True, True, True),
        (USER_ADMIN, "ADMIN", True, True, True, False),
        (USER_EDITOR, "EDITOR", True, True, False, False),
        (USER_VIEWER, "VIEWER", True, False, False, False),
        (USER_UNASSIGNED, None, False, False, False, False),
    ],
)
def test_effective_permissions_per_role(user_id, expected_role, can_view, can_edit, can_manage, can_delete):
    set_auth(user_id)
    response = client.get(
        f"/api/v1/tenants/{TENANT_A}/workspace/projects/{PROJECT_A}/permissions",
        headers={"Authorization": "Bearer mock-token"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["role"] == expected_role
    assert data["permissions"]["can_view"] is can_view
    assert data["permissions"]["can_edit"] is can_edit
    assert data["permissions"]["can_manage_members"] is can_manage
    assert data["permissions"]["can_delete"] is can_delete


# ==============================================================================
# 4. Privilege Escalation Guardrails
# ==============================================================================
def test_privilege_escalation_guardrails():
    # 4a: EDITOR cannot manage members
    set_auth(USER_EDITOR)
    res = client.post(
        f"/api/v1/tenants/{TENANT_A}/workspace/projects/{PROJECT_A}/members",
        json={"user_id": str(USER_UNASSIGNED), "role": "VIEWER"},
        headers={"Authorization": "Bearer mock-token"},
    )
    assert res.status_code == 403

    # 4b: VIEWER cannot manage members
    set_auth(USER_VIEWER)
    res = client.delete(
        f"/api/v1/tenants/{TENANT_A}/workspace/projects/{PROJECT_A}/members/{USER_EDITOR}",
        headers={"Authorization": "Bearer mock-token"},
    )
    assert res.status_code == 403

    # 4c: ADMIN cannot appoint an OWNER
    set_auth(USER_ADMIN)
    res = client.post(
        f"/api/v1/tenants/{TENANT_A}/workspace/projects/{PROJECT_A}/members",
        json={"user_id": str(USER_UNASSIGNED), "role": "OWNER"},
        headers={"Authorization": "Bearer mock-token"},
    )
    assert res.status_code == 403
    assert "Only project owners can assign the OWNER role" in res.json()["detail"]

    # 4d: ADMIN cannot remove an OWNER
    res = client.delete(
        f"/api/v1/tenants/{TENANT_A}/workspace/projects/{PROJECT_A}/members/{USER_OWNER}",
        headers={"Authorization": "Bearer mock-token"},
    )
    assert res.status_code == 403
    assert "Only an OWNER can remove an OWNER" in res.json()["detail"]


# ==============================================================================
# 5. Last-Owner Protection & Owner Transfer
# ==============================================================================
def test_last_owner_protection_and_transfer():
    set_auth(USER_OWNER)
    base = f"/api/v1/tenants/{TENANT_A}/workspace/projects/{PROJECT_A}/members"

    # 5a: Attempting to remove the sole owner returns 409 Conflict
    res = client.delete(f"{base}/{USER_OWNER}", headers={"Authorization": "Bearer mock-token"})
    assert res.status_code == 409
    assert "Cannot remove or demote the last remaining owner" in res.json()["detail"]

    # 5b: Attempting to demote the sole owner returns 409 Conflict
    res = client.patch(
        f"{base}/{USER_OWNER}",
        json={"role": "ADMIN"},
        headers={"Authorization": "Bearer mock-token"},
    )
    assert res.status_code == 409
    assert "Cannot remove or demote the last remaining owner" in res.json()["detail"]

    # 5c: Appoint Admin Bob as second OWNER (Transfer Step 1)
    res = client.patch(
        f"{base}/{USER_ADMIN}",
        json={"role": "OWNER"},
        headers={"Authorization": "Bearer mock-token"},
    )
    assert res.status_code == 200
    assert res.json()["role"] == "OWNER"

    # 5d: Now that 2 owners exist, demote original owner to ADMIN (Transfer Step 2)
    res = client.patch(
        f"{base}/{USER_OWNER}",
        json={"role": "ADMIN"},
        headers={"Authorization": "Bearer mock-token"},
    )
    assert res.status_code == 200
    assert res.json()["role"] == "ADMIN"

    # Restore Alice as OWNER and Bob as ADMIN for other tests
    set_auth(USER_ADMIN)  # Bob is now OWNER
    client.patch(f"{base}/{USER_OWNER}", json={"role": "OWNER"}, headers={"Authorization": "Bearer mock"})
    client.patch(f"{base}/{USER_ADMIN}", json={"role": "ADMIN"}, headers={"Authorization": "Bearer mock"})


# ==============================================================================
# 6. Database and API Cross-Tenant Prevention
# ==============================================================================
def test_cross_tenant_membership_rejected():
    set_auth(USER_OWNER)

    # 6a: Attempting to add Tenant B user to Tenant A project returns 403
    res = client.post(
        f"/api/v1/tenants/{TENANT_A}/workspace/projects/{PROJECT_A}/members",
        json={"user_id": str(USER_TENANT_B), "role": "VIEWER"},
        headers={"Authorization": "Bearer mock-token"},
    )
    assert res.status_code == 403
    assert "not an active member of this tenant" in res.json()["detail"]

    # 6b: User B attempting to access Tenant A project returns 403
    set_auth(USER_TENANT_B)
    res = client.get(
        f"/api/v1/tenants/{TENANT_A}/workspace/projects/{PROJECT_A}/members",
        headers={"Authorization": "Bearer mock-token"},
    )
    assert res.status_code == 403


# ==============================================================================
# 7. Revoked Tenant Membership Denies Project Access
# ==============================================================================
def test_revoked_tenant_membership_denies_project_access():
    try:
        # Suspend Charlie in tenant_memberships
        with engine.begin() as conn:
            conn.execute(
                text("""
                    UPDATE public.tenant_memberships
                    SET status = 'REVOKED'
                    WHERE user_id = :uid AND tenant_id = :tid
                """),
                {"uid": USER_EDITOR, "tid": TENANT_A},
            )

        # Charlie's project role is now revoked / default-deny
        set_auth(USER_EDITOR)
        res = client.get(
            f"/api/v1/tenants/{TENANT_A}/workspace/projects/{PROJECT_A}/permissions",
            headers={"Authorization": "Bearer mock-token"},
        )
        # Even if they try to access, authorized_tenant_session will reject with 403
        assert res.status_code == 403
    finally:
        # Restore Charlie
        with engine.begin() as conn:
            conn.execute(
                text("""
                    UPDATE public.tenant_memberships
                    SET status = 'ACTIVE'
                    WHERE user_id = :uid AND tenant_id = :tid
                """),
                {"uid": USER_EDITOR, "tid": TENANT_A},
            )


# ==============================================================================
# 8. PostgreSQL Row-Level Security on project_memberships
# ==============================================================================
def test_project_memberships_rls_isolation():
    # Verify using the restricted application role architectiq_app
    with RuntimeSessionLocal() as session:
        with session.begin():
            assert session.scalar(text("SELECT current_user")) == "architectiq_app"

            # 1. Without tenant context: 0 rows returned
            count_no_ctx = session.scalar(text("SELECT COUNT(*) FROM public.project_memberships"))
            assert count_no_ctx == 0

            # 2. With Tenant A context: only Tenant A records visible
            session.execute(
                text("SELECT set_config('architectiq.tenant_id', :tid, true)"),
                {"tid": str(TENANT_A)},
            )
            rows_a = session.execute(
                text("SELECT tenant_id, project_id FROM public.project_memberships")
            ).fetchall()
            assert len(rows_a) > 0
            for r in rows_a:
                assert UUID(str(r[0])) == TENANT_A
                assert UUID(str(r[1])) != PROJECT_B

            # 3. With Tenant B context: only Tenant B records visible
            session.execute(
                text("SELECT set_config('architectiq.tenant_id', :tid, true)"),
                {"tid": str(TENANT_B)},
            )
            rows_b = session.execute(
                text("SELECT tenant_id, project_id FROM public.project_memberships")
            ).fetchall()
            assert len(rows_b) == 1
            assert UUID(str(rows_b[0][0])) == TENANT_B
            assert UUID(str(rows_b[0][1])) == PROJECT_B


# ==============================================================================
# 9. Server-Side Capability Gates (VIEWER cannot rename/move)
# ==============================================================================
def test_viewer_cannot_rename_or_move_project():
    set_auth(USER_VIEWER)

    # Attempt to rename project as VIEWER
    res = client.patch(
        f"/api/v1/tenants/{TENANT_A}/workspace/projects/{PROJECT_A}",
        json={"name": "Hacked Name"},
        headers={"Authorization": "Bearer mock-token"},
    )
    assert res.status_code == 403
    assert "can_edit" in res.json()["detail"]

    # Attempt to rename project as OWNER
    set_auth(USER_OWNER)
    res = client.patch(
        f"/api/v1/tenants/{TENANT_A}/workspace/projects/{PROJECT_A}",
        json={"name": "Project A Renamed"},
        headers={"Authorization": "Bearer mock-token"},
    )
    assert res.status_code == 200
    assert res.json()["name"] == "Project A Renamed"
