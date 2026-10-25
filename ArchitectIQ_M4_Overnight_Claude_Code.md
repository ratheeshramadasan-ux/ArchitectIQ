# ArchitectIQ M4.0 — Overnight Claude Code Execution Contract

## Mission
Implement a substantial, integrated, secure Enterprise Workspace, Project Management, and Governance milestone in the existing ArchitectIQ repository. Work autonomously overnight on `feature/m40-workspace-management` starting from verified M3.1 commit `b47e7d5`. Deliver working FastAPI APIs, PostgreSQL migrations, React/TypeScript UI, automated tests, documentation, and reviewable commits. Favor coherent end-to-end vertical slices over disconnected scaffolding.

## Hard safety constraints
1. **Never modify, migrate, reset, seed, truncate, or connect for writes to `architectiq_dev` or any production database.** Only `architectiq_test` may be migrated and used for tests. Fail closed if the effective database name is not exactly `architectiq_test` for migration/test operations.
2. Preserve M3.1 tenant isolation, RLS, restricted runtime identity (`architectiq_app`), audit-writer INSERT-only access, IAM isolation, and authenticated tenant-scoped sessions. No admin DB dependency in tenant-facing endpoints. Never use BYPASSRLS, superuser, disable RLS, or broad grants to solve application failures.
3. Preserve the verified baseline; do not amend or reset it. Work only on `feature/m40-workspace-management`; do not merge to `main`, force push, change remotes, or create releases. Local commits are allowed; do not push unless specifically authorized.
4. Preserve untracked user files, reports, backups, model files, and local configurations. Do not run `git clean`, broad `git add .`, destructive file operations, or indiscriminate deletion. Stage exact source, tests, migrations and documentation paths; exclude `.bak`, temporary reports, credentials, `.env`, caches, model weights, and diagnostic scripts.
5. Do not overwrite or rotate credentials, access external paid APIs, download large models, deploy services, or install privileged system components. Do not assume secrets are available.
6. Migrations must be additive and data-preserving; no destructive downgrade. Inspect Alembic head(s), existing tables, indexes, triggers, grants, RLS policies, and code before writing migrations. Do not modify already-applied migration files.
7. Authorization is server-side. UI hiding is not a security control. Deny by default; validate tenant membership and scope on every operation. Avoid existence disclosure across tenants.
8. Every operation should be idempotent where appropriate, concurrency-safe, auditable, and return structured errors. Never fake execution data or success statuses.
9. If blocked, record exact blocker and continue independent work. Never silently mark incomplete work as done.

## Preflight: inspect, inventory, and baseline
- Confirm branch and HEAD; capture `git status --short`, staged/untracked state, package manifests, Python/Node versions, test commands, migration heads, and DB connection configuration without printing secrets.
- Inspect `apps/api/workspace.py`, `authentication.py`, `native_auth.py`, `tenant_discovery.py`, `database.py`, `models.py`, `settings.py`, request audit middleware, migrations, existing tests, `apps/web-studio/src/WorkspaceLive.tsx`, `App.tsx`, CSS, and package scripts.
- Map actual schema and security: tenant memberships, org/folder/project ownership, organization environments and environment folders, legacy project environments, activity triggers, database roles and grants, RLS policy dependencies.
- Establish test baseline; do not alter development DB. Record baseline and final test results.
- Produce `docs/milestones/M4_SCOPE_AND_GAP_ANALYSIS.md` with actual vs proposed, architectural decisions, dependency map and exclusions.

## Architectural invariants
- Existing hierarchy: Tenant -> Organization -> Development Folder (nested) -> Project. Organization environments (DEV/TEST/UAT/PROD) are separate environment-scoped resources. `project_environments` is legacy and must not be reintroduced as an active competing model.
- Keep existing API routes backward-compatible unless a documented safe versioning strategy is implemented. Deprecated project-environment endpoint may retain 410 with dead code removed.
- Use tenant-scoped PostgreSQL sessions and RLS as defense in depth, plus explicit application-level RBAC.
- Do not put sensitive tokens, PII, credentials, secret values or raw document contents into audit event payloads.
- Favor reusable domain services and API schemas over large monolithic route modules.
- Preserve the existing React shell, authentication, appearance settings, navigation and working explorer interactions.

## Deliverable A — Domain model, contracts, and migrations
Implement only genuinely missing tables/columns after inspection. Candidate entities:
- Project metadata: description, owner/maintainer references, lifecycle status, tags, classification, created/updated timestamps, optional business domain and cost center.
- Organization and project role assignments; permission policies with explicit scope, principal, role, status and inheritance rules. Avoid duplicate membership systems; extend existing tenant membership model.
- Resource lifecycle state and archive metadata (actor, timestamp, reason), without physically deleting dependent history.
- Environment governance: environment metadata, status, configuration metadata, deployment restrictions, promotion requirements; organization environment remains authoritative.
- Project/environment configuration: typed nonsecret settings, schema/version, validation and history; secrets represented by references only.
- Resource labels/tags and indexed search fields.
- Optional project templates and resource policy defaults only if they can be implemented end to end.
- Versioned audit/event records or extensions to existing workspace activity mechanism; prefer existing append-only audit infrastructure.
- Optional optimistic locking/version columns for conflicting updates.

