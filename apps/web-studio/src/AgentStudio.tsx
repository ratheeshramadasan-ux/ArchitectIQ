import { useState, useEffect, useCallback } from 'react'
import {
  Bot,
  Cpu,
  Play,
  CheckCircle2,
  XCircle,
  Plus,
  RefreshCw,
  Sparkles,
} from 'lucide-react'

export interface AIAgentItem {
  id: string
  tenant_id: string
  project_id: string
  name: string
  slug: string
  description?: string
  system_prompt: string
  model_provider: string
  model_name: string
  temperature: number
  max_tokens: number
  tools_config: { tool_name: string }[]
  budget_limit_usd: number
  total_spend_usd: number
  total_invocations: number
  status: string
  created_at: string
  updated_at: string
}

export interface InvocationItem {
  id: string
  agent_id: string
  input_prompt: string
  output_text?: string
  model_used: string
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  estimated_cost_usd: number
  duration_ms: number
  status: string
  error_message?: string
  created_at: string
}

export interface EvaluationItem {
  id: string
  agent_id: string
  eval_name: string
  test_cases: { name: string; input: string; expected_substring?: string }[]
  results: {
    total_cases: number
    passed_cases: number
    failed_cases: number
    cases: {
      case_name: string
      input: string
      output_preview: string
      passed: boolean
      reason: string
      tokens: number
      duration_ms: number
    }[]
  }
  pass_rate: number
  created_at: string
}

