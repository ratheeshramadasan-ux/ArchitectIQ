# ArchitectIQ — Complete Product Requirements and Antigravity Engineering Handoff

**Handoff date:** 25 October 2026  
**Product:** ArchitectIQ — Enterprise AI & Automation Studio  
**Repository:** https://github.com/ratheeshramadasan-ux/ArchitectIQ  
**Windows working copy:** `C:\Users\rathe\Documents\Projects\ArchitectIQ`  
**Verified foundation commit:** `b47e7d5` (M3.1; 43 API tests passed)  
**Working branch to inspect:** `feature/m40-workspace-management`  
**Document status:** Consolidated product/engineering handoff. It includes previously stated requirements plus clearly identified implementation proposals. Repository contents, not this document, determine actual implementation status.

---

## 0. Instructions to Antigravity — mandatory

You are the principal architect, product engineer, security reviewer, test engineer and delivery lead for ArchitectIQ. **Take over the existing repository; do not create a replacement product.** First inventory the repository, current Git status, tests, migrations, backend, frontend, configuration, and docs. Preserve existing code, untracked files, local models, data, secrets and backups. Produce a traceable gap analysis before writing features. Then implement in small, independently verifiable slices. Never claim something is complete without runnable evidence.

**Do not** run `git clean`, `git reset --hard`, destructive database commands, Docker volume deletion, or mass file cleanup. Do not alter existing migrations after they have been applied. Do not overwrite `authentication.py`, `database.py`, `main.py` or `workspace.py` wholesale. Do not add speculative security fixes or placeholder `pass` functions and call them completed. Do not push, merge, deploy or change production configuration without explicit authorization. Do not expose credentials or connection strings in logs. Do not implement a shutdown/STOP feature merely because the instruction says stop work.

**Safety gate:** The test database is `architectiq_test`; never run test fixtures, migrations, destructive queries or integration tests against `architectiq_dev`. Test scripts must positively verify the current database name before mutating data. The currently validated local services are PostgreSQL `127.0.0.1:5433` and Redis `127.0.0.1:6380`. PostgreSQL password may contain `@`: it remains literal in raw Docker password variables and is URL-encoded as `%40` only inside database URLs. Use `./.venv/Scripts/python.exe` on Windows, not bare `python`. Do not print secrets. The last verified API suite collected 43 tests and passed with one nonblocking Starlette/httpx deprecation warning.

### Required initial outputs (before feature coding)

1. `docs/handoff/00-repository-inventory.md`: actual file/module tree, current Git status, dependencies, architecture, migrations, API routes, UI screens, test coverage, CI/CD, known blockers and technical debt.
2. `docs/handoff/01-requirements-traceability.md`: every requirement in this document with status `Implemented / Partial / Missing / Unknown / Deferred`, supporting file paths, test references, priority and dependency.
3. `docs/handoff/02-target-architecture.md`: diagrams for control, execution and observability planes, domain boundaries, data flows, security boundaries, deployment and disaster recovery.
4. `docs/handoff/03-delivery-plan.md`: sequenced milestones, dependency graph, migrations, test strategy, acceptance gates, rollback plan and realistic estimates.
5. `docs/handoff/04-design-system.md`: screen inventory, navigation, component catalog, interaction standards and responsive behavior.
6. `docs/handoff/05-risk-register.md`: prioritized security, integrity, architectural, cost and delivery risks with mitigations.

Do not infer completed features from filenames or earlier assistant claims. Verify actual code and behavior. If something in this document conflicts with working code or another specification, record an ADR and seek approval for a disruptive change; otherwise preserve the verified architecture.

---

## 1. Product mission and principles

ArchitectIQ is a unified, multi-tenant, enterprise-grade platform for designing, governing, deploying, running, observing and improving deterministic automations, API integrations, document intelligence, AI agents and hybrid workflows with human approvals. It must support developers, analysts, business users, operations, support, security, platform administrators and executives through one coherent product rather than disconnected demos.

Principles:
- Security, tenant isolation and auditability by design; least privilege and explicit authorization at every service boundary.
- Deterministic execution for business rules and transactional operations; AI proposes, classifies, summarizes or assists but does not silently change approved rules.
- Human-in-the-loop for consequential, irreversible, policy-sensitive and low-confidence decisions.
- Reusable, versioned components, connectors, agents, prompts, models, document schemas, workflows and templates.
- Enterprise hierarchy, environments and governance visible consistently throughout the UI.
- Low-code/no-code visual authoring with extensibility for code-first developers.
- Production-grade performance, observability, reliability, cost control and accessibility.
- Platform independence: cloud, on-premises and hybrid deployment where technically feasible.
- No mock data in features declared complete; demos and fixtures must be explicitly labeled.

