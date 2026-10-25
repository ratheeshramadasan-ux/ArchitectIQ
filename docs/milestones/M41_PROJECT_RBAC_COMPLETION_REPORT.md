# Milestone M4.1 Completion Report — Project Membership & RBAC (Hardened)

**Milestone:** M4.1 — Project Membership & Access Management  
**Date:** 25 October 2026  
**Status:** **ACCEPTED & HARDENED**  
**Branch:** `feature/m40-workspace-management`  

---

## 1. Fulfilled Requirement Identifiers

| Requirement ID | Domain | Scope & Verification |
|---|---|---|
| **IAM-01** | IAM | Multi-tenant project role model (`OWNER`, `ADMIN`, `EDITOR`, `VIEWER`) and granular permission evaluation matrix. |
| **IAM-02** | IAM | Project membership data model with database-enforced tenant boundaries, active tenant membership checks, and default-deny authorization. |
| **IAM-03** | IAM | Authenticated REST APIs for member assignment, role updates, member removal, and effective capabilities, connected to the React Access panel. |
| **SEC-01** | Security | PostgreSQL Row-Level Security on `project_memberships` table for the restricted `architectiq_app` role; cross-tenant access rejection. |
| **SEC-02** | Security | Atomic project creation with initial owner assignment; concurrency-safe last-owner protection; privilege escalation defense. |

---

## 2. Verification of 10 Corrective Directives

1. **Router Registrations Cleaned (`apps/api/main.py`):**
   - Removed duplicate `project_rbac_router` inclusion from `main.py`.
   - `apps/api/workspace.py` mounts `project_rbac_router` directly via `router.include_router(project_rbac_router)` under `/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}`.

2. **Database-Enforced Tenant Consistency:**
   - PostgreSQL trigger `architectiq_enforce_project_membership_tenant()` resolves project tenant hierarchy (`projects -> folders -> organizations -> tenants`) and strictly validates that `project_tenant_id == NEW.tenant_id`.
   - Verifies target user is an active member of the tenant and active user (`users.status = 'ACTIVE'` and `tenant_memberships.status = 'ACTIVE'`).

3. **Least-Privilege IAM Grants & RLS Isolation:**
   - `architectiq_iam_owner` holds `SELECT` on `public.users` and `public.tenant_memberships` for executing SECURITY DEFINER trigger and verification functions.
   - `architectiq_app` holds column-level `GRANT SELECT (id, display_name, status) ON TABLE public.users` and `GRANT EXECUTE ON FUNCTION public.architectiq_verify_tenant_membership(uuid, uuid)`.
   - `tenant_memberships` table is shielded from direct queries by `architectiq_app`.
   - RLS enabled on `project_memberships` table with tenant isolation policy for `architectiq_app`.

4. **Hardened SECURITY DEFINER Trigger:**
   - `architectiq_enforce_project_membership_tenant()` specifies `SET search_path = pg_catalog, pg_temp;`.
   - Handles `UPDATE` operations by asserting immutability of `project_id`, `user_id`, and `tenant_id`.

5. **Deterministic Alembic Migration:**
   - Replaced all non-deterministic `IF NOT EXISTS` statements with clean, deterministic DDL (`CREATE TABLE public.project_memberships`, clean trigger creation and rollback drops).

6. **Revoked/Inactive Tenant Membership Denials:**
   - `require_project_capability` executes `SELECT public.architectiq_verify_tenant_membership(CAST(:uid AS uuid), CAST(:tid AS uuid))` to ensure caller has active tenant status.
   - Callers with suspended or revoked tenant memberships are strictly denied (HTTP 403 / 0 capabilities).

7. **Concurrency-Safe Last-Owner Protection:**
   - Mutual simultaneous owner deletions or demotions are serialized by acquiring an exclusive row-level lock on the parent project row:
     `SELECT id FROM public.projects WHERE id = :pid FOR UPDATE` before evaluating remaining owner counts.

8. **Server-Side Enforcement on Existing Operations:**
   - `rename_project` and `move_project` enforce server-side `can_edit` capability via `require_project_capability`. `VIEWER` role cannot rename or move projects (HTTP 403).

