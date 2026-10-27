"""Automated test suite for Module 01: Platform Control Center."""
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


def authenticate_as(user_id):
    app.dependency_overrides[get_verified_identity] = lambda: VerifiedIdentity(
        issuer="architectiq-native", subject=str(user_id)
    )


@pytest.fixture
def platform_env():
    admin_user_id = uuid4()
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO public.users (id, display_name, status, created_at) "
                "VALUES (:u, 'Platform Admin', 'ACTIVE', clock_timestamp()) ON CONFLICT (id) DO NOTHING"
            ),
            {"u": admin_user_id},
        )
    yield {"admin_user_id": admin_user_id}
    # Teardown: ensure test organizations and tenants do not pollute dev/prod database
    with engine.begin() as conn:
        conn.execute(
            text(
                "DELETE FROM public.workspace_activity WHERE tenant_id IN (SELECT id FROM public.tenants WHERE organization_id IN (SELECT id FROM public.platform_organizations WHERE slug != 'citibank-global'))"
            )
        )
        conn.execute(
            text(
                "DELETE FROM public.tenant_environments WHERE tenant_id IN (SELECT id FROM public.tenants WHERE organization_id IN (SELECT id FROM public.platform_organizations WHERE slug != 'citibank-global'))"
            )
        )
        conn.execute(
            text(
                "DELETE FROM public.tenants WHERE organization_id IN (SELECT id FROM public.platform_organizations WHERE slug != 'citibank-global') OR (organization_id = '9a1c6757-4268-42ab-9f98-38441eab424c' AND slug NOT IN ('citibank'))"
            )
        )
        conn.execute(
            text(
                "DELETE FROM public.platform_subscriptions WHERE organization_id IN (SELECT id FROM public.platform_organizations WHERE slug != 'citibank-global')"
            )
        )
        conn.execute(
            text(
                "DELETE FROM public.platform_infrastructure_pools WHERE assigned_org_id IN (SELECT id FROM public.platform_organizations WHERE slug != 'citibank-global')"
            )
        )
        conn.execute(
            text(
                "DELETE FROM public.platform_organizations WHERE slug != 'citibank-global'"
            )
        )
        conn.execute(
            text("DELETE FROM public.users WHERE id = :u"),
            {"u": admin_user_id},
        )


def test_platform_dashboard_kpis(platform_env):
    authenticate_as(platform_env["admin_user_id"])
    response = client.get("/api/v1/platform/dashboard")
    assert response.status_code == 200
    data = response.json()
    assert "counts" in data
    assert "compute" in data
    assert "consumption" in data
    assert "status" in data
    counts = data["counts"]
    assert counts["organizations_total"] >= 0
    assert counts["tenants_total"] >= 0
    assert counts["environments_total"] >= 0
    assert counts["active_pods"] >= 0


