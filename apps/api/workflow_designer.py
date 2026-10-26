"""Milestone M5 — Workflow Designer, Canonical Schema & Versioning Service.

Provides:
- Canonical workflow definition schema (Nodes, Edges, Variables, Policies)
- Server-side graph validation (trigger presence, reachability, dangling edge detection)
- Version management (Draft, Publish, Historical versions)
- Graph diff calculation between workflow versions
- Tenant-isolated and project-governed REST API endpoints
"""

from __future__ import annotations

from datetime import datetime, UTC
import re
from typing import Annotated, Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from authentication import get_authorized_tenant_db
from project_rbac import require_project_capability
from models import WorkflowDefinition, WorkflowVersion, Project, AiModelRoute

router = APIRouter(tags=["Workflow Designer"])
Db = Annotated[Session, Depends(get_authorized_tenant_db)]

NODE_TYPES = {
    "TRIGGER",
    "ACTION",
    "DECISION",
    "AI_AGENT",
    "APPROVAL",
    "INTEGRATION",
    "DOCUMENT_AI",
    "RULE",
    "NOTIFICATION",
    "TERMINAL",
    "MCP_TOOL",
    "PARALLEL_SPLIT",
    "TRY_CATCH",
    "FOR_EACH",
    "DELAY",
}


# ==============================================================================
# Pydantic Schemas
# ==============================================================================

class NodePosition(BaseModel):
    x: float
    y: float


class WorkflowNode(BaseModel):
    id: str = Field(..., min_length=1, max_length=100)
    type: str = Field(..., description="Canonical node type")
    label: str = Field(..., min_length=1, max_length=200)
    config: dict[str, Any] = Field(default_factory=dict)
    position: NodePosition = Field(default_factory=lambda: NodePosition(x=100.0, y=100.0))
    inputs: list[str] = Field(default_factory=list)
    outputs: list[str] = Field(default_factory=list)


class WorkflowEdge(BaseModel):
    id: str = Field(..., min_length=1, max_length=100)
    source: str = Field(..., description="Source node ID")
    target: str = Field(..., description="Target node ID")
    sourceHandle: str | None = None
    targetHandle: str | None = None
    label: str | None = None


