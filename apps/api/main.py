from tenant_discovery import router as tenant_discovery_router
from native_auth import router as native_router
from workspace import router as workspace_router
from platform_control import router as platform_control_router
from request_audit import RequestAuditMiddleware
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(
    title="ArchitectIQ Enterprise AI & Automation Studio",
    version="0.1.0",
    description="Enterprise AI and Automation Control Plane API",
)


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str


@app.get("/health", response_model=HealthResponse, tags=["Health"])
def health() -> HealthResponse:
    return HealthResponse(
        status="healthy",
        service="architectiq-api",
        version="0.1.0",
    )

app.include_router(workspace_router)

app.include_router(native_router)

app.include_router(tenant_discovery_router)

app.include_router(platform_control_router)

app.add_middleware(RequestAuditMiddleware)
