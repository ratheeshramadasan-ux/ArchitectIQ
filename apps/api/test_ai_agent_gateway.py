"""Comprehensive automated tests for AI Agent & Model Gateway (Milestone M8).

Covers:
- AG-01: Agent registry, orchestration, tools config, multi-provider model routing.
- AG-02: Token accounting, budgeting & cost tracking, budget limit enforcement (HTTP 402), evaluation benchmarks, cross-tenant isolation.
"""
from __future__ import annotations

import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from authentication import VerifiedIdentity, get_verified_identity
from database import engine
from main import app

client = TestClient(app)


def authenticate_as(user_id: uuid.UUID):
    app.dependency_overrides[get_verified_identity] = lambda: VerifiedIdentity(
        issuer="architectiq-native", subject=str(user_id)
    )


@pytest.fixture
def agent_gateway_env():
    tenant_id = uuid.uuid4()
    org_id = uuid.uuid4()
    folder_id = uuid.uuid4()
    project_id = uuid.uuid4()
    owner_id = uuid.uuid4()
    other_tenant_id = uuid.uuid4()
    other_user_id = uuid.uuid4()
    other_project_id = uuid.uuid4()
    other_org_id = uuid.uuid4()
    other_folder_id = uuid.uuid4()

    suffix = uuid.uuid4().hex[:6]

    with engine.begin() as conn:
        conn.execute(
            text("INSERT INTO public.tenants (id, name, slug, created_at) VALUES (:t, 'AI Studio Tenant', :slug, clock_timestamp())"),
            {"t": tenant_id, "slug": f"ai-t-{suffix}"},
        )
        conn.execute(
            text("INSERT INTO public.tenants (id, name, slug, created_at) VALUES (:t, 'Other Tenant', :slug, clock_timestamp())"),
            {"t": other_tenant_id, "slug": f"other-t-{suffix}"},
        )
        conn.execute(
            text("INSERT INTO public.users (id, display_name, status, created_at) VALUES (:u, 'AI Engineer', 'ACTIVE', clock_timestamp())"),
            {"u": owner_id},
        )
        conn.execute(
            text("INSERT INTO public.users (id, display_name, status, created_at) VALUES (:u, 'Other User', 'ACTIVE', clock_timestamp())"),
            {"u": other_user_id},
        )
        conn.execute(
            text("INSERT INTO public.tenant_memberships (id, user_id, tenant_id, status, created_at) VALUES (:m, :u, :t, 'ACTIVE', clock_timestamp())"),
            {"m": uuid.uuid4(), "u": owner_id, "t": tenant_id},
        )
        conn.execute(
            text("INSERT INTO public.tenant_memberships (id, user_id, tenant_id, status, created_at) VALUES (:m, :u, :t, 'ACTIVE', clock_timestamp())"),
            {"m": uuid.uuid4(), "u": other_user_id, "t": other_tenant_id},
        )
        conn.execute(
            text("INSERT INTO public.organizations (id, tenant_id, name, slug, created_at) VALUES (:o, :t, 'AI Org', :slug, clock_timestamp())"),
            {"o": org_id, "t": tenant_id, "slug": f"ai-org-{suffix}"},
        )
        conn.execute(
            text("INSERT INTO public.organizations (id, tenant_id, name, slug, created_at) VALUES (:o, :t, 'Other Org', :slug, clock_timestamp())"),
            {"o": other_org_id, "t": other_tenant_id, "slug": f"other-org-{suffix}"},
        )
        conn.execute(
            text("INSERT INTO public.folders (id, organization_id, name, created_at) VALUES (:f, :o, 'Agent Folder', clock_timestamp())"),
            {"f": folder_id, "o": org_id},
        )
        conn.execute(
            text("INSERT INTO public.folders (id, organization_id, name, created_at) VALUES (:f, :o, 'Other Folder', clock_timestamp())"),
            {"f": other_folder_id, "o": other_org_id},
        )
        conn.execute(
            text("INSERT INTO public.projects (id, folder_id, name, lifecycle_status, created_at) VALUES (:p, :f, 'AI Copilot Project', 'ACTIVE', clock_timestamp())"),
            {"p": project_id, "f": folder_id},
        )
        conn.execute(
            text("INSERT INTO public.projects (id, folder_id, name, lifecycle_status, created_at) VALUES (:p, :f, 'Other Project', 'ACTIVE', clock_timestamp())"),
            {"p": other_project_id, "f": other_folder_id},
        )
        conn.execute(
            text("INSERT INTO public.project_memberships (id, tenant_id, project_id, user_id, role, created_at) VALUES (:pm, :t, :p, :u, 'OWNER', clock_timestamp())"),
            {"pm": uuid.uuid4(), "t": tenant_id, "p": project_id, "u": owner_id},
        )
        conn.execute(
            text("INSERT INTO public.project_memberships (id, tenant_id, project_id, user_id, role, created_at) VALUES (:pm, :t, :p, :u, 'OWNER', clock_timestamp())"),
            {"pm": uuid.uuid4(), "t": other_tenant_id, "p": other_project_id, "u": other_user_id},
        )

    return {
        "tenant_id": str(tenant_id),
        "project_id": str(project_id),
        "owner_id": owner_id,
        "other_tenant_id": str(other_tenant_id),
        "other_project_id": str(other_project_id),
        "other_user_id": other_user_id,
    }


