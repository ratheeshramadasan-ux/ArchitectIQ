import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import AgentStudio from './AgentStudio'

const sampleAgents = [
  {
    id: 'agent-101-uuid',
    tenant_id: 'tenant-1',
    project_id: 'proj-1',
    name: 'Local Qwen3 Code Specialist',
    slug: 'qwen3-code-specialist',
    description: 'Local coding assistant',
    system_prompt: 'You are an elite Python and TypeScript software architect.',
    model_provider: 'ollama',
    model_name: 'qwen3-coder:30b',
    temperature: 0.5,
    max_tokens: 4096,
    tools_config: [{ tool_name: 'code_search' }],
    budget_limit_usd: 75.0,
    total_spend_usd: 0.0,
    total_invocations: 0,
    status: 'ACTIVE',
    created_at: '2026-10-25T12:00:00Z',
    updated_at: '2026-10-25T12:00:00Z',
  },
]

const sampleInvocations = [
  {
    id: 'inv-1',
    agent_id: 'agent-101-uuid',
    input_prompt: 'Write factorial function',
    output_text: 'def factorial(n): return 1 if n <= 1 else n * factorial(n - 1)',
    model_used: 'ollama:qwen3-coder:30b',
    prompt_tokens: 15,
    completion_tokens: 30,
    total_tokens: 45,
    estimated_cost_usd: 0.0,
    duration_ms: 120,
    status: 'SUCCESS',
    created_at: '2026-10-25T12:05:00Z',
  },
]

describe('AgentStudio — M8 AI Agent & Model Gateway Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    globalThis.fetch = vi.fn().mockImplementation((url: string | URL | Request, init?: RequestInit) => {
      const urlStr = String(url)
      const method = init?.method || 'GET'

      if (urlStr.includes('/agents/agent-101-uuid/invoke') && method === 'POST') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              invocation_id: 'inv-new',
              agent_id: 'agent-101-uuid',
              input_prompt: 'Test prompt',
              output_text: '[OLLAMA:qwen3-coder:30b] Verified code output:\ndef test_run(): pass',
              model_used: 'ollama:qwen3-coder:30b',
              prompt_tokens: 20,
              completion_tokens: 25,
              total_tokens: 45,
              estimated_cost_usd: 0.0,
              duration_ms: 85,
              status: 'SUCCESS',
            }),
        })
      }

      if (urlStr.includes('/agents/agent-101-uuid/evaluations') && method === 'POST') {
        return Promise.resolve({
          ok: true,
          status: 201,
          json: () =>
            Promise.resolve({
              id: 'eval-1',
              agent_id: 'agent-101-uuid',
              eval_name: 'Automated Eval Test',
              test_cases: [],
              results: {
                total_cases: 2,
                passed_cases: 2,
                failed_cases: 0,
                cases: [
                  {
                    case_name: 'Python Implementation Check',
                    passed: true,
                    reason: 'Pass',
                    duration_ms: 45,
                  },
                ],
              },
              pass_rate: 100.0,
              created_at: '2026-10-25T12:10:00Z',
            }),
        })
      }

      if (urlStr.includes('/agents/agent-101-uuid/invocations')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(sampleInvocations),
        })
      }

      if (urlStr.includes('/agents/agent-101-uuid/evaluations')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve([]),
        })
      }

      if (urlStr.includes('/projects/proj-1/agents')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(sampleAgents),
        })
      }

      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve([]),
      })
    })
  })

  it('renders agent studio header, agent list, and config', async () => {
    render(
      <AgentStudio
        token="test-token"
        tenant="tenant-uuid-1"
        projectId="proj-1"
      />
    )

    expect(screen.getByText('AI Agent & Model Gateway')).toBeDefined()
    expect(screen.getByText(/MULTI-MODEL GATEWAY & BENCHMARKS/i)).toBeDefined()

    await waitFor(() => {
      expect(screen.getAllByText('Local Qwen3 Code Specialist').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText(/qwen3-coder:30b/i).length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText('System Prompt Directive')).toBeDefined()
    })
  })

  it('switches to Playground tab and invokes agent inference', async () => {
    render(
      <AgentStudio
        token="test-token"
        tenant="tenant-uuid-1"
        projectId="proj-1"
      />
    )

    await waitFor(() => {
      expect(screen.getAllByText('Local Qwen3 Code Specialist').length).toBeGreaterThanOrEqual(1)
    })

    // Click Playground tab
    const playgroundTabBtn = screen.getByText('Interactive Playground')
    fireEvent.click(playgroundTabBtn)

    expect(screen.getByText('Test Input Prompt')).toBeDefined()
    expect(screen.getByText('Invoke Agent')).toBeDefined()

    // Trigger invocation
    fireEvent.click(screen.getByText('Invoke Agent'))

    await waitFor(() => {
      expect(screen.getByText(/Agent invocation completed successfully!/i)).toBeDefined()
      expect(screen.getByText(/Verified code output:/i)).toBeDefined()
    })
  })

  it('switches to Evaluations tab and runs benchmark test suite', async () => {
    render(
      <AgentStudio
        token="test-token"
        tenant="tenant-uuid-1"
        projectId="proj-1"
      />
    )

    await waitFor(() => {
      expect(screen.getAllByText('Local Qwen3 Code Specialist').length).toBeGreaterThanOrEqual(1)
    })

    // Click Benchmarks tab
    const evalsTabBtn = screen.getByRole('button', { name: /Benchmarks/i })
    fireEvent.click(evalsTabBtn)

    const runEvalBtn = screen.getByRole('button', { name: /Run Evaluation Benchmark/i })
    expect(runEvalBtn).toBeDefined()

    // Run Benchmark
    fireEvent.click(runEvalBtn)

    await waitFor(() => {
      expect(screen.getByText(/Evaluation completed! Pass rate: 100%/i)).toBeDefined()
      expect(screen.getByText('100% Pass Rate')).toBeDefined()
    })
  })
})