## 2. Existing implementation — confirmed baseline versus unknowns

### Verified or reported as established
- Monorepo with `apps/api` FastAPI/Python backend, `apps/web-studio` Vite/React/TypeScript frontend, Docker infrastructure.
- PostgreSQL 17 and Redis 7 local services; Python 3.12.15 virtual environment.
- Frontend libraries include React Flow (`@xyflow/react`), ECharts, ELK.js, React Grid Layout, Lucide and TanStack Query.
- Backend uses SQLAlchemy, psycopg, Alembic, Redis and httpx.
- Existing tenant authorization, PostgreSQL RLS-oriented restricted runtime role, separate privileged and audit access patterns, request audit middleware, workspace CRUD/tree/move/activity, and organization-level environment work.
- Key files reported: `apps/api/main.py`, `database.py`, `authentication.py`, `models.py`, `workspace.py`, Alembic migration `e7b42c91a603_organization_environments.py`, and `apps/web-studio/src/WorkspaceLive.tsx`.
- Existing WorkspaceLive UI reportedly includes tree, drag/drop, create/rename, activity and placeholders such as Access, Jobs and Triggers. Confirm actual behavior.
- M3.1 baseline commit `b47e7d5` and 43 passing tests against `architectiq_test` on 25 October 2026. The warning concerns Starlette TestClient/httpx; it is not a failing test.

### Not established as complete
M4 project-level RBAC, lifecycle management, Access UI, project environments, complete workflow designer, execution engine, agents, document intelligence, production dashboards, connectors, billing, CI/CD, deployment and the other product capabilities in this handoff. Verify each. A previous Claude Code run modified `workspace.py` with an empty `validate_tenant_ownership` function and created `fix_workspace_activity_audit.py` and `SECURITY_AUDIT.md`; the latest recovery instructions were provided but **execution of recovery has not been confirmed**. Inspect before changing anything. Preserve all other untracked backup and specification files.

## 3. Tenant, organization, workspace and project hierarchy

### 3.1 Canonical hierarchy
`Tenant → Organization → Folder(s) → Project → Project Components`, with governed environments independently selectable. Nested folders should be supported; prevent cycles. A project can contain workflows, agents, document AI projects, integrations, data assets, templates, jobs, schedules, approvals, dashboards and deployment artifacts. Define canonical resource IDs, parent-child relationships, ownership, metadata, audit history and consistent URLs.

### 3.2 Workspace features
- Create, read, rename, move, archive, restore and (governed) delete tenants/orgs/folders/projects where authorized.
- Folder nesting and project move with atomic authorization, tenant boundary checks and conflict detection.
- Drag-and-drop tree, context/right-click menu, breadcrumbs, favorites, recently opened, pinned items, search, filtering, sorting and bulk actions.
- Tree virtualization for large organizations; lazy loading, pagination and accessible keyboard navigation.
- Project templates, clone, import/export and onboarding wizard.
- Project metadata: name, description, owner, tags, domain, business unit, criticality, data classification, cost center, lifecycle status, retention, timestamps and SLA.
- Project-level settings and access; project summary/activity; dependencies, linked resources and usage metrics.
- Archive/restore semantics, soft delete, retention, legal hold and reversible operations.
- Concurrency/version checks, uniqueness constraints and useful validation messages.

### 3.3 Environments
- Governed organization-level environments: DEV, TEST, UAT, PROD, extensible with policy approval.
- Environment selection must be independent of workspace hierarchy and remain visible in the shell.
- Per-project environment bindings/configuration and resource overrides, without confusing organization-level environments with a duplicate project-environment catalog.
- Promotion DEV→TEST→UAT→PROD with approvals, release evidence, configuration drift detection, secrets references and rollback.
- Environment-specific credentials, queues, schedules, endpoints, compute policies, model routes and feature flags.

## 4. Identity, access management and security

### 4.1 Identity
- Existing authentication retained and hardened incrementally; support enterprise SSO via OIDC/SAML as planned, native accounts where appropriate, MFA/passkeys, sessions, refresh/revocation and service identities.
- Tenant membership and organization membership separate from project membership.
- Role taxonomy with least-privilege baseline: tenant/platform admin, organization admin, project owner/admin/editor/viewer, operator, approver, auditor and support roles; exact permissions must be specified in a matrix.
- RBAC with optional scoped attributes/policies for sensitive actions, inheritance with explicit precedence and default deny.
- Users, groups/teams, invitations, deactivation, access requests, approval workflows and periodic access reviews.
- Never infer tenant access solely from a user-supplied `tenant_id` path parameter.