class WorkflowVariable(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    type: str = Field(default="string", description="string, number, boolean, json")
    default_value: Any = None
    is_secret: bool = False
    description: str | None = None


class WorkflowDefinitionSchema(BaseModel):
    nodes: list[WorkflowNode] = Field(default_factory=list)
    edges: list[WorkflowEdge] = Field(default_factory=list)
    variables: list[WorkflowVariable] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class WorkflowCreateIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    initial_definition: WorkflowDefinitionSchema | None = None


class WorkflowDraftUpdateIn(BaseModel):
    name: str | None = None
    description: str | None = None
    definition: WorkflowDefinitionSchema
    change_summary: str | None = None


class WorkflowPublishIn(BaseModel):
    change_summary: str = Field(..., min_length=1, max_length=500)


# ==============================================================================
# Graph Validation Engine
# ==============================================================================

def validate_workflow_graph(definition: dict[str, Any]) -> dict[str, Any]:
    """Validates structural graph integrity and returns errors/warnings."""
    nodes = definition.get("nodes", [])
    edges = definition.get("edges", [])
    variables = definition.get("variables", [])

    errors: list[str] = []
    warnings: list[str] = []

    node_ids: set[str] = set()
    node_types: dict[str, str] = {}

    for node in nodes:
        nid = node.get("id")
        ntype = str(node.get("type", "")).upper()
        if not nid:
            errors.append("Encountered node without an ID")
            continue
        if nid in node_ids:
            errors.append(f"Duplicate node ID detected: {nid}")
        node_ids.add(nid)
        node_types[nid] = ntype
        if ntype not in NODE_TYPES:
            warnings.append(f"Node {nid} has non-standard type '{ntype}'")

    # Rule 1: Must have at least one node and one TRIGGER
    trigger_nodes = [nid for nid, ntype in node_types.items() if ntype == "TRIGGER"]
    if not nodes:
        errors.append("Workflow must contain at least one node")
    elif not trigger_nodes:
        errors.append("Workflow must contain at least one TRIGGER node")

    # Rule 2: Edge references
    incoming_edges: dict[str, list[str]] = {nid: [] for nid in node_ids}
    outgoing_edges: dict[str, list[str]] = {nid: [] for nid in node_ids}

    for edge in edges:
        eid = edge.get("id")
        src = edge.get("source")
        tgt = edge.get("target")

        if not src or src not in node_ids:
            errors.append(f"Edge {eid} references non-existent source node: {src}")
        if not tgt or tgt not in node_ids:
            errors.append(f"Edge {eid} references non-existent target node: {tgt}")

        if src in node_ids and tgt in node_ids:
            outgoing_edges[src].append(tgt)
            incoming_edges[tgt].append(src)

    # Rule 3: Reachability (Non-trigger nodes should have incoming edges)
    for nid, ntype in node_types.items():
        if ntype != "TRIGGER" and not incoming_edges[nid]:
            warnings.append(f"Node '{nid}' ({ntype}) is disconnected (no incoming transitions)")

    # Rule 4: Variable names validation
    var_names: set[str] = set()
    for var in variables:
        vname = var.get("name")
        if not vname or not re.match(r"^[a-zA-Z_][a-zA-Z0-9_]*$", vname):
            errors.append(f"Invalid variable name: '{vname}'. Must be alphanumeric identifier.")
        if vname in var_names:
            errors.append(f"Duplicate variable declaration: '{vname}'")
        var_names.add(vname)

    return {
        "is_valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
        "stats": {
            "node_count": len(nodes),
            "edge_count": len(edges),
            "variable_count": len(variables),
            "trigger_count": len(trigger_nodes),
        },
    }


def compute_workflow_diff(def1: dict[str, Any], def2: dict[str, Any]) -> dict[str, Any]:
    """Computes node, edge, and variable differences between two definitions."""
    nodes1 = {n["id"]: n for n in def1.get("nodes", [])}
    nodes2 = {n["id"]: n for n in def2.get("nodes", [])}

    added_nodes = [nodes2[nid] for nid in nodes2 if nid not in nodes1]
    removed_nodes = [nodes1[nid] for nid in nodes1 if nid not in nodes2]
    modified_nodes = []
    for nid in nodes1:
        if nid in nodes2 and (nodes1[nid].get("config") != nodes2[nid].get("config") or nodes1[nid].get("label") != nodes2[nid].get("label")):
            modified_nodes.append({
                "id": nid,
                "label": nodes2[nid].get("label"),
                "old_config": nodes1[nid].get("config"),
                "new_config": nodes2[nid].get("config"),
            })

    edges1 = {e["id"]: e for e in def1.get("edges", [])}
    edges2 = {e["id"]: e for e in def2.get("edges", [])}
    added_edges = [edges2[eid] for eid in edges2 if eid not in edges1]
    removed_edges = [edges1[eid] for eid in edges1 if eid not in edges2]

    return {
        "nodes_added": added_nodes,
        "nodes_removed": removed_nodes,
        "nodes_modified": modified_nodes,
        "edges_added": added_edges,
        "edges_removed": removed_edges,
        "summary": {
            "nodes_added_count": len(added_nodes),
            "nodes_removed_count": len(removed_nodes),
            "nodes_modified_count": len(modified_nodes),
            "edges_added_count": len(added_edges),
            "edges_removed_count": len(removed_edges),
        },
    }


def slugify(text: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", text.strip().lower()).strip("-")
    return slug or "workflow"


# ==============================================================================
# API Endpoints
# ==============================================================================

@router.get("/projects/{project_id}/workflows")
def list_project_workflows(
    tenant_id: UUID,
    project_id: UUID,
    db: Db,
    request: Request,
):
    """List all workflow definitions within a project."""
    actor_id: UUID = request.state.verified_actor_id
    require_project_capability(db, project_id, actor_id, tenant_id, "can_view")

    workflows = db.scalars(
        select(WorkflowDefinition)
        .where(
            WorkflowDefinition.tenant_id == tenant_id,
            WorkflowDefinition.project_id == project_id,
        )
        .order_by(WorkflowDefinition.updated_at.desc())
    ).all()

    return [
        {
            "id": str(w.id),
            "project_id": str(w.project_id),
            "name": w.name,
            "slug": w.slug,
            "description": w.description,
            "current_version": w.current_version,
            "status": w.status,
            "created_at": w.created_at.isoformat(),
            "updated_at": w.updated_at.isoformat(),
        }
        for w in workflows
    ]


@router.post("/projects/{project_id}/workflows", status_code=status.HTTP_201_CREATED)
def create_workflow(
    tenant_id: UUID,
    project_id: UUID,
    body: WorkflowCreateIn,
    db: Db,
    request: Request,
):
    """Create a new workflow definition with an initial v1 draft."""
    actor_id: UUID = request.state.verified_actor_id
    require_project_capability(db, project_id, actor_id, tenant_id, "can_edit")

    # Base slug
    base_slug = slugify(body.name)
    slug = base_slug
    counter = 1
    while db.scalar(
        select(WorkflowDefinition).where(
            WorkflowDefinition.project_id == project_id,
            WorkflowDefinition.slug == slug,
        )
    ):
        counter += 1
        slug = f"{base_slug}-{counter}"

    wf_id = uuid4()
    wf = WorkflowDefinition(
        id=wf_id,
        tenant_id=tenant_id,
        project_id=project_id,
        name=body.name,
        slug=slug,
        description=body.description,
        current_version=1,
        status="DRAFT",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
        created_by=actor_id,
    )
    db.add(wf)
    db.flush()

    # Create initial draft version
    init_def = body.initial_definition.model_dump() if body.initial_definition else {
        "nodes": [
            {
                "id": "trigger-start",
                "type": "TRIGGER",
                "label": "Manual Start",
                "config": {"trigger_type": "manual"},
                "position": {"x": 100.0, "y": 150.0},
                "inputs": [],
                "outputs": ["next"],
            }
        ],
        "edges": [],
        "variables": [],
        "metadata": {"template": "blank"},
    }

    v1 = WorkflowVersion(
        id=uuid4(),
        tenant_id=tenant_id,
        workflow_id=wf_id,
        version=1,
        definition=init_def,
        status="DRAFT",
        change_summary="Initial workflow draft",
        created_at=datetime.now(UTC),
        created_by=actor_id,
    )
    db.add(v1)
    db.flush()

    return {
        "id": str(wf.id),
        "project_id": str(wf.project_id),
        "name": wf.name,
        "slug": wf.slug,
        "description": wf.description,
        "current_version": wf.current_version,
        "status": wf.status,
        "definition": v1.definition,
        "created_at": wf.created_at.isoformat(),
        "updated_at": wf.updated_at.isoformat(),
    }


@router.get("/workflows/{workflow_id}")
def get_workflow(
    tenant_id: UUID,
    workflow_id: UUID,
    db: Db,
    request: Request,
):
    """Retrieve workflow metadata and active draft/published definition."""
    actor_id: UUID = request.state.verified_actor_id
    wf = db.scalar(
        select(WorkflowDefinition).where(
            WorkflowDefinition.id == workflow_id,
            WorkflowDefinition.tenant_id == tenant_id,
        )
    )
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")

    require_project_capability(db, wf.project_id, actor_id, tenant_id, "can_view")

    current_ver = db.scalar(
        select(WorkflowVersion).where(
            WorkflowVersion.workflow_id == wf.id,
            WorkflowVersion.version == wf.current_version,
        )
    )

    return {
        "id": str(wf.id),
        "project_id": str(wf.project_id),
        "name": wf.name,
        "slug": wf.slug,
        "description": wf.description,
        "current_version": wf.current_version,
        "status": wf.status,
        "definition": current_ver.definition if current_ver else {"nodes": [], "edges": [], "variables": []},
        "created_at": wf.created_at.isoformat(),
        "updated_at": wf.updated_at.isoformat(),
    }


@router.put("/workflows/{workflow_id}/draft")
def save_workflow_draft(
    tenant_id: UUID,
    workflow_id: UUID,
    body: WorkflowDraftUpdateIn,
    db: Db,
    request: Request,
):
    """Save an updated draft definition for the current workflow version."""
    actor_id: UUID = request.state.verified_actor_id
    wf = db.scalar(
        select(WorkflowDefinition).where(
            WorkflowDefinition.id == workflow_id,
            WorkflowDefinition.tenant_id == tenant_id,
        )
    )
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")

    require_project_capability(db, wf.project_id, actor_id, tenant_id, "can_edit")

    if body.name is not None:
        wf.name = body.name
    if body.description is not None:
        wf.description = body.description
    wf.updated_at = datetime.now(UTC)

    # Find or create draft version
    ver = db.scalar(
        select(WorkflowVersion).where(
            WorkflowVersion.workflow_id == wf.id,
            WorkflowVersion.version == wf.current_version,
        )
    )

    def_dict = body.definition.model_dump()

    if not ver or ver.status == "PUBLISHED":
        # Create next version as draft
        next_ver_num = wf.current_version + 1
        ver = WorkflowVersion(
            id=uuid4(),
            tenant_id=tenant_id,
            workflow_id=wf.id,
            version=next_ver_num,
            definition=def_dict,
            status="DRAFT",
            change_summary=body.change_summary or f"Draft updates for v{next_ver_num}",
            created_at=datetime.now(UTC),
            created_by=actor_id,
        )
        db.add(ver)
        wf.current_version = next_ver_num
        wf.status = "DRAFT"
    else:
        ver.definition = def_dict
        if body.change_summary:
            ver.change_summary = body.change_summary

    db.flush()

    validation = validate_workflow_graph(def_dict)

    return {
        "id": str(wf.id),
        "current_version": wf.current_version,
        "status": wf.status,
        "definition": ver.definition,
        "validation": validation,
        "updated_at": wf.updated_at.isoformat(),
    }


@router.post("/workflows/{workflow_id}/validate")
def validate_workflow(
    tenant_id: UUID,
    workflow_id: UUID,
    db: Db,
    request: Request,
    body: WorkflowDefinitionSchema | None = None,
):
    """Run structural graph validation on a supplied or current workflow definition."""
    actor_id: UUID = request.state.verified_actor_id
    wf = db.scalar(
        select(WorkflowDefinition).where(
            WorkflowDefinition.id == workflow_id,
            WorkflowDefinition.tenant_id == tenant_id,
        )
    )
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")

    require_project_capability(db, wf.project_id, actor_id, tenant_id, "can_view")

    if body is not None:
        def_dict = body.model_dump()
    else:
        ver = db.scalar(
            select(WorkflowVersion).where(
                WorkflowVersion.workflow_id == wf.id,
                WorkflowVersion.version == wf.current_version,
            )
        )
        def_dict = ver.definition if ver else {}

    return validate_workflow_graph(def_dict)


@router.post("/workflows/{workflow_id}/publish")
def publish_workflow(
    tenant_id: UUID,
    workflow_id: UUID,
    body: WorkflowPublishIn,
    db: Db,
    request: Request,
):
    """Validate and promote the current draft into an immutable PUBLISHED version."""
    actor_id: UUID = request.state.verified_actor_id
    wf = db.scalar(
        select(WorkflowDefinition).where(
            WorkflowDefinition.id == workflow_id,
            WorkflowDefinition.tenant_id == tenant_id,
        )
    )
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")

    require_project_capability(db, wf.project_id, actor_id, tenant_id, "can_manage_members")

    ver = db.scalar(
        select(WorkflowVersion).where(
            WorkflowVersion.workflow_id == wf.id,
            WorkflowVersion.version == wf.current_version,
        )
    )
    if not ver:
        raise HTTPException(status_code=400, detail="No version found to publish")

    # Graph must be valid before publishing
    val = validate_workflow_graph(ver.definition)
    if not val["is_valid"]:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"message": "Cannot publish invalid workflow graph", "errors": val["errors"]},
        )

    ver.status = "PUBLISHED"
    ver.change_summary = body.change_summary
    wf.status = "PUBLISHED"
    wf.updated_at = datetime.now(UTC)
    db.flush()

    return {
        "id": str(wf.id),
        "version": ver.version,
        "status": ver.status,
        "change_summary": ver.change_summary,
        "published_at": wf.updated_at.isoformat(),
    }


