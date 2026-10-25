# Milestone M4.2 Completion Report — Project Lifecycle & Metadata

**Milestone:** M4.2 — Project Lifecycle & Governance Metadata  
**Date:** 25 October 2026  
**Status:** **ACCEPTED & VERIFIED**  
**Branch:** `feature/m40-workspace-management`  

---

## 1. Fulfilled Requirement Identifiers

| Requirement ID | Domain | Scope & Verification |
|---|---|---|
| **LIFE-01** | Lifecycle | Project lifecycle state machine (`ACTIVE`, `ARCHIVED`, `SUSPENDED`) enforced by database check constraints and REST transitions. |
| **LIFE-02** | Metadata | Enterprise governance attributes: `description`, `tags`, `criticality` (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`), `data_classification` (`PUBLIC`, `INTERNAL`, `CONFIDENTIAL`, `RESTRICTED`), `cost_center`, `archived_at`, `archived_by`. |
| **LIFE-03** | Governance | Reversible archive/restore operations with actor tracking and audit logging in `workspace_activity`. |
| **SAFE-01** | Safety | Safe folder deletion (`DELETE /folders/{id}`), rejecting non-empty folders with HTTP 409 Conflict; least-privilege `DELETE` grant with PostgreSQL RLS. |
| **UX-01** | Workspace UX | Project metadata overview, lifecycle action buttons (Archive / Restore), settings metadata form, and tree view filtering with archived visibility toggle. |

---

## 2. Implementation Deliverables

1. **Alembic Migration ([`m42_project_lifecycle.py`](file:///c:/Users/rathe/Documents/Projects/ArchitectIQ/apps/api/migrations/versions/m42_project_lifecycle.py)):**
   - Added `lifecycle_status`, `description`, `tags`, `criticality`, `data_classification`, `cost_center`, `archived_at`, `archived_by` to `public.projects`.
   - Added check constraints on `lifecycle_status`, `criticality`, and `data_classification`.
   - Added index `ix_projects_lifecycle_status`.
   - Granted `DELETE ON public.folders TO architectiq_app` and established `folders_delete_policy` RLS policy.
   - Tested deterministic downgrade and re-upgrade against `architectiq_test`.

2. **Database Models ([`models.py`](file:///c:/Users/rathe/Documents/Projects/ArchitectIQ/apps/api/models.py)):**
   - Updated `Project` model with `lifecycle_status`, `description`, `tags`, `criticality`, `data_classification`, `cost_center`, `archived_at`, `archived_by`, and declarative check constraints.

3. **Workspace API Endpoints ([`workspace.py`](file:///c:/Users/rathe/Documents/Projects/ArchitectIQ/apps/api/workspace.py)):**
   - `GET /projects/{resource_id}`: Retrieves comprehensive project metadata and lifecycle status (requires `can_view`).
   - `PATCH /projects/{resource_id}`: Updates project metadata and name (requires `can_edit`).
   - `POST /projects/{resource_id}/archive`: Transitions project to `ARCHIVED`, records timestamp and actor (requires `can_delete`).
   - `POST /projects/{resource_id}/restore`: Restores project to `ACTIVE`, clears archive metadata (requires `can_delete`).
   - `DELETE /folders/{resource_id}`: Safely deletes empty folders, preventing accidental loss by rejecting populated folders (409 Conflict).
   - `GET /tree`: Filters archived projects by default, exposes `include_archived=true` parameter.

4. **Frontend Studio UX ([`WorkspaceLive.tsx`](file:///c:/Users/rathe/Documents/Projects/ArchitectIQ/apps/web-studio/src/WorkspaceLive.tsx)):**
   - Overview tab displays lifecycle badge, criticality, data classification, cost center, and tags.
   - Archive and Restore actions with confirmation dialogs and permission-based disabling.
   - Project Settings tab provides live metadata editor form with client-server validation.
   - Tree hierarchy includes `Show archived projects` checkbox and visual `ARCHIVED` badges.
   - Folder inspector provides empty folder deletion button with content-preservation safeguards.

5. **Automated Test Suite ([`test_project_lifecycle.py`](file:///c:/Users/rathe/Documents/Projects/ArchitectIQ/apps/api/test_project_lifecycle.py)):**
   - 7 comprehensive tests covering metadata creation, details fetching, metadata patch, archive/restore transitions, tree filtering, safe folder deletion, and cross-tenant isolation.

---

## 3. Test Verification Evidence

```text
============================= test session starts =============================
platform win32 -- Python 3.12.15, pytest-9.1.1 -- apps/api/.venv/Scripts/python.exe
collected 65 items

test_auth_dependency.py ...                                              [  4%]
test_authentication.py ..........................                        [ 44%]
test_db_connection.py .                                                  [ 46%]
test_native_auth_contract.py ..                                          [ 49%]
test_project_lifecycle.py .......                                        [ 60%]
test_project_rbac.py ...............                                     [ 83%]
test_request_audit_integration.py ......                                 [ 92%]
test_tenant_security.py ...                                              [ 96%]
test_workspace_contract.py ..                                            [100%]

======================= 65 passed, 3 warnings in 2.96s ========================
```

- **Frontend Build (`tsc -b && vite build`):** Clean in 326ms (`dist/assets/index-Des-XgLD.js` — 296.45 kB).
- **Frontend Lint (`eslint .`):** 0 errors, 0 warnings.
- **Database Safety:** All operations and migrations verified against `architectiq_test`. `architectiq_dev` completely untouched.
