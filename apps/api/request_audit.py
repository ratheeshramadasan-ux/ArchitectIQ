import logging
import time
from uuid import UUID, uuid4

from fastapi import Request
from sqlalchemy import text
from starlette.middleware.base import BaseHTTPMiddleware

from database import audit_session

logger = logging.getLogger(__name__)


def write_request_audit(
    *,
    correlation_id: UUID,
    tenant_id: UUID | None,
    actor_id: UUID | None,
    method: str,
    route: str,
    status_code: int,
    duration_ms: int,
) -> None:
    with audit_session() as session:
        session.execute(
            text("""
                INSERT INTO public.api_request_audit (
                    correlation_id,
                    tenant_id,
                    actor_id,
                    http_method,
                    normalized_route,
                    status_code,
                    duration_ms
                )
                VALUES (
                    :correlation_id,
                    :tenant_id,
                    :actor_id,
                    :http_method,
                    :normalized_route,
                    :status_code,
                    :duration_ms
                )
            """),
            {
                "correlation_id": correlation_id,
                "tenant_id": tenant_id,
                "actor_id": actor_id,
                "http_method": method,
                "normalized_route": route,
                "status_code": status_code,
                "duration_ms": duration_ms,
            },
        )


class RequestAuditMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        correlation_id = uuid4()
        request.state.correlation_id = correlation_id

        start = time.perf_counter()
        status_code = 500
        response = None

        try:
            response = await call_next(request)
            status_code = response.status_code
            return response

        finally:
            duration_ms = max(
                0,
                int((time.perf_counter() - start) * 1000),
            )

            route = request.scope.get("route")
            route_template = (
                getattr(route, "path", None)
                if route is not None
                else None
            )

            # Never persist raw request paths or query strings.
            normalized_route = route_template or "<unmatched>"

            tenant_id = getattr(
                request.state,
                "verified_tenant_id",
                None,
            )
            actor_id = getattr(
                request.state,
                "verified_actor_id",
                None,
            )

            try:
                write_request_audit(
                    correlation_id=correlation_id,
                    tenant_id=tenant_id,
                    actor_id=actor_id,
                    method=request.method,
                    route=normalized_route,
                    status_code=status_code,
                    duration_ms=duration_ms,
                )
            except Exception:
                logger.exception(
                    "HTTP request audit persistence failed"
                )