### 4.2 M4.1 project access management — immediate priority
- Project memberships and role assignments; tenant-consistent foreign keys/constraints; one canonical role evaluation service.
- Inherited access from org/folder where policy permits, direct project overrides with defined precedence and deny semantics.
- Authenticated APIs: list/add/change/remove members; effective permissions; access requests and membership history.
- Prevent privilege escalation, cross-tenant assignment, self-escalation, last-owner removal and unauthorized role administration.
- Functional Access tab with real data, member search, role selector, confirmation, loading/error/empty states and audit trail.
- Tests for all roles, tenant boundaries, inherited permissions, unauthorized calls, last owner, missing session context and RLS enforcement.

### 4.3 Security controls
- PostgreSQL RLS on tenant-owned tables; transaction-scoped tenant context; restricted runtime role; separate privileged migration and audit roles.
- Consistent authorization at API, service, worker, tool and resource layers; service-to-service identity.
- Encrypt in transit/at rest; external secrets manager integration (e.g. CyberArk), secret rotation, no plaintext secrets in DB/logs/UI.
- PII detection, classification, masking, redaction, retention, residency, deletion requests, consent and export controls.
- Audit records for authentication, membership, configuration, workflow edits, model changes, execution, approvals, promotions and data access; immutable/tamper-evident strategy.
- Request audit fields: tenant, actor, correlation ID, timestamp, method, normalized route, status, duration and sanitized error; distinguish request audit from business/activity audit.
- Threat modeling, input validation, SSRF protection for connectors, prompt injection controls, output validation, rate limits, CSRF/CORS/security headers, dependency scanning, SBOM, signed artifacts and vulnerability response.
- Segregation of duties and dual approval for high-risk production changes; tenant-aware support access with justification and expiration.
- Never assert a cross-tenant audit vulnerability without reproducing it in tests and tracing read/write authorization and RLS.

## 5. Six primary workspaces and full navigation

**Frozen baseline top-level workspaces:** `Dashboard`, `Configure`, `Test`, `Run`, `Support`, `Master Setup` (Master Setup restricted to administrators). Hierarchy and independent environment selection must remain visible across workspaces. Integrations can be exposed contextually or as a governed module, but must not silently replace the agreed navigation.

### 5.1 Dashboard
- Executive/project overview, health, throughput, business KPIs, savings, FTE capacity, success/failure rates, backlog, SLA, approvals, agent/model performance, cost, alerts and trends.
- User/project/org/tenant drill-downs, date filters, environment comparison, saved views, export and access-controlled metrics.

### 5.2 Configure
- Process/workflow designer; agent designer; Document AI; forms; human tasks; business rules; variables, data/knowledge, connectors, queues, triggers, schedules, reusable components, policies, credentials references, templates, deployment packages and settings.

### 5.3 Test
- Test cases and suites, workflow simulation, document evaluation, agent evaluation, integration tests, mock/stub connectors, replay, debugging, step-through, breakpoints, trace inspection, coverage, benchmark, load tests, policy tests and release gates.

### 5.4 Run
- Published processes/agents, jobs, queues, transactions, schedules, triggers, robots/workers, runtime environments, approvals, retry/dead-letter handling, incidents, deployment history and operational controls.

### 5.5 Support
- Fleet/platform health, alerts, logs, traces, metrics, audit, incident/problem management, SLA risk, runbooks, diagnostic packages, capacity recommendations, cost analytics, user/project usage, knowledge base and support dashboards.

### 5.6 Master Setup (admin only)
- Tenants, organizations, identity, users, groups, RBAC/policies, environments, infrastructure, workers, connectors, credentials vault integration, model registry/gateway, quotas, retention, approvals, governance, licensing, billing/chargeback, feature flags, integrations, security configuration and platform audit.

### 5.7 Common UX
- Modern, restrained enterprise visual design; avoid generic AI-generated aesthetics and excessive clutter.
- Consistent global header, hierarchy/breadcrumb, independent environment selector, search/command palette, notifications, help, profile and role-aware menus.
- Consistent table/grid, canvas, inspector, drawer, wizard, modal, detail page and dashboard patterns.
- Context/right-click menus, drag/drop with keyboard alternatives, undo for safe actions, destructive-action confirmation and informative progress.
- Responsive layout, WCAG 2.2 AA target, localization-ready dates/numbers, dark/light theme, high-density views, keyboard shortcuts and screen reader support.
- Standard loading/skeleton/empty/error states, toast feedback, optimistic updates only when safe, unsaved-change warnings and no dead controls.
- User has previously discussed a 20-module UI catalogue and UI-01–UI-07 sequence. **Find the original navigation specification in the repository or attached notes and reconcile every named module against this section; do not invent exact titles for the missing catalogue.**

