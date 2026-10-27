"""Automated test suite for Process Capture Studio (PCS-01).

Covers:
- Session state machine transitions (DRAFT -> RECORDING <-> PAUSED -> COMPLETED -> APPROVED)
- Windows Agent registration and heartbeat ACK
- Tenant isolation across capture assets
- Monotonic event sequencing and out-of-order normalization
- Automated PII and password field redaction
- Excluded application detection
- Evidence upload idempotency (SHA-256 deduplication)
- Flow Studio visual workflow synthesis
"""
import hashlib
from uuid import uuid4

from fastapi.testclient import TestClient
import pytest
from sqlalchemy import select

from authentication import VerifiedIdentity, get_verified_identity
from database import SessionLocal
from main import app
from models import (
    CaptureAgent,
    CaptureEvent,
    CaptureEvidence,
    CaptureSession,
    Folder,
    Organization,
    Project,
    Tenant,
    WorkflowDefinition,
    WorkflowVersion,
)

client = TestClient(app)

TEST_USER_EMAIL = "ratheesh.ramadasan@gmail.com"


@pytest.fixture(autouse=True)
def override_auth():
    app.dependency_overrides[get_verified_identity] = lambda: VerifiedIdentity(
        issuer="https://auth.architectiq.io",
        subject=TEST_USER_EMAIL,
    )
    yield
    app.dependency_overrides.pop(get_verified_identity, None)


@pytest.fixture
def test_setup():
    with SessionLocal() as db:
        # Load canonical live tenants
        tenant_a = db.scalar(select(Tenant).where(Tenant.slug == "banking-operations"))
        tenant_b = db.scalar(select(Tenant).where(Tenant.slug == "claims-operations"))

        if not tenant_a or not tenant_b:
            tenants = db.scalars(select(Tenant).limit(2)).all()
            tenant_a = tenants[0]
            tenant_b = tenants[1]

        # Ensure an Organization exists for tenant_a (required by folders foreign key)
        org_a = db.scalar(select(Organization).where(Organization.tenant_id == tenant_a.id))
        if not org_a:
            org_a = Organization(
                id=uuid4(),
                tenant_id=tenant_a.id,
                name="Test Organization",
                slug=f"test-org-{uuid4().hex[:6]}",
            )
            db.add(org_a)
            db.flush()

        # Create isolated test folder in tenant A
        folder_a = Folder(
            tenant_id=tenant_a.id,
            organization_id=org_a.id,
            name=f"Test Capture Folder {uuid4().hex[:6]}",
        )
        db.add(folder_a)
        db.commit()

        tenant_a_id = tenant_a.id
        tenant_b_id = tenant_b.id
        folder_a_id = folder_a.id

    yield {
        "tenant_a_id": tenant_a_id,
        "tenant_b_id": tenant_b_id,
        "folder_a_id": folder_a_id,
    }

    # Teardown
    with SessionLocal() as db:
        db.query(CaptureEvent).delete()
        db.query(CaptureEvidence).delete()
        db.query(CaptureSession).delete()
        db.query(CaptureAgent).delete()
        db.query(WorkflowVersion).delete()
        db.query(WorkflowDefinition).filter(WorkflowDefinition.name.like("%Auto-Discovered%")).delete()
        db.query(Project).filter(Project.folder_id == folder_a_id).delete()
        db.query(Folder).filter(Folder.id == folder_a_id).delete()
        db.commit()


