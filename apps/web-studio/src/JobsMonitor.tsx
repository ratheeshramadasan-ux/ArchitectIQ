import { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock,
  Filter,
  Layers3,
  Play,
  RefreshCw,
  RotateCcw,
  StopCircle,
} from 'lucide-react'

export type StepRun = {
  id: string
  node_id: string
  node_type: string
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'SKIPPED'
  input_payload: Record<string, unknown>
  output_payload: Record<string, unknown>
  error_message?: string
  retry_count: number
  started_at?: string
  completed_at?: string
  duration_ms?: number
  created_at: string
}

export type WorkflowRun = {
  id: string
  tenant_id: string
  project_id: string
  workflow_id: string
  workflow_version: number
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'SUSPENDED'
  trigger_type: string
  trigger_payload: Record<string, unknown>
  execution_context?: Record<string, unknown>
  started_at?: string
  completed_at?: string
  duration_ms?: number
  error_message?: string
  retry_count: number
  created_at: string
  steps?: StepRun[]
}

export type QueueItem = {
  id: string
  run_id: string
  queue_name: string
  priority: number
  status: string
  attempts: number
  max_attempts: number
  created_at: string
}

export default function JobsMonitor({
  token,
  tenant,
  projectId: propProjectId,
}: {
  token: string
  tenant: string
  projectId?: string
}) {
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(propProjectId || null)
  const effectiveProjectId = propProjectId || selectedProjectId

  const [runs, setRuns] = useState<WorkflowRun[]>([])
  const [queues, setQueues] = useState<QueueItem[]>([])
  const [selectedRun, setSelectedRun] = useState<WorkflowRun | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [busy, setBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  // Resume modal state
  const [resumeModal, setResumeModal] = useState(false)
  const [resumeNotes, setResumeNotes] = useState('')

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

  // Discover projects if none passed
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

  // Fetch runs and queues in effect cleanly without synchronous setState
  useEffect(() => {
    let cancelled = false
    if (!effectiveProjectId || !token) return

    const runsUrl =
      statusFilter && statusFilter !== 'ALL'
        ? `/projects/${effectiveProjectId}/runs?status=${statusFilter}`
        : `/projects/${effectiveProjectId}/runs`

    Promise.all([callApi(runsUrl), callApi('/queues')])
      .then(([runsData, queuesData]) => {
        if (!cancelled) {
          setRuns(runsData)
          setQueues(queuesData)
          if (runsData.length > 0 && !selectedRun) {
            callApi(`/runs/${runsData[0].id}`)
              .then((detail) => {
                if (!cancelled) setSelectedRun(detail)
              })
              .catch(() => {})
          }
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setErrorMessage(e instanceof Error ? e.message : 'Failed to fetch runs')
        }
      })

    return () => {
      cancelled = true
    }
  }, [callApi, effectiveProjectId, statusFilter, token, selectedRun])

  const refreshManually = () => {
    if (!effectiveProjectId || !token) return
    setBusy(true)
    setErrorMessage('')
    const runsUrl =
      statusFilter && statusFilter !== 'ALL'
        ? `/projects/${effectiveProjectId}/runs?status=${statusFilter}`
        : `/projects/${effectiveProjectId}/runs`

    Promise.all([callApi(runsUrl), callApi('/queues')])
      .then(([runsData, queuesData]) => {
        setRuns(runsData)
        setQueues(queuesData)
        if (runsData.length > 0 && !selectedRun) {
          callApi(`/runs/${runsData[0].id}`).then(setSelectedRun).catch(() => {})
        }
      })
      .catch((e) => {
        setErrorMessage(e instanceof Error ? e.message : 'Failed to fetch runs')
      })
      .finally(() => {
        setBusy(false)
      })
  }

  // Select a run and load details
  const handleSelectRun = async (runId: string) => {
    try {
      setBusy(true)
      const detail = await callApi(`/runs/${runId}`)
      setSelectedRun(detail)
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'Failed to load run details')
    } finally {
      setBusy(false)
    }
  }

  // Cancel run
  const handleCancelRun = async (runId: string) => {
    try {
      setBusy(true)
      await callApi(`/runs/${runId}/cancel`, { method: 'POST' })
      setSuccessMessage('Run cancelled successfully')
      setTimeout(() => setSuccessMessage(''), 3000)
      refreshManually()
      if (selectedRun?.id === runId) {
        const detail = await callApi(`/runs/${runId}`)
        setSelectedRun(detail)
      }
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'Cancel failed')
    } finally {
      setBusy(false)
    }
  }

  // Retry run
  const handleRetryRun = async (runId: string) => {
    try {
      setBusy(true)
      const res = await callApi(`/runs/${runId}/retry`, { method: 'POST' })
      setSuccessMessage('Retry triggered successfully')
      setTimeout(() => setSuccessMessage(''), 3000)
      refreshManually()
      setSelectedRun(res)
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'Retry failed')
    } finally {
      setBusy(false)
    }
  }

  // Resume suspended run
  const handleResumeRun = async () => {
    if (!selectedRun) return
    try {
      setBusy(true)
      const res = await callApi(`/runs/${selectedRun.id}/resume`, {
        method: 'POST',
        body: JSON.stringify({
          approved: true,
          resolution_notes: resumeNotes.trim() || 'Approved from Operations Console',
        }),
      })
      setResumeModal(false)
      setResumeNotes('')
      setSuccessMessage('Suspended run resumed and completed!')
      setTimeout(() => setSuccessMessage(''), 3000)
      refreshManually()
      setSelectedRun(res)
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'Resume failed')
    } finally {
      setBusy(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return '#4ade80'
      case 'RUNNING':
        return '#60a5fa'
      case 'SUSPENDED':
        return '#fde047'
      case 'FAILED':
        return '#f87171'
      case 'CANCELLED':
        return '#94a3b8'
      default:
        return '#cbd5e1'
    }
  }

  return (
    <div className="jobs-monitor-container" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)', minHeight: 600 }}>
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
          <span style={{ display: 'grid', placeItems: 'center', width: 36, height: 36, borderRadius: 10, background: 'rgba(96, 152, 255, 0.2)', color: '#6098ff' }}>
            <Play size={20} />
          </span>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ fontSize: 17, margin: 0, fontWeight: 700 }}>Jobs & Orchestration Engine</h2>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'rgba(34, 197, 94, 0.2)', color: '#4ade80', border: '1px solid rgba(34, 197, 94, 0.4)' }}>
                DURABLE RUNTIME · ACTIVE
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 3 }}>
              {projects.length > 0 && !propProjectId && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>PROJECT:</span>
                  <select
                    aria-label="Select project"
                    value={selectedProjectId || ''}
                    onChange={(e) => {
                      setSelectedProjectId(e.target.value)
                      setSelectedRun(null)
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
              <span style={{ fontSize: 11, color: '#94a3b8' }}>
                Queue Depth: <strong>{queues.length}</strong>
              </span>
            </div>
          </div>
        </div>

        {/* Global Toolbar Controls */}
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

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.03)', padding: '4px 8px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
            <Filter size={13} color="#94a3b8" />
            <select
              aria-label="Filter by status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ background: 'transparent', border: 'none', color: '#cbd5e1', fontSize: 12, cursor: 'pointer' }}
            >
              <option value="ALL">All Statuses</option>
              <option value="RUNNING">Running</option>
              <option value="COMPLETED">Completed</option>
              <option value="SUSPENDED">Suspended (Approval)</option>
              <option value="FAILED">Failed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>

          <button
            type="button"
            className="secondary-button"
            onClick={refreshManually}
            disabled={busy}
            style={{ fontSize: 12, padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <RefreshCw size={14} className={busy ? 'spin' : ''} /> Refresh
          </button>
        </div>
      </header>

      {/* Main Grid: Runs List -> Run Detail / Timeline */}
      <div style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: 14, flex: 1, minHeight: 0 }}>
        {/* Left: Execution Runs List */}
        <aside className="glass" style={{ padding: 14, borderRadius: 14, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <h3 style={{ fontSize: 12, margin: 0, textTransform: 'uppercase', letterSpacing: 0.8, color: '#94a3b8' }}>
              Execution History ({runs.length})
            </h3>
          </div>

          {runs.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
              No execution runs found for this project.
            </div>
          ) : (
            runs.map((r) => {
              const color = getStatusColor(r.status)
              const isSelected = selectedRun?.id === r.id
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => handleSelectRun(r.id)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    padding: 12,
                    borderRadius: 10,
                    border: isSelected ? '1px solid #6098ff' : '1px solid rgba(255,255,255,0.06)',
                    background: isSelected ? 'rgba(96, 152, 255, 0.1)' : 'rgba(255,255,255,0.02)',
                    color: '#f8fafc',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Layers3 size={14} color="#a18aff" /> Run v{r.workflow_version}
                    </span>
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        padding: '1px 6px',
                        borderRadius: 4,
                        background: `color-mix(in srgb, ${color} 20%, transparent)`,
                        color,
                        border: `1px solid color-mix(in srgb, ${color} 40%, transparent)`,
                      }}
                    >
                      {r.status}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: '#94a3b8' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Clock size={12} /> {r.duration_ms ? `${r.duration_ms}ms` : '—'}
                    </span>
                    <span>Trigger: {r.trigger_type}</span>
                    <span>{new Date(r.created_at).toLocaleTimeString()}</span>
                  </div>
                </button>
              )
            })
          )}
        </aside>

        {/* Right: Detailed Execution Timeline and State */}
        <main className="glass" style={{ padding: 18, borderRadius: 14, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {selectedRun ? (
            <>
              {/* Header Details */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 14 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <h3 style={{ fontSize: 18, margin: 0, fontWeight: 700 }}>Run Detail: {selectedRun.id.slice(0, 8)}</h3>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 6,
                        background: `color-mix(in srgb, ${getStatusColor(selectedRun.status)} 20%, transparent)`,
                        color: getStatusColor(selectedRun.status),
                        border: `1px solid color-mix(in srgb, ${getStatusColor(selectedRun.status)} 40%, transparent)`,
                      }}
                    >
                      {selectedRun.status}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                    <span>Workflow Version: v{selectedRun.workflow_version}</span>
                    <span>Duration: {selectedRun.duration_ms ? `${selectedRun.duration_ms} ms` : '—'}</span>
                    <span>Retries: {selectedRun.retry_count}</span>
                  </div>
                </div>

                {/* Run Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {selectedRun.status === 'SUSPENDED' && (
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => setResumeModal(true)}
                      style={{ background: '#eab308', fontSize: 12, padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      <CheckCircle2 size={14} /> Resolve Approval
                    </button>
                  )}
                  {['RUNNING', 'PENDING', 'SUSPENDED'].includes(selectedRun.status) && (
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => handleCancelRun(selectedRun.id)}
                      style={{ fontSize: 12, padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      <StopCircle size={14} color="#f87171" /> Cancel Run
                    </button>
                  )}
                  {selectedRun.status === 'FAILED' && (
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => handleRetryRun(selectedRun.id)}
                      style={{ fontSize: 12, padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      <RotateCcw size={14} /> Retry Execution
                    </button>
                  )}
                </div>
              </div>

              {/* Error Callout if failed */}
              {selectedRun.error_message && (
                <div style={{ padding: 12, borderRadius: 8, background: 'rgba(248, 113, 113, 0.1)', border: '1px solid rgba(248, 113, 113, 0.3)', color: '#f87171', fontSize: 12 }}>
                  <strong>Execution Failure:</strong> {selectedRun.error_message}
                </div>
              )}

              {/* Step Execution Timeline */}
              <div>
                <h4 style={{ fontSize: 14, margin: '0 0 12px 0', textTransform: 'uppercase', letterSpacing: 0.8, color: '#94a3b8' }}>
                  Execution Step Timeline
                </h4>
                {selectedRun.steps && selectedRun.steps.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {selectedRun.steps.map((step, idx) => {
                      const stepColor = getStatusColor(step.status)
                      return (
                        <div
                          key={step.id}
                          style={{
                            padding: 12,
                            borderRadius: 10,
                            background: 'rgba(255,255,255,0.02)',
                            border: '1px solid rgba(255,255,255,0.06)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 8,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>#{idx + 1}</span>
                              <strong style={{ fontSize: 13 }}>{step.node_id}</strong>
                              <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', color: '#94a3b8' }}>
                                {step.node_type}
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              {step.duration_ms !== null && step.duration_ms !== undefined && (
                                <span style={{ fontSize: 11, color: '#94a3b8' }}>{step.duration_ms} ms</span>
                              )}
                              <span
                                style={{
                                  fontSize: 9,
                                  fontWeight: 700,
                                  padding: '1px 6px',
                                  borderRadius: 4,
                                  background: `color-mix(in srgb, ${stepColor} 20%, transparent)`,
                                  color: stepColor,
                                }}
                              >
                                {step.status}
                              </span>
                            </div>
                          </div>

                          {/* Output Payload preview */}
                          {Boolean(step.output_payload && Object.keys(step.output_payload).length) && (
                            <pre
                              style={{
                                margin: 0,
                                padding: 8,
                                borderRadius: 6,
                                background: 'rgba(0,0,0,0.3)',
                                fontSize: 11,
                                color: '#cbd5e1',
                                overflowX: 'auto',
                              }}
                            >
                              {JSON.stringify(step.output_payload, null, 2)}
                            </pre>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p style={{ fontSize: 12, color: '#94a3b8' }}>No individual step logs recorded for this execution.</p>
                )}
              </div>

              {/* Execution Context & Variables */}
              {selectedRun.execution_context && (
                <div>
                  <h4 style={{ fontSize: 14, margin: '10px 0 10px 0', textTransform: 'uppercase', letterSpacing: 0.8, color: '#94a3b8' }}>
                    Runtime Context & Variables
                  </h4>
                  <pre
                    style={{
                      margin: 0,
                      padding: 12,
                      borderRadius: 8,
                      background: 'rgba(0,0,0,0.35)',
                      fontSize: 11,
                      color: '#a18aff',
                      overflowX: 'auto',
                    }}
                  >
                    {JSON.stringify(selectedRun.execution_context, null, 2)}
                  </pre>
                </div>
              )}
            </>
          ) : (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
              Select an execution run from the list to inspect steps and runtime state.
            </div>
          )}
        </main>
      </div>

      {/* Resolve Approval Modal */}
      {resumeModal && (
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
            <h3 style={{ margin: '0 0 8px 0', fontSize: 16 }}>Resolve Approval Gate</h3>
            <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 14px 0' }}>
              This workflow run is currently SUSPENDED waiting for human signoff. Approving resumes execution from the pending step.
            </p>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
              Resolution Notes
              <textarea
                rows={3}
                aria-label="Resolution notes"
                placeholder="e.g., Reviewed and verified by operations lead..."
                value={resumeNotes}
                onChange={(e) => setResumeNotes(e.target.value)}
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
              <button type="button" className="secondary-button" onClick={() => setResumeModal(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={busy}
                onClick={handleResumeRun}
                style={{ background: '#16a34a' }}
              >
                Approve & Resume Execution
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