export default function AgentStudio({
  token,
  tenant,
  projectId: propProjectId,
}: {
  token: string
  tenant: string
  projectId?: string
}) {
  const [activeTab, setActiveTab] = useState<'Registry' | 'Playground' | 'Metering' | 'Evaluations'>('Registry')
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(propProjectId || null)
  const effectiveProjectId = propProjectId || selectedProjectId

  // Agent State
  const [agents, setAgents] = useState<AIAgentItem[]>([])
  const [selectedAgent, setSelectedAgent] = useState<AIAgentItem | null>(null)
  const [invocations, setInvocations] = useState<InvocationItem[]>([])
  const [evaluations, setEvaluations] = useState<EvaluationItem[]>([])

  // Playground State
  const [promptInput, setPromptInput] = useState('Write a python function to validate enterprise email domains.')
  const [playgroundOutput, setPlaygroundOutput] = useState<string | null>(null)
  const [lastInvocationMetrics, setLastInvocationMetrics] = useState<{
    promptTokens: number
    completionTokens: number
    cost: number
    latency: number
    model: string
  } | null>(null)

  // Modals & Feedback
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [newAgentName, setNewAgentName] = useState('')
  const [newAgentSlug, setNewAgentSlug] = useState('')
  const [newAgentProvider, setNewAgentProvider] = useState('ollama')
  const [newAgentModel, setNewAgentModel] = useState('qwen3-coder:30b')
  const [newAgentPrompt, setNewAgentPrompt] = useState('You are an expert enterprise automation architect.')
  const [newAgentBudget, setNewAgentBudget] = useState(50.0)

  // Status
  const [busy, setBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const base = `/api/v1/tenants/${tenant}/workspace`

  const callApi = useCallback(
    async (path: string, init?: RequestInit) => {
      const res = await fetch(`${base}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...init?.headers,
        },
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(`API Error (${res.status}): ${text.slice(0, 200)}`)
      }
      return res.json()
    },
    [base, token]
  )

  // Discover projects
  useEffect(() => {
    let cancelled = false
    if (propProjectId || !token) return

    type TreeItemRaw = { id: string; name: string; kind: string; children?: TreeItemRaw[] }
    callApi('/tree')
      .then((tree: TreeItemRaw[]) => {
        if (cancelled) return
        const found: { id: string; name: string }[] = []
        const walk = (items: TreeItemRaw[]) => {
          for (const item of items) {
            if (item.kind === 'project') found.push({ id: item.id, name: item.name })
            if (item.children) walk(item.children)
          }
        }
        if (Array.isArray(tree)) walk(tree)
        setProjects(found)
        if (found.length > 0 && !selectedProjectId) {
          setSelectedProjectId(found[0].id)
        }
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [callApi, propProjectId, token, selectedProjectId])

  // Load agents for project
  useEffect(() => {
    let cancelled = false
    if (!token || !effectiveProjectId) return

    callApi(`/projects/${effectiveProjectId}/agents`)
      .then((data: AIAgentItem[]) => {
        if (!cancelled) {
          setAgents(data)
          if (data.length > 0 && !selectedAgent) {
            setSelectedAgent(data[0])
          }
        }
      })
      .catch((e) => {
        if (!cancelled) setErrorMessage(e instanceof Error ? e.message : 'Failed to fetch agents')
      })

    return () => {
      cancelled = true
    }
  }, [callApi, token, effectiveProjectId, selectedAgent])

  // Load invocations & evaluations when agent is selected
  useEffect(() => {
    let cancelled = false
    if (!token || !selectedAgent) return

    callApi(`/agents/${selectedAgent.id}/invocations`)
      .then((data: InvocationItem[]) => {
        if (!cancelled) setInvocations(data)
      })
      .catch(() => {})

    callApi(`/agents/${selectedAgent.id}/evaluations`)
      .then((data: EvaluationItem[]) => {
        if (!cancelled) setEvaluations(data)
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [callApi, token, selectedAgent])

  const refreshAgents = () => {
    if (!effectiveProjectId) return
    setBusy(true)
    callApi(`/projects/${effectiveProjectId}/agents`)
      .then((data: AIAgentItem[]) => {
        setAgents(data)
        if (data.length > 0) {
          const matched = data.find((a) => a.id === selectedAgent?.id)
          setSelectedAgent(matched || data[0])
        }
      })
      .finally(() => setBusy(false))
  }

  const handleCreateAgent = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!effectiveProjectId) return
    setBusy(true)
    setErrorMessage('')
    setSuccessMessage('')

    try {
      const payload = {
        name: newAgentName,
        slug: newAgentSlug || newAgentName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        system_prompt: newAgentPrompt,
        model_provider: newAgentProvider,
        model_name: newAgentModel,
        budget_limit_usd: Number(newAgentBudget),
        status: 'ACTIVE',
      }
      const created = await callApi(`/projects/${effectiveProjectId}/agents`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setAgents([created, ...agents])
      setSelectedAgent(created)
      setCreateModalOpen(false)
      setSuccessMessage(`Agent '${created.name}' created successfully!`)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to create agent')
    } finally {
      setBusy(false)
    }
  }

  const handleInvokePlayground = async () => {
    if (!selectedAgent) return
    setBusy(true)
    setErrorMessage('')
    setSuccessMessage('')

    try {
      const res = await callApi(`/agents/${selectedAgent.id}/invoke`, {
        method: 'POST',
        body: JSON.stringify({ input_prompt: promptInput }),
      })
      setPlaygroundOutput(res.output_text)
      setLastInvocationMetrics({
        promptTokens: res.prompt_tokens,
        completionTokens: res.completion_tokens,
        cost: res.estimated_cost_usd,
        latency: res.duration_ms,
        model: res.model_used,
      })
      setSuccessMessage('Agent invocation completed successfully!')
      // Refresh invocations
      callApi(`/agents/${selectedAgent.id}/invocations`).then((data: InvocationItem[]) => setInvocations(data))
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Inference failed')
    } finally {
      setBusy(false)
    }
  }

  const handleRunEvaluation = async () => {
    if (!selectedAgent) return
    setBusy(true)
    setErrorMessage('')
    setSuccessMessage('')

    try {
      const evalPayload = {
        eval_name: `Automated Eval - ${new Date().toLocaleTimeString()}`,
        test_cases: [
          {
            name: 'Python Implementation Check',
            input: 'Write a python function to compute factorial',
            expected_substring: 'def ',
          },
          {
            name: 'Structured Result Assertion',
            input: 'Execute task analysis for incoming transaction batch',
            expected_substring: 'result',
          },
        ],
      }
      const evalRes = await callApi(`/agents/${selectedAgent.id}/evaluations`, {
        method: 'POST',
        body: JSON.stringify(evalPayload),
      })
      setEvaluations([evalRes, ...evaluations])
      setSuccessMessage(`Evaluation completed! Pass rate: ${evalRes.pass_rate}%`)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Evaluation run failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="agent-studio-container" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)', minHeight: 600 }}>
      {/* Top Header */}
      <header className="glass" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderRadius: 14, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ display: 'grid', placeItems: 'center', width: 36, height: 36, borderRadius: 10, background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa' }}>
            <Bot size={20} />
          </span>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ fontSize: 17, margin: 0, fontWeight: 700 }}>AI Agent & Model Gateway</h2>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'rgba(59, 130, 246, 0.2)', color: '#93c5fd', border: '1px solid rgba(59, 130, 246, 0.4)' }}>
                MULTI-MODEL GATEWAY & BENCHMARKS
              </span>
            </div>
            {/* Tabs */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
              <div style={{ display: 'flex', gap: 4 }}>
                {(['Registry', 'Playground', 'Metering', 'Evaluations'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    style={{
                      border: 'none',
                      background: activeTab === tab ? 'rgba(255,255,255,0.1)' : 'transparent',
                      color: activeTab === tab ? '#f8fafc' : '#94a3b8',
                      padding: '3px 9px',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {tab === 'Registry' && `Agents (${agents.length})`}
                    {tab === 'Playground' && 'Interactive Playground'}
                    {tab === 'Metering' && 'Token & Spend Metering'}
                    {tab === 'Evaluations' && `Benchmarks (${evaluations.length})`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Project selector if not pre-bound */}
          {!propProjectId && projects.length > 0 && (
            <select
              aria-label="Target Project"
              value={selectedProjectId || ''}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc', padding: '6px 12px', borderRadius: 8, fontSize: 12 }}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id} style={{ background: '#0f172a' }}>
                  {p.name}
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            className="secondary-button"
            onClick={refreshAgents}
            disabled={busy}
            style={{ fontSize: 12, padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <RefreshCw size={14} className={busy ? 'spin' : ''} /> Refresh
          </button>

          <button
            type="button"
            className="primary-button"
            onClick={() => setCreateModalOpen(true)}
            style={{ fontSize: 12, padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Plus size={14} /> New AI Agent
          </button>
        </div>
      </header>

      {/* Notifications */}
      {errorMessage && (
        <div style={{ padding: '8px 14px', borderRadius: 8, background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#fca5a5', fontSize: 12, marginBottom: 12 }}>
          {errorMessage}
        </div>
      )}
      {successMessage && (
        <div style={{ padding: '8px 14px', borderRadius: 8, background: 'rgba(34, 197, 94, 0.15)', border: '1px solid rgba(34, 197, 94, 0.3)', color: '#86efac', fontSize: 12, marginBottom: 12 }}>
          {successMessage}
        </div>
      )}

      {/* Main Workspace Split Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 14, flex: 1, minHeight: 0 }}>
        {/* Sidebar: Agents List */}
        <aside className="glass" style={{ padding: 14, borderRadius: 14, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <h3 style={{ fontSize: 12, margin: 0, textTransform: 'uppercase', letterSpacing: 0.8, color: '#94a3b8' }}>
              Registered AI Agents ({agents.length})
            </h3>
          </div>

          {agents.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px 10px', color: '#64748b', fontSize: 12 }}>
              No AI agents configured in this project. Click <strong>New AI Agent</strong> above.
            </div>
          ) : (
            agents.map((agent) => {
              const isSelected = selectedAgent?.id === agent.id
              const isLocal = agent.model_provider === 'ollama'

              return (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => setSelectedAgent(agent)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    padding: 12,
                    borderRadius: 10,
                    border: isSelected ? '1px solid #3b82f6' : '1px solid rgba(255,255,255,0.06)',
                    background: isSelected ? 'rgba(59, 130, 246, 0.12)' : 'rgba(255,255,255,0.02)',
                    textAlign: 'left',
                    cursor: 'pointer',
                    color: '#f8fafc',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <strong style={{ fontSize: 13 }}>{agent.name}</strong>
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        padding: '2px 6px',
                        borderRadius: 4,
                        background: isLocal ? 'rgba(34, 197, 94, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                        color: isLocal ? '#86efac' : '#93c5fd',
                      }}
                    >
                      {agent.model_provider.toUpperCase()}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Cpu size={12} /> {agent.model_name}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: '#64748b', marginTop: 2 }}>
                    <span>Budget: ${agent.budget_limit_usd.toFixed(2)}</span>
                    <span style={{ color: agent.total_spend_usd > agent.budget_limit_usd ? '#f87171' : '#a3e635' }}>
                      Spend: ${agent.total_spend_usd.toFixed(4)}
                    </span>
                  </div>
                </button>
              )
            })
          )}
        </aside>

        {/* Right Detail Pane */}
        <main className="glass" style={{ padding: 18, borderRadius: 14, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {selectedAgent ? (
            <>
              {/* Agent Header Card */}
              <div style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 14, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                  <h3 style={{ fontSize: 18, margin: 0, fontWeight: 700 }}>{selectedAgent.name}</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4, fontSize: 12, color: '#94a3b8' }}>
                    <span>Model: <strong>{selectedAgent.model_provider}:{selectedAgent.model_name}</strong></span>
                    <span>·</span>
                    <span>Temperature: {selectedAgent.temperature}</span>
                    <span>·</span>
                    <span>Max Tokens: {selectedAgent.max_tokens}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>Budget Utilization</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#4ade80' }}>
                      ${selectedAgent.total_spend_usd.toFixed(4)} / ${selectedAgent.budget_limit_usd.toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Tab: Registry & Config */}
              {activeTab === 'Registry' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <h4 style={{ fontSize: 12, textTransform: 'uppercase', color: '#94a3b8', margin: '0 0 6px 0' }}>System Prompt Directive</h4>
                    <pre style={{ margin: 0, padding: 12, borderRadius: 8, background: 'rgba(0,0,0,0.3)', fontSize: 12, color: '#cbd5e1', whiteSpace: 'pre-wrap' }}>
                      {selectedAgent.system_prompt}
                    </pre>
                  </div>

                  <div>
                    <h4 style={{ fontSize: 12, textTransform: 'uppercase', color: '#94a3b8', margin: '0 0 6px 0' }}>Enabled Tool Registry</h4>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {selectedAgent.tools_config.length === 0 ? (
                        <span style={{ fontSize: 12, color: '#64748b' }}>No external tools bound. Agent operates in pure synthesis mode.</span>
                      ) : (
                        selectedAgent.tools_config.map((t, idx) => (
                          <span key={idx} style={{ padding: '4px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', fontSize: 11, color: '#93c5fd' }}>
                            {t.tool_name}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Tab: Interactive Playground */}
              {activeTab === 'Playground' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <label htmlFor="playground-prompt-input" style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8' }}>Test Input Prompt</label>
                      <button
                        type="button"
                        className="primary-button"
                        onClick={handleInvokePlayground}
                        disabled={busy}
                        style={{ fontSize: 12, padding: '4px 12px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      >
                        <Play size={12} /> Invoke Agent
                      </button>
                    </div>
                    <textarea
                      id="playground-prompt-input"
                      value={promptInput}
                      onChange={(e) => setPromptInput(e.target.value)}
                      rows={3}
                      style={{ width: '100%', boxSizing: 'border-box', padding: 10, borderRadius: 8, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc', fontSize: 13, resize: 'vertical' }}
                    />
                  </div>

                  {/* Output and Metrics */}
                  {playgroundOutput && (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8' }}>Inference Output</span>
                        {lastInvocationMetrics && (
                          <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#4ade80' }}>
                            <span>Latency: {lastInvocationMetrics.latency}ms</span>
                            <span>Tokens: {lastInvocationMetrics.promptTokens} in / {lastInvocationMetrics.completionTokens} out</span>
                            <span>Cost: ${lastInvocationMetrics.cost.toFixed(6)}</span>
                          </div>
                        )}
                      </div>
                      <pre style={{ margin: 0, padding: 14, borderRadius: 8, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)', fontSize: 12, color: '#f8fafc', whiteSpace: 'pre-wrap', maxHeight: 280, overflowY: 'auto' }}>
                        {playgroundOutput}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {/* Tab: Metering & Invocations */}
              {activeTab === 'Metering' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                    <div style={{ padding: 12, borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <small style={{ color: '#94a3b8', fontSize: 11 }}>Total Invocations</small>
                      <div style={{ fontSize: 20, fontWeight: 700, color: '#60a5fa', marginTop: 4 }}>
                        {selectedAgent.total_invocations}
                      </div>
                    </div>
                    <div style={{ padding: 12, borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <small style={{ color: '#94a3b8', fontSize: 11 }}>Total Cumulative Spend</small>
                      <div style={{ fontSize: 20, fontWeight: 700, color: '#4ade80', marginTop: 4 }}>
                        ${selectedAgent.total_spend_usd.toFixed(4)}
                      </div>
                    </div>
                    <div style={{ padding: 12, borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <small style={{ color: '#94a3b8', fontSize: 11 }}>Configured Budget Limit</small>
                      <div style={{ fontSize: 20, fontWeight: 700, color: '#facc15', marginTop: 4 }}>
                        ${selectedAgent.budget_limit_usd.toFixed(2)}
                      </div>
                    </div>
                  </div>

                  {/* Audit Log Table */}
                  <div>
                    <h4 style={{ fontSize: 12, textTransform: 'uppercase', color: '#94a3b8', margin: '0 0 8px 0' }}>Recent Invocations Audit Trail</h4>
                    {invocations.length === 0 ? (
                      <div style={{ color: '#64748b', fontSize: 12 }}>No invocations recorded yet.</div>
                    ) : (
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', textAlign: 'left', color: '#94a3b8' }}>
                              <th style={{ padding: '6px 8px' }}>Status</th>
                              <th style={{ padding: '6px 8px' }}>Model</th>
                              <th style={{ padding: '6px 8px' }}>Prompt Preview</th>
                              <th style={{ padding: '6px 8px' }}>Tokens</th>
                              <th style={{ padding: '6px 8px' }}>Cost</th>
                              <th style={{ padding: '6px 8px' }}>Duration</th>
                              <th style={{ padding: '6px 8px' }}>Timestamp</th>
                            </tr>
                          </thead>
                          <tbody>
                            {invocations.map((inv) => (
                              <tr key={inv.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                <td style={{ padding: '6px 8px' }}>
                                  <span style={{ color: inv.status === 'SUCCESS' ? '#4ade80' : '#f87171', fontWeight: 600 }}>
                                    {inv.status}
                                  </span>
                                </td>
                                <td style={{ padding: '6px 8px', color: '#cbd5e1' }}>{inv.model_used}</td>
                                <td style={{ padding: '6px 8px', color: '#94a3b8', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {inv.input_prompt}
                                </td>
                                <td style={{ padding: '6px 8px', color: '#cbd5e1' }}>{inv.total_tokens}</td>
                                <td style={{ padding: '6px 8px', color: '#4ade80' }}>${inv.estimated_cost_usd.toFixed(6)}</td>
                                <td style={{ padding: '6px 8px', color: '#cbd5e1' }}>{inv.duration_ms}ms</td>
                                <td style={{ padding: '6px 8px', color: '#64748b' }}>{new Date(inv.created_at).toLocaleTimeString()}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Tab: Evaluation Benchmarks */}
              {activeTab === 'Evaluations' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontSize: 13, color: '#94a3b8' }}>
                      Automated accuracy benchmarks evaluate test inputs and assertions against agent responses.
                    </div>
                    <button
                      type="button"
                      className="primary-button"
                      onClick={handleRunEvaluation}
                      disabled={busy}
                      style={{ fontSize: 12, padding: '4px 12px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      <Sparkles size={13} /> Run Evaluation Benchmark
                    </button>
                  </div>

                  {/* Benchmark runs */}
                  {evaluations.length === 0 ? (
                    <div style={{ padding: 20, textAlign: 'center', color: '#64748b', fontSize: 12 }}>
                      No evaluation runs recorded. Click <strong>Run Evaluation Benchmark</strong> to test competency.
                    </div>
                  ) : (
                    evaluations.map((ev) => (
                      <div key={ev.id} style={{ padding: 14, borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                          <div>
                            <strong style={{ fontSize: 14 }}>{ev.eval_name}</strong>
                            <div style={{ fontSize: 11, color: '#64748b' }}>{new Date(ev.created_at).toLocaleString()}</div>
                          </div>
                          <span style={{ fontSize: 16, fontWeight: 700, color: ev.pass_rate >= 80 ? '#4ade80' : '#f87171' }}>
                            {ev.pass_rate}% Pass Rate
                          </span>
                        </div>

                        {/* Cases breakdown */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {ev.results.cases.map((c, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderRadius: 6, background: 'rgba(0,0,0,0.2)', fontSize: 11 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                {c.passed ? <CheckCircle2 size={13} color="#4ade80" /> : <XCircle size={13} color="#f87171" />}
                                <strong style={{ color: '#cbd5e1' }}>{c.case_name}</strong>
                              </div>
                              <div style={{ color: '#94a3b8' }}>
                                Latency: {c.duration_ms}ms · Result: <span style={{ color: c.passed ? '#4ade80' : '#f87171' }}>{c.reason}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
              Select an agent from the sidebar or create a new one to begin.
            </div>
          )}
        </main>
      </div>

      {/* Create Agent Modal Dialog */}
      {createModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'grid', placeItems: 'center', zIndex: 100 }}>
          <div className="glass" style={{ width: 480, padding: 22, borderRadius: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Register New AI Agent</h3>

            <form onSubmit={handleCreateAgent} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label htmlFor="agent-name-input" style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8' }}>Agent Name</label>
                <input
                  id="agent-name-input"
                  required
                  value={newAgentName}
                  onChange={(e) => setNewAgentName(e.target.value)}
                  placeholder="e.g. Code Review Assistant"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 6, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc', fontSize: 12 }}
                />
              </div>

              <div>
                <label htmlFor="agent-slug-input" style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8' }}>Agent Slug</label>
                <input
                  id="agent-slug-input"
                  value={newAgentSlug}
                  onChange={(e) => setNewAgentSlug(e.target.value)}
                  placeholder="e.g. code-review-assistant"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 6, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc', fontSize: 12 }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label htmlFor="agent-provider-select" style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8' }}>Provider</label>
                  <select
                    id="agent-provider-select"
                    value={newAgentProvider}
                    onChange={(e) => {
                      setNewAgentProvider(e.target.value)
                      if (e.target.value === 'ollama') setNewAgentModel('qwen3-coder:30b')
                      if (e.target.value === 'openai') setNewAgentModel('gpt-4o')
                      if (e.target.value === 'anthropic') setNewAgentModel('claude-3-5-sonnet-20241022')
                      if (e.target.value === 'vertex') setNewAgentModel('gemini-1.5-pro')
                    }}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 6, background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc', fontSize: 12 }}
                  >
                    <option value="ollama">Ollama (Local / Modelfile)</option>
                    <option value="openai">OpenAI / Azure</option>
                    <option value="anthropic">Anthropic Claude</option>
                    <option value="vertex">Google Vertex AI</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="agent-model-input" style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8' }}>Model Name</label>
                  <input
                    id="agent-model-input"
                    required
                    value={newAgentModel}
                    onChange={(e) => setNewAgentModel(e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 6, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc', fontSize: 12 }}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="agent-system-prompt" style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8' }}>System Prompt Directive</label>
                <textarea
                  id="agent-system-prompt"
                  required
                  rows={3}
                  value={newAgentPrompt}
                  onChange={(e) => setNewAgentPrompt(e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 6, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc', fontSize: 12 }}
                />
              </div>

              <div>
                <label htmlFor="agent-budget-input" style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8' }}>Budget Limit ($USD)</label>
                <input
                  id="agent-budget-input"
                  type="number"
                  step="5"
                  value={newAgentBudget}
                  onChange={(e) => setNewAgentBudget(Number(e.target.value))}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 6, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc', fontSize: 12 }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setCreateModalOpen(false)}
                  style={{ fontSize: 12, padding: '6px 14px' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={busy}
                  style={{ fontSize: 12, padding: '6px 14px' }}
                >
                  Create Agent
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