For each schema change: write an additive Alembic migration; appropriate indexes, unique constraints, FKs, checks, tenant-safe composite relationships, RLS policies, least-privilege grants and tests. Ensure upgrades work against an existing populated test schema. Document forward-only rollback/compensation.

## Deliverable B — Secure authorization and membership
- Define permissions by resource and action: read, create, update, move, archive, restore, manage access, manage environment, manage settings, view audit, export metadata.
- Role set: Tenant Owner/Admin; Organization Admin; Project Owner/Maintainer/Developer/Reviewer/Viewer. Determine exact effective permissions and inheritance explicitly. Do not equate membership with full write access.
- Support role grants/revocations, membership list, effective permissions and permission explanations. Only authorized administrators can grant roles; block self-escalation and last-owner removal.
- Ensure organization/project scoping and inherited read-only access as appropriate; explicit deny behavior and safe revocation.
- Support active/suspended/revoked membership states; verify actor identity from authenticated principal, not user-submitted actor fields.
- Test cross-tenant, cross-organization, role escalation, expired/revoked sessions, missing resource, concurrent grant, and unauthorized audit access.
- Enforce RBAC on *existing* mutation endpoints too; do not only protect new endpoints.

## Deliverable C — Workspace and project APIs
- Maintain existing tenant-scoped `/api/v1/tenants/{tenant_id}/workspace` routes.
- Organization CRUD/update metadata, safe archive/restore and listing with pagination/filtering.
- Folder/subfolder create/rename/move/archive/restore, cycle prevention, same-organization constraints, hierarchy depth/size protections.
- Project create/update/rename/move, detail, owner, lifecycle (DRAFT, ACTIVE, SUSPENDED, ARCHIVED), restore, search, sorting, pagination, tags and classification.
- Organization environment list/create/detail/configure; ensure unique names and preserve DEV/TEST/UAT/PROD semantics. Environment folder hierarchy with same-environment parent validation and cycle protection.
- Workspace tree, breadcrumbs, resource detail, ancestors, descendant counts, summary metrics and server-side search.
- Access assignments, effective permissions, and change history endpoints.
- Resource audit/activity with filtering, pagination/cursors, consistent actor/timestamps and redaction.
- Structured errors (400/401/403/404/409/422), stable response schemas, API examples and OpenAPI correctness.
- Safe concurrency using transactions, locks where justified, uniqueness constraints and optimistic conflict handling.
- Avoid broad destructive cascades; archive before delete; physical deletion is out of scope by default.

## Deliverable D — Project lifecycle and governance
- State machine with explicit allowed transitions and authorized actors. Document when projects can be edited, deployed, archived and restored.
- Require reason and audit evidence for sensitive transitions and access changes.
- Guard archiving against active dependents when applicable; if runtime execution is not implemented, clearly state limitations rather than pretending to check.
- Support project metadata and ownership, classification, tags, naming policy and project defaults.
- Environment promotion policy data model and validation hooks, but do not implement a fake deployment engine.
- Approval *configuration* and governance rules may be included; actual long-running approval execution belongs to a future milestone unless a complete, tested subsystem is feasible.

## Deliverable E — React Workspace Studio
Implement real, responsive, accessible interfaces connected to the API:
- Workspace explorer: expandable tree, search, filters, breadcrumbs, selection persistence, keyboard navigation, loading/error/empty states, refresh.
- Context menus and action toolbars for create, rename, move, archive, restore, settings and access, gated by effective permissions.
- Drag/drop with validation, explicit confirmation for consequential moves, rollback on API failure, no optimistic false success.
- Project listing and detail: overview, metadata, status, ownership, tags, activity, access, settings and environment readiness.
- Environment administration: organization environments, environment folder tree, settings and policies; no confusing project-level environment duplication.
- Access management: list grants, invite/assign existing principals as supported by backend, change roles, revoke, effective permission explanation.
- Activity timeline with actor, action, resource, timestamp, filters and safe diff display.
- Settings screens for policies and configuration metadata, with clear validation and secret-reference-only display.
- Confirm dialogs, unsaved-change warnings, accessible labels, keyboard focus, mobile/responsive layouts, coherent styling with existing App shell.
- Remove or clearly label sample metrics, placeholder execution counts, fake workflows and mock operational charts. Preserve existing design system.
- Typed API client and TypeScript interfaces; centralize authorization/error handling; avoid embedding business logic in giant JSX components.

