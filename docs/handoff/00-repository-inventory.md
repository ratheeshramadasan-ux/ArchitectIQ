# ArchitectIQ — Repository Inventory & Baseline Evaluation

**Date:** 25 October 2026  
**Evaluator:** Antigravity (Principal Architect, Security Reviewer & Delivery Lead)  
**Repository Working Copy:** `C:\Users\rathe\Documents\Projects\ArchitectIQ`  
**Verified Git Baseline:** `b47e7d5` (`test(security): finalize M3.1 isolation and audit verification`)  
**Active Working Branch:** `feature/m40-workspace-management`  

---

## 1. Executive Summary & Verification State

An exhaustive physical inventory was conducted across the backend (`apps/api`), frontend (`apps/web-studio`), infrastructure (`infrastructure/docker`), documentation, database schemas, and migration states.

### Core Verification Facts:
1. **API Regression Suite:** **43 tests passed** in 1.35s running against isolated test database `architectiq_test`. Zero test failures. One non-blocking Starlette/httpx deprecation warning.
2. **Database Isolation:** Positively verified that tests strictly target `architectiq_test` and enforce role-based segregation (`architectiq`, `architectiq_app`, `architectiq_iam_login`, `architectiq_audit_writer`). `architectiq_dev` is never touched by test execution.
3. **Database Connectivity:** PostgreSQL 17 is active at `127.0.0.1:5433`; Redis 7 is active at `127.0.0.1:6380`.
4. **Current Alembic Head:** `m32_hierarchy_read_grants` (applied on `architectiq_test`).
5. **Frontend Build & Lint:** `apps/web-studio` builds cleanly (`tsc -b && vite build` in 857ms) and passes ESLint (`eslint .`) with zero errors.
6. **Working Tree Status:** `apps/api/workspace.py` contains uncommitted changes (an unfinished `delete_folder_contents` function and `DELETE /folders/{resource_id}` endpoint). Multiple untracked files exist, including artifacts from a previous failed Claude run (`M4-Failed-Run-20261024-204036/failed-changes.patch`).

---

## 2. Git Status and Working Tree Inspection

### Current Git Status
- **Branch:** `feature/m40-workspace-management`
- **Latest Commit:** `b47e7d5` — *test(security): finalize M3.1 isolation and audit verification*
- **Modified (Unstaged):** `apps/api/workspace.py`
- **Untracked Directories & Files:**
  - `ArchitectIQ - Enterprise UI Navigat.txt` (authoritative 20-module UI navigation catalogue)
  - `ArchitectIQ_Antigravity_Complete_Handoff.md` (complete requirements & handoff specification)
  - `ArchitectIQ_M4_Overnight_Claude_Code.md` (prior overnight session prompt)
  - `M4-Failed-Run-20261024-204036/` (contains `failed-changes.patch` from Claude Code run)
  - `M3-Session-Backup-20261020-140758/` (prior session backup)
  - `apps/m31_test_backups/` (prior test backups)
  - Various analysis reports: `CHANGES_SUMMARY.md`, `FINAL_VERIFICATION.md`, `final_audit_test_report.md`, `m31_investigation_report.md`, etc.
  - Backup files in `apps/api/`: `authentication.py.m31.bak`, `conftest.py.bak`, `main.py.m31.bak`, `settings.py.m31.bak`, `test_tenant_security.py.m31bak`, etc.

### Uncommitted Modification in `apps/api/workspace.py`
The working tree contains an uncommitted diff in `apps/api/workspace.py`:
1. `delete_folder_contents(db: Session, folder_id: UUID)`: A recursive deletion helper that deletes projects and subfolders. It is defined at line 64 but never called anywhere.
2. `DELETE /folders/{resource_id}` (`delete_folder`): An endpoint that rejects deletion with HTTP 409 if `project_count > 0` or `subfolder_count > 0`. This directly contradicts the docstring stating it recursively deletes contents, and has no automated test coverage.
*Action Required:* Preserve without editing during Stage 0; present proposal to cleanly reconcile or revert with user authorization before M4.1.

### Inspection of the Failed Claude Code Run (`M4-Failed-Run-20261024-204036`)
Inspection of `M4-Failed-Run-20261024-204036/failed-changes.patch` reveals:
- Claude attempted to inject a global `stop_execution` shutdown hook into `main.py` and `authentication.py` upon seeing "stop work" instructions.
- Claude attempted speculative modifications to `workspace.py` and created standalone test files (`fix_workspace_activity_audit.py`, `SECURITY_AUDIT.md`) which failed isolation checks.
- Those failed changes were isolated and backed up into `M4-Failed-Run-20261024-204036/`. Current working copy code in `main.py`, `authentication.py`, and `database.py` is clean and matches the verified `b47e7d5` baseline.