@router.get("/workflows/{workflow_id}/versions")
def list_workflow_versions(
    tenant_id: UUID,
    workflow_id: UUID,
    db: Db,
    request: Request,
):
    """List historical versions of a workflow."""
    actor_id: UUID = request.state.verified_actor_id
    wf = db.scalar(
        select(WorkflowDefinition).where(
            WorkflowDefinition.id == workflow_id,
            WorkflowDefinition.tenant_id == tenant_id,
        )
    )
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")

    require_project_capability(db, wf.project_id, actor_id, tenant_id, "can_view")

    versions = db.scalars(
        select(WorkflowVersion)
        .where(WorkflowVersion.workflow_id == wf.id)
        .order_by(WorkflowVersion.version.desc())
    ).all()

    return [
        {
            "id": str(v.id),
            "version": v.version,
            "status": v.status,
            "change_summary": v.change_summary,
            "created_at": v.created_at.isoformat(),
        }
        for v in versions
    ]


@router.get("/workflows/{workflow_id}/diff")
def get_workflow_diff(
    tenant_id: UUID,
    workflow_id: UUID,
    v1: int,
    v2: int,
    db: Db,
    request: Request,
):
    """Compute structural graph diff between two versions."""
    actor_id: UUID = request.state.verified_actor_id
    wf = db.scalar(
        select(WorkflowDefinition).where(
            WorkflowDefinition.id == workflow_id,
            WorkflowDefinition.tenant_id == tenant_id,
        )
    )
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")

    require_project_capability(db, wf.project_id, actor_id, tenant_id, "can_view")

    ver1 = db.scalar(
        select(WorkflowVersion).where(
            WorkflowVersion.workflow_id == wf.id,
            WorkflowVersion.version == v1,
        )
    )
    ver2 = db.scalar(
        select(WorkflowVersion).where(
            WorkflowVersion.workflow_id == wf.id,
            WorkflowVersion.version == v2,
        )
    )

    if not ver1 or not ver2:
        raise HTTPException(status_code=404, detail="One or both requested versions not found")

    return compute_workflow_diff(ver1.definition, ver2.definition)