## 6. Workflow/process automation designer

- React Flow-based canvas with drag/drop palette, search, minimap, zoom, pan, auto-layout (ELK), smart edge routing, nested subflows, swimlanes/groups and reusable templates.
- Node types: start/end, trigger, action, API, queue, data transform, conditional branch, loop, parallel/fork/join, wait/timer, event, exception/retry, human approval, AI agent, document processing, business rule, subflow and notification.
- Palette → canvas → inspector pattern; inspector tabs for properties, variables, mapping, validation and advanced configuration.
- Typed variables, scopes, input/output schemas, expression editor, JSON mapping, schema validation, secret references and reusable configuration.
- Canonical versioned workflow definition (`id`, `name`, `nodes`, `edges`, `variables`, `version`, `environment`, metadata, policies); server-side validation, migration and schema versioning.
- Draft/save/autosave, version diff, branching, review/approval, publish, rollback and reusable component references.
- Deterministic runtime interpretation; explicit retry/backoff/idempotency, timeouts, compensating transactions and error boundaries.
- Debugging: run history, step execution, replay scrubber, variable inspection, breakpoint, trace and logs correlated to nodes.
- AI-assisted flow generation may propose drafts but cannot publish or change production without validation and approval.
- Desktop/web automation and selectors may be future extensible worker capabilities; define isolation, permission and platform support before claiming availability.

## 7. AI agents, orchestration and model governance

- Agent catalog, agent builder, roles/instructions, tools, memory/state, model selection, knowledge retrieval, evaluation and versioning.
- Support direct model calls, deterministic chains, stateful graphs (LangGraph-style), multi-agent orchestration and MCP/tool integration where warranted by requirements—not multi-agent by default.
- Agent/tool registry with contracts, auth, scopes, allowlists, sandbox, input/output validation and policy gates.
- Model gateway with providers such as Azure/OpenAI, Google Vertex AI, Anthropic and approved local models (e.g. Ollama), subject to connector availability and license.
- Central configuration by tenant/project/environment; approved model routing, rate limits, token/cost budgets, fallback models **only after equivalent evaluation**, circuit breakers and queuing.
- Prompt registry, templates, versioning, injection defense, data minimization, safety policies and PII handling.
- RAG: source ingestion, parsing, chunking, embedding, vector indexing, ACL-aware retrieval, citations, freshness, reindexing and deletion propagation.
- Agent evaluation: golden datasets, accuracy, task completion, groundedness, hallucination, latency, token consumption, cost, tool correctness and adversarial tests.
- Approval checkpoint binds exact action, arguments, actor, evidence, expiration and resumption token; durable waits must survive restart.
- Trace model/tool/agent invocations with correlation IDs and protected payload sampling; dashboards show live/running/waiting/failed agents and costs.
- No fictional LLM 'confidence score' as a universal certainty measure; use calibrated task-specific quality/validation thresholds and risk rules.

## 8. Document AI / intelligent document processing

- Hierarchy: folder → Document AI project → classification/page segmentation → extraction → training → validation → publishing → runtime learning.
- Lifecycle: Draft → Classification Ready → Extraction Ready → Training → Validation → UAT → Published → Runtime Learning, with explicit transition criteria.
- Ingestion: uploads, API, batch, queue, email/integration as configured; PDF/images and supported office documents; antivirus, file limits, encryption and metadata.
- OCR and page rendering with PDF.js and/or equivalent UI tooling; backend OCR engines/provider adapters; preserve original documents and provenance.
- Classification: document types, bundles, page splitting/segmentation, predictive and human classification, confidence thresholds and exception routing.
- Extraction: fields, nested structures, tables, line items, checkboxes, signatures, entities, coordinates, multi-page spans and validation rules.
- Training: labeling/annotation UI, dataset versions, train/validation/test splits, model version registry, training jobs and evaluation.
- Human validation queue: image/PDF viewer, bounding boxes, field edits, review assignment, sampling, escalation, audit and SLA.
- Publish: immutable model/schema package, approval, environment promotion, rollback and impact simulation before disabling fields or models.
- Runtime: batch jobs, document status, confidence distributions, STP rates, exceptions, corrections, drift, active learning and cost.
- Ensure project/model/annotation permissions and tenant isolation; protect sensitive source documents.
- Earlier exploratory designs mentioned Next.js/Prisma and Konva; **do not replace the current Vite/FastAPI/SQLAlchemy stack merely to match an old proposal**. Port UI concepts into the established architecture.

