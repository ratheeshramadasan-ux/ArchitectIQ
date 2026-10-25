# ArchitectIQ — Operational Runbook & Known Limitations

**Version:** 1.0.0-enterprise  
**Status:** Verified Operational Baseline  
**Date:** 25 October 2026  

---

## 1. Operational Runbooks & SRE Procedures

### 1.1 Stalled Queue Drain & Worker Recovery
**Trigger Condition:** Queue latency exceeds 150ms or jobs remain stuck in `RUNNING` status without heartbeat renewal.
```bash
# 1. Inspect active queue depths and worker leases
curl -s -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:8000/api/v1/tenants/$TENANT_ID/workspace/observability/overview | jq

# 2. Trigger automated remediation runbook via API
curl -X POST -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:8000/api/v1/tenants/$TENANT_ID/workspace/observability/runbooks/$RUNBOOK_ID/execute | jq
```

### 1.2 Incident Triage & Escalation
**Trigger Condition:** `SEV-1` or `SEV-2` incident reported.
1. Open **Web Studio > Monitoring > Incident Management**.
2. Select the incident and click **Mark Investigating** to claim ownership.
3. Review linked resource logs (`affected_resource_id`).
4. Apply remediation runbook or reset downstream circuit breaker.
5. Record root-cause analysis in resolution notes and click **Resolve Incident**.

### 1.3 Database Backup & Disaster Recovery Verification (OPS-02)
**Trigger Condition:** Pre-deployment verification gate, scheduled DR drills, or after database migrations.

The verification suite separates non-destructive database health checks from isolated backup integrity and recovery tests.

#### 1.3.1 Database Health & Catalog Inspection
```bash
# Explicit target database connection string is required (hardcoded credentials prohibited).
export TARGET_DATABASE_URL="postgresql://architectiq:Mad%407878@127.0.0.1:5433/architectiq_test"

# Run schema-qualified catalog and restricted-role RLS verification:
.venv/Scripts/python.exe scripts/verify_database_health.py
```
Verifies:
- All 32 required enterprise tables present in schema `public`.
- Row-Level Security enabled with policies defined on all 28 multi-tenant tables.
- Runtime RLS isolation enforced under restricted `architectiq_app` role (default-deny and tenant context).
- WAL settings inspection (`archive_mode`, `archive_command`, `wal_level`).

#### 1.3.2 Isolated Backup Integrity & Disposable Restore Verification
```bash
# Authorization for disposable recovery database creation is mandatory:
export TARGET_DATABASE_URL="postgresql://architectiq:Mad%407878@127.0.0.1:5433/architectiq_test"
export ALLOW_DISPOSABLE_RECOVERY_DB="true"

# Execute isolated backup creation and restore test:
.venv/Scripts/python.exe scripts/verify_backup_recovery.py
```
Verifies:
1. **Security Guardrails:** Rejects missing credentials, rejects `architectiq_dev`, rejects production host/database names (`prod`/`production`).
2. **Backup Artifact Integrity:** Generates PostgreSQL custom format dump (`-F c`), verifies `PGDMP` binary magic header, size threshold, and sha256 checksum.
3. **Dedicated Recovery Environment:** Creates an isolated disposable database (`architectiq_recovery_disposable_<uuid>`).
4. **Restored Integrity:** Verifies 32 restored tables, migration head `m120_enterprise_hardening`, 28 restored RLS policies, and runtime `architectiq_app` isolation on the restored database.
5. **RTO/RPO Timing:** Evaluates recovery duration against SLA targets (RTO $\le 300$s; measured in $< 1.0$s).
6. **WAL & PITR Status:** When `archive_mode` is `off`, reports `WAL_ARCHIVE_VERIFICATION: NOT CONFIGURED` and `POINT_IN_TIME_RECOVERY: NOT VERIFIED` rather than fabricating success.
7. **Clean Teardown:** Terminates background connections and drops the disposable recovery database, leaving zero operational residue.
8. **Structured Evidence:** Emits JSON report to `docs/ops/ops02_verification_evidence.json`.

---

## 2. Technical Debt & Design Constraints

1. **Local Model Provider Latency:**
   - The local Ollama model provider targets `qwen3-coder:30b`. On machines without dedicated GPU acceleration, token generation throughput will depend on CPU threads and system RAM. Remote providers (OpenAI, Claude, Vertex AI) can be configured with instantaneous response streaming.
2. **Document AI OCR Heuristics:**
   - In the absence of a heavy proprietary OCR engine like Tesseract/Google Vision, the default extractor uses structured regex heuristics for invoice numbers, dates, currency, and vendor tags. Confidence routing to the Human Review Queue handles non-standard layouts seamlessly.
3. **Dual-Audit Retention Lifecycle:**
   - While the request audit middleware and business activity audit triggers log all transactions, automated cold-storage archiving to external S3 buckets can be configured using `compliance_policies` (data retention policy).

---

## 3. Commercial Roadmap & Deferred Capabilities

- **COM-01 (Commercial Metering, Billing & Licensing):**
  - Tenant token metering and USD pricing calculations are fully implemented in the AI Agent Gateway (`AG-02`). Integrating automated Stripe invoicing, credit card billing, and chargeback licensing is planned for the commercial edition.
- **Enterprise SAML 2.0 / ADFS:**
  - Standard OIDC JWKS authentication is verified (`test_authentication.py`). SAML 2.0 XML assertion parsing is deferred to enterprise identity add-ons.
