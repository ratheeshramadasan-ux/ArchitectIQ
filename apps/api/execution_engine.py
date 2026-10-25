"""Durable workflow execution and orchestration engine.

Enforces tenant isolation, project RBAC, state machine transitions,
graph topological step execution, and durable worker queues.
"""
from datetime import UTC, datetime
from typing import Annotated, Any, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from authentication import get_authorized_tenant_db
from models import (
    OrganizationEnvironment,
    Project,
    WorkflowDefinition,
    WorkflowQueue,
    WorkflowRun,
    WorkflowStepRun,
    WorkflowVersion,
)
from project_rbac import require_project_capability

router = APIRouter(tags=["Workflow Execution"])
Db = Annotated[Session, Depends(get_authorized_tenant_db)]


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class TriggerRunIn(BaseModel):
    trigger_type: Literal["MANUAL", "SCHEDULE", "WEBHOOK", "EVENT"] = "MANUAL"
    trigger_payload: dict[str, Any] = Field(default_factory=dict)
    environment_id: UUID | None = None
    version: int | None = None


class StepRunOut(BaseModel):
    id: UUID
    node_id: str
    node_type: str
    status: str
    input_payload: dict[str, Any]
    output_payload: dict[str, Any]
    error_message: str | None = None
    retry_count: int
    started_at: datetime | None = None
    completed_at: datetime | None = None
    duration_ms: int | None = None
    created_at: datetime


class RunOut(BaseModel):
    id: UUID
    tenant_id: UUID
    project_id: UUID
    workflow_id: UUID
    workflow_version: int
    environment_id: UUID | None = None
    status: str
    trigger_type: str
    started_at: datetime | None = None
    completed_at: datetime | None = None
    duration_ms: int | None = None
    error_message: str | None = None
    retry_count: int
    created_at: datetime


class RunDetailOut(RunOut):
    trigger_payload: dict[str, Any]
    execution_context: dict[str, Any]
    steps: list[StepRunOut]


class QueueItemOut(BaseModel):
    id: UUID
    run_id: UUID
    queue_name: str
    priority: int
    status: str
    attempts: int
    max_attempts: int
    created_at: datetime


# ---------------------------------------------------------------------------
# Execution Engine Core
# ---------------------------------------------------------------------------

def execute_graph_step(
    node: dict[str, Any],
    context: dict[str, Any],
    trigger_payload: dict[str, Any],
) -> tuple[str, dict[str, Any], str | None]:
    """Execute a single workflow node and return (status, output_payload, error_message)."""
    node_type = node.get("type", "ACTION")
    node_config = node.get("config", {})

    try:
        if node_type == "TRIGGER":
            return "COMPLETED", {"trigger_received": True, **trigger_payload}, None

        if node_type == "DECISION":
            # Evaluate decision rule against context
            cond_field = node_config.get("field", "status")
            cond_op = node_config.get("operator", "==")
            cond_val = node_config.get("value", True)

            actual_val = context.get(cond_field, trigger_payload.get(cond_field))
            outcome = False
            if cond_op == "==":
                outcome = (actual_val == cond_val)
            elif cond_op == "!=":
                outcome = (actual_val != cond_val)
            elif cond_op == ">":
                outcome = (actual_val is not None and actual_val > cond_val)
            elif cond_op == "<":
                outcome = (actual_val is not None and actual_val < cond_val)
            else:
                outcome = bool(actual_val)

            return "COMPLETED", {"branch_result": outcome, "evaluated_field": cond_field, "actual": actual_val}, None

        if node_type == "APPROVAL":
            # Approvals suspend the run until resolved
            return "SUSPENDED", {"approval_requested": True, "required_role": node_config.get("required_role", "ADMIN")}, None

        if node_type in ("ACTION", "INTEGRATION", "RULE", "DOCUMENT_AI", "NOTIFICATION", "TERMINAL"):
            # Simulate enterprise action execution
            result = {
                "action": node.get("label", node_type),
                "processed_at": datetime.now(UTC).isoformat(),
                "node_config": node_config,
            }
            return "COMPLETED", result, None

        if node_type == "AI_AGENT":
            # AI Agent execution mock/gateway result
            return "COMPLETED", {
                "model": node_config.get("model", "gemini-1.5-pro"),
                "status": "success",
                "tokens_used": 142,
            }, None

        return "COMPLETED", {"status": "ok"}, None
    except Exception as exc:
        return "FAILED", {}, str(exc)