## 9. Business rules, decisioning and approvals

- Central rule registry with typed inputs, deterministic expressions/decision tables, versioning, tests, owners and effective dates.
- SOP/policy change workflow: AI analyzes a revised SOP and proposes differences; authorized reviewers approve changes; **only then** are approved deterministic rules published to the rule engine.
- Runtime transactions are evaluated against the approved deterministic rules; AI does not invent commission/payment/claims rules per transaction.
- Simulation and impact analysis before deployment; explainability, reproducibility, traceable rule versions and rollback.
- Human tasks: inbox, assignment, delegation, SLA, escalation, expiration, approval/rejection/return, comments, evidence and full audit.
- Approval forms/UI, notification adapters, durable workflow checkpoints and resumption after long waits.
- Segregation of duties, maker/checker and dual authorization for production/high-risk changes.

## 10. Execution engine, queues and transactions

- Control plane stores definitions, policies, identity, schedules, approvals and deployment configuration.
- Execution plane runs workers/robots, workflows, agents, document processors, API calls and tools under least privilege.
- Observability plane ingests execution events, metrics, traces, logs, business KPIs and cost.
- Persistent job orchestration with durable state, retries, backoff, timeouts, idempotency keys, cancellation, pause/resume, checkpoint/replay and compensating actions.
- Redis may support transient coordination/cache; PostgreSQL is system of record. Do not treat Redis-only queue state as sufficient for critical durable transactions.
- Queue definitions, priorities, partitions, leasing, visibility timeout, concurrency, rate limits, dead-letter queues, replay and per-item status.
- Parent transaction → subtransactions with correlation, dependencies, checkpoints, reconciliation, EOD controls and immutable history.
- Triggers: manual, schedule/cron, webhook, API, queue/event, file arrival and business events.
- Workers: registration, capabilities, pools, tenancy, health, heartbeat, scaling, credential scope, maintenance and failover.
- Capacity planner: forecast based on throughput, service time, backlog, SLA and worker availability; explain recommended capacity.
- Runtime operational dashboard: active/queued/completed/failed/waiting jobs, per-project metrics, exception categories and drill-down traces.
- Evaluate durable orchestration technology (Temporal, BullMQ or equivalent) through ADR based on actual workload; do not introduce Kafka/Temporal solely for architectural appearance.

## 11. Data, knowledge, integrations and reusable components

- Connection catalog: REST/GraphQL/SOAP, databases, files/SFTP, cloud storage, email, messaging, ERP/CRM, event brokers and enterprise systems as prioritized.
- Connector lifecycle: registration, OAuth/service credentials, scopes, schema discovery, test connection, retry, rate limit, versioning and secret references.
- API/MCP tool registry with contract tests, sandbox, least privilege and environment bindings.
- Data pipelines: ingestion, mapping, transforms, validation, lineage, quality, reconciliation and retention.
- Knowledge bases: document sources, connectors, indexing, vector retrieval, access controls, freshness and provenance.
- Component marketplace/library: reusable workflows, subflows, agents, prompts, rules, connectors, forms, document schemas and dashboards; ownership, semver, dependency graph, approvals and deprecation.
- Template gallery with enterprise patterns, project starters, sample data clearly marked as samples, versioned import/export and compatibility checks.

## 12. Observability, dashboards and support operations

- OpenTelemetry-style traces, structured logs, metrics, events, request IDs, tenant/project/workflow/job/transaction/agent IDs.
- Dashboard layers: executive, tenant, organization, project, environment, process, agent, document, queue, worker and infrastructure.
- Metrics: throughput, STP, business outcomes, FTE capacity, backlog, SLA attainment/risk, latency, availability, failure/retry rates, model tokens/cost, infrastructure consumption, approval aging and exceptions.
- Alerts: thresholds, anomaly detection, deduplication, routing, escalation, acknowledgment and runbooks.
- Operations: incident timeline, job drill-down, retry/requeue with permissions, root cause evidence, replay and health checks.
- Support dashboard, audit viewer, capacity recommendation, model drift, quality, usage, chargeback/showback and cost budgets.
- Data minimization and retention controls for traces/logs; no plaintext secrets or unrestricted PII.

## 13. Governance, compliance, enterprise administration

- Policy engine for tenant/org/project/environment and resource-level controls.
- Master Setup configuration approval, audit, versioning and rollback.
- Data governance: classification, retention, residency, lineage, masking, legal hold and export/deletion.
- Responsible AI governance: model inventory, approved use cases, risk tiering, evaluation evidence, human oversight, change approvals, drift review and incident handling.
- Business continuity: backups, restore tests, RPO/RTO targets, HA/DR, multi-region strategy as appropriate, dependency failure modes.
- License/entitlement, quotas, usage metering, cost centers, budget alerts, chargeback and subscription administration as commercial roadmap items.
- Multi-tenant isolation test suite and auditability of all privileged actions.

