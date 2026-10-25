"""Human-in-the-loop approvals and deterministic business rules engine.

Enforces segregation of duties, role-based approval rights,
workflow run state synchronization, and decision table evaluation.
"""
from datetime import UTC, datetime
import re
from typing import Annotated, Any, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from authentication import get_authorized_tenant_db
from execution_engine import resume_workflow_run
from models import (
    ApprovalTask,
    BusinessRule,
    Project,
    WorkflowRun,
    WorkflowStepRun,
)
from project_rbac import require_project_capability

router = APIRouter(tags=["Approvals & Business Rules"])
Db = Annotated[Session, Depends(get_authorized_tenant_db)]


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class ApprovalTaskIn(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    priority: Literal["LOW", "MEDIUM", "HIGH", "URGENT"] = "MEDIUM"
    required_role: Literal["OWNER", "ADMIN", "EDITOR", "VIEWER"] = "ADMIN"
    run_id: UUID | None = None
    step_run_id: UUID | None = None
    sla_hours: int | None = Field(default=None, ge=1, le=720)
    payload: dict[str, Any] = Field(default_factory=dict)


class ResolveTaskIn(BaseModel):
    decision: Literal["APPROVED", "REJECTED"]
    resolution_notes: str | None = Field(default=None, max_length=2000)
    decision_payload: dict[str, Any] = Field(default_factory=dict)


class ApprovalTaskOut(BaseModel):
    id: UUID
    tenant_id: UUID
    project_id: UUID
    run_id: UUID | None = None
    step_run_id: UUID | None = None
    title: str
    description: str | None = None
    priority: str
    status: str
    required_role: str
    assigned_user_id: UUID | None = None
    resolution_notes: str | None = None
    resolved_by: UUID | None = None
    resolved_at: datetime | None = None
    sla_deadline: datetime | None = None
    payload: dict[str, Any]
    decision_payload: dict[str, Any]
    created_at: datetime
    created_by: UUID | None = None


class BusinessRuleIn(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    rule_type: Literal["DECISION_TABLE", "EXPRESSION", "POLICY_MATRIX"] = "DECISION_TABLE"
    conditions_schema: list[dict[str, Any]] = Field(default_factory=list)
    actions_schema: list[dict[str, Any]] = Field(default_factory=list)


class BusinessRuleOut(BaseModel):
    id: UUID
    tenant_id: UUID
    project_id: UUID
    name: str
    slug: str
    description: str | None = None
    version: int
    status: str
    rule_type: str
    conditions_schema: list[dict[str, Any]]
    actions_schema: list[dict[str, Any]]
    created_at: datetime
    updated_at: datetime


class RuleEvaluationIn(BaseModel):
    payload: dict[str, Any]
    strategy: Literal["FIRST_MATCH", "COLLECT_ALL"] = "FIRST_MATCH"


class RuleEvaluationOut(BaseModel):
    rule_id: UUID
    rule_name: str
    matched: bool
    matched_rows_count: int
    results: list[dict[str, Any]]
    evaluated_at: datetime


# ---------------------------------------------------------------------------
# Decision Table Evaluator Core
# ---------------------------------------------------------------------------

def evaluate_condition_item(cond: dict[str, Any], payload: dict[str, Any]) -> bool:
    """Evaluate a single condition item against input payload."""
    field_name = cond.get("field")
    operator = cond.get("operator", "==")
    expected_val = cond.get("value")

    actual_val = payload.get(field_name)
    if actual_val is None:
        return operator in ("is_null", "==", "None") and expected_val is None

    if operator == "==":
        return actual_val == expected_val
    if operator == "!=":
        return actual_val != expected_val
    if operator == ">":
        return actual_val > expected_val
    if operator == ">=":
        return actual_val >= expected_val
    if operator == "<":
        return actual_val < expected_val
    if operator == "<=":
        return actual_val <= expected_val
    if operator == "in":
        return actual_val in expected_val if isinstance(expected_val, (list, tuple, set)) else False
    if operator == "not_in":
        return actual_val not in expected_val if isinstance(expected_val, (list, tuple, set)) else True
    if operator == "contains":
        return str(expected_val) in str(actual_val)

    return False


def evaluate_decision_table(
    conditions_schema: list[dict[str, Any]],
    actions_schema: list[dict[str, Any]],
    input_payload: dict[str, Any],
    strategy: str = "FIRST_MATCH",
) -> tuple[bool, list[dict[str, Any]]]:
    """Deterministically evaluate decision table rules against input payload."""
    matched_actions: list[dict[str, Any]] = []

    # Each entry in conditions_schema is a row: {"row_id": "r1", "conditions": [...]}
    for idx, row in enumerate(conditions_schema):
        conditions = row.get("conditions", [])
        # All conditions in a row must match (AND)
        all_match = all(evaluate_condition_item(c, input_payload) for c in conditions)

        if all_match:
            # Find corresponding action row by index or row_id
            row_id = row.get("row_id", str(idx))
            matching_action = next(
                (a for a in actions_schema if a.get("row_id") == row_id),
                actions_schema[idx] if idx < len(actions_schema) else {},
            )
            matched_actions.append(matching_action.get("action", matching_action))

            if strategy == "FIRST_MATCH":
                break

    return (len(matched_actions) > 0, matched_actions)


def slugify_rule(text: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", text.strip().lower()).strip("-")
    return slug or "rule"


# ---------------------------------------------------------------------------
# Approval Tasks Endpoints
# ---------------------------------------------------------------------------

@router.post("/projects/{project_id}/approvals", response_model=ApprovalTaskOut)
def create_approval_task(
    tenant_id: UUID,
    project_id: UUID,
    body: ApprovalTaskIn,
    db: Db,
    request: Request,
):
    """Create a human approval task. Enforces project access."""
    actor_id: UUID = request.state.verified_actor_id
    require_project_capability(db, project_id, actor_id, tenant_id, "can_edit")

    now = datetime.now(UTC)
    deadline = None
    if body.sla_hours:
        from datetime import timedelta
        deadline = now + timedelta(hours=body.sla_hours)

    task = ApprovalTask(
        id=uuid4(),
        tenant_id=tenant_id,
        project_id=project_id,
        run_id=body.run_id,
        step_run_id=body.step_run_id,
        title=body.title,
        description=body.description,
        priority=body.priority,
        status="PENDING",
        required_role=body.required_role,
        payload=body.payload,
        sla_deadline=deadline,
        created_at=now,
        created_by=actor_id,
    )
    db.add(task)
    db.flush()
    return task


@router.get("/projects/{project_id}/approvals", response_model=list[ApprovalTaskOut])
def list_project_approval_tasks(
    tenant_id: UUID,
    project_id: UUID,
    db: Db,
    request: Request,
    status_filter: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=50, ge=1, le=100),
):
    """List approval tasks for a project."""
    actor_id: UUID = request.state.verified_actor_id
    require_project_capability(db, project_id, actor_id, tenant_id, "can_view")

    stmt = (
        select(ApprovalTask)
        .where(
            ApprovalTask.tenant_id == tenant_id,
            ApprovalTask.project_id == project_id,
        )
        .order_by(desc(ApprovalTask.created_at))
        .limit(limit)
    )
    if status_filter:
        stmt = stmt.where(ApprovalTask.status == status_filter)

    return db.scalars(stmt).all()


@router.get("/approvals", response_model=list[ApprovalTaskOut])
def list_tenant_approval_inbox(
    tenant_id: UUID,
    db: Db,
    request: Request,
    status_filter: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=50, ge=1, le=100),
):
    """List all approval tasks across tenant for operational inbox."""
    stmt = (
        select(ApprovalTask)
        .where(ApprovalTask.tenant_id == tenant_id)
        .order_by(desc(ApprovalTask.created_at))
        .limit(limit)
    )
    if status_filter:
        stmt = stmt.where(ApprovalTask.status == status_filter)

    return db.scalars(stmt).all()


@router.get("/approvals/{task_id}", response_model=ApprovalTaskOut)
def get_approval_task_detail(
    tenant_id: UUID,
    task_id: UUID,
    db: Db,
    request: Request,
):
    """Get single approval task detail."""
    actor_id: UUID = request.state.verified_actor_id
    task = db.scalar(
        select(ApprovalTask).where(
            ApprovalTask.id == task_id,
            ApprovalTask.tenant_id == tenant_id,
        )
    )
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Approval task not found")

    require_project_capability(db, task.project_id, actor_id, tenant_id, "can_view")
    return task


@router.post("/approvals/{task_id}/resolve", response_model=ApprovalTaskOut)
def resolve_approval_task(
    tenant_id: UUID,
    task_id: UUID,
    body: ResolveTaskIn,
    db: Db,
    request: Request,
):
    """Resolve an approval task (APPROVED or REJECTED) with segregation of duties protection."""
    actor_id: UUID = request.state.verified_actor_id
    task = db.scalar(
        select(ApprovalTask).where(
            ApprovalTask.id == task_id,
            ApprovalTask.tenant_id == tenant_id,
        )
    )
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Approval task not found")

    caller_role = require_project_capability(db, task.project_id, actor_id, tenant_id, "can_edit")

    if task.status != "PENDING":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Task is already {task.status}",
        )

    # Segregation of duties: High or Urgent priority tasks cannot be self-approved by non-owners
    if task.created_by == actor_id and task.priority in ("HIGH", "URGENT") and caller_role != "OWNER":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Segregation of duties: Self-approval is forbidden on high-priority tasks",
        )

    now = datetime.now(UTC)
    task.status = body.decision
    task.resolution_notes = body.resolution_notes
    task.decision_payload = body.decision_payload
    task.resolved_by = actor_id
    task.resolved_at = now

    # If linked to a workflow run, synchronize workflow execution
    if task.run_id:
        if body.decision == "APPROVED":
            resume_workflow_run(
                tenant_id=tenant_id,
                run_id=task.run_id,
                resume_payload={"task_id": str(task.id), "approved": True, "notes": body.resolution_notes},
                db=db,
                request=request,
            )
        else:
            # Mark workflow run as FAILED on rejection
            run = db.scalar(select(WorkflowRun).where(WorkflowRun.id == task.run_id, WorkflowRun.tenant_id == tenant_id))
            if run and run.status == "SUSPENDED":
                run.status = "FAILED"
                run.completed_at = now
                run.error_message = f"Approval rejected: {body.resolution_notes or 'No reason provided'}"

    db.flush()
    return task


