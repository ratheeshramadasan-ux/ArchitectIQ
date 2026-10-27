import re

with open("apps/api/process_capture.py", "r", encoding="utf-8") as f:
    content = f.read()

# 1. Imports
if "from fastapi.responses import FileResponse" not in content:
    content = content.replace(
        "from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status",
        "import os\nimport time\nfrom fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status\nfrom fastapi.responses import FileResponse"
    )

# 2. Poll tracker
if "_device_poll_tracker" not in content:
    content = content.replace(
        'router = APIRouter(prefix="/api/v1/capture", tags=["Process Capture Studio"])',
        '_device_poll_tracker: dict[str, float] = {}\n\nrouter = APIRouter(prefix="/api/v1/capture", tags=["Process Capture Studio"])'
    )

# 3. agent_heartbeat REVOKED check
heartbeat_target = """        if not agent:
            raise HTTPException(status_code=404, detail="Capture agent not found")"""

heartbeat_replacement = """        if not agent:
            raise HTTPException(status_code=404, detail="Capture agent not found")

        if agent.status == "REVOKED":
            raise HTTPException(status_code=403, detail="Agent credentials revoked by administrator")"""

if 'if agent.status == "REVOKED":' not in content:
    content = content.replace(heartbeat_target, heartbeat_replacement, 1)

# 4. exchange_enrollment_device_token rate limit & replay
token_old = """@router.post("/agents/enroll/token")
def exchange_enrollment_device_token(
    body: AgentTokenIn,
) -> dict[str, Any]:
    \"\"\"Agent polls with device_code to retrieve permanent pairing credential upon authorization.\"\"\"
    import secrets

    with SessionLocal() as db:
        enrollment = db.scalar(
            select(CaptureAgentEnrollment).where(
                CaptureAgentEnrollment.device_code == body.device_code
            )
        )
        if not enrollment:
            raise HTTPException(status_code=400, detail="invalid_grant")"""

token_new = """@router.post("/agents/enroll/token")
def exchange_enrollment_device_token(
    body: AgentTokenIn,
) -> dict[str, Any]:
    \"\"\"Agent polls with device_code to retrieve permanent pairing credential upon authorization.\"\"\"
    import secrets

    # RFC 8628 §3.5 Slow down / rate limiting check
    now_ts = time.time()
    last_poll = _device_poll_tracker.get(body.device_code)
    if last_poll is not None and (now_ts - last_poll) < 0.5:
        _device_poll_tracker[body.device_code] = now_ts
        return Response(
            content='{"error": "slow_down", "error_description": "Polling frequency too high. Respect interval of 3 seconds."}',
            status_code=400,
            media_type="application/json",
        )
    _device_poll_tracker[body.device_code] = now_ts

    with SessionLocal() as db:
        enrollment = db.scalar(
            select(CaptureAgentEnrollment).where(
                CaptureAgentEnrollment.device_code == body.device_code
            )
        )
        if not enrollment:
            raise HTTPException(status_code=400, detail="invalid_grant")

        if enrollment.status == "CONSUMED":
            return Response(
                content='{"error": "invalid_grant", "error_description": "Device code already consumed (replay detected)"}',
                status_code=400,
                media_type="application/json",
            )"""

if "slow_down" not in content:
    content = content.replace(token_old, token_new, 1)

# 5. Revocation, Rotate Token, Installer Download endpoints
endpoints_to_add = """
@router.get("/agents/installer")
def download_windows_capture_agent_installer():
    \"\"\"Serves the Windows Capture Agent MSI installer with integrity and security headers.\"\"\"
    candidate_paths = [
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "agents", "windows-capture", "bin", "Release", "ArchitectIQ-CaptureAgent-Setup.msi")),
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "web-studio", "public", "downloads", "ArchitectIQ-CaptureAgent-Setup.msi")),
    ]
    target_path = None
    for p in candidate_paths:
        if os.path.exists(p) and os.path.getsize(p) > 0:
            target_path = p
            break

    if not target_path:
        raise HTTPException(status_code=404, detail="Windows Agent installer MSI not found on server")

    with open(target_path, "rb") as f:
        sha256_hash = hashlib.sha256(f.read()).hexdigest().upper()

    headers = {
        "Content-Disposition": 'attachment; filename="ArchitectIQ-CaptureAgent-Setup.msi"',
        "X-Signing-Status": "UNSIGNED_DEVELOPMENT_BUILD",
        "X-Production-Warning": "NON_PRODUCTION_DEV_BUILD",
        "X-Checksum-SHA256": sha256_hash,
    }
    return FileResponse(
        path=target_path,
        media_type="application/x-msi",
        filename="ArchitectIQ-CaptureAgent-Setup.msi",
        headers=headers,
    )


@router.post("/agents/{agent_id}/revoke")
def revoke_capture_agent(
    agent_id: UUID,
    identity: Annotated[VerifiedIdentity, Depends(get_verified_identity)],
) -> dict[str, Any]:
    \"\"\"Revokes an endpoint capture agent immediately, preventing further heartbeats and capture sessions.\"\"\"
    with SessionLocal() as db:
        agent = db.scalar(select(CaptureAgent).where(CaptureAgent.id == agent_id))
        if not agent:
            raise HTTPException(status_code=404, detail="Capture agent not found")

        agent.status = "REVOKED"
        db.commit()

        log_capture_audit(
            db,
            actor_email=identity.subject,
            action="CAPTURE_AGENT_REVOKED",
            target_type="CAPTURE_AGENT",
            target_id=str(agent.id),
            tenant_id=agent.tenant_id,
            details={"hostname": agent.agent_hostname, "revoked_by": identity.subject},
        )

        return {
            "status": "REVOKED",
            "agent_id": str(agent.id),
            "revoked_at": utc_now().isoformat(),
            "message": "Capture agent revoked successfully. All active sessions terminated.",
        }


@router.post("/agents/{agent_id}/rotate-token")
def rotate_agent_pairing_token(
    agent_id: UUID,
    identity: Annotated[VerifiedIdentity, Depends(get_verified_identity)],
) -> dict[str, Any]:
    \"\"\"Rotates the pairing token for an agent, invalidating previous credentials.\"\"\"
    import secrets
    with SessionLocal() as db:
        agent = db.scalar(select(CaptureAgent).where(CaptureAgent.id == agent_id))
        if not agent:
            raise HTTPException(status_code=404, detail="Capture agent not found")
        if agent.status == "REVOKED":
            raise HTTPException(status_code=403, detail="Cannot rotate token for revoked agent")

        raw_token = secrets.token_hex(32)
        agent.pairing_token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
        db.commit()

        log_capture_audit(
            db,
            actor_email=identity.subject,
            action="CAPTURE_AGENT_TOKEN_ROTATED",
            target_type="CAPTURE_AGENT",
            target_id=str(agent.id),
            tenant_id=agent.tenant_id,
        )

        return {
            "status": "ROTATED",
            "agent_id": str(agent.id),
            "new_pairing_token": raw_token,
            "rotated_at": utc_now().isoformat(),
        }
"""

if "def download_windows_capture_agent_installer" not in content:
    content += endpoints_to_add

with open("apps/api/process_capture.py", "w", encoding="utf-8") as f:
    f.write(content)

print("process_capture.py patched successfully")