# ---------------------------------------------------------------------------
# API Endpoints
# ---------------------------------------------------------------------------

@router.post("/projects/{project_id}/workflows/{workflow_id}/runs", response_model=RunDetailOut)
def trigger_workflow_run(
    tenant_id: UUID,
    project_id: UUID,
    workflow_id: UUID,
    payload: TriggerRunIn,
    db: Db,
    request: Request,
):
    """Trigger a workflow execution run. Executes deterministically through node graph."""
    actor_id: UUID = request.state.verified_actor_id
    require_project_capability(db, project_id, actor_id, tenant_id, "can_edit")
    # Verify workflow exists and belongs to project & tenant
    wf = db.scalar(
        select(WorkflowDefinition).where(
            WorkflowDefinition.id == workflow_id,
            WorkflowDefinition.project_id == project_id,
            WorkflowDefinition.tenant_id == tenant_id,
        )
    )
    if not wf:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")

    # Determine version and graph definition to run
    version_num = payload.version or wf.current_version
    version_row = db.scalar(
        select(WorkflowVersion).where(
            WorkflowVersion.workflow_id == workflow_id,
            WorkflowVersion.version == version_num,
            WorkflowVersion.tenant_id == tenant_id,
        )
    )

    if version_row and version_row.definition:
        graph_def = version_row.definition
    else:
        # Fall back to latest version or default
        latest_ver = db.scalar(
            select(WorkflowVersion)
            .where(
                WorkflowVersion.workflow_id == workflow_id,
                WorkflowVersion.tenant_id == tenant_id,
            )
            .order_by(desc(WorkflowVersion.version))
        )
        graph_def = latest_ver.definition if latest_ver else {"nodes": [], "edges": [], "variables": []}

    nodes = graph_def.get("nodes", [])
    edges = graph_def.get("edges", [])

    if not nodes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Cannot execute empty workflow definition",
        )

    # Initialize execution run record
    now = datetime.now(UTC)
    run_id = uuid4()
    context: dict[str, Any] = {
        "workflow_id": str(workflow_id),
        "version": version_num,
        "trigger": payload.trigger_payload,
    }

    run = WorkflowRun(
        id=run_id,
        tenant_id=tenant_id,
        project_id=project_id,
        workflow_id=workflow_id,
        workflow_version=version_num,
        environment_id=payload.environment_id,
        status="RUNNING",
        trigger_type=payload.trigger_type,
        trigger_payload=payload.trigger_payload,
        execution_context=context,
        started_at=now,
        created_at=now,
        created_by=actor_id,
    )
    db.add(run)
    db.flush()

    # Add to durable worker queue
    queue_item = WorkflowQueue(
        tenant_id=tenant_id,
        run_id=run.id,
        queue_name="default",
        priority=0,
        status="PROCESSING",
        locked_by=f"worker-{uuid4().hex[:8]}",
        locked_at=now,
        attempts=1,
        payload={"trigger": payload.trigger_payload},
        created_at=now,
    )
    db.add(queue_item)
    db.flush()

    # Find starting trigger node
    trigger_node = next((n for n in nodes if n.get("type") == "TRIGGER"), nodes[0])
    visited: set[str] = set()
    current_node_id: str | None = trigger_node.get("id")
    step_records: list[WorkflowStepRun] = []
    has_suspended = False
    has_failed = False
    failure_error: str | None = None

    while current_node_id and current_node_id not in visited:
        visited.add(current_node_id)
        node = next((n for n in nodes if n.get("id") == current_node_id), None)
        if not node:
            break

        step_start = datetime.now(UTC)
        step_status, step_out, step_err = execute_graph_step(node, context, payload.trigger_payload)
        step_end = datetime.now(UTC)
        duration = int((step_end - step_start).total_seconds() * 1000)

        step_run = WorkflowStepRun(
            id=uuid4(),
            tenant_id=tenant_id,
            run_id=run_id,
            node_id=current_node_id,
            node_type=node.get("type", "ACTION"),
            status=step_status if step_status != "SUSPENDED" else "PENDING",
            input_payload={"context_snapshot": {k: v for k, v in context.items() if k != "workflow_id"}},
            output_payload=step_out,
            error_message=step_err,
            started_at=step_start,
            completed_at=step_end if step_status != "SUSPENDED" else None,
            duration_ms=duration if step_status != "SUSPENDED" else None,
            created_at=step_start,
        )
        db.add(step_run)
        step_records.append(step_run)

        # Merge step output into context
        context[f"node_{current_node_id}"] = step_out

        if step_status == "FAILED":
            has_failed = True
            failure_error = step_err
            break

        if step_status == "SUSPENDED":
            has_suspended = True
            break

        # Determine next node via edges
        outgoing = [e for e in edges if e.get("source") == current_node_id]
        if not outgoing:
            break

        if node.get("type") == "DECISION":
            branch_outcome = step_out.get("branch_result", True)
            # Find edge matching outcome label ("true"/"false") or take first
            matching_edge = next(
                (e for e in outgoing if str(e.get("label", "")).lower() == str(branch_outcome).lower()),
                outgoing[0],
            )
            current_node_id = matching_edge.get("target")
        else:
            current_node_id = outgoing[0].get("target")

    # Update run completion state
    finish_time = datetime.now(UTC)
    run.execution_context = context

    if has_failed:
        run.status = "FAILED"
        run.completed_at = finish_time
        run.duration_ms = int((finish_time - now).total_seconds() * 1000)
        run.error_message = failure_error or "Workflow execution failed at step"
        queue_item.status = "DEAD_LETTER"
    elif has_suspended:
        run.status = "SUSPENDED"
        queue_item.status = "QUEUED"
    else:
        run.status = "COMPLETED"
        run.completed_at = finish_time
        run.duration_ms = int((finish_time - now).total_seconds() * 1000)
        queue_item.status = "COMPLETED"

    db.flush()

    return RunDetailOut(
        id=run.id,
        tenant_id=run.tenant_id,
        project_id=run.project_id,
        workflow_id=run.workflow_id,
        workflow_version=run.workflow_version,
        environment_id=run.environment_id,
        status=run.status,
        trigger_type=run.trigger_type,
        trigger_payload=run.trigger_payload,
        execution_context=run.execution_context,
        started_at=run.started_at,
        completed_at=run.completed_at,
        duration_ms=run.duration_ms,
        error_message=run.error_message,
        retry_count=run.retry_count,
        created_at=run.created_at,
        steps=[
            StepRunOut(
                id=s.id,
                node_id=s.node_id,
                node_type=s.node_type,
                status=s.status,
                input_payload=s.input_payload,
                output_payload=s.output_payload,
                error_message=s.error_message,
                retry_count=s.retry_count,
                started_at=s.started_at,
                completed_at=s.completed_at,
                duration_ms=s.duration_ms,
                created_at=s.created_at,
            )
            for s in step_records
        ],
    )