# ---------------------------------------------------------------------------
# Business Rules Endpoints
# ---------------------------------------------------------------------------

@router.post("/projects/{project_id}/rules", response_model=BusinessRuleOut, status_code=status.HTTP_201_CREATED)
def create_business_rule(
    tenant_id: UUID,
    project_id: UUID,
    body: BusinessRuleIn,
    db: Db,
    request: Request,
):
    """Create a new deterministic business rule or decision table."""
    actor_id: UUID = request.state.verified_actor_id
    require_project_capability(db, project_id, actor_id, tenant_id, "can_edit")

    base_slug = slugify_rule(body.name)
    slug = base_slug
    counter = 1
    while db.scalar(
        select(BusinessRule).where(
            BusinessRule.project_id == project_id,
            BusinessRule.slug == slug,
        )
    ):
        slug = f"{base_slug}-{counter}"
        counter += 1

    rule = BusinessRule(
        id=uuid4(),
        tenant_id=tenant_id,
        project_id=project_id,
        name=body.name,
        slug=slug,
        description=body.description,
        version=1,
        status="DRAFT",
        rule_type=body.rule_type,
        conditions_schema=body.conditions_schema,
        actions_schema=body.actions_schema,
        created_by=actor_id,
    )
    db.add(rule)
    db.flush()
    return rule