9. **Negative Security Tests Added:**
   - Cross-tenant assignment rejection (`test_cross_tenant_membership_rejected`).
   - Privilege escalation guardrails (`test_privilege_escalation_guardrails`).
   - Inactive / revoked tenant memberships denied (`test_inactive_and_revoked_memberships_denied`).
   - Concurrent owner removal safety via row-locking (`test_concurrent_owner_removal_safety`).
   - Immutability of membership keys under UPDATE (`test_trigger_membership_update_immutability`).

10. **Full Regression Validation:**
    - Full Pytest suite: **58 passed in 2.61s** (43 baseline + 15 RBAC/Security).
    - Web Studio: **ESLint passed (0 errors)** and **Vite build passed (321ms)**.

---

## 3. Changed & Created Files Inventory

### Database & Migrations
- [`apps/api/migrations/versions/m41_project_memberships.py`](file:///c:/Users/rathe/Documents/Projects/ArchitectIQ/apps/api/migrations/versions/m41_project_memberships.py): Hardened Alembic migration with deterministic DDL, restricted `search_path`, trigger immutability checks, and least-privilege IAM grants.

### Backend Application
- [`apps/api/models.py`](file:///c:/Users/rathe/Documents/Projects/ArchitectIQ/apps/api/models.py#L225-L275): `ProjectMembership` declarative model with foreign keys and unique constraints.
- [`apps/api/project_rbac.py`](file:///c:/Users/rathe/Documents/Projects/ArchitectIQ/apps/api/project_rbac.py): RBAC evaluator, concurrency-safe row-locking last-owner guardrail, and REST endpoints for member management.
- [`apps/api/workspace.py`](file:///c:/Users/rathe/Documents/Projects/ArchitectIQ/apps/api/workspace.py): Direct mount of `project_rbac_router`, atomic owner creation on new projects, and server-side capability gates on rename/move.
- [`apps/api/main.py`](file:///c:/Users/rathe/Documents/Projects/ArchitectIQ/apps/api/main.py): Cleaned router registrations (zero duplicate imports).

### Frontend Application
- [`apps/web-studio/src/WorkspaceLive.tsx`](file:///c:/Users/rathe/Documents/Projects/ArchitectIQ/apps/web-studio/src/WorkspaceLive.tsx#L75-L100): Connected Access Management panel displaying effective role badge, capabilities, refresh button, member assignment form, member table, role change dropdown, and last-owner deletion confirmation.

### Test Suite & Patch Artifacts
- [`apps/api/test_project_rbac.py`](file:///c:/Users/rathe/Documents/Projects/ArchitectIQ/apps/api/test_project_rbac.py): 15 comprehensive positive and negative security tests.
- [`patches/deferred_folder_deletion_m42.patch`](file:///c:/Users/rathe/Documents/Projects/ArchitectIQ/patches/deferred_folder_deletion_m42.patch): Preserved folder-deletion patch deferred to M4.2.

---

## 4. Test Verification Evidence

```
collected 58 items
test_auth_dependency.py ...                                              [  5%]
test_authentication.py ..........................                        [ 50%]
test_db_connection.py .                                                  [ 51%]
test_native_auth_contract.py ..                                          [ 55%]
test_project_rbac.py ...............                                     [ 81%]
test_request_audit_integration.py ......                                 [ 91%]
test_tenant_security.py ...                                              [ 96%]
test_workspace_contract.py ..                                            [100%]

======================= 58 passed, 3 warnings in 2.61s ========================
```

- **Frontend Build (`npm run build`):** Clean in 321ms (`dist/assets/index-Bi3Ay3uS.js`).
- **Frontend Lint (`npm run lint`):** 0 errors, 0 warnings.
- **Database Target:** `architectiq_test` (port 5433). `architectiq_dev` completely untouched.

---

## 5. Unresolved Issues & Next Step

Zero unresolved blockers for M4.1.

In accordance with user instruction:
> "After M4.1, stop for a milestone review before proceeding to M4.2. Do not independently begin later milestones."

Antigravity stops here for the Milestone Review.