def test_organization_lifecycle_and_subscription(platform_env):
    authenticate_as(platform_env["admin_user_id"])
    unique_suffix = uuid4().hex[:6]
    slug = f"acme-{unique_suffix}"

    # 1. Create Organization
    create_payload = {
        "name": f"Acme Corp {unique_suffix}",
        "slug": slug,
        "tier": "ENTERPRISE_CORE",
        "region": "us-east-1",
        "contact_email": "admin@acme.example.com",
        "logo_url": "https://example.com/acme-logo.svg",
    }
    create_resp = client.post("/api/v1/platform/organizations", json=create_payload)
    assert create_resp.status_code == 201
    org_data = create_resp.json()
    assert org_data["slug"] == slug
    assert org_data["tier"] == "ENTERPRISE_CORE"
    assert org_data["status"] == "ENABLED"
    assert org_data["logo_url"] == "https://example.com/acme-logo.svg"
    org_id = org_data["id"]

    # 2. Duplicate slug should return 409 Conflict
    dup_resp = client.post("/api/v1/platform/organizations", json=create_payload)
    assert dup_resp.status_code == 409

    # 3. Patch Organization
    patch_resp = client.patch(
        f"/api/v1/platform/organizations/{org_id}",
        json={
            "contact_email": "updated@acme.example.com",
            "region": "eu-central-1",
            "logo_url": "https://example.com/acme-brand-updated.png",
        },
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["contact_email"] == "updated@acme.example.com"
    assert patch_resp.json()["region"] == "eu-central-1"
    assert patch_resp.json()["logo_url"] == "https://example.com/acme-brand-updated.png"

    # 4. Suspend Organization (no active tenants yet, should succeed)
    lifecycle_resp = client.post(
        f"/api/v1/platform/organizations/{org_id}/lifecycle",
        json={"action": "suspend", "reason": "Scheduled security review"},
    )
    assert lifecycle_resp.status_code == 200
    assert lifecycle_resp.json()["status"] == "SUSPENDED"

    # 5. Reactivate Organization
    reactivate_resp = client.post(
        f"/api/v1/platform/organizations/{org_id}/lifecycle",
        json={"action": "reactivate", "reason": "Security review completed"},
    )
    assert reactivate_resp.status_code == 200
    assert reactivate_resp.json()["status"] == "ENABLED"


def test_tenant_and_5_canonical_environments_provisioning(platform_env):
    authenticate_as(platform_env["admin_user_id"])
    unique_suffix = uuid4().hex[:6]

    # Create Org first
    org_resp = client.post(
        "/api/v1/platform/organizations",
        json={
            "name": f"FinTech Org {unique_suffix}",
            "slug": f"fintech-{unique_suffix}",
            "tier": "ENTERPRISE_ULTRA",
            "region": "us-west-2",
            "contact_email": "ops@fintech.example.com",
        },
    )
    assert org_resp.status_code == 201
    org_id = org_resp.json()["id"]

    # Provision Tenant - this MUST automatically provision DEV, TEST, UAT, CANARY, PROD
    tenant_slug = f"payments-{unique_suffix}"
    tenant_resp = client.post(
        "/api/v1/platform/fleet/tenants",
        json={
            "organization_id": org_id,
            "name": f"Payments Service {unique_suffix}",
            "slug": tenant_slug,
        },
    )
    assert tenant_resp.status_code == 201
    tenant_data = tenant_resp.json()
    assert tenant_data["slug"] == tenant_slug

    envs = tenant_data.get("environments", [])
    assert len(envs) == 5
    env_names = {e["name"] for e in envs}
    expected_canonical_envs = {"DEV", "TEST", "UAT", "CANARY", "PROD"}
    assert env_names == expected_canonical_envs
    for env in envs:
        assert env["is_active"] is True

    # Check fleet query endpoint
    fleet_resp = client.get(f"/api/v1/platform/fleet/tenants?organization_id={org_id}")
    assert fleet_resp.status_code == 200
    fleet = fleet_resp.json()
    assert len(fleet) >= 1
    found_tenant = next(t for t in fleet if t["id"] == tenant_data["id"])
    assert len(found_tenant["environments"]) == 5


def test_environment_disablement_blocking_on_active_runs(platform_env):
    authenticate_as(platform_env["admin_user_id"])
    unique_suffix = uuid4().hex[:6]

    org_resp = client.post(
        "/api/v1/platform/organizations",
        json={
            "name": f"Dep Org {unique_suffix}",
            "slug": f"dep-{unique_suffix}",
            "tier": "ENTERPRISE_CORE",
            "region": "us-east-1",
            "contact_email": "dev@dep.example.com",
        },
    )
    assert org_resp.status_code == 201
    org_id = org_resp.json()["id"]

    tenant_resp = client.post(
        "/api/v1/platform/fleet/tenants",
        json={
            "organization_id": org_id,
            "name": f"Dep Tenant {unique_suffix}",
            "slug": f"depten-{unique_suffix}",
        },
    )
    assert tenant_resp.status_code == 201
    tenant_data = tenant_resp.json()
    prod_env = next(e for e in tenant_data["environments"] if e["name"] == "PROD")
    env_id = prod_env["id"]

    # 1. Disable when no runs exist -> should succeed
    disable_resp = client.post(
        f"/api/v1/platform/fleet/environments/{env_id}/lifecycle",
        json={"action": "disable", "reason": "Maintenance window"},
    )
    assert disable_resp.status_code == 200
    assert disable_resp.json()["is_active"] is False

    # 2. Re-enable environment
    enable_resp = client.post(
        f"/api/v1/platform/fleet/environments/{env_id}/lifecycle",
        json={"action": "enable", "reason": "Maintenance complete"},
    )
    assert enable_resp.status_code == 200
    assert enable_resp.json()["is_active"] is True

    # 3. Insert an active workflow run into database for this environment
    folder_id = uuid4()
    proj_id = uuid4()
    run_id = uuid4()
    legacy_org_id = uuid4()
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO public.organizations (id, tenant_id, name, slug, created_at) "
                "VALUES (:o, :t, 'Legacy Org', :slug, clock_timestamp())"
            ),
            {"o": legacy_org_id, "t": tenant_data["id"], "slug": f"leg-{uuid4().hex[:6]}"},
        )
        conn.execute(
            text(
                "INSERT INTO public.folders (id, organization_id, tenant_id, name, created_at) "
                "VALUES (:f, :o, :t, 'Test Folder', clock_timestamp())"
            ),
            {"f": folder_id, "o": legacy_org_id, "t": tenant_data["id"]},
        )
        conn.execute(
            text(
                "INSERT INTO public.projects (id, folder_id, name, created_at) "
                "VALUES (:p, :f, 'Test Project', clock_timestamp())"
            ),
            {"p": proj_id, "f": folder_id},
        )
        wf_id = uuid4()
        conn.execute(
            text(
                "INSERT INTO public.workflow_definitions (id, tenant_id, project_id, name, slug, created_at, updated_at) "
                "VALUES (:w, :t, :p, 'Sample Workflow', :slug, clock_timestamp(), clock_timestamp())"
            ),
            {"w": wf_id, "t": tenant_data["id"], "p": proj_id, "slug": f"wf-{uuid4().hex[:6]}"},
        )
        conn.execute(
            text(
                "INSERT INTO public.workflow_runs (id, tenant_id, project_id, workflow_id, workflow_version, environment_id, status, started_at) "
                "VALUES (:id, :t_id, :p_id, :w_id, 1, NULL, 'RUNNING', clock_timestamp())"
            ),
            {"id": run_id, "t_id": tenant_data["id"], "p_id": proj_id, "w_id": wf_id},
        )

    # 4. Now disabling should fail with 409 Conflict due to active operational dependency
    blocked_resp = client.post(
        f"/api/v1/platform/fleet/environments/{env_id}/lifecycle",
        json={"action": "disable", "reason": "Forced shutdown attempt"},
    )
    assert blocked_resp.status_code == 409
    assert "Cannot disable environment with 1 active execution(s)" in blocked_resp.json()["detail"]

    # Clean up test run
    with engine.begin() as conn:
        conn.execute(text("DELETE FROM public.workflow_runs WHERE id = :id"), {"id": run_id})
        conn.execute(text("DELETE FROM public.workflow_definitions WHERE id = :id"), {"id": wf_id})
        conn.execute(text("DELETE FROM public.projects WHERE id = :id"), {"id": proj_id})
        conn.execute(text("DELETE FROM public.folders WHERE id = :id"), {"id": folder_id})
        conn.execute(text("DELETE FROM public.organizations WHERE id = :id"), {"id": legacy_org_id})