@router.get("/projects/{project_id}/rules", response_model=list[BusinessRuleOut])
def list_business_rules(
    tenant_id: UUID,
    project_id: UUID,
    db: Db,
    request: Request,
):
    """List business rules for a project."""
    actor_id: UUID = request.state.verified_actor_id
    require_project_capability(db, project_id, actor_id, tenant_id, "can_view")

    return db.scalars(
        select(BusinessRule)
        .where(
            BusinessRule.tenant_id == tenant_id,
            BusinessRule.project_id == project_id,
        )
        .order_by(BusinessRule.created_at.desc())
    ).all()


@router.get("/rules/{rule_id}", response_model=BusinessRuleOut)
def get_business_rule(
    tenant_id: UUID,
    rule_id: UUID,
    db: Db,
    request: Request,
):
    """Get single business rule detail."""
    actor_id: UUID = request.state.verified_actor_id
    rule = db.scalar(
        select(BusinessRule).where(
            BusinessRule.id == rule_id,
            BusinessRule.tenant_id == tenant_id,
        )
    )
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Business rule not found")

    require_project_capability(db, rule.project_id, actor_id, tenant_id, "can_view")
    return rule


@router.post("/rules/{rule_id}/evaluate", response_model=RuleEvaluationOut)
def evaluate_business_rule(
    tenant_id: UUID,
    rule_id: UUID,
    body: RuleEvaluationIn,
    db: Db,
    request: Request,
):
    """Deterministically evaluate input payload against rule decision table."""
    actor_id: UUID = request.state.verified_actor_id
    rule = db.scalar(
        select(BusinessRule).where(
            BusinessRule.id == rule_id,
            BusinessRule.tenant_id == tenant_id,
        )
    )
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Business rule not found")

    require_project_capability(db, rule.project_id, actor_id, tenant_id, "can_view")

    matched, results = evaluate_decision_table(
        conditions_schema=rule.conditions_schema or [],
        actions_schema=rule.actions_schema or [],
        input_payload=body.payload,
        strategy=body.strategy,
    )

    return RuleEvaluationOut(
        rule_id=rule.id,
        rule_name=rule.name,
        matched=matched,
        matched_rows_count=len(results),
        results=results,
        evaluated_at=datetime.now(UTC),
    )