def test_agent_registration_and_heartbeat(test_setup):
    tenant_a_id = test_setup["tenant_a_id"]

    # 1. Register new Windows desktop capture agent
    reg_payload = {
        "tenant_id": str(tenant_a_id),
        "agent_hostname": "DESKTOP-TREASURY-01",
        "os_version": "Windows 11 Enterprise 23H2",
        "agent_version": "1.0.0",
        "hardware_fingerprint": f"hw_fp_{uuid4().hex}",
        "capabilities": {"ui_automation": True, "screen_capture": True, "dpi_aware": True},
    }
    r = client.post("/api/v1/capture/agents/register", json=reg_payload)
    assert r.status_code == 201, r.text
    agent_data = r.json()
    assert agent_data["agent_hostname"] == "DESKTOP-TREASURY-01"
    assert "pairing_token" in agent_data
    assert agent_data["status"] == "ONLINE"

    agent_id = agent_data["agent_id"]
    pairing_token = agent_data["pairing_token"]

    # 2. Send heartbeat with correct token
    hb_r = client.post(
        f"/api/v1/capture/agents/{agent_id}/heartbeat",
        json={"agent_id": agent_id, "pairing_token": pairing_token},
    )
    assert hb_r.status_code == 200
    assert hb_r.json()["status"] == "ACK"

    # 3. Send heartbeat with invalid token (should be rejected)
    bad_hb = client.post(
        f"/api/v1/capture/agents/{agent_id}/heartbeat",
        json={"agent_id": agent_id, "pairing_token": "wrong_token"},
    )
    assert bad_hb.status_code == 401

    # 4. List agents for tenant A
    list_r = client.get(f"/api/v1/capture/agents?tenant_id={tenant_a_id}")
    assert list_r.status_code == 200
    agents_list = list_r.json()
    assert len(agents_list) >= 1
    assert any(a["id"] == agent_id for a in agents_list)


def test_capture_session_lifecycle_and_consent(test_setup):
    tenant_a_id = test_setup["tenant_a_id"]
    folder_a_id = test_setup["folder_a_id"]

    # 1. Create a capture session in DRAFT
    create_payload = {
        "tenant_id": str(tenant_a_id),
        "folder_id": str(folder_a_id),
        "name": "Nostro Reconciliation Settlement Trace",
        "description": "Capture daily end-of-day bank statement clearing workflow in SAP",
        "environment_name": "DEV",
        "target_application": "SAP GUI (saplogon.exe)",
        "consent_operator_name": "Ratheesh Ramadasan",
    }
    r = client.post("/api/v1/capture/sessions", json=create_payload)
    assert r.status_code == 201, r.text
    sess = r.json()
    session_id = sess["id"]
    assert sess["status"] == "DRAFT"

    # 2. Attempt START without operator consent (must fail)
    start_no_consent = client.post(
        f"/api/v1/capture/sessions/{session_id}/transition",
        json={"action": "START", "consent_confirmed": False},
    )
    assert start_no_consent.status_code == 400
    assert "Explicit operator consent confirmation is required" in start_no_consent.json()["detail"]

    # 3. Transition: START with consent confirmed
    start_ok = client.post(
        f"/api/v1/capture/sessions/{session_id}/transition",
        json={"action": "START", "consent_confirmed": True, "operator_name": "Ratheesh Ramadasan"},
    )
    assert start_ok.status_code == 200
    assert start_ok.json()["status"] == "RECORDING"

    # 4. Transition: PAUSE
    pause_r = client.post(
        f"/api/v1/capture/sessions/{session_id}/transition",
        json={"action": "PAUSE", "reason": "Operator answering incoming priority phone call"},
    )
    assert pause_r.status_code == 200
    assert pause_r.json()["status"] == "PAUSED"

    # 5. Transition: RESUME
    resume_r = client.post(
        f"/api/v1/capture/sessions/{session_id}/transition",
        json={"action": "RESUME"},
    )
    assert resume_r.status_code == 200
    assert resume_r.json()["status"] == "RECORDING"

    # 6. Transition: STOP
    stop_r = client.post(
        f"/api/v1/capture/sessions/{session_id}/transition",
        json={"action": "STOP", "reason": "Workflow process completed"},
    )
    assert stop_r.status_code == 200
    assert stop_r.json()["status"] == "COMPLETED"
    assert stop_r.json()["duration_seconds"] >= 0

    # 7. Transition: APPROVE
    approve_r = client.post(
        f"/api/v1/capture/sessions/{session_id}/transition",
        json={"action": "APPROVE"},
    )
    assert approve_r.status_code == 200
    assert approve_r.json()["status"] == "APPROVED"