@router.get("/projects/{project_id}/runs", response_model=list[RunOut])
def list_workflow_runs(
    tenant_id: UUID,
    project_id: UUID,
    db: Db,
    request: Request,
    workflow_id: UUID | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=50, ge=1, le=100),
):
    """List workflow runs for a project."""
    actor_id: UUID = request.state.verified_actor_id
    require_project_capability(db, project_id, actor_id, tenant_id, "can_view")
    stmt = (
        select(WorkflowRun)
        .where(
            WorkflowRun.tenant_id == tenant_id,
            WorkflowRun.project_id == project_id,
        )
        .order_by(desc(WorkflowRun.created_at))
        .limit(limit)
    )
    if workflow_id:
        stmt = stmt.where(WorkflowRun.workflow_id == workflow_id)
    if status_filter:
        stmt = stmt.where(WorkflowRun.status == status_filter)

    return db.scalars(stmt).all()


@router.get("/runs/{run_id}", response_model=RunDetailOut)
def get_workflow_run_detail(
    tenant_id: UUID,
    run_id: UUID,
    db: Db,
    request: Request,
):
    """Get complete run details including step execution history and variables context."""
    actor_id: UUID = request.state.verified_actor_id
    run = db.scalar(
        select(WorkflowRun).where(
            WorkflowRun.id == run_id,
            WorkflowRun.tenant_id == tenant_id,
        )
    )
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found")
    require_project_capability(db, run.project_id, actor_id, tenant_id, "can_view")

    steps = db.scalars(
        select(WorkflowStepRun)
        .where(
            WorkflowStepRun.run_id == run_id,
            WorkflowStepRun.tenant_id == tenant_id,
        )
        .order_by(WorkflowStepRun.created_at.asc())
    ).all()

    return RunDetailOut(
        id=run.id,
        tenant_id=run.tenant_id,
        project_id=run.project_id,
        workflow_id=run.workflow_id,
        workflow_version=run.workflow_version,
        environment_id=run.environment_id,
        status=run.status,
        trigger_type=run.trigger_type,
        trigger_payload=run.trigger_payload,
        execution_context=run.execution_context,
        started_at=run.started_at,
        completed_at=run.completed_at,
        duration_ms=run.duration_ms,
        error_message=run.error_message,
        retry_count=run.retry_count,
        created_at=run.created_at,
        steps=[
            StepRunOut(
                id=s.id,
                node_id=s.node_id,
                node_type=s.node_type,
                status=s.status,
                input_payload=s.input_payload,
                output_payload=s.output_payload,
                error_message=s.error_message,
                retry_count=s.retry_count,
                started_at=s.started_at,
                completed_at=s.completed_at,
                duration_ms=s.duration_ms,
                created_at=s.created_at,
            )
            for s in steps
        ],
    )


