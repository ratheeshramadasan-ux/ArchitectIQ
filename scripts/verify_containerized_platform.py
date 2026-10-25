"""ArchitectIQ Milestone M14 — Containerized Platform Acceptance & Live Studio Verification.

Tests all 6 Studio Workspaces against the live running container stack:
Frontend: http://127.0.0.1:8080 (Nginx reverse proxy)
Backend:  http://127.0.0.1:8000 (FastAPI API Container)
Database: PostgreSQL 17 on Port 5433 (architectiq_test)
Cache:    Redis 7 on Port 6380
"""
import sys
import uuid
import httpx

BASE_URL = "http://127.0.0.1:8080"
EMAIL = "admin@architectiq.io"
PASSWORD = "Password@12345"


def run_platform_verification():
    print("=== ARCHITECTIQ M14 CONTAINERIZED PLATFORM ACCEPTANCE ===")
    print(f"Target: {BASE_URL}")

    with httpx.Client(base_url=BASE_URL, timeout=15.0) as client:
        # Step 1: Health & Ingress
        print("\n[1/7] Ingress & HTML Bundle Verification...")
        r_home = client.get("/")
        assert r_home.status_code == 200, f"Expected 200, got {r_home.status_code}"
        assert "ArchitectIQ" in r_home.text or "<div id=\"root\">" in r_home.text
        print("  Web Studio Single-Page Application bundle served correctly.")

        # Step 2: Native Authentication & Tenant Discovery
        print("\n[2/7] Native Authentication & Multi-Tenant Discovery...")
        r_login = client.post(
            "/api/v1/auth/native/login",
            json={"email": EMAIL, "password": PASSWORD},
        )
        assert r_login.status_code == 200, f"Login failed: {r_login.text}"
        token = r_login.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        print("  Authenticated successfully. Acquired short-lived JWT.")

        r_tenants = client.get("/api/v1/me/tenants", headers=headers)
        assert r_tenants.status_code == 200
        tenants = r_tenants.json()
        assert len(tenants) > 0, "No active tenants found"
        tenant_id = tenants[0]["id"]
        tenant_name = tenants[0]["name"]
        print(f"  Discovered Active Tenant: '{tenant_name}' ({tenant_id})")

        # Step 3: Workspace Studio & Project Hierarchy
        print("\n[3/7] Workspace Studio & Hierarchy Navigation...")
        r_tree = client.get(f"/api/v1/tenants/{tenant_id}/workspace/tree", headers=headers)
        assert r_tree.status_code == 200
        tree = r_tree.json()
        print(f"  Hierarchy Tree loaded: {len(tree)} items.")

        r_summary = client.get(f"/api/v1/tenants/{tenant_id}/workspace/summary", headers=headers)
        assert r_summary.status_code == 200
        summary = r_summary.json()
        print(f"  Workspace Summary: {summary['active_projects']} active projects, {summary['folders']} folders.")

        # Step 4: Flow Studio & Workflow Designer
        print("\n[4/7] Flow Studio (Canvas, Versioning & Publishing)...")
        # Create a new validation workflow
        wf_name = f"Container Acceptance WF {uuid.uuid4().hex[:4]}"
        r_wf = client.post(
            f"/api/v1/tenants/{tenant_id}/workspace/projects/a0000000-0000-4000-8000-000000000005/workflows",
            headers=headers,
            json={"name": wf_name, "description": "M14 Container Live Acceptance Test"},
        )
        assert r_wf.status_code == 201, f"Failed creating workflow: {r_wf.text}"
        wf_id = r_wf.json()["id"]
        print(f"  Created Workflow: '{wf_name}' ({wf_id})")

        # Save Workflow Draft
        draft_payload = {
            "definition": {
                "nodes": [
                    {"id": "node-1", "type": "TRIGGER", "label": "Webhook Trigger", "data": {}},
                    {"id": "node-2", "type": "AGENT", "label": "AI Classifier", "data": {}},
                    {"id": "node-3", "type": "ACTION", "label": "Notify Slack", "data": {}},
                ],
                "edges": [
                    {"id": "e1-2", "source": "node-1", "target": "node-2"},
                    {"id": "e2-3", "source": "node-2", "target": "node-3"},
                ],
            }
        }
        r_draft = client.put(
            f"/api/v1/tenants/{tenant_id}/workspace/workflows/{wf_id}/draft",
            headers=headers,
            json=draft_payload,
        )
        assert r_draft.status_code == 200, f"Draft save failed: {r_draft.text}"
        print("  Saved Flow draft with 3 connected nodes.")

        # Publish Workflow
        r_pub = client.post(
            f"/api/v1/tenants/{tenant_id}/workspace/workflows/{wf_id}/publish",
            headers=headers,
            json={"change_summary": "Initial M14 published baseline"},
        )
        assert r_pub.status_code == 200, f"Publish failed: {r_pub.text}"
        print("  Workflow successfully published to Version 1.")

        # Step 5: Execution Engine & Jobs Monitor
        print("\n[5/7] Execution Engine & Jobs Monitor...")
        r_run = client.post(
            f"/api/v1/tenants/{tenant_id}/workspace/projects/a0000000-0000-4000-8000-000000000005/workflows/{wf_id}/runs",
            headers=headers,
            json={"trigger_type": "MANUAL", "trigger_payload": {"m14_test": True}},
        )
        assert r_run.status_code in (200, 201), f"Run trigger failed: {r_run.status_code} - {r_run.text}"
        run_id = r_run.json()["id"]
        run_status = r_run.json()["status"]
        print(f"  Dispatched Run {run_id} (Status: {run_status})")

        # Inspect run detail
        r_run_detail = client.get(f"/api/v1/tenants/{tenant_id}/workspace/runs/{run_id}", headers=headers)
        assert r_run_detail.status_code == 200
        print(f"  Run Detail inspected successfully (Duration: {r_run_detail.json().get('duration_ms')}ms).")

        # Step 6: Observability, Incidents & Runbooks
        print("\n[6/7] Observability Console & Incident Remediation...")
        r_obs = client.get(f"/api/v1/tenants/{tenant_id}/workspace/observability/overview", headers=headers)
        assert r_obs.status_code == 200, f"Observability failed: {r_obs.status_code} - {r_obs.text}"
        obs = r_obs.json()
        print(f"  Observability Overview: System Status '{obs.get('system_status')}', Active Incidents: {obs.get('open_incidents')}")

        # Step 7: Governance & Compliance Console
        print("\n[7/7] Governance Console & Compliance Reports...")
        r_rep = client.post(
            f"/api/v1/tenants/{tenant_id}/workspace/governance/reports/generate",
            headers=headers,
            json={"report_type": "RESPONSIBLE_AI_SAFETY"},
        )
        assert r_rep.status_code == 201, f"Report generation failed: {r_rep.status_code} - {r_rep.text}"
        report = r_rep.json()
        print(f"  Generated Compliance Audit Report: {report['report_type']} (Verdict: {report['verdict']}, Score: {report['score_pct']}%)")

    print("\n========================================================")
    print("ALL SIX WORKSPACE STUDIOS VERIFIED LIVE IN CONTAINERS!")
    print("========================================================")


if __name__ == "__main__":
    run_platform_verification()