def test_tenant_isolation(test_setup):
    tenant_a_id = test_setup["tenant_a_id"]
    tenant_b_id = test_setup["tenant_b_id"]

    # Create session in Tenant A
    r_a = client.post(
        "/api/v1/capture/sessions",
        json={
            "tenant_id": str(tenant_a_id),
            "name": "Alpha Core Wire Transfer",
            "target_application": "SWIFT Alliance Gateway",
        },
    )
    assert r_a.status_code == 201
    sess_a_id = r_a.json()["id"]

    # Verify listing Tenant B does NOT leak Tenant A's session
    r_list_b = client.get(f"/api/v1/capture/sessions?tenant_id={tenant_b_id}")
    assert r_list_b.status_code == 200
    sessions_b = r_list_b.json()
    assert not any(s["id"] == sess_a_id for s in sessions_b)


def test_event_ordering_and_monotonicity(test_setup):
    tenant_a_id = test_setup["tenant_a_id"]

    r = client.post(
        "/api/v1/capture/sessions",
        json={
            "tenant_id": str(tenant_a_id),
            "name": "Order Book Reconciliation",
            "target_application": "Excel & Bloomberg Terminal",
        },
    )
    session_id = r.json()["id"]

    # Ingest events intentionally out of chronological order
    events_batch = [
        {
            "sequence_number": 3,
            "monotonic_offset_ms": 15400,
            "event_type": "UI_CLICK",
            "process_name": "excel.exe",
            "window_title": "Daily Reconciliation.xlsx - Excel",
            "ui_element_metadata": {"automation_id": "btn_save", "control_type": "Button", "name": "Save"},
            "interaction_data": {"cursor_x": 45, "cursor_y": 120},
        },
        {
            "sequence_number": 1,
            "monotonic_offset_ms": 1200,
            "event_type": "UI_CLICK",
            "process_name": "excel.exe",
            "window_title": "Daily Reconciliation.xlsx - Excel",
            "ui_element_metadata": {"automation_id": "cell_A1", "control_type": "DataItem", "name": "Account ID"},
            "interaction_data": {"cursor_x": 100, "cursor_y": 200},
        },
        {
            "sequence_number": 2,
            "monotonic_offset_ms": 6800,
            "event_type": "UI_TYPE",
            "process_name": "excel.exe",
            "window_title": "Daily Reconciliation.xlsx - Excel",
            "ui_element_metadata": {
                "automation_id": "cell_A1",
                "control_type": "DataItem",
                "name": "Account ID",
                "sanitized_input_value": "ACC-99281",
            },
            "interaction_data": {"cursor_x": 100, "cursor_y": 200},
        },
    ]

    ingest_r = client.post(f"/api/v1/capture/sessions/{session_id}/events", json={"events": events_batch})
    assert ingest_r.status_code == 201
    assert ingest_r.json()["ingested_count"] == 3

    # Retrieve events - must be strictly ordered by monotonic offset ms
    get_r = client.get(f"/api/v1/capture/sessions/{session_id}/events")
    assert get_r.status_code == 200
    events = get_r.json()
    assert len(events) == 3

    offsets = [e["monotonic_offset_ms"] for e in events]
    assert offsets == [1200, 6800, 15400]
    assert events[0]["sequence_number"] == 1
    assert events[1]["sequence_number"] == 2
    assert events[2]["sequence_number"] == 3