# ==============================================================================
# Milestone M13 / FS-04 & FS-05: AI Model Routes Catalog
# ==============================================================================

class AiModelRouteIn(BaseModel):
    route_key: str = Field(..., min_length=2, max_length=100)
    display_name: str = Field(..., min_length=2, max_length=150)
    primary_provider: str = Field(default="google")
    primary_model: str = Field(default="gemini-1.5-pro")
    fallback_provider: str | None = None
    fallback_model: str | None = None
    timeout_ms: int = Field(default=30000, ge=1000, le=120000)
    max_retries: int = Field(default=3, ge=0, le=10)
    cost_limit_daily: float | None = None
    is_active: bool = True


class AiModelRouteOut(BaseModel):
    id: UUID
    tenant_id: UUID
    route_key: str
    display_name: str
    primary_provider: str
    primary_model: str
    fallback_provider: str | None
    fallback_model: str | None
    timeout_ms: int
    max_retries: int
    cost_limit_daily: float | None
    is_active: bool
    created_at: datetime


@router.get("/ai-model-routes", response_model=list[AiModelRouteOut])
def list_ai_model_routes(
    tenant_id: UUID,
    db: Db,
    request: Request,
):
    """List configured AI model gateway routes for the tenant. Auto-seeds defaults if empty."""
    routes = db.scalars(
        select(AiModelRoute)
        .where(AiModelRoute.tenant_id == tenant_id)
        .order_by(AiModelRoute.route_key)
    ).all()

    if not routes:
        defaults = [
            AiModelRoute(
                tenant_id=tenant_id,
                route_key="claims-classifier-prod",
                display_name="Claims Classifier (Prod)",
                primary_provider="google",
                primary_model="gemini-1.5-pro",
                fallback_provider="anthropic",
                fallback_model="claude-3-5-sonnet",
                timeout_ms=15000,
                max_retries=3,
                cost_limit_daily=50.0,
                is_active=True,
            ),
            AiModelRoute(
                tenant_id=tenant_id,
                route_key="fast-cheap",
                display_name="Fast & Low Latency (Flash)",
                primary_provider="google",
                primary_model="gemini-1.5-flash",
                fallback_provider="anthropic",
                fallback_model="claude-3-5-haiku",
                timeout_ms=5000,
                max_retries=2,
                cost_limit_daily=20.0,
                is_active=True,
            ),
            AiModelRoute(
                tenant_id=tenant_id,
                route_key="complex-reasoning",
                display_name="Complex Multi-Agent Reasoning",
                primary_provider="google",
                primary_model="gemini-1.5-pro",
                fallback_provider="openai",
                fallback_model="gpt-4o",
                timeout_ms=45000,
                max_retries=3,
                cost_limit_daily=100.0,
                is_active=True,
            ),
            AiModelRoute(
                tenant_id=tenant_id,
                route_key="document-extractor",
                display_name="Document Parsing & OCR Vision",
                primary_provider="google",
                primary_model="gemini-1.5-pro",
                fallback_provider="google",
                fallback_model="gemini-1.5-flash",
                timeout_ms=30000,
                max_retries=2,
                cost_limit_daily=50.0,
                is_active=True,
            ),
        ]
        for d in defaults:
            db.add(d)
        db.flush()
        routes = defaults

    return [
        AiModelRouteOut(
            id=r.id,
            tenant_id=r.tenant_id,
            route_key=r.route_key,
            display_name=r.display_name,
            primary_provider=r.primary_provider,
            primary_model=r.primary_model,
            fallback_provider=r.fallback_provider,
            fallback_model=r.fallback_model,
            timeout_ms=r.timeout_ms,
            max_retries=r.max_retries,
            cost_limit_daily=float(r.cost_limit_daily) if r.cost_limit_daily is not None else None,
            is_active=r.is_active,
            created_at=r.created_at,
        )
        for r in routes
    ]


