"""Automated test suite for M4.3 Environment Bindings & Promotion Governance."""

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
def promotion_seed_data():
    """Seed tenant, org, environments (DEV, TEST, UAT, PROD), folder, project, and users."""
    tenant_id = uuid4()
    org_id = uuid4()
    folder_id = uuid4()
    project_id = uuid4()

    owner_id = uuid4()
    admin_id = uuid4()
    editor_id = uuid4()

    env_ids = {}

    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO public.tenants (id, name, slug, created_at) VALUES (:id, :name, :slug, clock_timestamp())"
            ),
            {"id": tenant_id, "name": "Promo Tenant", "slug": f"promo-tenant-{tenant_id}"},
        )
        conn.execute(
            text(
                "INSERT INTO public.organizations (id, tenant_id, name, slug, created_at) VALUES (:id, :tid, :name, :slug, clock_timestamp())"
            ),
            {"id": org_id, "tid": tenant_id, "name": "Promo Org", "slug": f"promo-org-{org_id}"},
        )

        for name in ("DEV", "TEST", "UAT", "PROD"):
            eid = uuid4()
            env_ids[name] = eid
            conn.execute(
                text(
                    "INSERT INTO public.organization_environments (id, organization_id, name, created_at) "
                    "VALUES (:id, :oid, :name, clock_timestamp())"
                ),
                {"id": eid, "oid": org_id, "name": name},
            )

        conn.execute(
            text(
                "INSERT INTO public.folders (id, organization_id, name, created_at) VALUES (:id, :oid, :name, clock_timestamp())"
            ),
            {"id": folder_id, "oid": org_id, "name": "Promo Folder"},
        )
        conn.execute(
            text(
                "INSERT INTO public.projects (id, folder_id, name, created_at) VALUES (:id, :fid, :name, clock_timestamp())"
            ),
            {"id": project_id, "fid": folder_id, "name": "Promotion Candidate Project"},
        )

        # Users and tenant memberships
        for uid, name in [
            (owner_id, "Promo Owner"),
            (admin_id, "Promo Admin"),
            (editor_id, "Promo Editor"),
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

        # Project memberships
        conn.execute(
            text(
                "INSERT INTO public.project_memberships (id, tenant_id, project_id, user_id, role, created_at) "
                "VALUES (gen_random_uuid(), :tid, :pid, :uid, 'OWNER', clock_timestamp())"
            ),
            {"tid": tenant_id, "pid": project_id, "uid": owner_id},
        )
        conn.execute(
            text(
                "INSERT INTO public.project_memberships (id, tenant_id, project_id, user_id, role, created_at) "
                "VALUES (gen_random_uuid(), :tid, :pid, :uid, 'ADMIN', clock_timestamp())"
            ),
            {"tid": tenant_id, "pid": project_id, "uid": admin_id},
        )
        conn.execute(
            text(
                "INSERT INTO public.project_memberships (id, tenant_id, project_id, user_id, role, created_at) "
                "VALUES (gen_random_uuid(), :tid, :pid, :uid, 'EDITOR', clock_timestamp())"
            ),
            {"tid": tenant_id, "pid": project_id, "uid": editor_id},
        )

    return {
        "tenant_id": tenant_id,
        "org_id": org_id,
        "folder_id": folder_id,
        "project_id": project_id,
        "env_ids": env_ids,
        "owner_id": owner_id,
        "admin_id": admin_id,
        "editor_id": editor_id,
    }


def authenticate_as(user_id):
    app.dependency_overrides[get_verified_identity] = lambda: VerifiedIdentity(
        issuer="architectiq-native", subject=str(user_id)
    )


def test_environment_bindings_list_and_update(promotion_seed_data):
    """Verify listing and configuring environment overrides."""
    data = promotion_seed_data
    tenant_id = data["tenant_id"]
    project_id = data["project_id"]
    editor_id = data["editor_id"]
    dev_id = data["env_ids"]["DEV"]

    authenticate_as(editor_id)

    # 1. List bindings (should show all 4 org environments)
    res = client.get(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/environment-bindings"
    )
    assert res.status_code == 200, res.text
    bindings = res.json()
    assert len(bindings) == 4
    names = {b["environment_name"] for b in bindings}
    assert names == {"DEV", "TEST", "UAT", "PROD"}

    # 2. Update config overrides on DEV
    put_res = client.put(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/environment-bindings/{dev_id}",
        json={
            "config_overrides": {"api_timeout": 30, "batch_size": 100, "feature_v2": True},
            "is_enabled": True,
        },
    )
    assert put_res.status_code == 200
    updated = put_res.json()
    assert updated["config_overrides"]["api_timeout"] == 30
    assert updated["config_overrides"]["feature_v2"] is True


def test_promotion_request_and_drift_detection(promotion_seed_data):
    """Verify promotion submission detects configuration drift between environments."""
    data = promotion_seed_data
    tenant_id = data["tenant_id"]
    project_id = data["project_id"]
    editor_id = data["editor_id"]
    dev_id = data["env_ids"]["DEV"]
    test_id = data["env_ids"]["TEST"]

    authenticate_as(editor_id)

    # Set distinct configs on DEV and TEST
    client.put(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/environment-bindings/{dev_id}",
        json={"config_overrides": {"rate_limit": 500, "auth_provider": "OIDC"}},
    )
    client.put(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/environment-bindings/{test_id}",
        json={"config_overrides": {"rate_limit": 100, "auth_provider": "BASIC"}},
    )

    # Submit promotion DEV -> TEST
    promo_res = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/promotions",
        json={
            "source_environment_id": str(dev_id),
            "target_environment_id": str(test_id),
            "notes": "Promoting release v1.4 with higher rate limit",
        },
    )
    assert promo_res.status_code == 200
    promo = promo_res.json()
    assert promo["status"] == "PENDING"
    assert promo["source_environment_name"] == "DEV"
    assert promo["target_environment_name"] == "TEST"
    assert promo["drift_detected"] is True
    assert "rate_limit" in promo["drift_details"]
    assert promo["drift_details"]["rate_limit"]["source"] == 500
    assert promo["drift_details"]["rate_limit"]["target"] == 100