def test_sensitive_data_redaction_and_application_exclusion(test_setup):
    tenant_a_id = test_setup["tenant_a_id"]

    r = client.post(
        "/api/v1/capture/sessions",
        json={
            "tenant_id": str(tenant_a_id),
            "name": "Customer Profile Onboarding",
            "target_application": "CRM Web Portal",
            "security_exclusions": {
                "excluded_processes": ["1password.exe", "keepass.exe"],
                "mask_passwords": True,
                "redact_credit_cards": True,
            },
        },
    )
    session_id = r.json()["id"]

    events = [
        # 1. Event in password field
        {
            "sequence_number": 1,
            "monotonic_offset_ms": 1000,
            "event_type": "UI_TYPE",
            "process_name": "msedge.exe",
            "window_title": "Banking Portal Login",
            "ui_element_metadata": {
                "automation_id": "txt_user_password",
                "control_type": "Edit",
                "name": "Password",
                "is_password": True,
                "sanitized_input_value": "SecretPassword123!",
            },
            "interaction_data": {},
        },
        # 2. Event containing credit card number
        {
            "sequence_number": 2,
            "monotonic_offset_ms": 4000,
            "event_type": "UI_TYPE",
            "process_name": "msedge.exe",
            "window_title": "Payment Verification",
            "ui_element_metadata": {
                "automation_id": "txt_card_number",
                "control_type": "Edit",
                "name": "Card Number",
                "sanitized_input_value": "Card number 4111 2222 3333 4444 entered",
            },
            "interaction_data": {},
        },
        # 3. Event inside an excluded password manager application
        {
            "sequence_number": 3,
            "monotonic_offset_ms": 8000,
            "event_type": "UI_CLICK",
            "process_name": "1password.exe",
            "window_title": "1Password - Enterprise Vault",
            "ui_element_metadata": {"automation_id": "vault_entry", "name": "Copy Master Key"},
            "interaction_data": {},
        },
    ]

    client.post(f"/api/v1/capture/sessions/{session_id}/events", json={"events": events})

    # Retrieve and verify sanitization
    ret_r = client.get(f"/api/v1/capture/sessions/{session_id}/events")
    items = ret_r.json()

    # Password input field should be masked
    pw_event = items[0]
    assert pw_event["ui_element_metadata"]["sanitized_input_value"] == "[REDACTED_PASSWORD_FIELD]"

    # Credit card number should be redacted
    cc_event = items[1]
    assert "[REDACTED_CARD_NUMBER]" in cc_event["ui_element_metadata"]["sanitized_input_value"]
    assert "4111" not in cc_event["ui_element_metadata"]["sanitized_input_value"]

    # 1password.exe event should be marked as redacted by exclusion policy
    excl_event = items[2]
    assert excl_event["is_redacted"] is True
    assert "excluded by capture security policy" in excl_event["redaction_reason"]


def test_evidence_upload_idempotency(test_setup):
    tenant_a_id = test_setup["tenant_a_id"]

    r = client.post(
        "/api/v1/capture/sessions",
        json={"tenant_id": str(tenant_a_id), "name": "Evidence Test Session", "target_application": "SAP GUI"},
    )
    session_id = r.json()["id"]

    dummy_image = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
    dummy_hash = hashlib.sha256(dummy_image.encode()).hexdigest()

    evidence_payload = {
        "sequence_number": 1,
        "evidence_type": "KEYFRAME",
        "content_type": "image/png",
        "file_size_bytes": 70,
        "sha256_hash": dummy_hash,
        "data_base64": dummy_image,
        "timestamp_offset_ms": 1200,
    }

    # 1. First upload
    up1 = client.post(f"/api/v1/capture/sessions/{session_id}/evidence", json=evidence_payload)
    assert up1.status_code == 201
    ev_data = up1.json()
    assert ev_data["is_duplicate"] is False
    evidence_id = ev_data["id"]

    # 2. Duplicate upload of identical hash (simulating network retry)
    up2 = client.post(f"/api/v1/capture/sessions/{session_id}/evidence", json=evidence_payload)
    assert up2.status_code == 201
    assert up2.json()["is_duplicate"] is True
    assert up2.json()["id"] == evidence_id

    # 3. Retrieve evidence
    get_ev = client.get(f"/api/v1/capture/evidence/{evidence_id}")
    assert get_ev.status_code == 200
    assert get_ev.json()["sha256_hash"] == dummy_hash
    assert get_ev.json()["data_base64"] == dummy_image


