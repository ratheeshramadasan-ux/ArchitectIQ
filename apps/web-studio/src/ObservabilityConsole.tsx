import { useState, useEffect, useCallback } from 'react'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Play,
  Plus,
  RefreshCw,
  Terminal,
  Clock,
  Cpu,
  Radio,
} from 'lucide-react'

export interface OverviewMetrics {
  throughput_24h: number
  error_rate_pct: number
  avg_queue_latency_ms: number
  active_workers_count: number
  sla_health_pct: number
  open_incidents: Record<string, number>
  generated_at: string
}

export interface SystemMetricItem {
  id: string
  tenant_id: string
  metric_name: string
  metric_value: number
  dimensions: Record<string, unknown>
  timestamp: string
}

export interface IncidentItem {
  id: string
  tenant_id: string
  project_id?: string
  title: string
  severity: 'SEV-1' | 'SEV-2' | 'SEV-3' | 'SEV-4'
  status: 'OPEN' | 'INVESTIGATING' | 'MITIGATED' | 'RESOLVED'
  summary: string
  affected_resource_id?: string
  assigned_to?: string
  resolution_notes?: string
  created_at: string
  updated_at: string
}

export interface SLABreachItem {
  id: string
  tenant_id: string
  project_id?: string
  target_type: string
  target_id: string
  expected_sla_seconds: number
  actual_duration_seconds: number
  breach_severity: string
  status: string
  created_at: string
}

export interface RunbookItem {
  id: string
  tenant_id: string
  name: string
  slug: string
  category: string
  description: string
  steps: { name: string; command: string; timeout_seconds?: number }[]
  is_automated: boolean
  last_executed_at?: string
  created_at: string
  updated_at: string
}

