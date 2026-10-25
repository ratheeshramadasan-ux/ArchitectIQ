"""Test login and workspace data fetching through the containerized Web Studio & API."""
import httpx

BASE_URL = "http://127.0.0.1:8080"
EMAIL = "admin@architectiq.io"
PASSWORD = "Password@12345"


def test_login_flow():
    with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
        # 1. Test frontend HTML
        res_html = client.get("/")
        print(f"[1/4] Frontend index.html status: {res_html.status_code}")
        assert res_html.status_code == 200
        assert "<div id=\"root\">" in res_html.text or "ArchitectIQ" in res_html.text

        # 2. Test native login
        print(f"[2/4] Testing native login for {EMAIL}...")
        res_login = client.post(
            "/api/v1/auth/native/login",
            json={"email": EMAIL, "password": PASSWORD},
        )
        print(f"  Login response: {res_login.status_code} - {res_login.text[:200]}")
        assert res_login.status_code == 200, f"Login failed: {res_login.text}"
        token_data = res_login.json()
        token = token_data["access_token"]
        assert token, "No access token in response"

        # 3. Test tenant discovery
        print("[3/4] Testing tenant discovery (/api/v1/me/tenants)...")
        headers = {"Authorization": f"Bearer {token}"}
        res_tenants = client.get("/api/v1/me/tenants", headers=headers)
        print(f"  Tenants response: {res_tenants.status_code} - {res_tenants.text}")
        assert res_tenants.status_code == 200
        tenants = res_tenants.json()
        assert len(tenants) >= 1, "No tenants found for admin user"
        tenant_id = tenants[0]["id"]
        tenant_name = tenants[0]["name"]
        print(f"  Authenticated Tenant: {tenant_name} ({tenant_id})")

        # 4. Test workspace summary
        print(f"[4/4] Testing workspace summary for tenant {tenant_id}...")
        res_summary = client.get(
            f"/api/v1/tenants/{tenant_id}/workspace/summary",
            headers=headers,
        )
        print(f"  Summary response: {res_summary.status_code} - {res_summary.text}")
        assert res_summary.status_code == 200
        summary = res_summary.json()
        print(f"  Active Projects: {summary.get('active_projects')}")
        print(f"  Folders: {summary.get('folders')}")

        print("\n=== LOGIN & TENANT DISCOVERY VERIFICATION: 100% SUCCESSFUL ===")


if __name__ == "__main__":
    test_login_flow()