@router.post("/ai-model-routes", response_model=AiModelRouteOut, status_code=status.HTTP_201_CREATED)
def create_or_update_ai_model_route(
    tenant_id: UUID,
    payload: AiModelRouteIn,
    db: Db,
    request: Request,
):
    """Register or update an AI model routing rule."""
    existing = db.scalar(
        select(AiModelRoute).where(
            AiModelRoute.tenant_id == tenant_id,
            AiModelRoute.route_key == payload.route_key,
        )
    )
    if existing:
        existing.display_name = payload.display_name
        existing.primary_provider = payload.primary_provider
        existing.primary_model = payload.primary_model
        existing.fallback_provider = payload.fallback_provider
        existing.fallback_model = payload.fallback_model
        existing.timeout_ms = payload.timeout_ms
        existing.max_retries = payload.max_retries
        existing.cost_limit_daily = payload.cost_limit_daily
        existing.is_active = payload.is_active
        db.flush()
        return AiModelRouteOut(
            id=existing.id,
            tenant_id=existing.tenant_id,
            route_key=existing.route_key,
            display_name=existing.display_name,
            primary_provider=existing.primary_provider,
            primary_model=existing.primary_model,
            fallback_provider=existing.fallback_provider,
            fallback_model=existing.fallback_model,
            timeout_ms=existing.timeout_ms,
            max_retries=existing.max_retries,
            cost_limit_daily=float(existing.cost_limit_daily) if existing.cost_limit_daily is not None else None,
            is_active=existing.is_active,
            created_at=existing.created_at,
        )

    new_route = AiModelRoute(
        tenant_id=tenant_id,
        route_key=payload.route_key,
        display_name=payload.display_name,
        primary_provider=payload.primary_provider,
        primary_model=payload.primary_model,
        fallback_provider=payload.fallback_provider,
        fallback_model=payload.fallback_model,
        timeout_ms=payload.timeout_ms,
        max_retries=payload.max_retries,
        cost_limit_daily=payload.cost_limit_daily,
        is_active=payload.is_active,
    )
    db.add(new_route)
    db.flush()
    return AiModelRouteOut(
        id=new_route.id,
        tenant_id=new_route.tenant_id,
        route_key=new_route.route_key,
        display_name=new_route.display_name,
        primary_provider=new_route.primary_provider,
        primary_model=new_route.primary_model,
        fallback_provider=new_route.fallback_provider,
        fallback_model=new_route.fallback_model,
        timeout_ms=new_route.timeout_ms,
        max_retries=new_route.max_retries,
        cost_limit_daily=float(new_route.cost_limit_daily) if new_route.cost_limit_daily is not None else None,
        is_active=new_route.is_active,
        created_at=new_route.created_at,
    )