def test_step_annotation_and_flow_studio_synthesis(test_setup):
    tenant_a_id = test_setup["tenant_a_id"]
    folder_a_id = test_setup["folder_a_id"]

    # 1. Create session and ingest 2 steps
    r = client.post(
        "/api/v1/capture/sessions",
        json={
            "tenant_id": str(tenant_a_id),
            "folder_id": str(folder_a_id),
            "name": "GL Posting and Journal Entry",
            "target_application": "SAP GUI",
        },
    )
    session_id = r.json()["id"]

    client.post(
        f"/api/v1/capture/sessions/{session_id}/events",
        json={
            "events": [
                {
                    "sequence_number": 1,
                    "monotonic_offset_ms": 1500,
                    "event_type": "UI_CLICK",
                    "process_name": "saplogon.exe",
                    "window_title": "SAP Easy Access",
                    "ui_element_metadata": {"automation_id": "btn_tcode_f02", "name": "Enter Transaction FB02"},
                },
                {
                    "sequence_number": 2,
                    "monotonic_offset_ms": 4200,
                    "event_type": "UI_TYPE",
                    "process_name": "saplogon.exe",
                    "window_title": "Enter General Ledger Account Posting",
                    "ui_element_metadata": {
                        "automation_id": "txt_gl_account",
                        "name": "GL Account",
                        "sanitized_input_value": "110020",
                    },
                },
            ]
        },
    )

    events = client.get(f"/api/v1/capture/sessions/{session_id}/events").json()
    first_event_id = events[0]["id"]

    # 2. Annotate and approve step 1
    ann_r = client.patch(
        f"/api/v1/capture/sessions/{session_id}/events/{first_event_id}/annotate",
        json={
            "annotation_title": "Navigate to General Ledger Posting",
            "annotation_notes": "Enters SAP Transaction FB02 for manual journal vouchers",
            "business_rule_tag": "BR_GL_POSTING_01",
            "is_approved": True,
        },
    )
    assert ann_r.status_code == 200
    assert ann_r.json()["annotation_title"] == "Navigate to General Ledger Posting"
    assert ann_r.json()["is_approved"] is True

    # 3. Synthesize into Flow Studio workflow
    synth_r = client.post(
        f"/api/v1/capture/sessions/{session_id}/synthesize-flow",
        json={"workflow_name": "Auto-Discovered GL Journal Workflow"},
    )
    assert synth_r.status_code == 200
    synth_data = synth_r.json()
    assert synth_data["workflow_name"] == "Auto-Discovered GL Journal Workflow"
    assert synth_data["steps_synthesized"] == 2
    assert synth_data["nodes_count"] >= 4  # Trigger + 2 Action steps + Terminal

    # 4. Verify workflow exists in DB
    with SessionLocal() as db:
        wf = db.scalar(select(WorkflowDefinition).where(WorkflowDefinition.id == synth_data["workflow_id"]))
        assert wf is not None
        assert wf.name == "Auto-Discovered GL Journal Workflow"
        sess = db.scalar(select(CaptureSession).where(CaptureSession.id == session_id))
        assert sess.status == "APPROVED"


def test_pcs02_policy_hierarchy_and_application_catalog(test_setup):
    """PCS-02: Test effective policy hierarchy and invariant enforcement."""
    tenant_id = test_setup["tenant_a_id"]

    # 1. Fetch effective policy for tenant
    r = client.get(f"/api/v1/capture/policies/effective?tenant_id={tenant_id}")
    assert r.status_code == 200, r.text
    policy = r.json()
    assert policy["tenant_id"] == str(tenant_id)
    assert len(policy["mandatory_pii_rules"]) >= 4
    # Prohibited executables must include bitwarden, 1password, keepass
    prohibited = [p.lower() for p in policy["prohibited_executables"]]
    assert "bitwarden.exe" in prohibited
    assert "1password.exe" in prohibited

    # 2. Try to allow a platform-denied executable at tenant level (MUST FAIL with 403)
    attempt_override = client.post(
        "/api/v1/capture/admin/applications",
        json={
            "tenant_id": str(tenant_id),
            "name": "Bypassed Bitwarden",
            "executable_name": "bitwarden.exe",
            "policy_action": "ALLOW",
            "classification": "STANDARD",
        },
    )
    assert attempt_override.status_code == 403
    assert "cannot relax platform prohibited application" in attempt_override.json()["detail"]

    # 3. Allow an authorized business app at tenant level (MUST SUCCEED)
    add_app = client.post(
        "/api/v1/capture/admin/applications",
        json={
            "tenant_id": str(tenant_id),
            "name": "Custom In-House Accounting",
            "executable_name": "accounting_ledger.exe",
            "publisher_signature": "Acme Corp Internal CA",
            "policy_action": "ALLOW",
            "classification": "STANDARD",
        },
    )
    assert add_app.status_code == 201
    app_data = add_app.json()
    assert app_data["executable_name"] == "accounting_ledger.exe"