---

## 3. Physical Directory & Module Layout

```
C:\Users\rathe\Documents\Projects\ArchitectIQ\
├── .git/
├── .python-version (3.12)
├── .gitignore
├── infrastructure/
│   └── docker/
│       ├── .env (Docker credentials for PG and Redis)
│       └── compose.yaml (Postgres 17 on 5433, Redis 7 on 6380)
├── apps/
│   ├── api/
│   │   ├── .env (Database connection strings and JWT secrets)
│   │   ├── .env.example
│   │   ├── .python-version
│   │   ├── .venv/ (Dedicated API virtual environment with all dependencies)
│   │   ├── alembic.ini
│   │   ├── authentication.py (OIDC JWKS & Native HS256 JWT verification)
│   │   ├── check_connections.py (Postgres & Redis health check)
│   │   ├── conftest.py (Strict test database isolation to architectiq_test)
│   │   ├── database.py (Session factories for runtime, iam, audit, and admin)
│   │   ├── iam.py (PostgreSQL SECURITY DEFINER membership and external ID resolution)
│   │   ├── main.py (FastAPI entrypoint, middlewares, routers)
│   │   ├── migrations/
│   │   │   ├── env.py
│   │   │   └── versions/ (17 Alembic migration scripts)
│   │   ├── models.py (SQLAlchemy 2.0 declarative models)
│   │   ├── native_auth.py (Native login/logout endpoints)
│   │   ├── native_bootstrap.py (Local CLI provisioning for test/admin users)
│   │   ├── pyproject.toml
│   │   ├── pytest.ini
│   │   ├── request_audit.py (Tenant-aware HTTP request audit middleware)
│   │   ├── settings.py (Pydantic settings)
│   │   ├── tenant_discovery.py (/api/v1/me/tenants)
│   │   ├── workspace.py (/api/v1/tenants/{tenant_id}/workspace/*)
│   │   └── tests (test_auth_dependency.py, test_authentication.py, etc.)
│   └── web-studio/
│       ├── dist/ (Production build artifacts)
│       ├── node_modules/
│       ├── package.json (React 19, Vite 8, Lucide, Tailwind, React Flow, etc.)
│       ├── tsconfig.json, tsconfig.app.json, tsconfig.node.json
│       ├── vite.config.ts
│       └── src/
│           ├── App.tsx (Main shell, theme engine, navigation groups)
│           ├── App.css (Dark/light glassmorphic styling system)
│           ├── LoginScreen.tsx (Native email/password auth interface)
│           ├── WorkspaceLive.tsx (Live tree, CRUD, move, activity panel)
│           └── main.tsx
└── docs/
    ├── milestones/
    │   └── M31_SECURITY_VALIDATION_REPORT.md
    └── handoff/ (Stage 0 Deliverables)
```

---

## 4. Environment & Dependency Specifications

### Python Runtime & Virtual Environments
- **System Version:** Python 3.12.15 (Windows)
- **Virtual Environments:**
  - `apps/api/.venv`: Active virtualenv containing FastAPI 0.115+, SQLAlchemy 2.0+, psycopg 3.2+, Alembic 1.14+, Pydantic 2.14+, Redis 5.2+, Argon2-cffi, PyJWT, pytest 9.1+.
  - Bare `python` invokes Windows Microsoft Store alias; all tooling must run via `apps/api/.venv/Scripts/python.exe` or `.\.venv\Scripts\python.exe`.
- **Database Driver:** `psycopg` (v3) binary with connection pooling.

### Node & Frontend Runtime
- **Node & NPM:** Node.js v20+ / NPM v10+
- **Frontend Stack:** React 19, TypeScript 5.7, Vite 8.3.4, `@xyflow/react` (React Flow), Lucide React, ECharts.

---

## 5. Database Architecture & Role Segregation

ArchitectIQ enforces strict PostgreSQL role segregation and Row-Level Security (RLS) on all tenant-owned tables.

### Database Roles & Credentials
1. `architectiq` (Database Superuser / Migration Runner):
   - Used only by Alembic migrations and `native_bootstrap.py`.
   - Bypasses RLS. Never used in application API endpoints.