## 14. Backend, data and API architecture

- Preserve FastAPI + SQLAlchemy + Alembic + PostgreSQL + Redis foundation unless a documented ADR proves a change is required.
- Domain modules should isolate IAM, workspace, projects, workflow definitions, executions, queues, approvals, agents, models, documents, integrations, telemetry and administration.
- Versioned API conventions, OpenAPI schemas, validation, pagination, filtering, idempotency, error envelopes, correlation IDs and backward compatibility.
- Schema migrations are additive/forward-only; migration test on empty and existing `architectiq_test` schemas; no editing applied historical migrations.
- PostgreSQL transactional integrity, foreign keys, constraints, indexes, optimistic locking, RLS, audit and retention.
- Object storage for large documents/artifacts; vector store strategy for retrieval; telemetry store strategy based on volume and retention. Use provider-neutral interfaces and do not provision paid services without approval.
- Background worker separation, durable job state and transactional outbox for critical event publication.
- Async where useful, but concurrency is based on resource budgets and throughput, not one pod per request.

## 15. Frontend architecture and visual standards

- Preserve existing Vite + React + TypeScript frontend and established dependencies. Do not silently migrate to Next.js.
- App shell: navigation, tenant/org/folder/project context, independent environment selector, global search, alerts, help and account controls.
- Typed API client, query caching, error boundaries, permission-aware routes/actions, state isolation and optimistic concurrency.
- Visual builder using React Flow, layout using ELK, dashboards using ECharts, draggable panels/grids where appropriate.
- Shared design tokens (spacing, typography, color, elevation, motion), component library, accessibility, keyboard and touch behaviors.
- Complex screens require explicit interaction specs, not just attractive screenshots. Every visible control must work or be visibly marked planned/disabled.
- Frontend tests for core interactions, integration tests against API, E2E journeys for onboarding, project access, design/test/deploy/run/support.

## 16. Deployment, infrastructure and developer experience

- Local developer bootstrap with Docker Compose, health checks, reproducible dependency installs, test DB isolation and seed fixtures.
- CI: format/lint, type checking, unit/integration/security tests, migration checks, frontend build, dependency/license scans and artifact generation.
- CD: artifact signing, environment promotion, approval gates, rollback, configuration validation and release notes.
- Containerized services with readiness/liveness, resource limits, secrets, networking and least privilege; Kubernetes/cloud deployment only when justified and approved.
- Support Azure/GCP/AWS/on-prem/hybrid through deployment profiles, not simultaneously hardwired vendor dependencies.
- Backup/restore drills, monitoring, incident response, SLOs, load/performance testing and capacity planning.
- Documentation: setup, architecture, API, runbooks, threat model, data model, deployment, operations, contribution guide and ADRs.
- No automatic cloud spending, external model calls or third-party data transfer without authorization.

## 17. Functional requirements catalog and suggested priorities

Priority meanings: P0 foundation/security and immediate M4; P1 core marketable workflows; P2 advanced enterprise/scale; P3 optional ecosystem/commercial expansion. These are planning priorities, not claims of existing delivery.

