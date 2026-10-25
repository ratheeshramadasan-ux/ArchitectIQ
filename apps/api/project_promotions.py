"""Project environment bindings, promotion governance, and drift detection.

Delivers multi-environment progression (DEV -> TEST -> UAT -> PROD), configuration
overrides, drift detection, segregation-of-duties review gates, and execution synchronization.
"""

from datetime import UTC, datetime
from typing import Annotated, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from authentication import get_authorized_tenant_db
from models import Folder, Organization, Project, ProjectEnvironmentBinding, PromotionRequest, User
from project_rbac import require_project_capability

router = APIRouter()
Db = Annotated[Session, Depends(get_authorized_tenant_db)]

ENV_ORDER = {
    "DEV": 0,
    "TEST": 1,
    "UAT": 2,
    "PROD": 3,
}


class BindingIn(BaseModel):
    config_overrides: dict = Field(default_factory=dict)
    is_enabled: bool = True


class PromotionRequestIn(BaseModel):
    source_environment_id: UUID
    target_environment_id: UUID
    notes: str | None = None


class PromotionReviewIn(BaseModel):
    action: Literal["APPROVE", "REJECT"]
    review_notes: str | None = None


def compute_drift(source_cfg: dict, target_cfg: dict) -> tuple[bool, dict]:
    """Calculate key-level drift between source and target configurations."""
    all_keys = set(source_cfg.keys()).union(set(target_cfg.keys()))
    diffs = {}
    for k in all_keys:
        val_s = source_cfg.get(k)
        val_t = target_cfg.get(k)
        if val_s != val_t:
            diffs[k] = {"source": val_s, "target": val_t}
    return (len(diffs) > 0, diffs)


@router.get("/projects/{project_id}/environment-bindings")
def get_environment_bindings(
    tenant_id: UUID,
    project_id: UUID,
    db: Db,
    request: Request,
):
    """Retrieve environment bindings for all environments in the project's organization."""
    actor_id: UUID | None = getattr(request.state, "verified_actor_id", None)
    if actor_id:
        require_project_capability(db, project_id, actor_id, tenant_id, "can_view")

    # Resolve organization id for this project
    org_id = db.scalar(
        select(Folder.organization_id)
        .join(Project, Project.folder_id == Folder.id)
        .where(Project.id == project_id)
    )
    if not org_id:
        raise HTTPException(status_code=404, detail="Project or organization not found")

    # Get all organization environments
    envs = db.execute(
        text("SELECT id, name FROM public.organization_environments WHERE organization_id = :org ORDER BY name"),
        {"org": org_id},
    ).mappings().all()

    # Get existing bindings
    bindings_map = {
        b.environment_id: b
        for b in db.scalars(
            select(ProjectEnvironmentBinding).where(
                ProjectEnvironmentBinding.project_id == project_id,
                ProjectEnvironmentBinding.tenant_id == tenant_id,
            )
        ).all()
    }

    result = []
    for env in envs:
        env_id = env["id"]
        b = bindings_map.get(env_id)
        result.append({
            "environment_id": str(env_id),
            "environment_name": env["name"],
            "binding_id": str(b.id) if b else None,
            "is_enabled": b.is_enabled if b else True,
            "config_overrides": b.config_overrides if b else {},
            "updated_at": b.updated_at.isoformat() if b else None,
        })
    return result


