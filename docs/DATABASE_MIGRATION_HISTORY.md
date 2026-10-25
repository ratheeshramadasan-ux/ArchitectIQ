# ArchitectIQ — Database Migration History & Schema Evolution

**Engine:** PostgreSQL 17.11  
**Migration Tool:** Alembic (Python 3.12, SQLAlchemy 2.0)  
**Safety Verification Environment:** `architectiq_test` (port 5433)  
**Development Baseline:** `architectiq_dev` strictly preserved at `m31_api_request_audit`  
**Date:** 25 October 2026  

---

## 1. Complete Migration Revision Graph

The linear revision chain across all platform milestones:

```
[ m31_api_request_audit ] (Stage 0 Baseline - architectiq_dev)
           │
           ▼
[ m41_project_memberships ] (Milestone M4.1)
           │
           ▼
[ m42_project_lifecycle_metadata ] (Milestone M4.2)
           │
           ▼
[ m43_environment_promotions ] (Milestone M4.3)
           │
           ▼
[ m50_workflow_designer ] (Milestone M5.0)
           │
           ▼
[ m60_workflow_execution ] (Milestone M6.0)
           │
           ▼
[ m70_approvals_and_rules ] (Milestone M7.0)
           │
           ▼
[ m80_agent_gateway ] (Milestone M8.0)
           │
           ▼
[ m90_document_ai ] (Milestone M9.0)
           │
           ▼
[ m100_integrations_and_tools ] (Milestone M10.0)
           │
           ▼
[ m110_observability_and_support ] (Milestone M11.0)
           │
           ▼
[ m120_enterprise_hardening ] (Milestone M12.0 - head)
```

---

## 2. Milestone Migration Inventory & Table Schemas

### Baseline (`m31_api_request_audit`)
- **Tables:** `tenants`, `users`, `tenant_memberships`, `organizations`, `folders`, `projects`, `request_audits`, `workspace_activities`.
- **Status in dev:** Active (`architectiq_dev` preserved at this exact revision).

### Milestone M4.1: `m41_project_memberships`
- **Tables Added:** `project_memberships`.
- **Columns:** `id`, `tenant_id`, `project_id`, `user_id`, `role`, `created_at`, `updated_at`.
- **Constraints:** Foreign key constraints with cascading delete; trigger `architectiq_enforce_project_membership_tenant()` enforcing active tenant membership.
- **RLS:** `project_memberships_tenant_isolation`.

### Milestone M4.2: `m42_project_lifecycle_metadata`
- **Columns Added to `projects`:** `lifecycle_status`, `criticality`, `data_classification`, `tags`, `cost_center`, `archived_at`, `archived_by`.
- **Soft-Delete Safety:** `DELETE` on folders protected by `cannot_delete_non_empty_folder` check.

### Milestone M4.3: `m43_environment_promotions`
- **Tables Added:** `project_environments`, `promotion_requests`.
- **Features:** Governed per-project bindings (`DEV`, `TEST`, `UAT`, `PROD`), drift hash detection, segregation of duties check.

### Milestone M5.0: `m50_workflow_designer`
- **Tables Added:** `workflow_definitions`, `workflow_versions`.
- **Features:** Canonical JSON graph schema, immutable published versions with semantic versioning.

### Milestone M6.0: `m60_workflow_execution`
- **Tables Added:** `workflow_runs`, `workflow_step_runs`, `workflow_queues`.
- **Features:** Durable execution state machine, sequential step transactions, worker queue claims.

### Milestone M7.0: `m70_approvals_and_rules`
- **Tables Added:** `approval_tasks`, `business_rules`.
- **Features:** Dual-authorization human inbox, deterministic decision tables with condition evaluation operators.

### Milestone M8.0: `m80_agent_gateway`
- **Tables Added:** `ai_agents`, `ai_agent_invocations`, `ai_agent_evaluations`.
- **Features:** Model gateway router, token metering, budget caps, automated benchmark suite.

### Milestone M9.0: `m90_document_ai`
- **Tables Added:** `document_schemas`, `documents`, `document_annotations`.
- **Features:** OCR schema extraction, confidence scoring threshold, human review annotation queue.

### Milestone M10.0: `m100_integrations_and_tools`
- **Tables Added:** `credential_references`, `connectors`, `integration_tools`, `project_templates`.
- **Features:** Masked vault references, connection handshake tests, OpenAPI tool invocation, project packaging export & clone.

### Milestone M11.0: `m110_observability_and_support`
- **Tables Added:** `system_metrics`, `incident_tickets`, `sla_breach_events`, `runbooks`.
- **Features:** Time-series telemetry stream, incident lifecycle state machine, automated runbook remediation pipelines.

### Milestone M12.0: `m120_enterprise_hardening`
- **Tables Added:** `compliance_policies`, `compliance_audit_reports`.
- **Features:** Retention policies, Responsible AI safety checks, SOC2 access reviews, automated DR diagnostics.

---

## 3. Row-Level Security (RLS) Policy Catalog

Every multi-tenant table enforces PostgreSQL RLS configured with:
```sql
ALTER TABLE <table_name> ENABLE ROW LEVEL SECURITY;

CREATE POLICY <table_name>_tenant_isolation ON <table_name>
FOR ALL TO architectiq_app
USING (tenant_id = public.architectiq_current_tenant_id())
WITH CHECK (tenant_id = public.architectiq_current_tenant_id());
```

Verified across all 28 multi-tenant tables:
`organizations`, `folders`, `projects`, `project_memberships`, `project_environments`, `workflow_definitions`, `workflow_versions`, `workflow_runs`, `workflow_step_runs`, `workflow_queues`, `approval_tasks`, `business_rules`, `ai_agents`, `ai_agent_invocations`, `ai_agent_evaluations`, `document_schemas`, `documents`, `document_annotations`, `credential_references`, `connectors`, `integration_tools`, `project_templates`, `system_metrics`, `incident_tickets`, `sla_breach_events`, `runbooks`, `compliance_policies`, `compliance_audit_reports`.

---

## 4. Migration Upgrade & Downgrade Gate Evidence

Every migration was tested with bidirectional execution (`upgrade head` -> `downgrade -1` -> `upgrade head`) against `architectiq_test`:
- All tables dropped and created cleanly without orphaned types or foreign key constraint deadlocks.
- Zero modifications were introduced to `architectiq_dev`.