| ID | Domain | Requirement | Priority |
|---|---|---|---|
| WS-01 | Workspace | Canonical tenant/org/folder/project hierarchy and tree | P0 |
| WS-02 | Workspace | Project lifecycle, metadata, archive/restore | P0 |
| WS-03 | Workspace | Move, drag/drop, search, context menus, favorites | P1 |
| WS-04 | Workspace | Templates, clone, import/export, bulk operations | P1 |
| ENV-01 | Environment | Organization environment governance | P0 |
| ENV-02 | Environment | Per-project environment bindings and promotion | P0 |
| IAM-01 | IAM | Tenant/org/project role model and permission matrix | P0 |
| IAM-02 | IAM | Project membership and effective permissions | P0 |
| IAM-03 | IAM | Access Management APIs and UI | P0 |
| IAM-04 | IAM | SSO/MFA/service identities/access review | P1 |
| SEC-01 | Security | RLS, least privilege, tenant isolation tests | P0 |
| SEC-02 | Security | Audits, secrets, PII, approval safeguards | P0 |
| UI-01 | UX | Six workspaces, shell, hierarchy, environment selector | P0 |
| UI-02 | UX | Full module catalogue, functional menus and design system | P1 |
| WF-01 | Workflow | Visual canvas, node library, properties/variables | P1 |
| WF-02 | Workflow | Versioned definition, validation, templates | P1 |
| WF-03 | Workflow | Simulation, debugging, testing, publish | P1 |
| EXE-01 | Runtime | Durable execution, jobs, queues, subtransactions | P1 |
| EXE-02 | Runtime | Triggers, schedules, workers, retries, SLA | P1 |
| HITL-01 | Approval | Durable human tasks, inbox, escalation, audit | P1 |
| RULE-01 | Rules | Approved deterministic rule engine and SOP changes | P1 |
| AG-01 | Agent | Agent registry, orchestration, tools and model gateway | P1 |
| AG-02 | Agent | Evaluation, governance, budgets, fallback | P1 |
| DOC-01 | Document AI | Ingestion, classification, segmentation, extraction | P1 |
| DOC-02 | Document AI | Annotation, training, validation, publish/runtime | P1 |
| INT-01 | Integration | Connectors, credential references, tool registry | P1 |
| OBS-01 | Observability | Logs, metrics, traces, activity, alerts, dashboards | P1 |
| SUP-01 | Support | Incident/runbook/capacity/SLA operational console | P2 |
| GOV-01 | Governance | Responsible AI, retention, access reviews, compliance | P1 |
| OPS-01 | DevOps | CI/CD, migration safety, rollback, deployment | P0 |
| OPS-02 | Reliability | HA/DR, load tests, performance and cost controls | P2 |
| COM-01 | Commercial | Metering, licensing, chargeback/marketplace | P3 |

## 18. Delivery roadmap and stage gates

### Stage 0 — Recovery and truthful inventory (mandatory)
- Confirm current branch/commit and inspect untracked artifacts; back up the working tree safely.
- Determine whether failed Claude changes remain in `workspace.py`; remove only confirmed failed changes with explicit approval.
- Validate config without revealing secrets, run 43 baseline API tests on `architectiq_test`, build/lint frontend, inspect migrations and test DB roles.
- Produce repository inventory, traceability matrix, risk register and prioritized backlog.
- **Gate:** cleanly understood baseline and no unintended source edits.

### M4.1 — Project membership and RBAC
- Data model, new migration, permission service, member APIs, Access tab, audit, cross-tenant/privilege escalation tests.
- **Gate:** 43 existing tests plus new security tests; functional UI and migration verified.

### M4.2 — Project lifecycle and metadata
- Metadata schema/API/UI, archive/restore, ownership transitions, soft-delete/retention, search/filter, lifecycle audit.
- **Gate:** lifecycle tests and reversible data changes.

### M4.3 — Environment bindings and release governance
- Project/environment settings, policies, secrets references, promotion/approval history, rollback semantics.
- **Gate:** cross-environment isolation and authorization tests.

### M4.4 — Enterprise workspace UX
- Fully operational tree/context menus, drag/drop, breadcrumbs, project summary, favorites, search, templates and polished Access/Settings interactions.
- **Gate:** accessible E2E workspace journeys; no placeholder controls declared complete.

### M4.5 — Governance, integration and milestone stabilization
- Consolidated permission matrix, audits, test coverage, performance, migration rehearsals, documentation, frontend quality and release readiness.
- **Gate:** end-to-end M4 acceptance evidence and tagged verified baseline.

### M5 — Workflow design and versioning
- Canonical workflow schema, visual designer, inspector, reusable nodes/subflows, validation, drafts and release packages.

### M6 — Execution and orchestration
- Jobs, durable queues, subtransactions, workers, triggers, schedules, retry/replay, SLAs and operations console.

### M7 — Human approvals and deterministic rules
- Inbox, forms, durable approval waits, escalation, SOP change approval and versioned rule engine.

### M8 — AI agents and model gateway
- Agent registry/designer, orchestration, tools/MCP, prompt/model governance, RAG, evaluation, token/cost observability.

### M9 — Document AI lifecycle
- Ingestion, classification, segmentation, extraction, labeling, training, validation, publishing and runtime learning.

### M10 — Enterprise integrations and reusable marketplace
- Connector catalog, secrets integration, data/knowledge management, templates and versioned shared components.

### M11 — Observability, dashboards and Support
- Comprehensive dashboards, telemetry, alerts, incident response, capacity and cost management.

### M12 — Enterprise hardening and release
- Security assessment, penetration tests, compliance, CI/CD, backup/restore, HA/DR, scalability, accessibility, documentation and deployment packaging.

Milestone names M5–M12 are **proposed planning labels** for the handoff, not evidence that earlier planning assigned those exact numbers. Antigravity must reconcile them with any authoritative roadmap in the repo.

## 19. Testing and acceptance strategy