## Deliverable F — Search, discovery, templates and usability
- Tenant-isolated search across authorized organizations/folders/projects, with paging, filters and bounded result sets.
- Recently accessed and favorites may be added if identity/session persistence is available and implemented securely.
- Project templates: metadata-only templates for repeatable structure, with preview, validation and controlled application; do not copy secrets or runtime state.
- Bulk metadata operations only with per-resource authorization, dry-run preview, transaction boundaries and bounded batch sizes.
- Clear navigation links from dashboard to explorer, projects, environments, access and activity.

## Deliverable G — Observability, audit, and operational resilience
- Audit all meaningful resource changes and access decisions using the existing append-only model. Preserve audit-writer least privilege and avoid double logging.
- Request correlation IDs, structured application logs, error categorization, health checks and sanitized exception handling.
- Metrics for API latency, error rates, resource counts, denied actions and migration/test status; never invent runtime throughput metrics.
- Pagination and indexes for large tenants; avoid N+1 queries and unbounded recursive tree loads.
- Concurrency, timeout and transaction safety; document operational assumptions.
- Redact secrets/PII and avoid logging bearer tokens.

## Deliverable H — Test and quality gates
- Preserve all existing 43 M3.1 tests; run the entire backend suite and add substantial M4 coverage.
- Unit, API contract, DB integration, RLS, RBAC, cross-tenant isolation, hierarchy cycles, move races, lifecycle transitions, audit integrity, environment scoping and negative security tests.
- Test as least-privilege runtime role; do not use admin privileges to mask access defects.
- React: TypeScript typecheck, lint, production build and component/e2e tests if existing framework supports them; add appropriate tests where feasible without heavy dependencies.
- Confirm migration upgrade on `architectiq_test` and re-run idempotent smoke checks. Never migrate `architectiq_dev`.
- Verify OpenAPI schema generation and authenticated route behavior.
- CI workflow for lint/typecheck/tests/security checks where feasible; CI secrets must be injected, never committed.
- Record test counts, command outputs, failures, coverage limitations and warning classification. No fabricated pass results.

## Deliverable I — Documentation and handoff
Write:
- `docs/milestones/M4_SCOPE_AND_GAP_ANALYSIS.md`
- `docs/milestones/M4_ARCHITECTURE.md` with hierarchy, identity, permission matrix, sequence diagrams, ERD and threat model
- `docs/milestones/M4_API_CONTRACT.md`
- `docs/milestones/M4_MIGRATION_PLAN.md` with data safety and rollback/compensation
- `docs/milestones/M4_TEST_MATRIX.md`
- `docs/milestones/M4_IMPLEMENTATION_REPORT.md` with completed/partial/blocked work and exact evidence
- `docs/milestones/M4_OPERATOR_RUNBOOK.md` for local startup, tests, troubleshooting and controlled rollout
- Update root README only as appropriate, preserving existing content.

## Autonomous execution order
1. Preflight and inspect all existing code/schema; record baseline and inventory.
2. Write short implementation plan and explicit permission matrix.
3. Implement migrations + models + tenant-safe access service; test RLS and negative cases first.
4. Implement domain services and APIs with focused tests.
5. Implement React UI and typed API client integrated end to end.
6. Implement lifecycle, environment governance, search, activity and usability enhancements.
7. Add CI/docs and run complete verification.
8. Review `git diff`, inspect staged files for secrets/backups, make small descriptive commits per coherent slice.
9. Produce final report and stop. Do not push or merge unless explicitly instructed.

## Time/quality prioritization
P0 must work before P1 polish: tenant-safe RBAC; workspace CRUD and lifecycle; environment governance; real UI integration; audit; tests. P1: search, bulk actions, templates, advanced dashboard. P2: cosmetic polish and noncritical extensibility. If time runs short, deliver secure tested vertical slices and label remaining items explicitly; never bypass tests to claim completeness.

## Acceptance criteria
- Baseline tests still pass and new tests exercise authorization and tenant boundaries.
- All mutating endpoints require authenticated, scoped permissions; runtime identity remains least privileged.
- No writes to `architectiq_dev`; no destructive migration or deletion of user files.
- No competing environment architecture or duplicate resource source of truth.
- UI features correspond to real working APIs and reflect server-authorized capabilities.
- Audit records show meaningful actor/action/resource changes without secrets.
- TypeScript build and Python test suite succeed or blockers are precisely documented.
- Deliverables are committed locally on M4.0 branch, with clean staged state and preserved untracked files.
- Final report includes commit SHAs, files changed, migration IDs, test evidence, open risks, and exact next commands.

## Final response format for Claude Code
1. Executive status: COMPLETE / PARTIAL / BLOCKED (truthful).
2. Feature matrix: implemented, tested, deferred.
3. Security verification: tenant/RLS/RBAC/grants/audit and database safety.
4. Test commands and exact outcomes.
5. Migration details and whether applied to `architectiq_test`.
6. Local commits and changed files.
7. Outstanding blockers and prioritized next actions.
8. Explicit statement: `architectiq_dev` untouched, branch not merged, push not performed (or disclose any deviation).
