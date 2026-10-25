# ArchitectIQ — Risk Register & Mitigation Strategy

**Date:** 25 October 2026  
**Author:** Antigravity (Principal Security Reviewer & Delivery Lead)  
**Classification:** Internal Engineering Risk Assessment  

---

## 1. Risk Evaluation Matrix

Risks are categorized by **Severity** (Critical, High, Medium, Low) and **Likelihood** (High, Medium, Low) and prioritized for mitigation.

| Risk ID | Category | Risk Description | Severity | Likelihood | Mitigation Strategy | Status |
|---|---|---|---|---|---|---|
| **RSK-01** | Security | Unintended test execution against `architectiq_dev` | Critical | Low | Hardened `conftest.py` inspects all 4 database URLs at pytest startup. Explicitly aborts if database name is not `architectiq_test`. | **Mitigated** |
| **RSK-02** | Integrity | Uncommitted diff in `apps/api/workspace.py` | High | High | Isolate uncommitted code during Stage 0; present proposal to cleanly reconcile or revert with explicit user approval before M4.1. | **Active / Controlled** |
| **RSK-03** | Security | Speculative shutdown / STOP modifications by AI agents | Critical | Low | Explicitly enforce rule: AI agents must never inject runtime halt/shutdown functions into `main.py` or `authentication.py`. Claude's prior patch safely isolated. | **Mitigated** |
| **RSK-04** | Security | Cross-tenant data leakage via missing RLS context | Critical | Low | PostgreSQL RLS enabled on all tenant-owned tables. Default return is 0 rows when context is omitted. Verified by `test_tenant_security.py`. | **Mitigated** |
| **RSK-05** | IAM / Security | Last-owner lockout or privilege escalation in M4.1 | High | Medium | Canonical `PermissionService` enforces: (1) Last remaining project owner cannot be removed or demoted; (2) Admins/Editors cannot self-grant elevated roles. | **Target for M4.1** |
| **RSK-06** | Architecture | Uncontrolled drift in Alembic migration history | High | Low | Rule: Never edit historical migrations after application. All schema enhancements are forward-only with paired downgrade functions. | **Mitigated** |
| **RSK-07** | Cost / Compliance | Unbudgeted external cloud or LLM API expenses | High | Low | Local developer profile uses PostgreSQL and Redis. Model integrations require explicit user approval and provider credentials before invocation. | **Mitigated** |
| **RSK-08** | Performance | Tree render performance degradation at scale | Medium | Medium | Implement tree virtualization (`react-window`) and paginated lazy-loading in M4.4 for enterprise tenants with >1,000 resources. | **Planned M4.4** |
| **RSK-09** | Architecture | Premature introduction of complex distributed tech (Kafka/Temporal) | Medium | Medium | Adhere to ADR process: use PostgreSQL as durable system of record and Redis for transient queues until workload benchmarks demand dedicated engines. | **Mitigated** |
| **RSK-10** | UX / Quality | Discrepancy between UI prototypes and backend persistence | Medium | Low | Principle: Clearly label mock/demo components with "DEMO DATA" pills. Never claim an unpersisted UI feature is complete. | **Mitigated** |

---

## 2. In-Depth Analysis of Key Risks

### RSK-01: Test Database Isolation
- **Context:** Destructive integration tests or test fixtures running against the development database (`architectiq_dev`) could cause irreversible data loss.
- **Verification:** Verified that `apps/api/conftest.py` actively intercepts all four database roles (`DATABASE_URL`, `APP_DATABASE_URL`, `IAM_DATABASE_URL`, `AUDIT_DATABASE_URL`) and forces `architectiq_test`. In addition, `test_request_audit_integration.py` executes an explicit `SELECT current_database()` assertion confirming `architectiq_test`.

### RSK-02: Working Tree Diff in `workspace.py`
- **Context:** An unstaged diff exists in `apps/api/workspace.py` introducing `delete_folder_contents` (unused) and `DELETE /folders/{resource_id}` (untested).
- **Risk:** Introducing untested deletion endpoints risks silent data loss or architectural inconsistency.
- **Resolution:** Reconcile cleanly: implement governed soft-delete and cascade rules with thorough unit/integration tests as part of M4.2 project lifecycle.

### RSK-03: Artificial Emergency Shutdowns
- **Context:** In a previous session, Claude Code attempted to insert `stop_execution` shutdown hooks upon encountering "stop work" phrases in documentation.
- **Resolution:** Antigravity operates strictly under instructions: "Do not implement a shutdown/STOP feature merely because the instruction says stop work." All core files (`main.py`, `authentication.py`, `database.py`) remain clean and faithful to the verified foundation.

### RSK-05: Project-Level RBAC Escalation & Last-Owner Guardrails
- **Context:** In M4.1, adding project membership APIs could allow users to escalate their own privileges or remove all project owners, creating orphaned projects.
- **Resolution:**
  - Enforce atomic transaction checks: Query count of active `OWNER` roles on the project; reject deletion or demotion if count <= 1.
  - Require `OWNER` or `ADMIN` role for role assignment; prohibit users from assigning roles higher than their own effective role.