export default function ObservabilityConsole({
  token,
  tenant,
}: {
  token: string
  tenant: string
  projectId?: string
}) {
  const [activeTab, setActiveTab] = useState<'Overview' | 'Incidents' | 'Runbooks' | 'SLA'>('Overview')
  const [busy, setBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  // Data States
  const [overview, setOverview] = useState<OverviewMetrics | null>(null)
  const [metrics, setMetrics] = useState<SystemMetricItem[]>([])
  const [incidents, setIncidents] = useState<IncidentItem[]>([])
  const [selectedIncident, setSelectedIncident] = useState<IncidentItem | null>(null)
  const [runbooks, setRunbooks] = useState<RunbookItem[]>([])
  const [selectedRunbook, setSelectedRunbook] = useState<RunbookItem | null>(null)
  const [slaBreaches, setSlaBreaches] = useState<SLABreachItem[]>([])

  // Execution terminal state
  const [runbookLogs, setRunbookLogs] = useState<string[]>([])
  const [resolutionInput, setResolutionInput] = useState('')

  // Modals
  const [incidentModalOpen, setIncidentModalOpen] = useState(false)
  const [newIncTitle, setNewIncTitle] = useState('')
  const [newIncSeverity, setNewIncSeverity] = useState<'SEV-1' | 'SEV-2' | 'SEV-3' | 'SEV-4'>('SEV-2')
  const [newIncSummary, setNewIncSummary] = useState('')
  const [newIncResource, setNewIncResource] = useState('')

  const base = `/api/v1/tenants/${tenant}/workspace/observability`

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

  const refreshAll = () => {
    if (!token) return
    setBusy(true)
    Promise.all([
      callApi('/overview').then((data) => setOverview(data)).catch(() => {}),
      callApi('/metrics?limit=30').then((data) => setMetrics(Array.isArray(data) ? data : [])).catch(() => {}),
      callApi('/incidents').then((data) => {
        if (Array.isArray(data)) setIncidents(data)
      }).catch(() => {}),
      callApi('/runbooks').then((data) => {
        if (Array.isArray(data)) setRunbooks(data)
      }).catch(() => {}),
      callApi('/sla-breaches').then((data) => setSlaBreaches(Array.isArray(data) ? data : [])).catch(() => {}),
    ]).finally(() => setBusy(false))
  }

  useEffect(() => {
    let cancelled = false
    if (!token) return

    Promise.all([
      callApi('/overview').then((data) => { if (!cancelled) setOverview(data) }).catch(() => {}),
      callApi('/metrics?limit=30').then((data) => { if (!cancelled && Array.isArray(data)) setMetrics(data) }).catch(() => {}),
      callApi('/incidents').then((data) => {
        if (!cancelled && Array.isArray(data)) {
          setIncidents(data)
          if (data.length > 0 && !selectedIncident) setSelectedIncident(data[0])
        }
      }).catch(() => {}),
      callApi('/runbooks').then((data) => {
        if (!cancelled && Array.isArray(data)) {
          setRunbooks(data)
          if (data.length > 0 && !selectedRunbook) setSelectedRunbook(data[0])
        }
      }).catch(() => {}),
      callApi('/sla-breaches').then((data) => { if (!cancelled && Array.isArray(data)) setSlaBreaches(data) }).catch(() => {}),
    ])

    return () => {
      cancelled = true
    }
  }, [callApi, token, selectedIncident, selectedRunbook])

  const handleCreateIncident = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErrorMessage('')
    setSuccessMessage('')

    try {
      const payload = {
        title: newIncTitle,
        severity: newIncSeverity,
        summary: newIncSummary,
        affected_resource_id: newIncResource || undefined,
      }
      const created = await callApi('/incidents', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setIncidents([created, ...incidents])
      setSelectedIncident(created)
      setIncidentModalOpen(false)
      setNewIncTitle('')
      setNewIncSummary('')
      setSuccessMessage(`Incident '${created.title}' filed successfully!`)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to file incident')
    } finally {
      setBusy(false)
    }
  }

  const handleUpdateIncidentStatus = async (status: IncidentItem['status']) => {
    if (!selectedIncident) return
    setBusy(true)
    setErrorMessage('')
    setSuccessMessage('')

    try {
      const updated = await callApi(`/incidents/${selectedIncident.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status,
          resolution_notes: resolutionInput || undefined,
        }),
      })
      setSelectedIncident(updated)
      setIncidents(incidents.map((i) => (i.id === updated.id ? updated : i)))
      setSuccessMessage(`Incident marked as ${status}!`)
      setResolutionInput('')
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to update incident')
    } finally {
      setBusy(false)
    }
  }

  const handleExecuteRunbook = async () => {
    if (!selectedRunbook) return
    setBusy(true)
    setErrorMessage('')
    setSuccessMessage('')
    setRunbookLogs([`[INIT] Triggering automated remediation runbook: ${selectedRunbook.name}...`])

    try {
      const res = await callApi(`/runbooks/${selectedRunbook.id}/execute`, {
        method: 'POST',
      })
      setRunbookLogs(res.logs || [])
      setSuccessMessage(`Runbook execution ${res.status} in ${res.duration_ms}ms!`)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Runbook execution failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="observability-console-container" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)', minHeight: 600 }}>
      {/* Top Header */}
      <header className="glass" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderRadius: 14, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ display: 'grid', placeItems: 'center', width: 36, height: 36, borderRadius: 10, background: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8' }}>
            <Activity size={20} />
          </span>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ fontSize: 17, margin: 0, fontWeight: 700 }}>Telemetry, Observability & Operational Support</h2>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'rgba(34, 197, 94, 0.2)', color: '#4ade80', border: '1px solid rgba(34, 197, 94, 0.4)' }}>
                SYSTEM HEALTHY
              </span>
            </div>
            {/* Tabs */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
              <div style={{ display: 'flex', gap: 4 }}>
                {(['Overview', 'Incidents', 'Runbooks', 'SLA'] as const).map((tab) => (
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
                    {tab === 'Overview' && 'System Health & Metrics'}
                    {tab === 'Incidents' && `Incident Management (${incidents.length})`}
                    {tab === 'Runbooks' && `Runbook Automation (${runbooks.length})`}
                    {tab === 'SLA' && `SLA Breach Risk (${slaBreaches.length})`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            className="secondary-button"
            onClick={refreshAll}
            disabled={busy}
            style={{ fontSize: 12, padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <RefreshCw size={14} className={busy ? 'spin' : ''} /> Refresh Telemetry
          </button>

          {activeTab === 'Incidents' && (
            <button
              type="button"
              className="primary-button"
              onClick={() => setIncidentModalOpen(true)}
              style={{ fontSize: 12, padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Plus size={14} /> Report Incident
            </button>
          )}
        </div>
      </header>

      {/* Notification Banners */}
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

      {/* Main Content Areas */}
      {activeTab === 'Overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1, minHeight: 0 }}>
          {/* KPI Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14 }}>
            <div className="glass" style={{ padding: 14, borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#94a3b8', fontSize: 11 }}>
                <span>24H THROUGHPUT</span>
                <Radio size={14} color="#60a5fa" />
              </div>
              <strong style={{ fontSize: 20, fontWeight: 700 }}>{overview ? overview.throughput_24h.toLocaleString() : '0'}</strong>
              <small style={{ color: overview && overview.throughput_24h > 0 ? '#4ade80' : '#94a3b8', fontSize: 11 }}>Completed Executions</small>
            </div>

            <div className="glass" style={{ padding: 14, borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#94a3b8', fontSize: 11 }}>
                <span>ERROR RATE</span>
                <AlertTriangle size={14} color="#f87171" />
              </div>
              <strong style={{ fontSize: 20, fontWeight: 700 }}>{overview ? `${overview.error_rate_pct}%` : '0.0%'}</strong>
              <small style={{ color: '#94a3b8', fontSize: 11 }}>Failure Threshold &lt; 1.0%</small>
            </div>

            <div className="glass" style={{ padding: 14, borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#94a3b8', fontSize: 11 }}>
                <span>QUEUE LATENCY</span>
                <Clock size={14} color="#facc15" />
              </div>
              <strong style={{ fontSize: 20, fontWeight: 700 }}>{overview ? `${overview.avg_queue_latency_ms}ms` : '0ms'}</strong>
              <small style={{ color: '#94a3b8', fontSize: 11 }}>Nominal Dispatch P95</small>
            </div>

            <div className="glass" style={{ padding: 14, borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#94a3b8', fontSize: 11 }}>
                <span>ACTIVE WORKERS</span>
                <Cpu size={14} color="#c084fc" />
              </div>
              <strong style={{ fontSize: 20, fontWeight: 700 }}>{overview ? overview.active_workers_count : 0}</strong>
              <small style={{ color: '#94a3b8', fontSize: 11 }}>Distributed Consumer Nodes</small>
            </div>

            <div className="glass" style={{ padding: 14, borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#94a3b8', fontSize: 11 }}>
                <span>SLA HEALTH SCORE</span>
                <CheckCircle2 size={14} color="#4ade80" />
              </div>
              <strong style={{ fontSize: 20, fontWeight: 700 }}>{overview && overview.throughput_24h > 0 ? `${overview.sla_health_pct}%` : 'N/A'}</strong>
              <small style={{ color: overview && overview.throughput_24h > 0 ? '#4ade80' : '#94a3b8', fontSize: 11 }}>{overview && overview.throughput_24h > 0 ? 'Compliant with Enterprise Tier' : 'No execution data'}</small>
            </div>
          </div>

          {/* Telemetry Stream */}
          <div className="glass" style={{ flex: 1, padding: 16, borderRadius: 14, overflowY: 'auto' }}>
            <h3 style={{ fontSize: 13, textTransform: 'uppercase', color: '#94a3b8', margin: '0 0 12px 0' }}>Live System Metrics Telemetry Stream</h3>
            {metrics.length === 0 ? (
              <div style={{ padding: 30, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                No custom telemetry points ingested yet. Background workers continuously stream metrics.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {metrics.map((m) => (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div>
                      <strong style={{ fontSize: 13 }}>{m.metric_name}</strong>
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                        Dimensions: <code>{JSON.stringify(m.dimensions)}</code>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: '#38bdf8' }}>{m.metric_value}</span>
                      <div style={{ fontSize: 10, color: '#64748b' }}>{new Date(m.timestamp).toLocaleTimeString()}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'Incidents' && (
        <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 14, flex: 1, minHeight: 0 }}>
          {/* Incident List */}
          <aside className="glass" style={{ padding: 14, borderRadius: 14, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h3 style={{ fontSize: 12, margin: 0, textTransform: 'uppercase', letterSpacing: 0.8, color: '#94a3b8' }}>
              Incidents ({incidents.length})
            </h3>
            {incidents.length === 0 ? (
              <div style={{ padding: '30px 10px', textAlign: 'center', color: '#64748b', fontSize: 12 }}>
                No active incidents reported. Click <strong>Report Incident</strong> to file.
              </div>
            ) : (
              incidents.map((inc) => {
                const isSelected = selectedIncident?.id === inc.id
                return (
                  <button
                    key={inc.id}
                    type="button"
                    onClick={() => setSelectedIncident(inc)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                      padding: 12,
                      borderRadius: 10,
                      border: isSelected ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.06)',
                      background: isSelected ? 'rgba(56, 189, 248, 0.12)' : 'rgba(255,255,255,0.02)',
                      textAlign: 'left',
                      cursor: 'pointer',
                      color: '#f8fafc',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <strong style={{ fontSize: 13 }}>{inc.title}</strong>
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: 4,
                          background:
                            inc.severity === 'SEV-1' ? 'rgba(239, 68, 68, 0.2)' : inc.severity === 'SEV-2' ? 'rgba(249, 115, 22, 0.2)' : 'rgba(234, 179, 8, 0.2)',
                          color: inc.severity === 'SEV-1' ? '#fca5a5' : inc.severity === 'SEV-2' ? '#fdba74' : '#fde047',
                        }}
                      >
                        {inc.severity}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8' }}>
                      <span>Status: <strong>{inc.status}</strong></span>
                      <span>{new Date(inc.created_at).toLocaleTimeString()}</span>
                    </div>
                  </button>
                )
              })
            )}
          </aside>

          {/* Incident Detail Pane */}
          <main className="glass" style={{ padding: 18, borderRadius: 14, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {selectedIncident ? (
              <>
                <div style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 14, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div>
                    <h3 style={{ fontSize: 18, margin: 0, fontWeight: 700 }}>{selectedIncident.title}</h3>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                      Severity: <strong>{selectedIncident.severity}</strong> · Status: <strong>{selectedIncident.status}</strong> · Resource: <code>{selectedIncident.affected_resource_id || 'System-wide'}</code>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {selectedIncident.status !== 'INVESTIGATING' && selectedIncident.status !== 'RESOLVED' && (
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => handleUpdateIncidentStatus('INVESTIGATING')}
                        disabled={busy}
                        style={{ fontSize: 11, padding: '5px 10px' }}
                      >
                        Mark Investigating
                      </button>
                    )}
                    {selectedIncident.status !== 'RESOLVED' && (
                      <button
                        type="button"
                        className="primary-button"
                        onClick={() => handleUpdateIncidentStatus('RESOLVED')}
                        disabled={busy}
                        style={{ fontSize: 11, padding: '5px 10px' }}
                      >
                        Resolve Incident
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <h4 style={{ fontSize: 12, textTransform: 'uppercase', color: '#94a3b8', margin: '0 0 6px 0' }}>Incident Summary</h4>
                  <p style={{ margin: 0, padding: 12, borderRadius: 8, background: 'rgba(0,0,0,0.3)', fontSize: 13, color: '#cbd5e1' }}>
                    {selectedIncident.summary}
                  </p>
                </div>

                <div>
                  <label htmlFor="inc-resolution-input" style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 6 }}>
                    Resolution Notes & Root Cause Analysis
                  </label>
                  <textarea
                    id="inc-resolution-input"
                    rows={3}
                    value={resolutionInput || selectedIncident.resolution_notes || ''}
                    onChange={(e) => setResolutionInput(e.target.value)}
                    placeholder="Enter root cause, mitigation steps, and prevention measures..."
                    style={{ width: '100%', boxSizing: 'border-box', padding: 10, borderRadius: 8, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc', fontSize: 12 }}
                  />
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
                Select an incident ticket from the sidebar to inspect or resolve.
              </div>
            )}
          </main>
        </div>
      )}

      {activeTab === 'Runbooks' && (
        <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 14, flex: 1, minHeight: 0 }}>
          {/* Runbooks List */}
          <aside className="glass" style={{ padding: 14, borderRadius: 14, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h3 style={{ fontSize: 12, margin: 0, textTransform: 'uppercase', letterSpacing: 0.8, color: '#94a3b8' }}>
              Operational Runbooks ({runbooks.length})
            </h3>
            {runbooks.map((rb) => {
              const isSelected = selectedRunbook?.id === rb.id
              return (
                <button
                  key={rb.id}
                  type="button"
                  onClick={() => setSelectedRunbook(rb)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    padding: 12,
                    borderRadius: 10,
                    border: isSelected ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.06)',
                    background: isSelected ? 'rgba(56, 189, 248, 0.12)' : 'rgba(255,255,255,0.02)',
                    textAlign: 'left',
                    cursor: 'pointer',
                    color: '#f8fafc',
                  }}
                >
                  <strong style={{ fontSize: 13 }}>{rb.name}</strong>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>Category: {rb.category} · Steps: {rb.steps?.length || 0}</div>
                </button>
              )
            })}
          </aside>

          {/* Runbook Executor & Logs */}
          <main className="glass" style={{ padding: 18, borderRadius: 14, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {selectedRunbook ? (
              <>
                <div style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 14, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div>
                    <h3 style={{ fontSize: 18, margin: 0, fontWeight: 700 }}>{selectedRunbook.name}</h3>
                    <p style={{ fontSize: 13, color: '#94a3b8', margin: '4px 0 0 0' }}>{selectedRunbook.description}</p>
                  </div>
                  <button
                    type="button"
                    className="primary-button"
                    onClick={handleExecuteRunbook}
                    disabled={busy}
                    style={{ fontSize: 12, padding: '6px 14px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <Play size={13} /> Execute Runbook Remediation
                  </button>
                </div>

                <div>
                  <h4 style={{ fontSize: 12, textTransform: 'uppercase', color: '#94a3b8', margin: '0 0 8px 0' }}>Remediation Steps Pipeline</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {selectedRunbook.steps?.map((st, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 8, borderRadius: 6, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <span style={{ fontSize: 11, color: '#38bdf8', fontWeight: 700 }}>Step {i + 1}</span>
                        <strong style={{ fontSize: 12 }}>{st.name}</strong>
                        <code style={{ fontSize: 11, color: '#94a3b8', marginLeft: 'auto' }}>{st.command}</code>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Console Terminal */}
                <div>
                  <h4 style={{ fontSize: 12, textTransform: 'uppercase', color: '#94a3b8', margin: '0 0 6px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Terminal size={14} /> Execution Logs Terminal
                  </h4>
                  <pre style={{ margin: 0, padding: 14, borderRadius: 8, background: '#090d16', border: '1px solid rgba(56, 189, 248, 0.2)', fontSize: 12, color: '#38bdf8', maxHeight: 220, overflowY: 'auto' }}>
                    {runbookLogs.length > 0 ? runbookLogs.join('\n') : '# Ready for automated execution. Click "Execute Runbook Remediation" above.'}
                  </pre>
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
                Select a runbook from the sidebar to inspect or execute.
              </div>
            )}
          </main>
        </div>
      )}

      {activeTab === 'SLA' && (
        <div className="glass" style={{ padding: 16, borderRadius: 14, flex: 1, overflowY: 'auto' }}>
          <h3 style={{ fontSize: 13, textTransform: 'uppercase', color: '#94a3b8', margin: '0 0 12px 0' }}>SLA Breach Events & Predictive Risk</h3>
          {slaBreaches.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
              No SLA breach events registered. All executions operating within nominal service level thresholds.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {slaBreaches.map((sb) => (
                <div key={sb.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div>
                    <strong style={{ fontSize: 13 }}>{sb.target_type}: {sb.target_id}</strong>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                      Expected: <strong>{sb.expected_sla_seconds}s</strong> · Actual: <strong style={{ color: '#f87171' }}>{sb.actual_duration_seconds}s</strong>
                    </div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: 'rgba(239, 68, 68, 0.2)', color: '#fca5a5' }}>
                    {sb.breach_severity}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Incident Filing Modal */}
      {incidentModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'grid', placeItems: 'center', zIndex: 100 }}>
          <div className="glass" style={{ width: 480, padding: 22, borderRadius: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Report Operational Incident</h3>
            <form onSubmit={handleCreateIncident} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label htmlFor="inc-title" style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8' }}>Incident Title</label>
                <input
                  id="inc-title"
                  required
                  value={newIncTitle}
                  onChange={(e) => setNewIncTitle(e.target.value)}
                  placeholder="e.g. Workflow Queue Dispatch Latency Spike"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 6, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc', fontSize: 12 }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 10 }}>
                <div>
                  <label htmlFor="inc-severity" style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8' }}>Severity</label>
                  <select
                    id="inc-severity"
                    value={newIncSeverity}
                    onChange={(e) => setNewIncSeverity(e.target.value as IncidentItem['severity'])}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 6, background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc', fontSize: 12 }}
                  >
                    <option value="SEV-1">SEV-1 (Critical)</option>
                    <option value="SEV-2">SEV-2 (Major)</option>
                    <option value="SEV-3">SEV-3 (Moderate)</option>
                    <option value="SEV-4">SEV-4 (Minor)</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="inc-resource" style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8' }}>Affected Resource ID</label>
                  <input
                    id="inc-resource"
                    value={newIncResource}
                    onChange={(e) => setNewIncResource(e.target.value)}
                    placeholder="e.g. worker-pool-01"
                    style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 6, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc', fontSize: 12 }}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="inc-summary" style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8' }}>Summary & Impact Description</label>
                <textarea
                  id="inc-summary"
                  required
                  rows={3}
                  value={newIncSummary}
                  onChange={(e) => setNewIncSummary(e.target.value)}
                  placeholder="Describe failure symptoms, impacted workflows, and initial diagnostic observations..."
                  style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 6, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc', fontSize: 12 }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <button type="button" className="secondary-button" onClick={() => setIncidentModalOpen(false)} style={{ fontSize: 12, padding: '6px 14px' }}>
                  Cancel
                </button>
                <button type="submit" className="primary-button" disabled={busy} style={{ fontSize: 12, padding: '6px 14px' }}>
                  File Incident
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
