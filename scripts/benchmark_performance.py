"""ArchitectIQ Milestone M13 — Performance, Concurrency & Resilience Benchmark.

Benchmarks:
1. 50 concurrent client connections to `/workspace/summary`.
2. High-depth hierarchical project tree traversal latency over 100 iterations.
3. Queue leasing contention under concurrent worker contention.
4. Latency percentiles (Min, Max, Mean, P50, P95, P99).
"""
import concurrent.futures
import json
import os
import sys
import time
import uuid
from datetime import UTC, datetime

from pathlib import Path
from dotenv import dotenv_values
from sqlalchemy.engine import make_url

# Configure isolated test database environment matching conftest.py
env_file = Path(__file__).resolve().parent.parent / "apps" / "api" / ".env"
file_values = dotenv_values(env_file) if env_file.exists() else {}

for key, expected_role in [
    ("DATABASE_URL", "architectiq"),
    ("APP_DATABASE_URL", "architectiq_app"),
    ("IAM_DATABASE_URL", "architectiq_iam_login"),
    ("AUDIT_DATABASE_URL", "architectiq_audit_writer"),
]:
    raw = os.environ.get(key) or file_values.get(key)
    if raw:
        url = make_url(raw)
        os.environ[key] = url.set(database="architectiq_test").render_as_string(hide_password=False)

os.environ.setdefault("REDIS_URL", "redis://127.0.0.1:6380/0")

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "apps", "api")))

from fastapi.testclient import TestClient
from sqlalchemy import text

from authentication import VerifiedIdentity, get_verified_identity
from database import engine
from main import app

client = TestClient(app)


def calculate_percentiles(latencies_ms: list[float]) -> dict[str, float]:
    if not latencies_ms:
        return {"min": 0, "max": 0, "mean": 0, "p50": 0, "p95": 0, "p99": 0}
    sorted_l = sorted(latencies_ms)
    n = len(sorted_l)
    return {
        "min": round(sorted_l[0], 2),
        "max": round(sorted_l[-1], 2),
        "mean": round(sum(sorted_l) / n, 2),
        "p50": round(sorted_l[int(n * 0.50)], 2),
        "p95": round(sorted_l[min(int(n * 0.95), n - 1)], 2),
        "p99": round(sorted_l[min(int(n * 0.99), n - 1)], 2),
    }