def test_create_and_list_ai_agents(agent_gateway_env):
    env = agent_gateway_env
    tenant_id = env["tenant_id"]
    project_id = env["project_id"]
    authenticate_as(env["owner_id"])

    headers = {"Authorization": "Bearer test-token"}

    # 1. Create Agent
    create_payload = {
        "name": "Local Qwen3 Code Specialist",
        "slug": "qwen3-code-specialist",
        "description": "Local high-performance code assistant powered by Ollama",
        "system_prompt": "You are an elite Python and TypeScript software architect.",
        "model_provider": "ollama",
        "model_name": "qwen3-coder:30b",
        "temperature": 0.5,
        "max_tokens": 4096,
        "tools_config": [{"tool_name": "code_search"}, {"tool_name": "ast_parser"}],
        "budget_limit_usd": 75.0,
        "status": "ACTIVE",
    }

    res = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/agents",
        json=create_payload,
        headers=headers,
    )
    assert res.status_code == 201, res.text
    agent_data = res.json()
    assert agent_data["name"] == "Local Qwen3 Code Specialist"
    assert agent_data["model_provider"] == "ollama"
    assert agent_data["model_name"] == "qwen3-coder:30b"
    assert agent_data["budget_limit_usd"] == 75.0
    agent_id = agent_data["id"]

    # 2. List Agents
    list_res = client.get(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/agents",
        headers=headers,
    )
    assert list_res.status_code == 200
    agents = list_res.json()
    assert len(agents) == 1
    assert agents[0]["id"] == agent_id
    assert agents[0]["total_spend_usd"] == 0.0
    assert agents[0]["total_invocations"] == 0

    # 3. Get Agent Details
    detail_res = client.get(
        f"/api/v1/tenants/{tenant_id}/workspace/agents/{agent_id}",
        headers=headers,
    )
    assert detail_res.status_code == 200
    assert detail_res.json()["slug"] == "qwen3-code-specialist"


def test_invoke_agent_success_and_token_accounting(agent_gateway_env):
    env = agent_gateway_env
    tenant_id = env["tenant_id"]
    project_id = env["project_id"]
    authenticate_as(env["owner_id"])

    headers = {"Authorization": "Bearer test-token"}

    # Create agent using GPT-4o with pricing
    create_payload = {
        "name": "Cloud GPT-4o Synthesizer",
        "slug": "gpt-4o-synthesizer",
        "system_prompt": "You are an automated code generator for data pipelines.",
        "model_provider": "openai",
        "model_name": "gpt-4o",
        "temperature": 0.7,
        "budget_limit_usd": 10.0,
    }
    create_res = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/agents",
        json=create_payload,
        headers=headers,
    )
    assert create_res.status_code == 201
    agent_id = create_res.json()["id"]

    # Invoke Agent
    invoke_payload = {
        "input_prompt": "Generate a python function for deduplicating transactional streams.",
    }
    invoke_res = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/agents/{agent_id}/invoke",
        json=invoke_payload,
        headers=headers,
    )
    assert invoke_res.status_code == 200, invoke_res.text
    inv_data = invoke_res.json()
    assert inv_data["status"] == "SUCCESS"
    assert inv_data["prompt_tokens"] > 0
    assert inv_data["completion_tokens"] > 0
    assert inv_data["total_tokens"] == inv_data["prompt_tokens"] + inv_data["completion_tokens"]
    assert inv_data["estimated_cost_usd"] > 0.0
    assert "def execute_task" in inv_data["output_text"]

    # Verify Invocations audit log
    inv_list_res = client.get(
        f"/api/v1/tenants/{tenant_id}/workspace/agents/{agent_id}/invocations",
        headers=headers,
    )
    assert inv_list_res.status_code == 200
    invs = inv_list_res.json()
    assert len(invs) == 1
    assert invs[0]["id"] == inv_data["invocation_id"]

    # Verify spend accumulated on Agent
    agent_res = client.get(
        f"/api/v1/tenants/{tenant_id}/workspace/agents/{agent_id}",
        headers=headers,
    )
    assert agent_res.status_code == 200
    assert agent_res.json()["total_spend_usd"] == inv_data["estimated_cost_usd"]
    assert agent_res.json()["total_invocations"] == 1


