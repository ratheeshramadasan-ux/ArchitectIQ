# ArchitectIQ — Milestone M14 Containerized Platform Acceptance Report

**Milestone:** M14 — Local Containerized Platform Acceptance & Live Web Studio Verification  
**Target Environment:** Docker Desktop on Windows  
**Frontend URL:** `http://localhost:8080/` (Nginx container `architectiq-web-studio`)  
**Backend URL:** `http://localhost:8000/` (FastAPI container `architectiq-api`)  
**Database:** PostgreSQL 17 on Port 5433 (`architectiq-postgres` targeting `architectiq_test`)  
**Cache:** Redis 7 on Port 6380 (`architectiq-redis`)  
**Overall Status:** **100% OPERATIONAL & VERIFIED**

---

## 1. Executive Summary & Root Cause Analysis

During local containerized platform verification, the Web Studio frontend opened on `http://localhost:8080/`, but login attempts failed because **no native user credentials had been provisioned** in the `native_credentials` database table. Additionally, an attribute mismatch in `observability_support.py` (`active_workers`) caused an internal server error on observability metrics aggregation.

Both issues have been remediated:
1. Provisioned default Enterprise Administrator credentials in `architectiq_test`.
2. Fixed `observability_support.py` queue worker counting logic.
3. Rebuilt and redeployed the container images.
4. Validated the entire end-to-end login flow and Six Core Studios via automated live HTTP verification through the containerized stack.

---

## 2. Default Administrator Credentials

| Parameter | Configuration Value |
|---|---|
| **Login URL** | `http://localhost:8080/` |
| **Email** | `admin@architectiq.io` |
| **Password** | `Password@12345` |
| **Primary Tenant** | `ArchitectIQ Enterprise` (`a0000000-0000-4000-8000-000000000001`) |
| **Role** | `OWNER` |

---

## 3. Container Services Topology

```
[ Browser / Client ]
         │
         ▼
[ Port 8080: Nginx (architectiq-web-studio) ]
   ├── /      -> Static React Vite SPA Bundle
   └── /api/  -> Proxy Pass http://api:8000/api/
                      │
                      ▼
       [ Port 8000: FastAPI (architectiq-api) ]
              │                 │
              ▼                 ▼
   [ Port 5433: PostgreSQL ]  [ Port 6380: Redis ]
    (architectiq_test)         (Cache / Queue)
```

| Service Container | Image | Port Mapping | Health & Runtime Status |
|---|---|---|---|
| `architectiq-web-studio` | `architectiq-web-studio:latest` | `8080:80` | **Up & Healthy** |
| `architectiq-api` | `architectiq-api:latest` | `8000:8000` | **Up & Healthy** |
| `architectiq-postgres` | `postgres:17` | `5433:5432` | **Up & Healthy** |
| `architectiq-redis` | `redis:7-alpine` | `6380:6379` | **Up & Healthy** |

---

## 4. Live Verification Matrix across the Six Studios

Executed via `scripts/verify_containerized_platform.py` through `http://127.0.0.1:8080`:

| Step | Studio / Domain | Action & Verification | Status |
|:---:|---|---|:---:|
| **1** | **Ingress** | HTTP GET `/` returns Web Studio SPA index bundle | **PASS** |
| **2** | **IAM & Auth** | POST `/api/v1/auth/native/login` returns valid JWT; GET `/api/v1/me/tenants` discovers `ArchitectIQ Enterprise` | **PASS** |
| **3** | **Workspace** | GET `/workspace/tree` and GET `/workspace/summary` return live hierarchy | **PASS** |
| **4** | **Flow Studio** | Created workflow, saved multi-node draft, published Version 1 | **PASS** |
| **5** | **Execution Engine**| Dispatched workflow run (Status: `COMPLETED` in 1ms) and inspected run details | **PASS** |
| **6** | **Observability** | GET `/workspace/observability/overview` returns aggregated incident and health status | **PASS** |
| **7** | **Governance** | POST `/workspace/governance/reports/generate` generates `RESPONSIBLE_AI_SAFETY` audit report | **PASS** |

---

## 5. Certification

All containerized platform services are healthy, responsive, securely proxied, and ready for immediate interactive use.