2. `architectiq_app` (Application Runtime):
   - Used for normal CRUD queries across organizations, folders, projects, environments.
   - Enforces RLS: Can only see rows where `tenant_id = current_setting('architectiq.tenant_id')`.
   - Without `architectiq.tenant_id` set in the session, **zero rows** are visible.
3. `architectiq_iam_login` (IAM Access Verification):
   - Restricted role used by `iam.py`. Executes `SECURITY DEFINER` functions:
     - `public.architectiq_verify_tenant_membership(user_id, tenant_id)`
     - `public.architectiq_resolve_external_identity(issuer, subject)`
     - `public.architectiq_list_user_tenants(user_id)`
   - No direct access to business data tables.
4. `architectiq_audit_writer` (Request Audit Logger):
   - Dedicated unprivileged role used by `request_audit.py`.
   - Has `INSERT` privilege on `public.api_request_audit` only.
   - Cannot `SELECT`, `UPDATE`, or `DELETE` audit logs; cannot access business tables.

### Existing Database Tables (in `architectiq_test`)
- `alembic_version`
- `tenants` (RLS enabled)
- `users`
- `tenant_memberships` (RLS enabled)
- `user_external_identities` (OIDC subject mappings)
- `native_credentials` (Argon2 password hashes)
- `native_sessions`
- `organizations` (RLS enabled)
- `folders` (RLS enabled, self-referential tree, cycle prevention)
- `projects` (RLS enabled)
- `project_environments` (DEV, TEST, UAT, PROD)
- `organization_environments` (Org-level governed environments)
- `environment_folders`
- `workspace_activity` (Business audit log for workspace mutations)
- `api_request_audit` (HTTP request audit trail)

---

## 6. Migration Chain Analysis

The Alembic migration chain comprises 17 versions, perfectly sequential from initial hierarchy to M3.2 grants:

| Revision ID | Description | Down Revision | Status on `architectiq_test` |
|---|---|---|---|
| `e5b2130ca6a6` | Initial hierarchy (tenants, orgs, folders, projects) | `None` | Applied |
| `77a4f812ece6` | Enforce project environment values (DEV/TEST/UAT/PROD) | `e5b2130ca6a6` | Applied |
| `4ab5a219229f` | Enforce folder hierarchy integrity | `77a4f812ece6` | Applied |
| `fbe4556e3af8` | Prevent circular folder hierarchy trigger | `4ab5a219229f` | Applied |
| `6780bf6d7862` | Enable PostgreSQL Row-Level Security | `fbe4556e3af8` | Applied |
| `c62a4fca77b9` | Add users and tenant memberships | `6780bf6d7862` | Applied |
| `1b9623dcbb26` | Secure IAM membership verification function | `c62a4fca77b9` | Applied |
| `d86fd4e88ca7` | Add user external identities table | `1b9623dcbb26` | Applied |
| `9376adb6347c` | Add restricted external identity resolution function | `d86fd4e88ca7` | Applied |
| `a3c1d90e7b22` | Workspace writes permissions & safe flush | `9376adb6347c` | Applied |
| `b7e24a91c0f3` | Native identity credentials and sessions | `a3c1d90e7b22` | Applied |
| `c8e9a22b1f04` | Tenant discovery function (`architectiq_list_user_tenants`) | `b7e24a91c0f3` | Applied |
| `d4a6c901e2b7` | Fix tenant discovery permissions | `c8e9a22b1f04` | Applied |
| `e7b42c91a603` | Organization environments & environment folders | `d4a6c901e2b7` | Applied |
| `f9c6210d8e44` | Workspace activity audit table & triggers | `e7b42c91a603` | Applied |
| `m31_api_request_audit` | API request audit table & writer role | `f9c6210d8e44` | Applied |
| `m32_hierarchy_read_grants` | Restore hierarchy read grants for runtime | `m31_api_request_audit` | Applied (HEAD) |

---

## 7. Current API Route Inventory