def test_pcs02_agent_discovery_and_multi_app_session(test_setup):
    """PCS-02: Test running application & window discovery and multi-app session creation."""
    tenant_id = test_setup["tenant_a_id"]
    folder_id = test_setup["folder_a_id"]

    # 1. Register agent
    reg = client.post(
        "/api/v1/capture/agents/register",
        json={
            "tenant_id": str(tenant_id),
            "agent_hostname": "FIN-WORKSTATION-09",
            "os_version": "Windows 11 Enterprise 23H2",
            "agent_version": "2.0.0",
            "hardware_fingerprint": f"hw_fp_{uuid4().hex}",
            "capabilities": {"screen_capture": True, "ui_automation": True, "window_discovery": True},
        },
    )
    assert reg.status_code == 201
    agent_id = reg.json()["agent_id"]

    # 2. Query running application discovery on the agent
    disc_r = client.get(f"/api/v1/capture/agents/{agent_id}/discovery")
    assert disc_r.status_code == 200
    disc_data = disc_r.json()
    assert disc_data["agent_id"] == agent_id
    assert len(disc_data["applications"]) >= 2
    # Check that discovered apps include windows with titles
    excel = next((a for a in disc_data["applications"] if a["process_name"] == "excel.exe"), None)
    assert excel is not None
    assert len(excel["windows"]) > 0

    # 3. Create a multi-application capture session
    sess_payload = {
        "tenant_id": str(tenant_id),
        "folder_id": str(folder_id),
        "name": "Multi-App Financial Settlement Workflow",
        "description": "Cross-application workflow spanning Excel and SAP GUI",
        "environment_name": "UAT",
        "target_application": "Composite Multi-App",
        "consent_operator_name": "Ratheesh Ramadasan",
        "selected_applications": [
            {
                "display_name": "Microsoft Excel",
                "process_name": "excel.exe",
                "publisher": "Microsoft Corporation",
                "selected_windows": ["Q3_Settlement_Ledger.xlsx - Excel"],
            },
            {
                "display_name": "SAP GUI for Windows",
                "process_name": "saplogon.exe",
                "publisher": "SAP SE",
                "selected_windows": ["SAP Easy Access - User Menu for RATHEESH"],
            },
        ],
    }
    create_r = client.post("/api/v1/capture/sessions", json=sess_payload)
    assert create_r.status_code == 201
    created = create_r.json()
    assert "Microsoft Excel, SAP GUI for Windows" in created["target_application"]