@router.put("/projects/{project_id}/environment-bindings/{environment_id}")
def update_environment_binding(
    tenant_id: UUID,
    project_id: UUID,
    environment_id: UUID,
    body: BindingIn,
    db: Db,
    request: Request,
):
    """Upsert environment configuration overrides for a project. Requires can_edit."""
    actor_id: UUID | None = getattr(request.state, "verified_actor_id", None)
    if actor_id:
        require_project_capability(db, project_id, actor_id, tenant_id, "can_edit")

    binding = db.scalar(
        select(ProjectEnvironmentBinding).where(
            ProjectEnvironmentBinding.project_id == project_id,
            ProjectEnvironmentBinding.environment_id == environment_id,
            ProjectEnvironmentBinding.tenant_id == tenant_id,
        )
    )

    if binding:
        binding.config_overrides = body.config_overrides
        binding.is_enabled = body.is_enabled
        binding.updated_at = datetime.now(UTC)
    else:
        binding = ProjectEnvironmentBinding(
            id=uuid4(),
            tenant_id=tenant_id,
            project_id=project_id,
            environment_id=environment_id,
            config_overrides=body.config_overrides,
            is_enabled=body.is_enabled,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        db.add(binding)

    db.flush()
    return {
        "id": str(binding.id),
        "project_id": str(binding.project_id),
        "environment_id": str(binding.environment_id),
        "config_overrides": binding.config_overrides,
        "is_enabled": binding.is_enabled,
        "updated_at": binding.updated_at.isoformat(),
    }


@router.post("/projects/{project_id}/promotions")
def request_promotion(
    tenant_id: UUID,
    project_id: UUID,
    body: PromotionRequestIn,
    db: Db,
    request: Request,
):
    """Submit a promotion request between environments. Enforces progression and drift analysis."""
    actor_id: UUID = request.state.verified_actor_id
    require_project_capability(db, project_id, actor_id, tenant_id, "can_edit")

    # Resolve environment names
    source_name = db.scalar(
        text("SELECT name FROM public.organization_environments WHERE id = :id"),
        {"id": body.source_environment_id},
    )
    target_name = db.scalar(
        text("SELECT name FROM public.organization_environments WHERE id = :id"),
        {"id": body.target_environment_id},
    )

    if not source_name or not target_name:
        raise HTTPException(status_code=404, detail="Source or target environment not found")

    source_order = ENV_ORDER.get(source_name)
    target_order = ENV_ORDER.get(target_name)

    if source_order is None or target_order is None:
        raise HTTPException(status_code=422, detail="Invalid environment progression sequence")

    if target_order != source_order + 1:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid promotion step: cannot promote directly from {source_name} to {target_name}. Progression must follow DEV -> TEST -> UAT -> PROD.",
        )

    # Fetch configuration overrides to compute drift
    source_binding = db.scalar(
        select(ProjectEnvironmentBinding).where(
            ProjectEnvironmentBinding.project_id == project_id,
            ProjectEnvironmentBinding.environment_id == body.source_environment_id,
        )
    )
    target_binding = db.scalar(
        select(ProjectEnvironmentBinding).where(
            ProjectEnvironmentBinding.project_id == project_id,
            ProjectEnvironmentBinding.environment_id == body.target_environment_id,
        )
    )

    source_cfg = source_binding.config_overrides if source_binding else {}
    target_cfg = target_binding.config_overrides if target_binding else {}

    has_drift, drift_details = compute_drift(source_cfg, target_cfg)

    promo = PromotionRequest(
        id=uuid4(),
        tenant_id=tenant_id,
        project_id=project_id,
        source_environment_id=body.source_environment_id,
        target_environment_id=body.target_environment_id,
        status="PENDING",
        requested_by=actor_id,
        notes=body.notes,
        drift_detected=has_drift,
        drift_details=drift_details,
        created_at=datetime.now(UTC),
    )
    db.add(promo)
    db.flush()

    return {
        "id": str(promo.id),
        "project_id": str(promo.project_id),
        "source_environment_id": str(promo.source_environment_id),
        "source_environment_name": source_name,
        "target_environment_id": str(promo.target_environment_id),
        "target_environment_name": target_name,
        "status": promo.status,
        "notes": promo.notes,
        "drift_detected": promo.drift_detected,
        "drift_details": promo.drift_details,
        "requested_by": str(promo.requested_by),
        "created_at": promo.created_at.isoformat(),
    }


@router.get("/projects/{project_id}/promotions")
def list_promotions(
    tenant_id: UUID,
    project_id: UUID,
    db: Db,
    request: Request,
):
    """List promotion history and active requests for a project."""
    actor_id: UUID | None = getattr(request.state, "verified_actor_id", None)
    if actor_id:
        require_project_capability(db, project_id, actor_id, tenant_id, "can_view")

    promos = db.scalars(
        select(PromotionRequest)
        .where(
            PromotionRequest.project_id == project_id,
            PromotionRequest.tenant_id == tenant_id,
        )
        .order_by(PromotionRequest.created_at.desc())
    ).all()

    # Pre-resolve environment names
    env_names = dict(
        db.execute(text("SELECT id, name FROM public.organization_environments")).all()
    )

    return [
        {
            "id": str(p.id),
            "project_id": str(p.project_id),
            "source_environment_id": str(p.source_environment_id),
            "source_environment_name": env_names.get(p.source_environment_id, "Unknown"),
            "target_environment_id": str(p.target_environment_id),
            "target_environment_name": env_names.get(p.target_environment_id, "Unknown"),
            "status": p.status,
            "notes": p.notes,
            "review_notes": p.review_notes,
            "drift_detected": p.drift_detected,
            "drift_details": p.drift_details,
            "requested_by": str(p.requested_by),
            "reviewed_by": str(p.reviewed_by) if p.reviewed_by else None,
            "created_at": p.created_at.isoformat(),
            "reviewed_at": p.reviewed_at.isoformat() if p.reviewed_at else None,
            "executed_at": p.executed_at.isoformat() if p.executed_at else None,
        }
        for p in promos
    ]


