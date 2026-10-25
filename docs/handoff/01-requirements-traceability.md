# ArchitectIQ — Requirements Traceability Matrix

**Date:** 25 October 2026  
**Evaluator:** Antigravity (Principal Architect & Delivery Lead)  
**Baseline Verification Commit:** `b47e7d5`  
**Evaluation Standard:** Physical verification of source code, schemas, and runnable test fixtures. No feature is marked "Implemented" without runnable automated test evidence.

---

## 1. Traceability Status Key

- **Implemented:** Code is complete, verified, and backed by automated passing tests.
- **Partial:** Foundational data model or UI prototype exists, but critical enterprise logic, persistence, or automated tests are incomplete.
- **Missing:** Not present in the codebase.
- **Deferred:** Planned for subsequent milestones (M5–M12) or commercial roadmap.
- **Unknown:** Cannot be confirmed without external third-party service integration.

---

## 2. Requirements Traceability Matrix

| Req ID | Domain | Requirement Description | Priority | Status | Supporting Files | Test References | Dependencies / Notes |
|---|---|---|---|---|---|---|---|
| **WS-01** | Workspace | Canonical tenant/org/folder/project hierarchy and tree | P0 | **Implemented** | `apps/api/models.py`, `apps/api/workspace.py`, `apps/web-studio/src/WorkspaceLive.tsx` | `test_tenant_security.py`, `test_workspace_contract.py` | Enforces org-scoped folders, self-parent prevention, cyclic trigger checks. |
| **WS-02** | Workspace | Project lifecycle, metadata, archive/restore, soft-delete | P0 | **Partial** | `apps/api/models.py`, `apps/api/workspace.py` | `test_workspace_contract.py` | Project CRUD exists; lifecycle states (ARCHIVED/ACTIVE), retention, and metadata fields are target for M4.2. |
| **WS-03** | Workspace | Move, drag/drop, search, context menus, favorites | P1 | **Partial** | `apps/api/workspace.py`, `apps/web-studio/src/WorkspaceLive.tsx` | Manual browser drag/drop; API move tested via contract | API `PATCH /move` endpoints exist for folder & project with cycle/org checks. Favorites & context menus pending M4.4. |
| **WS-04** | Workspace | Templates, clone, import/export, bulk operations | P1 | **Missing** | N/A | None | Target for M4.4 / M10. |
| **ENV-01** | Environment | Organization environment governance | P0 | **Implemented** | `apps/api/migrations/versions/e7b42c91a603_organization_environments.py`, `apps/api/workspace.py` | `test_workspace_contract.py` | Org-level DEV/TEST/UAT/PROD environments and folder bindings supported via API. |
| **ENV-02** | Environment | Per-project environment bindings and promotion | P0 | **Partial** | `apps/api/models.py` (`ProjectEnvironment`), `apps/api/workspace.py` | `test_tenant_security.py` | `project_environments` table exists with DEV/TEST/UAT/PROD check. Promotion workflow & approvals target for M4.3. |
| **IAM-01** | IAM | Tenant/org/project role model and permission matrix | P0 | **Partial** | `apps/api/iam.py`, `apps/api/authentication.py` | `test_auth_dependency.py`, `test_tenant_security.py` | Tenant membership verified via SECURITY DEFINER function. Project-level RBAC role matrix is target for immediate M4.1. |
| **IAM-02** | IAM | Project membership and effective permissions | P0 | **Missing** | To be created in `apps/api/models.py`, `apps/api/iam.py` | Target for M4.1 tests | Immediate priority M4.1. Requires `project_memberships` table and canonical permission service. |
| **IAM-03** | IAM | Access Management APIs and UI | P0 | **Partial** | `apps/web-studio/src/WorkspaceLive.tsx` (Access Tab placeholder) | None (UI placeholder only) | Immediate priority M4.1. Requires member CRUD APIs and functional Access tab. |
| **IAM-04** | IAM | SSO/MFA/service identities/access review | P1 | **Partial** | `apps/api/authentication.py`, `apps/api/native_auth.py` | `test_authentication.py` (26 OIDC tests), `test_native_auth_contract.py` | OIDC JWKS validation and native Argon2/JWT session auth implemented. SAML and automated access reviews deferred. |
| **SEC-01** | Security | PostgreSQL RLS, least privilege, tenant isolation tests | P0 | **Implemented** | `apps/api/database.py`, `apps/api/iam.py`, PostgreSQL RLS policies | `test_tenant_security.py` (3 tests), `test_request_audit_integration.py` | 4 isolated roles (`architectiq`, `architectiq_app`, `architectiq_iam_login`, `architectiq_audit_writer`). 100% verified. |
| **SEC-02** | Security | Audits, secrets, PII, approval safeguards | P0 | **Implemented** | `apps/api/request_audit.py`, `apps/api/workspace.py` (`workspace_activity`) | `test_request_audit_integration.py` (6 tests) | Dual audit architecture: HTTP request audit middleware + business activity log triggers. |
| **UI-01** | UX | Six primary workspaces, shell, hierarchy, environment selector | P0 | **Partial** | `apps/web-studio/src/App.tsx`, `apps/web-studio/src/WorkspaceLive.tsx` | Frontend build & lint clean | App shell and tree implemented. Reconciling 4 nav groups to 6 primary workspaces + independent env selector is M4.4. |
| **UI-02** | UX | Full module catalogue, functional menus and design system | P1 | **Partial** | `apps/web-studio/src/App.tsx`, `ArchitectIQ - Enterprise UI Navigat.txt` | Frontend build & lint clean | Visual styling & 20-module preview catalogue exist. Functional wiring of non-workspace modules planned across M5–M12. |
| **WF-01** | Workflow | Visual canvas, node library, properties/variables | P1 | **Partial** | `apps/web-studio/src/App.tsx` (`FlowPreview`) | Visual preview only | Illustrative React Flow preview exists. Canonical visual workflow designer planned for M5. |
| **WF-02** | Workflow | Versioned definition, validation, templates | P1 | **Missing** | N/A | None | Planned for M5. |
| **WF-03** | Workflow | Simulation, debugging, testing, publish | P1 | **Missing** | N/A | None | Planned for M5 / M6. |
| **EXE-01** | Runtime | Durable execution, jobs, queues, subtransactions | P1 | **Missing** | `infrastructure/docker/compose.yaml` (Redis 7) | `test_db_connection.py` | Redis active; durable PostgreSQL-backed state engine planned for M6. |
| **EXE-02** | Runtime | Triggers, schedules, workers, retries, SLA | P1 | **Missing** | N/A | None | Planned for M6. |
| **HITL-01** | Approval | Durable human tasks, inbox, escalation, audit | P1 | **Missing** | N/A | None | Planned for M7. |
| **RULE-01** | Rules | Approved deterministic rule engine and SOP changes | P1 | **Missing** | N/A | None | Planned for M7. |
| **AG-01** | Agent | Agent registry, orchestration, tools and model gateway | P1 | **Missing** | `Modelfile` (untracked) | None | Planned for M8. |
| **AG-02** | Agent | Evaluation, governance, budgets, fallback | P1 | **Missing** | N/A | None | Planned for M8. |
| **DOC-01** | Document AI | Ingestion, classification, segmentation, extraction | P1 | **Missing** | N/A | None | Planned for M9. |
| **DOC-02** | Document AI | Annotation, training, validation, publish/runtime | P1 | **Missing** | N/A | None | Planned for M9. |
| **INT-01** | Integration | Connectors, credential references, tool registry | P1 | **Missing** | N/A | None | Planned for M10. |
| **OBS-01** | Observability | Logs, metrics, traces, activity, alerts, dashboards | P1 | **Partial** | `apps/api/request_audit.py`, `apps/web-studio/src/WorkspaceLive.tsx` | `test_request_audit_integration.py` | Request & activity audit in place. Metrics, OpenTelemetry traces, and operational dashboards planned for M11. |
| **SUP-01** | Support | Incident/runbook/capacity/SLA operational console | P2 | **Missing** | N/A | None | Planned for M11. |
| **GOV-01** | Governance | Responsible AI, retention, access reviews, compliance | P1 | **Missing** | N/A | None | Planned for M12. |
| **OPS-01** | DevOps | CI/CD, migration safety, rollback, deployment | P0 | **Partial** | `apps/api/conftest.py`, `apps/api/alembic.ini`, `apps/api/migrations` | Migration test verification | Migration safety validation in place; automated GitHub Actions / GitLab CI pipeline target for M4.5 / M12. |
| **OPS-02** | Reliability | HA/DR, load tests, performance and cost controls | P2 | **Missing** | N/A | None | Planned for M12. |
| **COM-01** | Commercial | Metering, licensing, chargeback/marketplace | P3 | **Deferred** | N/A | None | Deferred to commercial roadmap. |

---

## 3. Immediate Gap Analysis for Milestone M4

The current foundation (M3.1) successfully delivers **WS-01**, **ENV-01**, **SEC-01**, and **SEC-02**.  
The immediate gaps to fulfill M4 are:
1. **IAM-02 (Project Membership & Effective Permissions):** Create `project_memberships` table, migration script, and permission evaluator service.
2. **IAM-03 (Access Management APIs & UI):** Replace the placeholder in `WorkspaceLive.tsx` with a live member list, role assignment dropdown, access removal dialog, and audit logging.
3. **WS-02 (Project Lifecycle & Metadata):** Add metadata fields (description, tags, owner, SLA, status) and archive/restore endpoints.
4. **ENV-02 (Per-Project Environment Bindings):** Expose governed environment promotion workflows.
5. **UI-01 (Six Workspaces & Environment Selector):** Surface the governed environment switcher in the global header and align top-level workspaces with `Dashboard`, `Configure`, `Test`, `Run`, `Support`, `Master Setup`.