def test_promotion_step_validation(promotion_seed_data):
    """Verify invalid promotion skips (e.g. DEV -> PROD) are rejected with 422."""
    data = promotion_seed_data
    tenant_id = data["tenant_id"]
    project_id = data["project_id"]
    editor_id = data["editor_id"]
    dev_id = data["env_ids"]["DEV"]
    prod_id = data["env_ids"]["PROD"]

    authenticate_as(editor_id)

    # Attempt direct promotion DEV -> PROD
    invalid_res = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/promotions",
        json={
            "source_environment_id": str(dev_id),
            "target_environment_id": str(prod_id),
            "notes": "Attempting illegal direct promotion to PROD",
        },
    )
    assert invalid_res.status_code == 422
    assert "cannot promote directly" in invalid_res.json()["detail"]


def test_segregation_of_duties_self_approval(promotion_seed_data):
    """Verify admin requester cannot approve their own promotion (segregation of duties)."""
    data = promotion_seed_data
    tenant_id = data["tenant_id"]
    project_id = data["project_id"]
    admin_id = data["admin_id"]
    owner_id = data["owner_id"]
    dev_id = data["env_ids"]["DEV"]
    test_id = data["env_ids"]["TEST"]

    # Admin requests promotion
    authenticate_as(admin_id)
    promo_res = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/promotions",
        json={"source_environment_id": str(dev_id), "target_environment_id": str(test_id)},
    )
    promo_id = promo_res.json()["id"]

    # Admin attempts to approve their own request -> 403 Forbidden
    self_review = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/promotions/{promo_id}/review",
        json={"action": "APPROVE", "review_notes": "Self approval by admin"},
    )
    assert self_review.status_code == 403
    assert "Segregation of duties violation" in self_review.json()["detail"]

    # Owner can approve the request
    authenticate_as(owner_id)
    owner_review = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/promotions/{promo_id}/review",
        json={"action": "APPROVE", "review_notes": "Approved by Owner"},
    )
    assert owner_review.status_code == 200
    assert owner_review.json()["status"] == "APPROVED"


def test_promotion_execution_synchronization(promotion_seed_data):
    """Verify promotion execution synchronizes configuration overrides from source to target."""
    data = promotion_seed_data
    tenant_id = data["tenant_id"]
    project_id = data["project_id"]
    owner_id = data["owner_id"]
    dev_id = data["env_ids"]["DEV"]
    test_id = data["env_ids"]["TEST"]

    authenticate_as(owner_id)

    # 1. Set DEV config
    client.put(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/environment-bindings/{dev_id}",
        json={"config_overrides": {"timeout": 60, "max_concurrency": 25}},
    )

    # 2. Request promotion
    promo_res = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/promotions",
        json={"source_environment_id": str(dev_id), "target_environment_id": str(test_id)},
    )
    promo_id = promo_res.json()["id"]

    # 3. Execution before approval is rejected
    exec_early = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/promotions/{promo_id}/execute"
    )
    assert exec_early.status_code == 400
    assert "Only APPROVED promotions can be executed" in exec_early.json()["detail"]

    # 4. Approve
    client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/promotions/{promo_id}/review",
        json={"action": "APPROVE", "review_notes": "Ready to execute"},
    )

    # 5. Execute
    exec_res = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/promotions/{promo_id}/execute"
    )
    assert exec_res.status_code == 200
    executed = exec_res.json()
    assert executed["status"] == "EXECUTED"
    assert executed["target_config"] == {"timeout": 60, "max_concurrency": 25}

    # 6. Verify TEST environment binding now matches DEV config
    bindings_res = client.get(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/environment-bindings"
    )
    test_binding = next(b for b in bindings_res.json() if b["environment_name"] == "TEST")
    assert test_binding["config_overrides"] == {"timeout": 60, "max_concurrency": 25}


def test_cross_tenant_promotion_isolation(promotion_seed_data):
    """Verify cross-tenant promotion boundaries cannot be crossed."""
    data = promotion_seed_data
    tenant_a = data["tenant_id"]
    project_a = data["project_id"]
    owner_a = data["owner_id"]

    # Create Tenant B and User B
    tenant_b = uuid4()
    user_b = uuid4()
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO public.tenants (id, name, slug, created_at) VALUES (:id, 'Tenant B Promo', :slug, now())"
            ),
            {"id": tenant_b, "slug": f"tb-promo-{tenant_b}"},
        )
        conn.execute(
            text(
                "INSERT INTO public.users (id, display_name, status, created_at) VALUES (:id, 'User B Promo', 'ACTIVE', now())"
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

    # User B attempts to access Tenant A project promotions
    authenticate_as(user_b)
    cross_get = client.get(
        f"/api/v1/tenants/{tenant_b}/workspace/projects/{project_a}/promotions"
    )
    assert cross_get.status_code in (403, 404)