@router.post("/promotions/{promotion_id}/review")
def review_promotion(
    tenant_id: UUID,
    promotion_id: UUID,
    body: PromotionReviewIn,
    db: Db,
    request: Request,
):
    """Review (APPROVE or REJECT) a promotion request with segregation-of-duties enforcement."""
    actor_id: UUID = request.state.verified_actor_id
    promo = db.scalar(
        select(PromotionRequest).where(
            PromotionRequest.id == promotion_id,
            PromotionRequest.tenant_id == tenant_id,
        )
    )
    if not promo:
        raise HTTPException(status_code=404, detail="Promotion request not found")

    if promo.status != "PENDING":
        raise HTTPException(status_code=400, detail=f"Cannot review promotion in {promo.status} status")

    caller_role = require_project_capability(
        db, promo.project_id, actor_id, tenant_id, "can_manage_members"
    )

    # Segregation of duties: Admin cannot self-approve their own request
    if promo.requested_by == actor_id and caller_role != "OWNER":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Segregation of duties violation: Requester cannot approve their own promotion request without Owner role",
        )

    promo.status = "APPROVED" if body.action == "APPROVE" else "REJECTED"
    promo.reviewed_by = actor_id
    promo.review_notes = body.review_notes
    promo.reviewed_at = datetime.now(UTC)
    db.flush()

    return {
        "id": str(promo.id),
        "status": promo.status,
        "reviewed_by": str(promo.reviewed_by),
        "review_notes": promo.review_notes,
        "reviewed_at": promo.reviewed_at.isoformat(),
    }


@router.post("/promotions/{promotion_id}/execute")
def execute_promotion(
    tenant_id: UUID,
    promotion_id: UUID,
    db: Db,
    request: Request,
):
    """Execute an approved promotion, synchronizing configurations from source to target."""
    actor_id: UUID = request.state.verified_actor_id
    promo = db.scalar(
        select(PromotionRequest).where(
            PromotionRequest.id == promotion_id,
            PromotionRequest.tenant_id == tenant_id,
        )
    )
    if not promo:
        raise HTTPException(status_code=404, detail="Promotion request not found")

    if promo.status != "APPROVED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Only APPROVED promotions can be executed. Current status: {promo.status}",
        )

    require_project_capability(
        db, promo.project_id, actor_id, tenant_id, "can_manage_members"
    )

    # Fetch source binding
    source_binding = db.scalar(
        select(ProjectEnvironmentBinding).where(
            ProjectEnvironmentBinding.project_id == promo.project_id,
            ProjectEnvironmentBinding.environment_id == promo.source_environment_id,
        )
    )
    source_cfg = source_binding.config_overrides if source_binding else {}

    # Update or insert target binding
    target_binding = db.scalar(
        select(ProjectEnvironmentBinding).where(
            ProjectEnvironmentBinding.project_id == promo.project_id,
            ProjectEnvironmentBinding.environment_id == promo.target_environment_id,
        )
    )

    if target_binding:
        target_binding.config_overrides = dict(source_cfg)
        target_binding.updated_at = datetime.now(UTC)
    else:
        target_binding = ProjectEnvironmentBinding(
            id=uuid4(),
            tenant_id=tenant_id,
            project_id=promo.project_id,
            environment_id=promo.target_environment_id,
            config_overrides=dict(source_cfg),
            is_enabled=True,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        db.add(target_binding)

    promo.status = "EXECUTED"
    promo.executed_at = datetime.now(UTC)
    db.flush()

    return {
        "id": str(promo.id),
        "status": promo.status,
        "executed_at": promo.executed_at.isoformat(),
        "target_config": target_binding.config_overrides,
    }