def test_pcs02_evidence_redaction_workflow(test_setup):
    """PCS-02: Test reviewer solid-black evidence redaction persistence."""
    tenant_id = test_setup["tenant_a_id"]
    folder_id = test_setup["folder_a_id"]

    # 1. Create session and evidence
    sess_r = client.post(
        "/api/v1/capture/sessions",
        json={
            "tenant_id": str(tenant_id),
            "folder_id": str(folder_id),
            "name": "Evidence Redaction Session",
            "target_application": "Payment Terminal",
        },
    )
    session_id = sess_r.json()["id"]

    dummy_image = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
    dummy_hash = hashlib.sha256(dummy_image.encode()).hexdigest()

    ev_r = client.post(
        f"/api/v1/capture/sessions/{session_id}/evidence",
        json={
            "sequence_number": 1,
            "evidence_type": "KEYFRAME",
            "content_type": "image/png",
            "file_size_bytes": 70,
            "sha256_hash": dummy_hash,
            "data_base64": dummy_image,
            "timestamp_offset_ms": 1200,
        },
    )
    assert ev_r.status_code == 201
    evidence_id = ev_r.json()["id"]

    # 2. Add solid-black redaction region
    redact_r = client.post(
        f"/api/v1/capture/sessions/{session_id}/redactions",
        json={
            "evidence_id": evidence_id,
            "bounding_box": {"x": 250, "y": 420, "width": 300, "height": 45},
            "redaction_type": "SOLID_BLACK",
            "detected_category": "PCI_PAN",
            "confidence_score": 0.99,
        },
    )
    assert redact_r.status_code == 201
    redact_data = redact_r.json()
    assert redact_data["bounding_box"]["width"] == 300
    assert redact_data["redaction_type"] == "SOLID_BLACK"

    # 3. List redactions for session
    list_r = client.get(f"/api/v1/capture/sessions/{session_id}/redactions")
    assert list_r.status_code == 200
    redactions = list_r.json()
    assert len(redactions) >= 1
    assert redactions[0]["detected_category"] == "PCI_PAN"


def test_pca01_rfc8628_device_enrollment_lifecycle(test_setup):
    """PCA-01 M1: Verify RFC 8628 Device Authorization Grant enrollment lifecycle."""
    tenant_id = test_setup["tenant_a_id"]

    # 1. Agent initiates enrollment
    init_r = client.post(
        "/api/v1/capture/agents/enroll",
        json={
            "agent_hostname": "DESKTOP-ACCOUNTING-02",
            "hardware_fingerprint": "hw_fp_accounting_99",
            "os_name": "Windows",
            "os_version": "11 Enterprise 23H2",
            "agent_version": "1.0.0",
        },
    )
    assert init_r.status_code == 200, init_r.text
    init_data = init_r.json()
    assert "device_code" in init_data
    assert "user_code" in init_data
    assert "verification_uri_complete" in init_data
    assert len(init_data["user_code"]) == 9  # ABCD-EFGH

    device_code = init_data["device_code"]
    user_code = init_data["user_code"]

    import time
    # 2. Agent polls before authorization (must return 400 authorization_pending)
    poll_early = client.post(
        "/api/v1/capture/agents/enroll/token",
        json={"device_code": device_code},
    )
    assert poll_early.status_code == 400
    assert "authorization_pending" in poll_early.json()["error"]

    # RFC 8628 §3.5: Rate limiting check (polling too fast triggers slow_down)
    poll_fast = client.post(
        "/api/v1/capture/agents/enroll/token",
        json={"device_code": device_code},
    )
    assert poll_fast.status_code == 400
    assert poll_fast.json()["error"] == "slow_down"

    time.sleep(0.6)

    # 3. Authenticated operator authorizes device in Web Studio
    auth_r = client.post(
        "/api/v1/capture/agents/enroll/authorize",
        json={"user_code": user_code, "tenant_id": str(tenant_id)},
    )
    assert auth_r.status_code == 200, auth_r.text
    assert auth_r.json()["status"] == "AUTHORIZED"
    assert auth_r.json()["agent_hostname"] == "DESKTOP-ACCOUNTING-02"

    # 4. Agent polls again and receives permanent pairing credential
    poll_ok = client.post(
        "/api/v1/capture/agents/enroll/token",
        json={"device_code": device_code},
    )
    assert poll_ok.status_code == 200, poll_ok.text
    token_data = poll_ok.json()
    assert token_data["status"] == "ENROLLED"
    assert "access_token" in token_data
    assert token_data["tenant_id"] == str(tenant_id)
    agent_id = token_data["agent_id"]
    pairing_token = token_data["access_token"]

    # 5. Replay Protection: Attempt to reuse consumed device_code
    time.sleep(0.6)
    poll_replay = client.post(
        "/api/v1/capture/agents/enroll/token",
        json={"device_code": device_code},
    )
    assert poll_replay.status_code == 400
    assert "already consumed" in poll_replay.json()["error_description"]

    # 6. Agent sends heartbeat using newly issued token
    hb_r = client.post(
        f"/api/v1/capture/agents/{agent_id}/heartbeat",
        json={"agent_id": agent_id, "pairing_token": pairing_token},
    )
    assert hb_r.status_code == 200
    assert hb_r.json()["status"] == "ACK"

    # 7. Token rotation
    rot_r = client.post(f"/api/v1/capture/agents/{agent_id}/rotate-token")
    assert rot_r.status_code == 200
    new_token = rot_r.json()["new_pairing_token"]
    assert new_token != pairing_token

    # Old token fails
    hb_old = client.post(
        f"/api/v1/capture/agents/{agent_id}/heartbeat",
        json={"agent_id": agent_id, "pairing_token": pairing_token},
    )
    assert hb_old.status_code == 401

    # New token succeeds
    hb_new = client.post(
        f"/api/v1/capture/agents/{agent_id}/heartbeat",
        json={"agent_id": agent_id, "pairing_token": new_token},
    )
    assert hb_new.status_code == 200

    # 8. Agent Revocation (Fail-Closed)
    rev_r = client.post(f"/api/v1/capture/agents/{agent_id}/revoke")
    assert rev_r.status_code == 200
    assert rev_r.json()["status"] == "REVOKED"

    # Heartbeat after revocation must fail 403 Forbidden
    hb_revoked = client.post(
        f"/api/v1/capture/agents/{agent_id}/heartbeat",
        json={"agent_id": agent_id, "pairing_token": new_token},
    )
    assert hb_revoked.status_code == 403
    assert "revoked" in hb_revoked.json()["detail"].lower()