@router.post("/runs/{run_id}/cancel", response_model=RunOut)
def cancel_workflow_run(
    tenant_id: UUID,
    run_id: UUID,
    db: Db,
    request: Request,
):
    """Cancel an active or pending workflow run."""
    actor_id: UUID = request.state.verified_actor_id
    run = db.scalar(
        select(WorkflowRun).where(
            WorkflowRun.id == run_id,
            WorkflowRun.tenant_id == tenant_id,
        )
    )
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found")
    require_project_capability(db, run.project_id, actor_id, tenant_id, "can_edit")

    if run.status in ("COMPLETED", "FAILED", "CANCELLED"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot cancel run in '{run.status}' state",
        )

    now = datetime.now(UTC)
    run.status = "CANCELLED"
    run.completed_at = now
    if run.started_at:
        run.duration_ms = int((now - run.started_at).total_seconds() * 1000)

    # Cancel queue item if exists
    queue_item = db.scalar(
        select(WorkflowQueue).where(
            WorkflowQueue.run_id == run_id,
            WorkflowQueue.tenant_id == tenant_id,
        )
    )
    if queue_item:
        queue_item.status = "CANCELLED"

    db.flush()
    return run


@router.post("/runs/{run_id}/retry", response_model=RunDetailOut)
def retry_workflow_run(
    tenant_id: UUID,
    run_id: UUID,
    db: Db,
    request: Request,
):
    """Retry a failed workflow run."""
    actor_id: UUID = request.state.verified_actor_id
    run = db.scalar(
        select(WorkflowRun).where(
            WorkflowRun.id == run_id,
            WorkflowRun.tenant_id == tenant_id,
        )
    )
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found")
    require_project_capability(db, run.project_id, actor_id, tenant_id, "can_edit")

    if run.status != "FAILED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only failed runs can be retried",
        )

    if run.retry_count >= run.max_retries:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Maximum retries ({run.max_retries}) exceeded",
        )

    run.retry_count += 1
    db.flush()

    # Re-trigger with same payload
    return trigger_workflow_run(
        tenant_id=tenant_id,
        project_id=run.project_id,
        workflow_id=run.workflow_id,
        payload=TriggerRunIn(
            trigger_type=run.trigger_type,  # type: ignore
            trigger_payload=run.trigger_payload,
            environment_id=run.environment_id,
            version=run.workflow_version,
        ),
        db=db,
        request=request,
    )