def test_governance_break_glass_dual_custody(platform_env):
    admin_id = platform_env["admin_user_id"]
    authenticate_as(admin_id)

    # Create org to associate break glass
    org_resp = client.post(
        "/api/v1/platform/organizations",
        json={
            "name": f"Break Glass Test Org {uuid4().hex[:6]}",
            "tier": "ENTERPRISE_ULTRA",
            "contact_email": "ops@bgtest.com",
        },
    )
    assert org_resp.status_code == 201
    org_id = org_resp.json()["id"]

    # Create break-glass emergency lease request
    bg_payload = {
        "organization_id": org_id,
        "requester_email": "sre-lead@architectiq.io",
        "reason": "Sev-1 Production Database Corruption Incident PagerDuty #49281",
        "lease_hours": 2,
    }
    req_resp = client.post("/api/v1/platform/governance/break-glass", json=bg_payload)
    assert req_resp.status_code == 201
    bg_data = req_resp.json()
    req_id = bg_data["id"]
    assert bg_data["status"] == "PENDING"
    assert bg_data["requester_email"] == "sre-lead@architectiq.io"

    # Approve break glass request
    approver_id = uuid4()
    with engine.begin() as conn:
        conn.execute(
            text("INSERT INTO public.users (id, display_name, status, created_at) VALUES (:u, 'Approver SecOps', 'ACTIVE', clock_timestamp()) ON CONFLICT DO NOTHING"),
            {"u": approver_id},
        )
    authenticate_as(approver_id)

    approve_resp = client.post(
        f"/api/v1/platform/governance/break-glass/{req_id}/action",
        json={"action": "approve", "approver_email": "secops-director@architectiq.io"},
    )
    assert approve_resp.status_code == 200
    approved_data = approve_resp.json()
    assert approved_data["status"] == "APPROVED"
    assert approved_data["lease_expires_at"] is not None

    # Terminate break glass lease early
    term_resp = client.post(
        f"/api/v1/platform/governance/break-glass/{req_id}/action",
        json={"action": "terminate", "approver_email": "secops-director@architectiq.io"},
    )
    assert term_resp.status_code == 200
    assert term_resp.json()["status"] == "TERMINATED"


