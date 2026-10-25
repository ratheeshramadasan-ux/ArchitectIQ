# ArchitectIQ — Enterprise Architecture & Deployment Documentation

**Platform Version:** 1.0.0-enterprise  
**Release Baseline:** Verified M12.0 Delivery  
**Lead Architect:** Antigravity (Google DeepMind Agentic Systems)  
**Date:** 25 October 2026  

---

## 1. High-Level System Architecture

ArchitectIQ is an enterprise-grade AI and Automation Control Plane engineered for multi-tenant workflow orchestration, intelligent document processing, governed AI agents, deterministic business rules, and real-time operational observability.

```
                              [ Enterprise Web Studio ]
                           (React 19, TypeScript, Vite)
                                        │
                         HTTPS / TLS 1.3 │ JWT / Bearer
                                        ▼
                       [ FastAPI Control Plane / Gateway ]
                        (Python 3.12, Pydantic, SQLAlchemy)
                                        │
           ┌────────────────────────────┼────────────────────────────┐
           ▼                            ▼                            ▼
[ PostgreSQL 17 + RLS ]         [ Redis Stream Broker ]      [ Local Ollama / Remote LLM ]
 - 4 Restricted IAM Roles         - Durable Worker Queues      - qwen3-coder:30b (Ollama)
 - 28 Multi-Tenant Tables         - Lease Claims & Retries     - OpenAI / Claude / Vertex AI
 - Row-Level Security Policies    - Dead-Letter Queues         - Governed Model Gateway
 - Request & Activity Audits
```

---

## 2. Core Architectural Subsystems

### 2.1 Multi-Tenant Identity & Row-Level Security (RLS)
The platform enforces strict zero-trust tenant boundary isolation using PostgreSQL Row-Level Security combined with restricted database IAM roles:
1. `architectiq`: Migration DDL administrator (used only by Alembic).
2. `architectiq_app`: Application runtime role restricted by `public.architectiq_current_tenant_id()` on all 28 tenant tables.
3. `architectiq_audit_writer`: Security audit role restricted strictly to appending request and activity logs.
4. `architectiq_iam_login`: Native authentication role restricted to credential verification.

### 2.2 Workflow Orchestration & Durable Execution Engine
- **Designer:** React Flow + ELK.js hierarchical auto-layout producing versioned canonical DAG JSON schemas (`WF-01`, `WF-02`).
- **State Machine:** Durable execution engine (`EXE-01`) writing immutable step runs (`PENDING` -> `RUNNING` -> `COMPLETED`/`FAILED`).
- **Worker Queues:** Distributed task distribution with lease lock timeouts, heartbeat renewals, dead-letter routing, and automatic retries (`EXE-02`).

### 2.3 Human-in-the-Loop & Business Rules Engine
- **Dual-Authorization:** Segregation of duties enforcing that workflow trigger authors cannot approve their own high-criticality tasks (`HITL-01`).
- **Deterministic Rules Engine:** Versioned decision tables supporting rich condition evaluation (`==`, `!=`, `<`, `>`, `in`, `contains`) without code deployments (`RULE-01`).

### 2.4 Governed AI Agent Gateway & Model Metering
- **Multi-Provider Router:** Seamless routing between local zero-cost models (`ollama:qwen3-coder:30b`) and remote commercial providers (OpenAI, Anthropic Claude, Google Vertex AI) (`AG-01`).
- **Token Accounting & Budget Caps:** Per-model cost metering tracking prompt and completion tokens. Strictly halts invocation with `HTTP 402 Payment Required` when spend caps are reached (`AG-02`).

### 2.5 Intelligent Document Processing (IDP)
- Multi-page document ingestion supporting PDF, TIFF, PNG, and JPEG formats (`DOC-01`).
- Heuristic OCR entity extraction with confidence scoring. Low-confidence entities (< threshold) route to the Human Review Queue (`DOC-02`).

### 2.6 Integrations, Vault Secrets & Packaging
- Secure external vault references for CyberArk, HashiCorp Vault, AWS Secrets Manager, and Azure Key Vault with automated masked previews (`INT-01`).
- Governed tool registry with OpenAPI JSON Schema parameter enforcement and rate limiting.
- Full workspace packaging producing export manifests and supporting project cloning with dependency graph replication (`WS-04`).

### 2.7 Observability, Telemetry & Incident Management
- Time-series metric telemetry stream tracking throughput, error rates %, queue latency ms, and active worker pools (`OBS-01`).
- Incident management lifecycle (`OPEN` -> `INVESTIGATING` -> `MITIGATED` -> `RESOLVED`) with severity scoring (`SEV-1` to `SEV-4`) (`SUP-01`).
- Automated operational runbook remediation with sequential step execution and live terminal logging.

---

## 3. Local Startup & Development Environment

### Prerequisites
- Python 3.12+ (in virtual environment `.venv`)
- Node.js 20+ & npm 10+
- Docker & Docker Compose (or local PostgreSQL & Redis)

### Step 1: Start Infrastructure Containers
```bash
# Start PostgreSQL (port 5433) and Redis (port 6380)
docker compose up -d
```

### Step 2: Initialize Database Migrations
Always verify against the authorized target database:
```bash
cd apps/api
$env:DATABASE_URL="postgresql+psycopg://architectiq:Mad%407878@127.0.0.1:5433/architectiq_test"
..\..\.venv\Scripts\python.exe -m alembic upgrade head
```

### Step 3: Run Verification Scripts
```bash
# Verify backup and disaster recovery readiness
..\..\.venv\Scripts\python.exe ..\..\scripts\verify_backup_recovery.py
```

### Step 4: Start Backend API Server
```bash
cd apps/api
..\..\.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```
API Documentation will be available at: `http://127.0.0.1:8000/docs`

### Step 5: Start Frontend Studio
```bash
cd apps/web-studio
npm run dev
```
Web Studio interface will be live at: `http://localhost:5173`

---

## 4. Production Deployment Guidelines

### Container Build
```bash
# Build Backend Image
docker build -t architectiq/control-plane:1.0.0 -f apps/api/Dockerfile .

# Build Frontend Image
docker build -t architectiq/web-studio:1.0.0 -f apps/web-studio/Dockerfile .
```

### Production Security Checklist
1. **Database Role Privileges:** Ensure application workers connect strictly using `architectiq_app` and request audit middleware uses `architectiq_audit_writer`. Never connect in production using `architectiq` (migration admin).
2. **PostgreSQL RLS:** Run `python scripts/verify_backup_recovery.py` in the CD pipeline to ensure RLS is active on all 28 tables.
3. **JWT Secret:** Configure `NATIVE_JWT_SECRET` using a high-entropy cryptographically secure random string (at least 256 bits).
4. **Disaster Recovery:** Schedule automated WAL archiving to S3/GCS bucket with point-in-time recovery enabled. Target RPO: &le; 60 seconds; target RTO: &le; 300 seconds.
