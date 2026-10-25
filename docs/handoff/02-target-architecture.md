# ArchitectIQ — Target Architecture & System Design

**Date:** 25 October 2026  
**Author:** Antigravity (Principal Architect)  
**System:** ArchitectIQ — Enterprise AI & Automation Studio  
**Foundation Baseline:** FastAPI 0.115+, PostgreSQL 17 (RLS), Redis 7, React 19, Vite 8, TypeScript 5.7  

---

## 1. High-Level Architectural Planes

ArchitectIQ is partitioned into three strictly decoupled architectural planes:

```mermaid
flowchart TD
    subgraph CP["Control Plane (FastAPI / PostgreSQL)"]
        IAM["IAM & Identity Service"]
        WSM["Workspace & Project Management"]
        WFD["Workflow & Component Definitions"]
        SEC["Security & Policy Engine"]
        API_GW["API Gateway / Routers"]
    end

    subgraph EP["Execution Plane (Workers & Orchestration)"]
        WORKER["Worker Fleet (Stateless)"]
        QUEUE["Durable Queues & State (Postgres / Redis)"]
        AG_EXEC["AI Agent Orchestrator"]
        DOC_AI["Document AI Pipeline Engine"]
        RULE_ENG["Deterministic Rule Engine"]
    end

    subgraph OP["Observability Plane (Telemetry & Audit)"]
        REQ_AUDIT["HTTP Request Audit (api_request_audit)"]
        BIZ_AUDIT["Business Activity Audit (workspace_activity)"]
        METRICS["Metrics & KPI Aggregator"]
        TRACES["OpenTelemetry Distributed Tracing"]
        ALERT["Alerting & SLA Monitor"]
    end

    CP -->|Deploy / Dispatch| EP
    CP -->|Audit Events| OP
    EP -->|Status / Telemetry| OP
```

### 1. Control Plane
- **Responsibilities:** Identity authentication (OIDC / Native), tenant isolation, folder and project lifecycle, workflow authoring, model governance, role-based access control, environment promotion approvals.
- **Persistence:** PostgreSQL 17 (System of Record with RLS).
- **Security Boundary:** Least-privilege database roles, transaction-scoped tenant context (`architectiq.tenant_id`), immutable audit logs.

### 2. Execution Plane
- **Responsibilities:** Reliable, deterministic execution of automation workflows, AI agent tool execution, OCR and document parsing, deterministic business rule evaluation, human approval checkpoints.
- **Persistence:** PostgreSQL for durable execution state, checkpoints, and dead-letter queues; Redis for transient queue leases, distributed locks, and pub/sub.
- **Principles:** Worker idempotency, durable waits surviving process restarts, compensating transactions, safe timeouts.

### 3. Observability Plane
- **Responsibilities:** Ingestion and visualization of API request audits, business entity activity logs, worker health heartbeats, SLA attainment metrics, token usage, and LLM inference cost tracking.
- **Integrations:** OpenTelemetry, ECharts dashboards, enterprise SIEM export.

---

## 2. Security Boundaries & PostgreSQL Role Isolation

ArchitectIQ eliminates cross-tenant data leakage by enforcing database-level Row-Level Security (RLS) combined with four distinct PostgreSQL roles:

```mermaid
flowchart LR
    subgraph Clients["Incoming Requests"]
        User["User / Service Client"]
    end

    subgraph Auth["API Security & Auth Gateway"]
        TokenCheck["JWT / OIDC Validation"]
        IAMCheck["Tenant Membership Verification"]
    end

    subgraph DBRoles["PostgreSQL Role Segregation"]
        Super["architectiq (Migration Superuser)"]
        IAMRole["architectiq_iam_login (IAM Validator)"]
        AppRole["architectiq_app (RLS Runtime)"]
        AuditRole["architectiq_audit_writer (Append-Only Audit)"]
    end

    subgraph Storage["PostgreSQL 17 Database"]
        TenantTables[("Business Tables (RLS Enforced)\norganizations, folders, projects, project_environments")]
        IAMTables[("IAM Tables\nusers, tenant_memberships, native_credentials")]
        AuditTables[("Audit Tables\napi_request_audit, workspace_activity")]
    end

    User --> TokenCheck
    TokenCheck --> IAMCheck
    IAMCheck -->|SECURITY DEFINER| IAMRole
    IAMRole --> IAMTables

    IAMCheck -->|SET LOCAL architectiq.tenant_id| AppRole
    AppRole -->|RLS Filtered| TenantTables

    Auth -.->|Middleware Flush| AuditRole
    AuditRole -->|INSERT Only| AuditTables

    Super -.->|Alembic Migrations Only| Storage
```

