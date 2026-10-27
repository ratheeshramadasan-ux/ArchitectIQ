with open("apps/api/process_capture.py", "r", encoding="utf-8") as f:
    text = f.read()

target = """@router.get("/agents/{agent_id}/discovery")
def get_agent_discovered_applications(
    agent_id: UUID,
    identity: Annotated[VerifiedIdentity, Depends(get_verified_identity)] = None,
) -> dict[str, Any]:
    \"\"\"Returns active running applications and window hierarchy discovered on the endpoint.\"\"\"
    with SessionLocal() as db:
        agent = db.scalar(select(CaptureAgent).where(CaptureAgent.id == agent_id))
        if not agent:
            raise HTTPException(status_code=404, detail="Capture agent not found")"""

replacement = """@router.post("/agents/{agent_id}/discovery")
def upload_agent_discovery_snapshot(
    agent_id: UUID,
    body: dict[str, Any],
    identity: Annotated[VerifiedIdentity, Depends(get_verified_identity)],
) -> dict[str, Any]:
    \"\"\"Stores endpoint agent's live discovered running applications snapshot.\"\"\"
    with SessionLocal() as db:
        agent = db.scalar(select(CaptureAgent).where(CaptureAgent.id == agent_id))
        if not agent:
            raise HTTPException(status_code=404, detail="Capture agent not found")

        caps = dict(agent.capabilities or {})
        caps["discovered_applications"] = body.get("discovered_applications", [])
        caps["discovery_updated_at"] = utc_now().isoformat()
        agent.capabilities = caps
        db.commit()

        return {
            "status": "ACCEPTED",
            "agent_id": str(agent.id),
            "applications_recorded": len(caps["discovered_applications"]),
            "timestamp": utc_now().isoformat(),
        }


@router.get("/agents/{agent_id}/discovery")
def get_agent_discovered_applications(
    agent_id: UUID,
    identity: Annotated[VerifiedIdentity, Depends(get_verified_identity)] = None,
) -> dict[str, Any]:
    \"\"\"Returns active running applications and window hierarchy discovered on the endpoint.\"\"\"
    with SessionLocal() as db:
        agent = db.scalar(select(CaptureAgent).where(CaptureAgent.id == agent_id))
        if not agent:
            raise HTTPException(status_code=404, detail="Capture agent not found")

        if agent.capabilities and "discovered_applications" in agent.capabilities:
            return {
                "agent_id": str(agent.id),
                "agent_hostname": agent.agent_hostname,
                "discovered_applications": agent.capabilities["discovered_applications"],
                "total_applications": len(agent.capabilities["discovered_applications"]),
                "last_discovered_at": agent.capabilities.get("discovery_updated_at", agent.last_heartbeat_at.isoformat()),
            }"""

assert target in text, "get_agent_discovered_applications target not found"
text = text.replace(target, replacement, 1)

with open("apps/api/process_capture.py", "w", encoding="utf-8") as f:
    f.write(text)

print("Added POST /agents/{agent_id}/discovery and updated GET in process_capture.py")