@router.post("/runs/{run_id}/resume", response_model=RunDetailOut)
def resume_workflow_run(
    tenant_id: UUID,
    run_id: UUID,
    resume_payload: dict[str, Any],
    db: Db,
    request: Request,
):
    """Resume a suspended workflow run (e.g. following human approval or external signal)."""
    actor_id: UUID = request.state.verified_actor_id
    run = db.scalar(
        select(WorkflowRun).where(
            WorkflowRun.id == run_id,
            WorkflowRun.tenant_id == tenant_id,
        )
    )
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found")
    require_project_capability(db, run.project_id, actor_id, tenant_id, "can_edit")

    if run.status != "SUSPENDED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Run is not suspended (current status: '{run.status}')",
        )

    now = datetime.now(UTC)
    context = dict(run.execution_context or {})
    context["resume_signal"] = resume_payload

    run.status = "COMPLETED"
    run.execution_context = context
    run.completed_at = now
    if run.started_at:
        run.duration_ms = int((now - run.started_at).total_seconds() * 1000)

    # Complete any pending step run
    pending_step = db.scalar(
        select(WorkflowStepRun)
        .where(
            WorkflowStepRun.run_id == run_id,
            WorkflowStepRun.tenant_id == tenant_id,
            WorkflowStepRun.status == "PENDING",
        )
    )
    if pending_step:
        pending_step.status = "COMPLETED"
        pending_step.output_payload = resume_payload
        pending_step.completed_at = now

    # Complete queue item
    queue_item = db.scalar(
        select(WorkflowQueue).where(
            WorkflowQueue.run_id == run_id,
            WorkflowQueue.tenant_id == tenant_id,
        )
    )
    if queue_item:
        queue_item.status = "COMPLETED"

    db.flush()

    steps = db.scalars(
        select(WorkflowStepRun)
        .where(
            WorkflowStepRun.run_id == run_id,
            WorkflowStepRun.tenant_id == tenant_id,
        )
        .order_by(WorkflowStepRun.created_at.asc())
    ).all()

    return RunDetailOut(
        id=run.id,
        tenant_id=run.tenant_id,
        project_id=run.project_id,
        workflow_id=run.workflow_id,
        workflow_version=run.workflow_version,
        environment_id=run.environment_id,
        status=run.status,
        trigger_type=run.trigger_type,
        trigger_payload=run.trigger_payload,
        execution_context=run.execution_context,
        started_at=run.started_at,
        completed_at=run.completed_at,
        duration_ms=run.duration_ms,
        error_message=run.error_message,
        retry_count=run.retry_count,
        created_at=run.created_at,
        steps=[
            StepRunOut(
                id=s.id,
                node_id=s.node_id,
                node_type=s.node_type,
                status=s.status,
                input_payload=s.input_payload,
                output_payload=s.output_payload,
                error_message=s.error_message,
                retry_count=s.retry_count,
                started_at=s.started_at,
                completed_at=s.completed_at,
                duration_ms=s.duration_ms,
                created_at=s.created_at,
            )
            for s in steps
        ],
    )


@router.get("/queues", response_model=list[QueueItemOut])
def list_workflow_queues(
    tenant_id: UUID,
    db: Db,
    limit: int = Query(default=50, ge=1, le=100),
):
    """List queue items across tenant."""
    return db.scalars(
        select(WorkflowQueue)
        .where(WorkflowQueue.tenant_id == tenant_id)
        .order_by(WorkflowQueue.created_at.desc())
        .limit(limit)
    ).all()
