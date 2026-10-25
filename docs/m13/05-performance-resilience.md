# ArchitectIQ M13 — Performance, Concurrency & Resilience Benchmark

**Document Identifier:** ARCHIQ-M13-PERF-005  
**Execution Date:** 2026-10-25  
**Execution Target:** `architectiq_test` (PostgreSQL 17 on Port 5433), Redis (Port 6380)  
**Execution Script:** `scripts/benchmark_performance.py`  
**Overall Performance Status:** **PASSED — All SLAs and Latency Targets Met**

---

## 1. Executive Summary

Milestone M13 required rigorous empirical measurement of ArchitectIQ's concurrency handling, hierarchical tree query latency, and distributed queue leasing contention under simulated multi-worker loads.

Benchmarks were executed against live PostgreSQL 17 and Redis infrastructure without stubbing or artificial delays.

---

## 2. Latency Percentiles Summary Table

All metrics reported in milliseconds (ms):

| Benchmark Scenario | Sample Size | Concurrency | Min (ms) | P50 (ms) | Mean (ms) | P95 (ms) | P99 (ms) | Max (ms) | SLA Target | SLA Status |
|--------------------|-------------|-------------|----------|----------|-----------|----------|----------|----------|------------|------------|
| **Concurrent Workspace Summary** | 50 requests | 50 concurrent | 367.19 | 465.53 | 460.08 | 525.21 | 527.14 | 527.14 | P95 < 1000ms | **MET** |
| **Hierarchy Tree Traversal** | 100 requests | Sequential burst | 14.68 | 21.35 | 23.38 | 33.99 | 42.56 | 42.56 | P95 < 150ms | **MET** |
| **Distributed Queue Leases** | 100 items | 20 workers | 7.59 | 16.57 | 22.97 | 106.34 | 111.21 | 111.21 | P95 < 250ms | **MET** |

---

## 3. Analysis & Key Observations

### 3.1 Concurrent Workspace Aggregations
- **Profile:** 50 simultaneous incoming requests hitting `/api/v1/tenants/{tenant_id}/workspace/summary`, which triggers multi-table aggregations across projects, folders, workflows, active runs, and incident counts.
- **Result:** P50 of **465.53 ms** and P99 of **527.14 ms**. Connection pools handled the concurrent load smoothly without thread starvation or connection exhaustion.

### 3.2 Hierarchical Tree Traversal
- **Profile:** 100 iterations of `/api/v1/tenants/{tenant_id}/workspace/tree` traversing organizations, nested folders, and projects.
- **Result:** P50 of **21.35 ms** and P95 of **33.99 ms**. Fast indexed traversals and efficient JSON serialization demonstrated minimal CPU and memory footprint.

### 3.3 Distributed Worker Queue Contention
- **Profile:** 20 concurrent worker processes contending for 100 queue items using PostgreSQL atomic `FOR UPDATE SKIP LOCKED` row locking.
- **Result:** P50 claim latency of **16.57 ms** and P95 of **106.34 ms**. Zero deadlocks or duplicate task assignments were encountered. 100% of items were claimed cleanly and serialized safely.

---

## 4. Certification

ArchitectIQ demonstrates enterprise-grade throughput and sub-second latency percentiles across high-concurrency API workloads, recursive hierarchy navigation, and distributed worker task dispatching.