def test_pca01_admin_overview_and_session_commands(test_setup):
    """PCA-01 M1: Test Process Capture admin overview telemetry and remote command dispatch."""
    tenant_id = test_setup["tenant_a_id"]
    folder_id = test_setup["folder_a_id"]

    # 1. Fetch admin overview
    admin_r = client.get(f"/api/v1/capture/admin/overview?tenant_id={tenant_id}")
    assert admin_r.status_code == 200
    overview = admin_r.json()
    assert overview["tenant_id"] == str(tenant_id)
    assert "fleet_health" in overview
    assert "capture_metrics" in overview

    # 2. Create session and dispatch remote commands
    sess_r = client.post(
        "/api/v1/capture/sessions",
        json={
            "tenant_id": str(tenant_id),
            "folder_id": str(folder_id),
            "name": "Fleet Command Controlled Session",
            "target_application": "ERP Financial Terminal",
            "consent_operator_name": "Ratheesh Ramadasan",
        },
    )
    assert sess_r.status_code == 201
    session_id = sess_r.json()["id"]

    # Dispatch START command
    cmd_start = client.post(
        f"/api/v1/capture/sessions/{session_id}/commands",
        json={"action": "START"},
    )
    assert cmd_start.status_code == 200
    assert cmd_start.json()["status"] == "RECORDING"

    # Dispatch PAUSE command
    cmd_pause = client.post(
        f"/api/v1/capture/sessions/{session_id}/commands",
        json={"action": "PAUSE"},
    )
    assert cmd_pause.status_code == 200
    assert cmd_pause.json()["status"] == "PAUSED"

    # Finalize session
    fin_r = client.post(f"/api/v1/capture/sessions/{session_id}/finalize")
    assert fin_r.status_code == 200
    assert fin_r.json()["status"] == "COMPLETED"

def test_pca01_msi_installer_download_security():
    """PCA-01 Step 1 & 3: Verify Studio download endpoint serves real MSI with strict security headers."""
    r = client.get("/api/v1/capture/agents/installer")
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/x-msi"
    assert "ArchitectIQ-CaptureAgent-Setup.msi" in r.headers["content-disposition"]
    assert r.headers["x-signing-status"] == "UNSIGNED_DEVELOPMENT_BUILD"
    assert r.headers["x-production-warning"] == "NON_PRODUCTION_DEV_BUILD"
    assert len(r.headers["x-checksum-sha256"]) == 64
    assert len(r.content) > 100000  # Valid 200+ KB MSI payload