def test_audit_trail_and_diagnostics(platform_env):
    authenticate_as(platform_env["admin_user_id"])

    # 1. Audit Trail query (will have entries from preceding tests)
    audit_resp = client.get("/api/v1/platform/audit-trail?limit=20")
    assert audit_resp.status_code == 200
    events = audit_resp.json()
    assert isinstance(events, list)
    assert len(events) >= 1
    outcomes = {e["outcome"] for e in events}
    assert "SUCCESS" in outcomes or "DENIED" in outcomes

    # Filter by outcome
    success_resp = client.get("/api/v1/platform/audit-trail?outcome=SUCCESS&limit=5")
    assert success_resp.status_code == 200
    for e in success_resp.json():
        assert e["outcome"] == "SUCCESS"

    # 2. Diagnostics
    diag_resp = client.get("/api/v1/platform/diagnostics")
    assert diag_resp.status_code == 200
    diag = diag_resp.json()
    assert diag["database"]["pool_status"] == "ONLINE"
    assert "feature_flags" in diag
    assert "backup_verification" in diag

    # 3. Toggle feature flag
    flag_resp = client.post(
        "/api/v1/platform/diagnostics/feature-flags",
        json={"key": "CANARY_DEPLOYMENTS", "is_enabled": False},
    )
    assert flag_resp.status_code == 200
    assert flag_resp.json()["is_enabled"] is False

    # 4. Trigger Backup Verification
    backup_resp = client.post(
        "/api/v1/platform/diagnostics/verify-backup",
    )
    assert backup_resp.status_code == 200
    verification = backup_resp.json()
    assert verification["status"] == "VERIFIED"
    assert verification["rpo_minutes"] > 0
    assert verification["rto_minutes"] > 0


def test_fleet_tenant_lifecycle_and_administration_overview(platform_env):
    authenticate_as(platform_env["admin_user_id"])
    unique_suffix = uuid4().hex[:6]

    # 1. Overview API
    overview_resp = client.get("/api/v1/platform/administration/overview")
    assert overview_resp.status_code == 200
    ov_data = overview_resp.json()
    assert "total_tenants" in ov_data
    assert "total_users" in ov_data
    assert "active_projects" in ov_data
    assert ov_data["policy_compliance_pct"] == 100

    # 2. Provision Tenant with description and status
    tenant_resp = client.post(
        "/api/v1/platform/fleet/tenants",
        json={
            "name": f"Admin Tenant {unique_suffix}",
            "description": "Lifecycle testing tenant",
            "status": "Active",
        },
    )
    assert tenant_resp.status_code == 201
    created_tenant = tenant_resp.json()
    tenant_id = created_tenant["id"]
    assert created_tenant["status"] == "Active"
    assert created_tenant["description"] == "Lifecycle testing tenant"

    # 3. Patch Tenant (Update name and status to Suspended)
    patch_resp = client.patch(
        f"/api/v1/platform/fleet/tenants/{tenant_id}",
        json={
            "name": f"Admin Tenant {unique_suffix} Updated",
            "status": "Suspended",
            "description": "Temporarily suspended for maintenance",
        },
    )
    assert patch_resp.status_code == 200
    patched = patch_resp.json()
    assert patched["name"] == f"Admin Tenant {unique_suffix} Updated"
    assert patched["status"] == "Suspended"
    assert patched["description"] == "Temporarily suspended for maintenance"

    # 4. Delete / Archive Tenant
    del_resp = client.delete(f"/api/v1/platform/fleet/tenants/{tenant_id}")
    assert del_resp.status_code == 200
    assert del_resp.json()["status"] == "Archived"


import base64

