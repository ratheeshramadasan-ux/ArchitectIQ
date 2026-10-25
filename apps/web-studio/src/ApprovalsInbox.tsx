import { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock,
  FileCheck2,
  Filter,
  Play,
  RefreshCw,
  SlidersHorizontal,
  Table,
  XCircle,
} from 'lucide-react'

export type ApprovalTask = {
  id: string
  tenant_id: string
  project_id: string
  run_id?: string
  step_run_id?: string
  title: string
  description?: string
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED'
  required_role: string
  assigned_user_id?: string
  resolution_notes?: string
  resolved_by?: string
  resolved_at?: string
  sla_deadline?: string
  payload: Record<string, unknown>
  decision_payload: Record<string, unknown>
  created_at: string
  created_by?: string
}

export type BusinessRule = {
  id: string
  tenant_id: string
  project_id: string
  name: string
  slug: string
  description?: string
  version: number
  status: string
  rule_type: string
  conditions_schema: { row_id: string; conditions: { field: string; operator: string; value: unknown }[] }[]
  actions_schema: { row_id: string; action: Record<string, unknown> }[]
  created_at: string
}

export default function ApprovalsInbox({
  token,
  tenant,
  projectId: propProjectId,
}: {
  token: string
  tenant: string
  projectId?: string
}) {
  const [activeTab, setActiveTab] = useState<'Inbox' | 'Rules'>('Inbox')

  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(propProjectId || null)
  const effectiveProjectId = propProjectId || selectedProjectId

  // Approvals State
  const [tasks, setTasks] = useState<ApprovalTask[]>([])
  const [selectedTask, setSelectedTask] = useState<ApprovalTask | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('PENDING')

  // Rules State
  const [rules, setRules] = useState<BusinessRule[]>([])
  const [selectedRule, setSelectedRule] = useState<BusinessRule | null>(null)
  const [ruleTestPayload, setRuleTestPayload] = useState('{\n  "amount": 15000,\n  "country": "US"\n}')
  const [ruleEvaluationResult, setRuleEvaluationResult] = useState<Record<string, unknown> | null>(null)

  // Modals & Feedback
  const [resolveModal, setResolveModal] = useState<null | 'APPROVED' | 'REJECTED'>(null)
  const [resolutionNotes, setResolutionNotes] = useState('')
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

  // Load approvals inbox
  useEffect(() => {
    let cancelled = false
    if (!token) return

    const url = statusFilter && statusFilter !== 'ALL' ? `/approvals?status=${statusFilter}` : `/approvals`

    callApi(url)
      .then((data: ApprovalTask[]) => {
        if (!cancelled) {
          setTasks(data)
          if (data.length > 0 && !selectedTask) {
            setSelectedTask(data[0])
          }
        }
      })
      .catch((e) => {
        if (!cancelled) setErrorMessage(e instanceof Error ? e.message : 'Failed to fetch tasks')
      })

    return () => {
      cancelled = true
    }
  }, [callApi, token, statusFilter, selectedTask])

  // Load rules when in Rules tab
  useEffect(() => {
    let cancelled = false
    if (activeTab !== 'Rules' || !effectiveProjectId || !token) return

    callApi(`/projects/${effectiveProjectId}/rules`)
      .then((data: BusinessRule[]) => {
        if (!cancelled) {
          setRules(data)
          if (data.length > 0 && !selectedRule) {
            setSelectedRule(data[0])
          }
        }
      })
      .catch((e) => {
        if (!cancelled) setErrorMessage(e instanceof Error ? e.message : 'Failed to fetch rules')
      })

    return () => {
      cancelled = true
    }
  }, [activeTab, callApi, effectiveProjectId, token, selectedRule])

  const refreshInbox = () => {
    setBusy(true)
    const url = statusFilter && statusFilter !== 'ALL' ? `/approvals?status=${statusFilter}` : `/approvals`
    callApi(url)
      .then((data: ApprovalTask[]) => {
        setTasks(data)
        if (data.length > 0) setSelectedTask(data[0])
      })
      .catch((e) => setErrorMessage(e instanceof Error ? e.message : 'Refresh failed'))
      .finally(() => setBusy(false))
  }

  // Handle task resolution (Approve or Reject)
  const handleResolve = async () => {
    if (!selectedTask || !resolveModal) return
    setBusy(true)
    setErrorMessage('')
    try {
      const res = await callApi(`/approvals/${selectedTask.id}/resolve`, {
        method: 'POST',
        body: JSON.stringify({
          decision: resolveModal,
          resolution_notes: resolutionNotes.trim() || undefined,
        }),
      })
      setSelectedTask(res)
      setResolveModal(null)
      setResolutionNotes('')
      setSuccessMessage(`Task successfully ${resolveModal.toLowerCase()}!`)
      setTimeout(() => setSuccessMessage(''), 3000)
      refreshInbox()
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'Resolution failed')
    } finally {
      setBusy(false)
    }
  }

  // Evaluate rule tester
  const handleEvaluateRule = async () => {
    if (!selectedRule) return
    setBusy(true)
    setErrorMessage('')
    try {
      const parsed = JSON.parse(ruleTestPayload)
      const res = await callApi(`/rules/${selectedRule.id}/evaluate`, {
        method: 'POST',
        body: JSON.stringify({ payload: parsed, strategy: 'FIRST_MATCH' }),
      })
      setRuleEvaluationResult(res)
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'Invalid JSON or evaluation failed')
    } finally {
      setBusy(false)
    }
  }

  const getPriorityColor = (p: string) => {
    switch (p) {
      case 'URGENT':
        return '#ef4444'
      case 'HIGH':
        return '#f97316'
      case 'MEDIUM':
        return '#eab308'
      case 'LOW':
        return '#3b82f6'
      default:
        return '#94a3b8'
    }
  }

  return (
    <div className="approvals-studio-container" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)', minHeight: 600 }}>
      {/* Top Header */}
      <header
        className="glass"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 20px',
          borderRadius: 14,
          marginBottom: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ display: 'grid', placeItems: 'center', width: 36, height: 36, borderRadius: 10, background: 'rgba(234, 179, 8, 0.2)', color: '#fde047' }}>
            <FileCheck2 size={20} />
          </span>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ fontSize: 17, margin: 0, fontWeight: 700 }}>Approvals & Business Rules</h2>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'rgba(234, 179, 8, 0.2)', color: '#fde047', border: '1px solid rgba(234, 179, 8, 0.4)' }}>
                GOVERNANCE CONTROL PLANE
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
              {/* Tab Selector */}
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  type="button"
                  onClick={() => setActiveTab('Inbox')}
                  style={{
                    border: 'none',
                    background: activeTab === 'Inbox' ? 'rgba(255,255,255,0.1)' : 'transparent',
                    color: activeTab === 'Inbox' ? '#f8fafc' : '#94a3b8',
                    padding: '3px 9px',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Approval Tasks ({tasks.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('Rules')}
                  style={{
                    border: 'none',
                    background: activeTab === 'Rules' ? 'rgba(255,255,255,0.1)' : 'transparent',
                    color: activeTab === 'Rules' ? '#f8fafc' : '#94a3b8',
                    padding: '3px 9px',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Decision Tables & Rules
                </button>
              </div>

              {projects.length > 0 && !propProjectId && activeTab === 'Rules' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>PROJECT:</span>
                  <select
                    aria-label="Select project"
                    value={selectedProjectId || ''}
                    onChange={(e) => {
                      setSelectedProjectId(e.target.value)
                      setSelectedRule(null)
                    }}
                    style={{ fontSize: 11, background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#cbd5e1', borderRadius: 4, padding: '2px 6px', cursor: 'pointer' }}
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Global Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {successMessage && (
            <span style={{ fontSize: 12, color: '#4ade80', display: 'flex', alignItems: 'center', gap: 5 }}>
              <Check size={14} /> {successMessage}
            </span>
          )}
          {errorMessage && (
            <span style={{ fontSize: 12, color: '#f87171', display: 'flex', alignItems: 'center', gap: 5 }}>
              <AlertCircle size={14} /> {errorMessage}
            </span>
          )}

          {activeTab === 'Inbox' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.03)', padding: '4px 8px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
              <Filter size={13} color="#94a3b8" />
              <select
                aria-label="Filter tasks by status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{ background: 'transparent', border: 'none', color: '#cbd5e1', fontSize: 12, cursor: 'pointer' }}
              >
                <option value="ALL">All Statuses</option>
                <option value="PENDING">Pending Only</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
              </select>
            </div>
          )}

          <button
            type="button"
            className="secondary-button"
            onClick={refreshInbox}
            disabled={busy}
            style={{ fontSize: 12, padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <RefreshCw size={14} className={busy ? 'spin' : ''} /> Refresh
          </button>
        </div>
      </header>

      {/* Main Body */}
      {activeTab === 'Inbox' ? (
        <div style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: 14, flex: 1, minHeight: 0 }}>
          {/* Left Tasks List */}
          <aside className="glass" style={{ padding: 14, borderRadius: 14, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h3 style={{ fontSize: 12, margin: '0 0 4px 0', textTransform: 'uppercase', letterSpacing: 0.8, color: '#94a3b8' }}>
              Pending Tasks ({tasks.length})
            </h3>

            {tasks.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                No approval tasks in this inbox view.
              </div>
            ) : (
              tasks.map((task) => {
                const isSelected = selectedTask?.id === task.id
                const pColor = getPriorityColor(task.priority)
                return (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => setSelectedTask(task)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                      padding: 12,
                      borderRadius: 10,
                      border: isSelected ? '1px solid #fde047' : '1px solid rgba(255,255,255,0.06)',
                      background: isSelected ? 'rgba(234, 179, 8, 0.1)' : 'rgba(255,255,255,0.02)',
                      color: '#f8fafc',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <strong style={{ fontSize: 13 }}>{task.title}</strong>
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          padding: '1px 6px',
                          borderRadius: 4,
                          background: `color-mix(in srgb, ${pColor} 20%, transparent)`,
                          color: pColor,
                          border: `1px solid color-mix(in srgb, ${pColor} 40%, transparent)`,
                        }}
                      >
                        {task.priority}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: '#94a3b8' }}>
                      <span>Role: {task.required_role}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Clock size={11} /> {new Date(task.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </button>
                )
              })
            )}
          </aside>

          {/* Right Task Details & Actions */}
          <main className="glass" style={{ padding: 18, borderRadius: 14, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {selectedTask ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 14 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <h3 style={{ fontSize: 18, margin: 0, fontWeight: 700 }}>{selectedTask.title}</h3>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 6,
                          background: selectedTask.status === 'APPROVED' ? 'rgba(34,197,94,0.2)' : selectedTask.status === 'REJECTED' ? 'rgba(248,113,113,0.2)' : 'rgba(234,179,8,0.2)',
                          color: selectedTask.status === 'APPROVED' ? '#4ade80' : selectedTask.status === 'REJECTED' ? '#f87171' : '#fde047',
                        }}
                      >
                        {selectedTask.status}
                      </span>
                    </div>
                    {selectedTask.description && (
                      <p style={{ margin: '6px 0 0 0', fontSize: 13, color: '#94a3b8' }}>{selectedTask.description}</p>
                    )}
                  </div>

                  {/* Actions for PENDING task */}
                  {selectedTask.status === 'PENDING' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => setResolveModal('REJECTED')}
                        style={{ fontSize: 12, padding: '6px 12px', color: '#f87171', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      >
                        <XCircle size={14} /> Reject
                      </button>
                      <button
                        type="button"
                        className="primary-button"
                        onClick={() => setResolveModal('APPROVED')}
                        style={{ fontSize: 12, padding: '6px 12px', background: '#16a34a', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      >
                        <CheckCircle2 size={14} /> Approve Request
                      </button>
                    </div>
                  )}
                </div>

                {/* Audit & Linked Run details */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                  <div style={{ padding: 10, borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <small style={{ color: '#64748b', fontSize: 11 }}>Required Authority</small>
                    <div style={{ fontWeight: 600, fontSize: 13, marginTop: 2 }}>{selectedTask.required_role}</div>
                  </div>
                  <div style={{ padding: 10, borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <small style={{ color: '#64748b', fontSize: 11 }}>Linked Workflow Run</small>
                    <div style={{ fontWeight: 600, fontSize: 13, marginTop: 2 }}>{selectedTask.run_id ? selectedTask.run_id.slice(0, 8) : 'Standalone'}</div>
                  </div>
                  <div style={{ padding: 10, borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <small style={{ color: '#64748b', fontSize: 11 }}>SLA Target</small>
                    <div style={{ fontWeight: 600, fontSize: 13, marginTop: 2 }}>
                      {selectedTask.sla_deadline ? new Date(selectedTask.sla_deadline).toLocaleTimeString() : 'Standard'}
                    </div>
                  </div>
                </div>

                {/* Task Context Payload */}
                <div>
                  <h4 style={{ fontSize: 13, margin: '0 0 8px 0', textTransform: 'uppercase', letterSpacing: 0.8, color: '#94a3b8' }}>
                    Request Data Payload
                  </h4>
                  <pre
                    style={{
                      margin: 0,
                      padding: 12,
                      borderRadius: 8,
                      background: 'rgba(0,0,0,0.3)',
                      fontSize: 12,
                      color: '#fde047',
                      overflowX: 'auto',
                    }}
                  >
                    {JSON.stringify(selectedTask.payload, null, 2)}
                  </pre>
                </div>

                {/* Resolution Audit if completed */}
                {selectedTask.resolved_at && (
                  <div style={{ padding: 12, borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <h4 style={{ fontSize: 13, margin: '0 0 6px 0', color: '#94a3b8' }}>Resolution Audit Trail</h4>
                    <p style={{ margin: 0, fontSize: 12, color: '#cbd5e1' }}>
                      <strong>Notes:</strong> {selectedTask.resolution_notes || 'No resolution notes entered'}
                    </p>
                    <small style={{ color: '#64748b', fontSize: 11, display: 'block', marginTop: 4 }}>
                      Resolved at {new Date(selectedTask.resolved_at).toLocaleString()}
                    </small>
                  </div>
                )}
              </>
            ) : (
              <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                Select an approval task to view details and action resolution.
              </div>
            )}
          </main>
        </div>
      ) : (
        /* Rules Tab */
        <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 14, flex: 1, minHeight: 0 }}>
          {/* Rules List */}
          <aside className="glass" style={{ padding: 14, borderRadius: 14, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h3 style={{ fontSize: 12, margin: '0 0 4px 0', textTransform: 'uppercase', letterSpacing: 0.8, color: '#94a3b8' }}>
              Decision Tables ({rules.length})
            </h3>
            {rules.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                No business rules found in this project.
              </div>
            ) : (
              rules.map((rule) => {
                const isSelected = selectedRule?.id === rule.id
                return (
                  <button
                    key={rule.id}
                    type="button"
                    onClick={() => {
                      setSelectedRule(rule)
                      setRuleEvaluationResult(null)
                    }}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                      padding: 12,
                      borderRadius: 10,
                      border: isSelected ? '1px solid #3b82f6' : '1px solid rgba(255,255,255,0.06)',
                      background: isSelected ? 'rgba(59, 130, 246, 0.1)' : 'rgba(255,255,255,0.02)',
                      color: '#f8fafc',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <strong style={{ fontSize: 13 }}>{rule.name}</strong>
                    <div style={{ fontSize: 11, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Table size={12} /> {rule.rule_type} · v{rule.version}
                    </div>
                  </button>
                )
              })
            )}
          </aside>

          {/* Rule Detail & Decision Table Simulator */}
          <main className="glass" style={{ padding: 18, borderRadius: 14, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {selectedRule ? (
              <>
                <div style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 12 }}>
                  <h3 style={{ fontSize: 18, margin: 0, fontWeight: 700 }}>{selectedRule.name}</h3>
                  <small style={{ color: '#94a3b8', fontSize: 12 }}>{selectedRule.description || 'Deterministic Decision Matrix'}</small>
                </div>

                {/* Table Schema Preview */}
                <div>
                  <h4 style={{ fontSize: 13, margin: '0 0 8px 0', textTransform: 'uppercase', letterSpacing: 0.8, color: '#94a3b8' }}>
                    Conditions & Actions Structure
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <small style={{ fontSize: 11, color: '#64748b' }}>Conditions Schema</small>
                      <pre style={{ margin: '4px 0 0 0', padding: 10, borderRadius: 8, background: 'rgba(0,0,0,0.3)', fontSize: 11, color: '#cbd5e1', maxHeight: 180, overflowY: 'auto' }}>
                        {JSON.stringify(selectedRule.conditions_schema, null, 2)}
                      </pre>
                    </div>
                    <div>
                      <small style={{ fontSize: 11, color: '#64748b' }}>Actions Output Schema</small>
                      <pre style={{ margin: '4px 0 0 0', padding: 10, borderRadius: 8, background: 'rgba(0,0,0,0.3)', fontSize: 11, color: '#4ade80', maxHeight: 180, overflowY: 'auto' }}>
                        {JSON.stringify(selectedRule.actions_schema, null, 2)}
                      </pre>
                    </div>
                  </div>
                </div>

                {/* Interactive Simulator */}
                <div style={{ padding: 14, borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <SlidersHorizontal size={16} color="#3b82f6" />
                      <strong style={{ fontSize: 13 }}>Interactive Rule Simulator</strong>
                    </div>
                    <button
                      type="button"
                      className="primary-button"
                      onClick={handleEvaluateRule}
                      disabled={busy}
                      style={{ fontSize: 12, padding: '5px 12px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      <Play size={13} /> Evaluate Rules
                    </button>
                  </div>

                  <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>
                    Input Payload (JSON)
                    <textarea
                      rows={4}
                      aria-label="Input payload JSON"
                      value={ruleTestPayload}
                      onChange={(e) => setRuleTestPayload(e.target.value)}
                      style={{
                        width: '100%',
                        background: 'rgba(0,0,0,0.3)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 8,
                        padding: 8,
                        color: '#f8fafc',
                        fontFamily: 'monospace',
                        fontSize: 12,
                        marginTop: 4,
                      }}
                    />
                  </label>

                  {ruleEvaluationResult && (
                    <div style={{ marginTop: 12 }}>
                      <small style={{ fontSize: 11, color: '#4ade80', fontWeight: 600 }}>Evaluation Output Verdict:</small>
                      <pre style={{ margin: '4px 0 0 0', padding: 10, borderRadius: 8, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', fontSize: 11, color: '#4ade80' }}>
                        {JSON.stringify(ruleEvaluationResult, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                Select a business rule to inspect decision tables and run evaluation tests.
              </div>
            )}
          </main>
        </div>
      )}

      {/* Resolution Confirmation Modal */}
      {resolveModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(8px)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 9999,
          }}
        >
          <div className="glass" style={{ width: 440, padding: 22, borderRadius: 16 }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: 16 }}>
              {resolveModal === 'APPROVED' ? 'Approve Task Request' : 'Reject Task Request'}
            </h3>
            <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 14px 0' }}>
              Confirm your governance decision. This action is audited and permanently recorded in the immutable compliance journal.
            </p>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
              Resolution Notes
              <textarea
                rows={3}
                aria-label="Resolution audit notes"
                placeholder="Enter justification or signoff comments..."
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8,
                  padding: 8,
                  color: '#f8fafc',
                }}
              />
            </label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <button type="button" className="secondary-button" onClick={() => setResolveModal(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={busy}
                onClick={handleResolve}
                style={{ background: resolveModal === 'APPROVED' ? '#16a34a' : '#dc2626' }}
              >
                Confirm {resolveModal === 'APPROVED' ? 'Approval' : 'Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