Testing layers: static analysis/type checks, unit tests, API contract tests, database integration/RLS tests, migration upgrade tests, frontend component tests, browser E2E, load/performance, fault injection, security and backup/restore.

Mandatory cross-cutting scenarios:
1. Tenant A cannot read, mutate or infer Tenant B data via path IDs, searches, activity logs, files, queues, agents or tool calls.
2. A project viewer cannot modify workflows, permissions, deployments or secrets.
3. Editors cannot grant themselves elevated privileges; admins cannot violate owner or policy constraints.
4. The last owner cannot be removed without an approved ownership-transfer mechanism.
5. A user denied access to a resource cannot retrieve it through inherited permissions, API, export, websocket, background job or RAG retrieval.
6. All mutating operations produce appropriate audit records and correlation IDs without secrets.
7. Environment promotion requires the correct role, validated artifact, policy and approvals.
8. A workflow crash/restart does not duplicate a payment or lose a durable approval state.
9. A failed model/tool call respects timeout, fallback evaluation, retry limits and cost budget.
10. Document validation edits are versioned and reviewable; published versions are reproducible.
11. PII masking and retention apply to runtime data, telemetry, document previews and exports.
12. All UI controls, empty/error states, keyboard interactions and critical E2E journeys are exercised.

Every completed feature must include: requirement IDs, implementation files, migration status, automated tests, actual commands and outputs, UI evidence, security considerations, limitations, local commit SHA and rollback steps. A passing existing suite alone does not certify new functionality.

## 20. Engineering workflow and reporting contract

For each slice:
1. Read relevant code and specifications.
2. State exact files to change, dependencies, data changes and acceptance tests.
3. Write failing tests first where practical.
4. Implement minimal cohesive changes, without unrelated refactoring.
5. Run targeted tests and full regression suite; run frontend lint/typecheck/build when affected.
6. Review Git diff, secrets, migrations and tenant isolation.
7. Produce a concise report: done/not done, evidence, risks and next action.
8. Create a local commit only after tests pass and user-approved scope is satisfied.

**Stop and request explicit approval** for: changing core auth/database architecture; deleting or renaming existing resources; migration against any non-test DB; replacing frontend framework; deploying/pushing/merging; spending money or calling paid cloud/model APIs; transmitting proprietary data externally; changing tenant isolation/RLS model; modifying historical migrations; bulk cleanup.

## 21. Definition of done — product level

ArchitectIQ is not complete merely because a UI renders. A production-ready release must support authenticated tenant onboarding, governed workspace/project access, workflow design/versioning, deterministic execution and queue management, approved AI/agent use, document processing lifecycle, human approvals, integrations, monitoring/support, secure deployment and recoverability. Every critical journey must be demonstrable with real APIs and persisted state, security and load tests, operational runbooks and an approved release checklist.

## 22. Immediate instruction to start Antigravity

> Open the existing ArchitectIQ repository at `C:\Users\rathe\Documents\Projects\ArchitectIQ`. Treat `b47e7d5` as the last verified M3.1 baseline, not as proof that the current working tree is clean. Do not generate a new application. Read this entire handoff and the existing repository documentation, especially `ArchitectIQ_M4_Overnight_Claude_Code.md` and the enterprise UI navigation notes. First perform **Stage 0**: inventory actual code, status, migrations, tests, untracked files and the failed Claude audit patch; produce the six mandatory handoff reports. Do not edit source code during Stage 0. Verify that the API regression suite targets only `architectiq_test`. Report discrepancies between this handoff and repository reality. Then present the M4.1 implementation plan with exact files, schema, permission matrix, tests and rollback, and wait for approval before modifying source code. Never claim untested work is complete.

---

## 23. Open decisions that must be resolved explicitly, not guessed

- Exact role hierarchy and inheritance precedence across tenant/org/folder/project.
- Whether environment roles are separate from project roles, and the policy governing production promotion.
- Canonical workspace/project folder nesting rules and naming uniqueness scope.
- SSO providers and native authentication long-term policy.
- Preferred durable workflow engine and queue technology after evaluating workload and existing code.
- Initial cloud/on-prem deployment target, RPO/RTO and performance SLOs.
- Model gateway providers, local model hardware constraints and data residency policy.
- Document OCR/model training providers, annotation tooling and dataset retention.
- First production connectors and required integration credentials.
- Full exact 20-module navigation catalogue and UI-01–UI-07 sequence from the existing UI specification.
- Commercial licensing/marketplace scope and first release target.

These are open decisions, **not missing permission to inventory and plan**. Antigravity should surface them with recommendations and consequences, but should not silently impose a new stack or architectural direction.