def test_organization_slug_generation_and_immutability(platform_env):
    authenticate_as(platform_env["admin_user_id"])
    unique_suffix = uuid4().hex[:6]
    org_name = f"Canada Life Financial {unique_suffix}"

    # 1. Automatic slug generation without providing slug
    create_resp = client.post(
        "/api/v1/platform/organizations",
        json={
            "name": org_name,
            "tier": "ENTERPRISE_CORE",
            "administrators": [
                {
                    "email": f"owner@{unique_suffix}.com",
                    "role": "ORGANIZATION_OWNER",
                    "status": "ACTIVE",
                    "is_primary": True,
                }
            ],
        },
    )
    assert create_resp.status_code == 201
    data = create_resp.json()
    expected_prefix = f"canada-life-financial-{unique_suffix}"
    assert data["slug"].startswith("canada-life-financial")
    org_id = data["id"]
    initial_slug = data["slug"]

    # 2. Renaming organization does NOT change slug (slug is immutable)
    patch_resp = client.patch(
        f"/api/v1/platform/organizations/{org_id}",
        json={"name": f"Great-West Lifeco {unique_suffix}"},
    )
    assert patch_resp.status_code == 200

    # Verify via GET that slug remained exactly the same
    get_resp = client.get("/api/v1/platform/organizations")
    found = next(o for o in get_resp.json() if o["id"] == org_id)
    assert found["name"] == f"Great-West Lifeco {unique_suffix}"
    assert found["slug"] == initial_slug


def test_organization_logo_upload_security_and_management(platform_env):
    authenticate_as(platform_env["admin_user_id"])
    unique_suffix = uuid4().hex[:6]

    org_resp = client.post(
        "/api/v1/platform/organizations",
        json={
            "name": f"Logo Test Org {unique_suffix}",
            "tier": "ENTERPRISE_STARTER",
        },
    )
    assert org_resp.status_code == 201
    org_id = org_resp.json()["id"]

    # 1. Upload valid PNG logo
    sample_png = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4"
    b64_png = base64.b64encode(sample_png).decode()

    upload_resp = client.post(
        f"/api/v1/platform/organizations/{org_id}/logo",
        json={
            "content_type": "image/png",
            "data_base64": b64_png,
        },
    )
    assert upload_resp.status_code == 200
    up_data = upload_resp.json()
    asset_id = up_data["asset_id"]
    assert up_data["logo_url"] == f"/api/v1/platform/assets/{asset_id}"

    # 2. Fetch asset via GET
    get_asset_resp = client.get(f"/api/v1/platform/assets/{asset_id}")
    assert get_asset_resp.status_code == 200
    assert get_asset_resp.content == sample_png
    assert "image/png" in get_asset_resp.headers["content-type"]

    # 3. Reject malicious SVG with script tags
    malicious_svg = b"<svg><script>alert('xss')</script></svg>"
    b64_mal = base64.b64encode(malicious_svg).decode()
    mal_resp = client.post(
        f"/api/v1/platform/organizations/{org_id}/logo",
        json={
            "content_type": "image/svg+xml",
            "data_base64": b64_mal,
        },
    )
    assert mal_resp.status_code == 400
    assert "prohibited executable content" in mal_resp.json()["detail"]

    # 4. Remove logo
    del_resp = client.delete(f"/api/v1/platform/organizations/{org_id}/logo")
    assert del_resp.status_code == 200


def test_organization_multi_administrator_governance(platform_env):
    authenticate_as(platform_env["admin_user_id"])
    unique_suffix = uuid4().hex[:6]

    # 1. Create Org with 2 administrators (1 owner, 1 admin)
    org_resp = client.post(
        "/api/v1/platform/organizations",
        json={
            "name": f"Governance Org {unique_suffix}",
            "administrators": [
                {
                    "email": f"owner@{unique_suffix}.com",
                    "role": "ORGANIZATION_OWNER",
                    "status": "ACTIVE",
                    "is_primary": True,
                },
                {
                    "email": f"it.admin@{unique_suffix}.com",
                    "role": "ORGANIZATION_ADMIN",
                    "status": "ACTIVE",
                    "is_primary": False,
                },
            ],
        },
    )
    assert org_resp.status_code == 201
    org_id = org_resp.json()["id"]

    # 2. List administrators
    admins_resp = client.get(f"/api/v1/platform/organizations/{org_id}/administrators")
    assert admins_resp.status_code == 200
    admins = admins_resp.json()
    assert len(admins) == 2

    owner = next(a for a in admins if a["email"] == f"owner@{unique_suffix}.com")
    it_admin = next(a for a in admins if a["email"] == f"it.admin@{unique_suffix}.com")
    assert owner["is_primary"] is True

    # 3. Delete secondary admin - should succeed
    del_it_resp = client.delete(f"/api/v1/platform/organizations/{org_id}/administrators/{it_admin['id']}")
    assert del_it_resp.status_code == 200

    # 4. Attempt to delete last active admin (owner) - must be blocked with HTTP 400
    del_owner_resp = client.delete(f"/api/v1/platform/organizations/{org_id}/administrators/{owner['id']}")
    assert del_owner_resp.status_code == 400
    assert "Cannot delete the last active organization administrator" in del_owner_resp.json()["detail"]


