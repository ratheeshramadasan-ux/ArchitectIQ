import re

with open("apps/api/test_process_capture.py", "r", encoding="utf-8") as f:
    content = f.read()

old_test = """    # 2. Agent polls before authorization (must return 400 authorization_pending)
    poll_early = client.post(
        "/api/v1/capture/agents/enroll/token",
        json={"device_code": device_code},
    )
    assert poll_early.status_code == 400
    assert "authorization_pending" in poll_early.json()["error"]

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

    # 5. Agent sends heartbeat using newly issued token
    hb_r = client.post(
        f"/api/v1/capture/agents/{agent_id}/heartbeat",
        json={"agent_id": agent_id, "pairing_token": pairing_token},
    )
    assert hb_r.status_code == 200
    assert hb_r.json()["status"] == "ACK" """

new_test = """    import time
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
    assert "revoked" in hb_revoked.json()["detail"].lower()"""

# Replace in content
assert old_test.strip() in content, "old_test target not found"
content = content.replace(old_test.strip(), new_test.strip(), 1)

# Add installer endpoint test
installer_test = """
def test_pca01_msi_installer_download_security():
    \"\"\"PCA-01 Step 1 & 3: Verify Studio download endpoint serves real MSI with strict security headers.\"\"\"
    r = client.get("/api/v1/capture/agents/installer")
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/x-msi"
    assert "ArchitectIQ-CaptureAgent-Setup.msi" in r.headers["content-disposition"]
    assert r.headers["x-signing-status"] == "UNSIGNED_DEVELOPMENT_BUILD"
    assert r.headers["x-production-warning"] == "NON_PRODUCTION_DEV_BUILD"
    assert len(r.headers["x-checksum-sha256"]) == 64
    assert len(r.content) > 100000  # Valid 200+ KB MSI payload
"""

if "def test_pca01_msi_installer_download_security" not in content:
    content += installer_test

with open("apps/api/test_process_capture.py", "w", encoding="utf-8") as f:
    f.write(content)

print("test_process_capture.py patched successfully")