### Security Boundary Guarantees
1. **No RLS Bypass in App:** The application runtime uses `architectiq_app`, which cannot bypass RLS under any circumstances.
2. **Deterministic Context Setting:** Every database transaction opened for a tenant request sets `architectiq.tenant_id` via `SET LOCAL`. If omitted, RLS policies return **zero rows**.
3. **IAM Partitioning:** Membership verification is handled via `SECURITY DEFINER` routines (`architectiq_verify_tenant_membership`) accessed only by `architectiq_iam_login`.
4. **Append-Only Auditing:** The `architectiq_audit_writer` role possesses `INSERT` grants on `api_request_audit`, preventing tampering or reading of audit records.

---

## 3. Domain Boundaries & Canonical Data Model

```mermaid
erDiagram
    TENANT ||--o{ ORGANIZATION : contains
    ORGANIZATION ||--o{ FOLDER : contains
    FOLDER ||--o{ FOLDER : nests
    FOLDER ||--o{ PROJECT : contains
    PROJECT ||--o{ PROJECT_MEMBERSHIP : assigns
    USER ||--o{ PROJECT_MEMBERSHIP : receives
    PROJECT ||--o{ PROJECT_ENVIRONMENT : binds
    ORGANIZATION ||--o{ ORGANIZATION_ENVIRONMENT : defines
    PROJECT ||--o{ WORKFLOW_DEFINITION : contains
    PROJECT ||--o{ AGENT_DEFINITION : contains
    PROJECT ||--o{ DOCUMENT_AI_PROJECT : contains

    TENANT {
        uuid id PK
        string name
        string slug UK
        datetime created_at
    }

    ORGANIZATION {
        uuid id PK
        uuid tenant_id FK
        string name
        string slug
        datetime created_at
    }

    FOLDER {
        uuid id PK
        uuid organization_id FK
        uuid parent_folder_id FK
        string name
        datetime created_at
    }

    PROJECT {
        uuid id PK
        uuid folder_id FK
        string name
        string lifecycle_status
        string description
        datetime created_at
    }

    PROJECT_MEMBERSHIP {
        uuid id PK
        uuid project_id FK
        uuid user_id FK
        string role
        uuid granted_by FK
        datetime created_at
    }

    USER {
        uuid id PK
        string display_name
        string status
        datetime created_at
    }
```

### Hierarchy Invariants:
1. `Tenant → Organization → Folder(s) → Project → Project Components`
2. **Cycle Prevention:** Folders cannot be made parents of their own ancestors. Enforced via database triggers (`fbe4556e3af8`).
3. **Cross-Organization Boundary:** A folder or project cannot be moved across organization boundaries (`apps/api/workspace.py` and constraints).
4. **Independent Environments:** Organizations define governed environments (`DEV`, `TEST`, `UAT`, `PROD`). Projects bind to these environments with distinct configurations.

---

## 4. End-to-End Request & Data Flow

```mermaid
sequenceDiagram
    autonumber
    actor Client as User / Web Studio
    participant MW as RequestAuditMiddleware
    participant Auth as Authentication & IAM
    participant DB_IAM as Postgres (IAM Role)
    participant Router as Workspace / Project API
    participant DB_App as Postgres (App Role + RLS)
    participant AuditDB as Postgres (Audit Writer)

    Client->>MW: HTTP Request (Bearer JWT + Tenant Header/Path)
    MW->>MW: Generate correlation_id (UUIDv4)
    MW->>Auth: Validate Bearer Token
    Auth->>Auth: Verify JWT Signature (RS256/HS256) & Claims
    Auth->>DB_IAM: Verify Tenant Membership (SECURITY DEFINER)
    DB_IAM-->>Auth: Membership Confirmed (ACTIVE)
    
    Auth->>DB_App: Begin Transaction & SET LOCAL architectiq.tenant_id
    Auth->>Router: Hand off authorized Session
    Router->>DB_App: Execute Query (RLS automatically filters tenant data)
    DB_App-->>Router: Result Set
    Router-->>MW: HTTP Response
    
    MW->>AuditDB: INSERT api_request_audit (correlation_id, tenant_id, actor_id, duration)
    MW-->>Client: Final Response + X-Correlation-ID
```

---

## 5. Deployment & Disaster Recovery

### Local & CI Baseline
- Single-command orchestration via `docker compose -f infrastructure/docker/compose.yaml up -d`.
- Isolated test database (`architectiq_test`) automatically provisioned and validated by `conftest.py`.

### Production Deployment Architecture
- **API Nodes:** Stateless containerized FastAPI instances behind an enterprise Load Balancer / Reverse Proxy.
- **Database:** PostgreSQL Primary with Synchronous Read Replicas; automated WAL archiving; Point-In-Time-Recovery (PITR) target: RPO < 5 minutes, RTO < 30 minutes.
- **Secrets Management:** External Key Management (HashiCorp Vault / CyberArk / AWS Secrets Manager) mapped via environment variables at container initialization; no plaintext secrets in repository or databases.
- **Static Frontend:** Vite production bundle distributed through a Content Delivery Network (CDN) with Content-Security-Policy (CSP) headers.