def test_tenant_deployment_models_and_residency(platform_env):
    authenticate_as(platform_env["admin_user_id"])
    unique_suffix = uuid4().hex[:6]

    # 1. Fetch supported regions catalog
    regions_resp = client.get("/api/v1/platform/deployment/regions")
    assert regions_resp.status_code == 200
    regions = regions_resp.json()
    assert len(regions) >= 4
    region_ids = [r["id"] for r in regions]
    assert "ca-central-1" in region_ids
    assert "us-east-1" in region_ids

    # Create parent organization
    org_resp = client.post(
        "/api/v1/platform/organizations",
        json={"name": f"Enterprise Bank {unique_suffix}"},
    )
    assert org_resp.status_code == 201
    org_id = org_resp.json()["id"]

    # 2. Provision SaaS Tenant with ca-central-1
    saas_tenant_resp = client.post(
        "/api/v1/platform/fleet/tenants",
        json={
            "organization_id": org_id,
            "name": f"SaaS Banking {unique_suffix}",
            "deployment_model": "saas",
            "hosting_region": "ca-central-1",
            "tenant_admins": [f"admin@{unique_suffix}.ca"],
        },
    )
    assert saas_tenant_resp.status_code == 201
    saas_data = saas_tenant_resp.json()
    saas_id = saas_data["id"]
    assert saas_data["deployment"]["deployment_model"] == "saas"
    assert saas_data["deployment"]["hosting_region"] == "ca-central-1"

    # 3. Provision Client Cloud Tenant (AWS)
    cloud_tenant_resp = client.post(
        "/api/v1/platform/fleet/tenants",
        json={
            "organization_id": org_id,
            "name": f"Cloud Payments {unique_suffix}",
            "deployment_model": "client_cloud",
            "cloud_provider": "AWS",
            "cloud_account_id": "1234-5678-9012",
            "infrastructure_region": "us-east-2",
        },
    )
    assert cloud_tenant_resp.status_code == 201
    cloud_data = cloud_tenant_resp.json()
    assert cloud_data["deployment"]["deployment_model"] == "client_cloud"
    assert cloud_data["deployment"]["cloud_provider"] == "AWS"
    assert cloud_data["deployment"]["infrastructure_region"] == "us-east-2"

    # 4. Provision On-Premises Tenant
    onprem_tenant_resp = client.post(
        "/api/v1/platform/fleet/tenants",
        json={
            "organization_id": org_id,
            "name": f"Core Vault {unique_suffix}",
            "deployment_model": "on_premises",
            "site_name": "Toronto Tier-4 DataCenter",
            "jurisdiction": "Canada - Federal",
            "isolated_network": True,
            "ai_inference_allowed": False,
        },
    )
    assert onprem_tenant_resp.status_code == 201
    onprem_data = onprem_tenant_resp.json()
    assert onprem_data["deployment"]["deployment_model"] == "on_premises"
    assert onprem_data["deployment"]["site_name"] == "Toronto Tier-4 DataCenter"
    assert onprem_data["deployment"]["isolated_network"] is True
    assert onprem_data["deployment"]["ai_inference_allowed"] is False

    # 5. Check Effective Residency Endpoint
    res_resp = client.get(f"/api/v1/platform/tenants/{saas_id}/residency")
    assert res_resp.status_code == 200
    res_data = res_resp.json()
    assert res_data["deployment_model"] == "saas"
    assert res_data["hosting_region"] == "ca-central-1"

    # 6. Request Governed Residency Migration for SaaS Tenant
    mig_resp = client.post(
        f"/api/v1/platform/tenants/{saas_id}/residency-migrations",
        json={
            "target_region": "eu-west-1",
            "reason": "Regulatory compliance with European DORA requirements",
        },
    )
    assert mig_resp.status_code == 201
    mig_data = mig_resp.json()
    assert mig_data["source_region"] == "ca-central-1"
    assert mig_data["target_region"] == "eu-west-1"
    assert mig_data["status"] == "REQUESTED"