| HTTP Method | Route Pattern | Handler | Auth & Role Dependency | Audit Logged |
|---|---|---|---|---|
| `GET` | `/health` | `health()` | None (Public) | Yes |
| `POST` | `/api/v1/auth/native/login` | `login()` | Native credentials validation | Yes |
| `POST` | `/api/v1/auth/native/logout` | `logout()` | Native token revocation | Yes |
| `GET` | `/api/v1/me/tenants` | `my_tenants()` | Verified JWT (`get_authenticated_user_id`) | Yes |
| `GET` | `/api/v1/tenants/{tenant_id}/workspace/tree` | `tree()` | `get_authorized_tenant_db` (RLS) | Yes |
| `GET` | `/api/v1/tenants/{tenant_id}/workspace/summary` | `summary()` | `get_authorized_tenant_db` (RLS) | Yes |
| `POST` | `/api/v1/tenants/{tenant_id}/workspace/organizations` | `create_org()` | `get_authorized_tenant_db` (RLS) | Yes |
| `PATCH` | `/api/v1/tenants/{tenant_id}/workspace/organizations/{id}` | `rename_org()` | `get_authorized_tenant_db` (RLS) | Yes |
| `GET` | `/api/v1/tenants/{tenant_id}/workspace/organizations/{id}/settings` | `organization_settings()` | `get_authorized_tenant_db` (RLS) | Yes |
| `GET` | `/api/v1/tenants/{tenant_id}/workspace/organizations/{id}/environments` | `list_org_environments()` | `get_authorized_tenant_db` (RLS) | Yes |
| `POST` | `/api/v1/tenants/{tenant_id}/workspace/organizations/{id}/environments` | `create_org_environment()` | `get_authorized_tenant_db` (RLS) | Yes |
| `GET` | `/api/v1/tenants/{tenant_id}/workspace/organizations/{id}/environments/{env_id}/folders` | `list_environment_folders()` | `get_authorized_tenant_db` (RLS) | Yes |
| `POST` | `/api/v1/tenants/{tenant_id}/workspace/organizations/{id}/environments/{env_id}/folders` | `create_environment_folder()` | `get_authorized_tenant_db` (RLS) | Yes |
| `POST` | `/api/v1/tenants/{tenant_id}/workspace/folders` | `create_folder()` | `get_authorized_tenant_db` (RLS) | Yes |
| `PATCH` | `/api/v1/tenants/{tenant_id}/workspace/folders/{id}` | `rename_folder()` | `get_authorized_tenant_db` (RLS) | Yes |
| `PATCH` | `/api/v1/tenants/{tenant_id}/workspace/folders/{id}/move` | `move_folder()` | `get_authorized_tenant_db` (RLS) | Yes |
| `DELETE` | `/api/v1/tenants/{tenant_id}/workspace/folders/{id}` | `delete_folder()` | `get_authorized_tenant_db` (Unstaged diff) | Yes |
| `POST` | `/api/v1/tenants/{tenant_id}/workspace/projects` | `create_project()` | `get_authorized_tenant_db` (RLS) | Yes |
| `PATCH` | `/api/v1/tenants/{tenant_id}/workspace/projects/{id}` | `rename_project()` | `get_authorized_tenant_db` (RLS) | Yes |
| `PATCH` | `/api/v1/tenants/{tenant_id}/workspace/projects/{id}/move` | `move_project()` | `get_authorized_tenant_db` (RLS) | Yes |
| `POST` | `/api/v1/tenants/{tenant_id}/workspace/projects/{id}/environments` | `create_environment()` | `get_authorized_tenant_db` (RLS) | Yes |
| `GET` | `/api/v1/tenants/{tenant_id}/workspace/activity` | `workspace_activity()` | `get_authorized_tenant_db` (RLS) | Yes |

---

## 8. Frontend Screen & Interaction Inventory

### Screen States in `apps/web-studio`
1. **Unauthenticated / Session Restore:**
   - Loading screen ("Restoring secure session…") while validating stored token against `/api/v1/me/tenants`.
   - `LoginScreen.tsx`: Native login form (email & password) with error alerts, submit state, and session caching in `sessionStorage`.
2. **Authenticated App Shell (`App.tsx`):**
   - **Header:** Tenant switcher dropdown, active breadcrumb, Demo indicator pill, global search button (Ctrl+K), notification bell, dark/light theme toggle, appearance settings modal button, user avatar, Sign Out.
   - **Sidebar:** Brand mark, active tenant info, 4 navigation groups (`WORKSPACE`, `DESIGN STUDIOS`, `OPERATIONS`, `CONTROL PLANE`) with 21 navigable link items, sidebar collapse toggle.
   - **Search Palette (Modal):** Global fuzzy search over studio modules and pages with keyboard navigation and Esc dismiss.
   - **Appearance Studio (Drawer):** Theme selection (Dark / Light / System), presets (Professional, Balanced, Immersive), accent color selection (Blue, Violet, Cyan, Emerald), transparency/blur/shadow range sliders.