def run_benchmarks():
    print("=== ARCHITECTIQ M13 PERFORMANCE & RESILIENCE BENCHMARK ===")
    tenant_id = uuid.uuid4()
    org_id = uuid.uuid4()
    folder_id = uuid.uuid4()
    admin_id = uuid.uuid4()
    suffix = uuid.uuid4().hex[:6]

    with engine.begin() as conn:
        conn.execute(
            text("INSERT INTO public.tenants (id, name, slug, created_at) VALUES (:t, 'Perf Tenant', :s, clock_timestamp())"),
            {"t": tenant_id, "s": f"perf-{suffix}"},
        )
        conn.execute(
            text("INSERT INTO public.users (id, display_name, status, created_at) VALUES (:u, 'Perf Admin', 'ACTIVE', clock_timestamp())"),
            {"u": admin_id},
        )
        conn.execute(
            text("INSERT INTO public.tenant_memberships (id, user_id, tenant_id, status, created_at) VALUES (gen_random_uuid(), :u, :t, 'ACTIVE', clock_timestamp())"),
            {"u": admin_id, "t": tenant_id},
        )
        conn.execute(
            text("INSERT INTO public.organizations (id, tenant_id, name, slug, created_at) VALUES (:o, :t, 'Perf Org', :s, clock_timestamp())"),
            {"o": org_id, "t": tenant_id, "s": f"perf-org-{suffix}"},
        )
        conn.execute(
            text("INSERT INTO public.folders (id, organization_id, name, created_at) VALUES (:f, :o, 'Perf Root Folder', clock_timestamp())"),
            {"f": folder_id, "o": org_id},
        )
        # Populate 15 projects in this folder
        for i in range(15):
            pid = uuid.uuid4()
            conn.execute(
                text("INSERT INTO public.projects (id, folder_id, name, lifecycle_status, created_at) VALUES (:p, :f, :name, 'ACTIVE', clock_timestamp())"),
                {"p": pid, "f": folder_id, "name": f"Perf Project {i}"},
            )
            conn.execute(
                text("INSERT INTO public.project_memberships (id, tenant_id, project_id, user_id, role, created_at) VALUES (gen_random_uuid(), :t, :p, :u, 'OWNER', clock_timestamp())"),
                {"t": tenant_id, "p": pid, "u": admin_id},
            )

    app.dependency_overrides[get_verified_identity] = lambda: VerifiedIdentity(
        issuer="architectiq-native", subject=str(admin_id)
    )

    results = {}

    # 1. 50 Concurrent API Requests to /workspace/summary
    print("\n[1/3] Benchmarking 50 Concurrent API Requests to /workspace/summary...")
    summary_latencies = []

    def fetch_summary():
        t0 = time.perf_counter()
        resp = client.get(
            f"/api/v1/tenants/{tenant_id}/workspace/summary",
            headers={"Authorization": "Bearer perf-token"},
        )
        elapsed = (time.perf_counter() - t0) * 1000.0
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        return elapsed

    with concurrent.futures.ThreadPoolExecutor(max_workers=50) as executor:
        futures = [executor.submit(fetch_summary) for _ in range(50)]
        for f in concurrent.futures.as_completed(futures):
            summary_latencies.append(f.result())

    results["concurrent_summary_50"] = calculate_percentiles(summary_latencies)
    print(f"  Summary P50: {results['concurrent_summary_50']['p50']}ms | P95: {results['concurrent_summary_50']['p95']}ms | P99: {results['concurrent_summary_50']['p99']}ms")

    # 2. Hierarchy Tree Traversal (100 sequential & burst iterations)
    print("\n[2/3] Benchmarking Hierarchy Tree Traversal Latency (100 iterations)...")
    tree_latencies = []
    for _ in range(100):
        t0 = time.perf_counter()
        resp = client.get(
            f"/api/v1/tenants/{tenant_id}/workspace/tree",
            headers={"Authorization": "Bearer perf-token"},
        )
        elapsed = (time.perf_counter() - t0) * 1000.0
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        tree_latencies.append(elapsed)

    results["tree_traversal_100"] = calculate_percentiles(tree_latencies)
    print(f"  Tree P50: {results['tree_traversal_100']['p50']}ms | P95: {results['tree_traversal_100']['p95']}ms | P99: {results['tree_traversal_100']['p99']}ms")

    # 3. Queue Contention Under Concurrent Worker Leases
    print("\n[3/3] Benchmarking Queue Contention (100 items, 20 concurrent worker leases)...")
    wf_id = uuid.uuid4()
    run_id = uuid.uuid4()
    with engine.begin() as conn:
        conn.execute(
            text("""
                INSERT INTO public.workflow_definitions (
                    id, tenant_id, project_id, name, slug, current_version, status, created_at, updated_at
                ) VALUES (
                    :wfid, :tid, :pid, 'Queue Benchmark Workflow', 'queue-bench-wf', 1, 'PUBLISHED', clock_timestamp(), clock_timestamp()
                )
            """),
            {"wfid": wf_id, "tid": tenant_id, "pid": pid},
        )
        conn.execute(
            text("""
                INSERT INTO public.workflow_runs (
                    id, tenant_id, project_id, workflow_id, workflow_version, status, trigger_type, created_at
                ) VALUES (
                    :rid, :tid, :pid, :wfid, 1, 'RUNNING', 'MANUAL', clock_timestamp()
                )
            """),
            {"rid": run_id, "tid": tenant_id, "pid": pid, "wfid": wf_id},
        )
        for idx in range(100):
            conn.execute(
                text("""
                    INSERT INTO public.workflow_queues (
                        id, tenant_id, run_id, queue_name, priority, status, attempts, max_attempts, payload, created_at
                    ) VALUES (
                        gen_random_uuid(), :tid, :rid, 'contention-bench', :prio, 'QUEUED', 0, 3, '{"job": true}'::jsonb, clock_timestamp()
                    )
                """),
                {"tid": tenant_id, "rid": run_id, "prio": idx % 5},
            )

    queue_latencies = []

    def lease_queue_item(worker_id: int):
        t0 = time.perf_counter()
        with engine.begin() as conn:
            # Atomic claim using SKIP LOCKED
            claimed = conn.execute(
                text("""
                    WITH next_item AS (
                        SELECT id FROM public.workflow_queues
                        WHERE tenant_id = :tid AND status = 'QUEUED' AND queue_name = 'contention-bench'
                        ORDER BY priority DESC, created_at ASC
                        FOR UPDATE SKIP LOCKED
                        LIMIT 1
                    )
                    UPDATE public.workflow_queues q
                    SET status = 'PROCESSING',
                        locked_by = :worker,
                        locked_at = clock_timestamp(),
                        attempts = attempts + 1
                    FROM next_item
                    WHERE q.id = next_item.id
                    RETURNING q.id
                """),
                {"tid": tenant_id, "worker": f"worker-{worker_id}"},
            ).scalar()
        elapsed = (time.perf_counter() - t0) * 1000.0
        return elapsed, claimed is not None

    with concurrent.futures.ThreadPoolExecutor(max_workers=20) as executor:
        futures = [executor.submit(lease_queue_item, i) for i in range(100)]
        for f in concurrent.futures.as_completed(futures):
            elapsed, was_claimed = f.result()
            queue_latencies.append(elapsed)

    results["queue_contention_leases"] = calculate_percentiles(queue_latencies)
    print(f"  Queue Lease P50: {results['queue_contention_leases']['p50']}ms | P95: {results['queue_contention_leases']['p95']}ms | P99: {results['queue_contention_leases']['p99']}ms")

    print("\n=== BENCHMARK SUMMARY RESULTS ===")
    print(json.dumps(results, indent=2))
    return results


if __name__ == "__main__":
    run_benchmarks()