def test_agent_budget_limit_enforcement(agent_gateway_env):
    env = agent_gateway_env
    tenant_id = env["tenant_id"]
    project_id = env["project_id"]
    authenticate_as(env["owner_id"])

    headers = {"Authorization": "Bearer test-token"}

    # Set budget limit very low (e.g., $0.0001)
    create_payload = {
        "name": "Budget Constrained Agent",
        "slug": "budget-constrained-agent",
        "system_prompt": "You are a financial auditor assistant.",
        "model_provider": "openai",
        "model_name": "gpt-4o",
        "budget_limit_usd": 0.0001,
    }
    create_res = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/agents",
        json=create_payload,
        headers=headers,
    )
    assert create_res.status_code == 201
    agent_id = create_res.json()["id"]

    # 1. First invocation consumes tokens and costs > $0.0001
    inv_res_1 = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/agents/{agent_id}/invoke",
        json={"input_prompt": "Perform initial audit of account balances"},
        headers=headers,
    )
    assert inv_res_1.status_code == 200

    # 2. Second invocation: spend exceeds $0.0001 limit -> HTTP 402 PAYMENT REQUIRED
    inv_res_2 = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/agents/{agent_id}/invoke",
        json={"input_prompt": "Second query that should exceed budget"},
        headers=headers,
    )
    assert inv_res_2.status_code == 402
    assert "budget limit" in inv_res_2.text.lower()


def test_run_agent_evaluations(agent_gateway_env):
    env = agent_gateway_env
    tenant_id = env["tenant_id"]
    project_id = env["project_id"]
    authenticate_as(env["owner_id"])

    headers = {"Authorization": "Bearer test-token"}

    create_payload = {
        "name": "Benchmark Evaluation Agent",
        "slug": "benchmark-eval-agent",
        "system_prompt": "Expert Python developer specializing in microservices.",
        "model_provider": "ollama",
        "model_name": "qwen3-coder:30b",
    }
    create_res = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}/agents",
        json=create_payload,
        headers=headers,
    )
    assert create_res.status_code == 201
    agent_id = create_res.json()["id"]

    # Run Benchmark Evaluation
    eval_payload = {
        "eval_name": "Architecture Competency Benchmark",
        "test_cases": [
            {
                "name": "Python Function Generation",
                "input": "Write a python function for caching user tokens",
                "expected_substring": "def execute_task",
            },
            {
                "name": "Negative Substring Assertion",
                "input": "Summarize operational protocols",
                "expected_substring": "Analysis of query",
            },
        ],
    }

    eval_res = client.post(
        f"/api/v1/tenants/{tenant_id}/workspace/agents/{agent_id}/evaluations",
        json=eval_payload,
        headers=headers,
    )
    assert eval_res.status_code == 201, eval_res.text
    eval_data = eval_res.json()
    assert eval_data["eval_name"] == "Architecture Competency Benchmark"
    assert eval_data["pass_rate"] == 100.0
    assert eval_data["results"]["passed_cases"] == 2

    # List evaluations
    list_res = client.get(
        f"/api/v1/tenants/{tenant_id}/workspace/agents/{agent_id}/evaluations",
        headers=headers,
    )
    assert list_res.status_code == 200
    evals = list_res.json()
    assert len(evals) == 1
    assert evals[0]["id"] == eval_data["id"]


def test_ai_agent_cross_tenant_isolation(agent_gateway_env):
    env = agent_gateway_env
    tenant_1 = env["tenant_id"]
    proj_1 = env["project_id"]
    tenant_2 = env["other_tenant_id"]

    authenticate_as(env["owner_id"])
    headers_1 = {"Authorization": "Bearer test-token"}

    # Create agent in Tenant 1
    create_res = client.post(
        f"/api/v1/tenants/{tenant_1}/workspace/projects/{proj_1}/agents",
        json={
            "name": "Confidential Tenant 1 Agent",
            "slug": "t1-agent",
            "system_prompt": "Classified proprietary intelligence",
        },
        headers=headers_1,
    )
    assert create_res.status_code == 201
    agent_id = create_res.json()["id"]

    # Switch to User in Tenant 2
    authenticate_as(env["other_user_id"])
    headers_2 = {"Authorization": "Bearer test-token"}

    # Tenant 2 cannot get Tenant 1 agent
    res = client.get(
        f"/api/v1/tenants/{tenant_2}/workspace/agents/{agent_id}",
        headers=headers_2,
    )
    assert res.status_code == 404

    # Tenant 2 cannot invoke Tenant 1 agent
    inv_res = client.post(
        f"/api/v1/tenants/{tenant_2}/workspace/agents/{agent_id}/invoke",
        json={"input_prompt": "Attempt cross-tenant extraction"},
        headers=headers_2,
    )
    assert inv_res.status_code == 404