3. **Workspace View (`WorkspaceLive.tsx`):**
   - **Resource Tree:** Recursive hierarchy viewer (Org -> Folder -> Project) with drag-and-drop support, expand/collapse toggles, selection highlights.
   - **Resource Detail Tabs:**
     - `Overview`: Selected item summary and contextual action forms (Create resource, Move resource, Rename resource).
     - `Activity`: Live business audit log table loaded from `/workspace/activity` with filtering by operation (INSERT, UPDATE, DELETE, ALL), record limits (25, 50, 100, 200), and changed field diff viewer.
     - `Access`: **Placeholder** ("Access management pending. Effective permissions and inherited grants will be displayed after the authorization API is implemented.").
     - `Jobs`: **Placeholder** ("No connected execution service").
     - `Triggers`: **Placeholder** ("Triggers not yet available").
     - `Settings`: Basic rename action; advanced policies marked pending.
4. **Studio & Operations Modules:**
   - `Dashboard`: Live hierarchy preview widget alongside illustrative KPI metric cards and simulated trend SVG charts.
   - `Flow Studio`: Illustrative React Flow preview graph with sample nodes (Trigger, AI Action, Risk Decision, Output) and disabled properties inspector.
   - Other Modules (Agent Builder, Document Studio, Queues, etc.): "INTERFACE PREVIEW" placeholder cards stating that runtime persistence is pending.

---

## 9. Baseline Test Coverage & Verification Evidence

Test suite executed via `apps/api/.venv/Scripts/python.exe -m pytest` inside `apps/api`:
- **Result:** **43 passed, 3 warnings in 1.35s**
- **Tested Scenarios:**
  - `test_auth_dependency.py` (3 tests): Missing bearer token rejection, malformed/tampered token rejection, valid token acceptance.
  - `test_authentication.py` (26 tests): Signature tampering, token expiration, wrong issuer, wrong audience, missing subject, SSRF protection on JWKS URLs (rejecting http, credentials, localhost, non-standard ports, fragments, unresolvable hosts), JWKS trust binding enforcement, future `iat` / `nbf` rejection, missing `exp` rejection.
  - `test_db_connection.py` (1 test): Positive verification of Postgres (5433) and Redis (6380) connectivity.
  - `test_native_auth_contract.py` (2 tests): Route availability and rejection of invalid payloads without database mutation.
  - `test_request_audit_integration.py` (6 tests): Audit writer role privilege restrictions, cross-tenant audit isolation, middleware request correlation ID assignment, duration logging, unhandled error logging, and explicit database connection verification.
  - `test_tenant_security.py` (3 tests):
    1. `test_missing_tenant_context_exposes_no_records`: Verifies that querying `tenants`, `organizations`, `folders`, `projects`, and `project_environments` without `architectiq.tenant_id` returns 0 rows.
    2. `test_cross_tenant_rls_isolation`: Verifies that Tenant A cannot see Tenant B's folders, projects, or environments under any circumstance.
    3. `test_visible_records_have_correct_tenant_ownership`: Verifies all returned rows match the set session context.
  - `test_workspace_contract.py` (2 tests): Unauthenticated access to tree and workspace mutation endpoints return HTTP 401.

---

## 10. Known Blockers, Technical Debt & Discrepancies

1. **Uncommitted `workspace.py` Diff:**
   - Unused `delete_folder_contents` function.
   - Contradictory `DELETE /folders/{resource_id}` endpoint without tests.
   - *Recommendation:* Cleanly revert or properly complete and test with user consent.
2. **Missing M4 Project Access & IAM Models:**
   - `ProjectMembership` table does not yet exist.
   - Project-level RBAC service does not exist.
   - Frontend `WorkspaceLive.tsx` Access tab is a static empty state.
3. **Workspace Tree Virtualization:**
   - Tree is rendered recursively in DOM; large enterprise structures with thousands of nodes will require virtualization (`react-window` or virtualized list).
4. **Activity Audit Ancestor Rollups:**
   - `/activity` currently queries exact `resource_id`. Inspecting a project or folder does not currently roll up events from parent or child resources.
5. **Frontend Navigation Reconciliation:**
   - `App.tsx` has 21 links across 4 groups. The authoritative UI navigation specification (`ArchitectIQ - Enterprise UI Navigat.txt`) defines 20 functional modules under 6 frozen top-level workspaces (`Dashboard`, `Configure`, `Test`, `Run`, `Support`, `Master Setup`).
