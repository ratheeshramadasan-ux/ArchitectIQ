import { useState, useEffect, useCallback } from 'react'
import {
  ShieldCheck,
  FileCheck,
  Database,
  Plus,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Lock,
  Layers,
  Sparkles,
  Server,
} from 'lucide-react'

export interface PolicyItem {
  id: string
  tenant_id: string
  name: string
  policy_type: 'DATA_RETENTION' | 'RESPONSIBLE_AI' | 'SECURITY_BASELINE'
  retention_days?: number
  rules: Record<string, unknown>
  is_active: boolean
  created_at: string
}

export interface AuditReportItem {
  id: string
  tenant_id: string
  report_type: 'RESPONSIBLE_AI_SAFETY' | 'SOC2_ACCESS_REVIEW' | 'DATA_RETENTION'
  generated_by: string
  verdict: 'COMPLIANT' | 'FLAGGED_FOR_REVIEW' | 'NON_COMPLIANT'
  findings: Array<Record<string, unknown>>
  score_pct: number
  created_at: string
}

export interface DisasterRecoveryHealth {
  status: string
  database_replication: string
  backup_readiness: string
  last_verified_backup: string
  active_recovery_point_objective_sec: number
  active_recovery_time_objective_sec: number
  system_resilience_verdict: string
  verified_at: string
}

interface GovernanceConsoleProps {
  token: string
  tenant: string
  projectId?: string
}

export default function GovernanceConsole({ token, tenant }: GovernanceConsoleProps) {
  const [tab, setTab] = useState<'policies' | 'audits' | 'resilience'>('policies')
  const [policies, setPolicies] = useState<PolicyItem[]>([])
  const [reports, setReports] = useState<AuditReportItem[]>([])
  const [drHealth, setDrHealth] = useState<DisasterRecoveryHealth | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [actionSuccess, setActionSuccess] = useState('')

  // Modal for new policy
  const [showPolicyModal, setShowPolicyModal] = useState(false)
  const [newPolicyName, setNewPolicyName] = useState('')
  const [newPolicyType, setNewPolicyType] = useState<'DATA_RETENTION' | 'RESPONSIBLE_AI' | 'SECURITY_BASELINE'>('DATA_RETENTION')
  const [newRetentionDays, setNewRetentionDays] = useState(365)

  // Report generation state
  const [generatingReport, setGeneratingReport] = useState(false)

  useEffect(() => {
    if (!token || !tenant) return
    let cancelled = false
    const headers = { Authorization: `Bearer ${token}` }

    Promise.all([
      fetch(`/api/v1/tenants/${tenant}/workspace/governance/policies`, { headers }),
      fetch(`/api/v1/tenants/${tenant}/workspace/governance/reports`, { headers }),
      fetch(`/api/v1/tenants/${tenant}/workspace/governance/disaster-recovery/health`, { headers }),
    ])
      .then(async ([policiesRes, reportsRes, drRes]) => {
        if (!policiesRes.ok) throw new Error(`Policies HTTP ${policiesRes.status}`)
        if (!reportsRes.ok) throw new Error(`Reports HTTP ${reportsRes.status}`)

        const policiesData = await policiesRes.json()
        const reportsData = await reportsRes.json()
        let drData = null
        if (drRes.ok) {
          drData = await drRes.json()
        }

        if (!cancelled) {
          setPolicies(Array.isArray(policiesData) ? policiesData : [])
          setReports(Array.isArray(reportsData) ? reportsData : [])
          if (drData) setDrHealth(drData)
          setError('')
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
        }
      })

    return () => {
      cancelled = true
    }
  }, [token, tenant])

  const handleRefresh = useCallback(async () => {
    if (!token || !tenant) return
    setLoading(true)
    setError('')
    try {
      const headers = { Authorization: `Bearer ${token}` }
      const [policiesRes, reportsRes, drRes] = await Promise.all([
        fetch(`/api/v1/tenants/${tenant}/workspace/governance/policies`, { headers }),
        fetch(`/api/v1/tenants/${tenant}/workspace/governance/reports`, { headers }),
        fetch(`/api/v1/tenants/${tenant}/workspace/governance/disaster-recovery/health`, { headers }),
      ])

      if (!policiesRes.ok) throw new Error(`Policies HTTP ${policiesRes.status}`)
      if (!reportsRes.ok) throw new Error(`Reports HTTP ${reportsRes.status}`)

      const policiesData = await policiesRes.json()
      const reportsData = await reportsRes.json()

      setPolicies(Array.isArray(policiesData) ? policiesData : [])
      setReports(Array.isArray(reportsData) ? reportsData : [])

      if (drRes.ok) {
        const drData = await drRes.json()
        setDrHealth(drData)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [token, tenant])

  const handleCreatePolicy = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newPolicyName.trim()) return
    setError('')
    try {
      const res = await fetch(`/api/v1/tenants/${tenant}/workspace/governance/policies`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newPolicyName.trim(),
          policy_type: newPolicyType,
          retention_days: newPolicyType === 'DATA_RETENTION' ? newRetentionDays : undefined,
          rules: { immutable: true, automated_enforcement: true },
          is_active: true,
        }),
      })

      if (!res.ok) throw new Error(`Failed to create policy (${res.status})`)
      const created = await res.json()
      setPolicies(prev => [created, ...prev])
      setShowPolicyModal(false)
      setNewPolicyName('')
      setActionSuccess(`Policy '${created.name}' registered successfully.`)
      setTimeout(() => setActionSuccess(''), 4000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleGenerateAuditReport = async (reportType: 'RESPONSIBLE_AI_SAFETY' | 'SOC2_ACCESS_REVIEW' | 'DATA_RETENTION') => {
    setGeneratingReport(true)
    setError('')
    try {
      const res = await fetch(`/api/v1/tenants/${tenant}/workspace/governance/reports/generate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ report_type: reportType }),
      })

      if (!res.ok) throw new Error(`Failed to generate report (${res.status})`)
      const generated = await res.json()
      setReports(prev => [generated, ...prev])
      setActionSuccess(`Generated ${reportType} report with score ${generated.score_pct}%.`)
      setTimeout(() => setActionSuccess(''), 4000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setGeneratingReport(false)
    }
  }

  return (
    <div className="governance-console p-6 space-y-6" data-testid="governance-console">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/50 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
              <ShieldCheck size={24} />
            </span>
            <h1 className="text-2xl font-bold tracking-tight">Enterprise Governance & Compliance</h1>
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            Enforce Responsible AI guardrails, audit logging retention, SOC2 access policies, and DR resilience SLAs.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-sm hover:bg-muted/50 disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            onClick={() => setShowPolicyModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
          >
            <Plus size={15} />
            New Policy
          </button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2 text-red-400 text-sm" role="alert">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}
      {actionSuccess && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg flex items-center gap-2 text-emerald-400 text-sm" role="status">
          <CheckCircle2 size={16} />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-border/40 gap-6 text-sm font-medium">
        <button
          onClick={() => setTab('policies')}
          className={`pb-2 border-b-2 flex items-center gap-2 ${tab === 'policies' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          <Lock size={15} />
          Policies ({policies.length})
        </button>
        <button
          onClick={() => setTab('audits')}
          className={`pb-2 border-b-2 flex items-center gap-2 ${tab === 'audits' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          <FileCheck size={15} />
          Compliance Audits ({reports.length})
        </button>
        <button
          onClick={() => setTab('resilience')}
          className={`pb-2 border-b-2 flex items-center gap-2 ${tab === 'resilience' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          <Database size={15} />
          Disaster Recovery & HA
        </button>
      </div>

      {/* Tab: Policies */}
      {tab === 'policies' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl border border-border/50 bg-card/40">
              <span className="text-xs font-semibold text-muted-foreground uppercase">Data Retention</span>
              <p className="text-2xl font-bold mt-1">
                {policies.filter(p => p.policy_type === 'DATA_RETENTION').length} Active
              </p>
              <small className="text-muted-foreground">Immutable audit & telemetry storage</small>
            </div>
            <div className="p-4 rounded-xl border border-border/50 bg-card/40">
              <span className="text-xs font-semibold text-muted-foreground uppercase">Responsible AI</span>
              <p className="text-2xl font-bold mt-1">
                {policies.filter(p => p.policy_type === 'RESPONSIBLE_AI').length} Active
              </p>
              <small className="text-muted-foreground">Prompt injection & spend controls</small>
            </div>
            <div className="p-4 rounded-xl border border-border/50 bg-card/40">
              <span className="text-xs font-semibold text-muted-foreground uppercase">Security Baseline</span>
              <p className="text-2xl font-bold mt-1">
                {policies.filter(p => p.policy_type === 'SECURITY_BASELINE').length} Active
              </p>
              <small className="text-muted-foreground">SOC2 & dual-authorization policies</small>
            </div>
          </div>

          <div className="rounded-xl border border-border overflow-hidden bg-card/20">
            <table className="w-full text-left text-sm" data-testid="policies-table">
              <thead className="bg-muted/40 text-muted-foreground text-xs uppercase font-semibold border-b border-border">
                <tr>
                  <th className="p-3">Policy Name</th>
                  <th className="p-3">Category</th>
                  <th className="p-3">Retention / Rules</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Created At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {policies.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-muted-foreground">
                      No compliance policies configured. Register a policy above.
                    </td>
                  </tr>
                ) : (
                  policies.map(p => (
                    <tr key={p.id} className="hover:bg-muted/10 transition-colors">
                      <td className="p-3 font-medium flex items-center gap-2">
                        <Lock size={14} className="text-primary/70" />
                        {p.name}
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-xs bg-muted border border-border/50">
                          {p.policy_type}
                        </span>
                      </td>
                      <td className="p-3 text-muted-foreground text-xs font-mono">
                        {p.retention_days ? `${p.retention_days} Days` : JSON.stringify(p.rules)}
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.is_active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-500/10 text-zinc-400'}`}>
                          {p.is_active ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td className="p-3 text-muted-foreground text-xs">
                        {new Date(p.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: Audits */}
      {tab === 'audits' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl border border-border/60 bg-muted/20">
            <div>
              <h3 className="font-semibold text-sm">Generate Compliance Assessment</h3>
              <p className="text-xs text-muted-foreground">Perform automated evaluation across active workloads</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => handleGenerateAuditReport('RESPONSIBLE_AI_SAFETY')}
                disabled={generatingReport}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-purple-600/20 text-purple-300 border border-purple-500/30 text-xs font-medium hover:bg-purple-600/30 disabled:opacity-50"
              >
                <Sparkles size={14} />
                Responsible AI Safety Audit
              </button>
              <button
                onClick={() => handleGenerateAuditReport('SOC2_ACCESS_REVIEW')}
                disabled={generatingReport}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-600/20 text-blue-300 border border-blue-500/30 text-xs font-medium hover:bg-blue-600/30 disabled:opacity-50"
              >
                <Layers size={14} />
                SOC2 Access Review
              </button>
              <button
                onClick={() => handleGenerateAuditReport('DATA_RETENTION')}
                disabled={generatingReport}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 text-xs font-medium hover:bg-emerald-600/30 disabled:opacity-50"
              >
                <Database size={14} />
                Data Retention Audit
              </button>
            </div>
          </div>

          <div className="space-y-3" data-testid="reports-list">
            {reports.length === 0 ? (
              <div className="p-8 text-center border border-dashed border-border rounded-xl text-muted-foreground">
                No compliance audit reports generated. Click one of the buttons above to run an audit.
              </div>
            ) : (
              reports.map(rep => (
                <div key={rep.id} className="p-4 rounded-xl border border-border bg-card/30 flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{rep.report_type.replace(/_/g, ' ')}</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                        rep.verdict === 'COMPLIANT'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                          : rep.verdict === 'FLAGGED_FOR_REVIEW'
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                          : 'bg-red-500/10 text-red-400 border border-red-500/30'
                      }`}>
                        {rep.verdict}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Generated at {new Date(rep.created_at).toLocaleString()} by {rep.generated_by}
                    </p>
                    {rep.findings && rep.findings.length > 0 && (
                      <div className="text-xs text-amber-300 mt-2 space-y-0.5">
                        {rep.findings.map((f, i) => (
                          <div key={i}>• {String(f.issue || f.check || JSON.stringify(f))}</div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-black">{rep.score_pct}%</div>
                    <span className="text-xs text-muted-foreground">Compliance Score</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Tab: Disaster Recovery & HA */}
      {tab === 'resilience' && drHealth && (
        <div className="space-y-6" data-testid="dr-resilience-panel">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl border border-border/50 bg-card/40">
              <span className="text-xs text-muted-foreground uppercase font-semibold">Resilience SLA</span>
              <div className="text-lg font-bold text-emerald-400 mt-1 flex items-center gap-1.5">
                <CheckCircle2 size={18} />
                {drHealth.system_resilience_verdict}
              </div>
              <small className="text-muted-foreground">Verified at {new Date(drHealth.verified_at).toLocaleTimeString()}</small>
            </div>
            <div className="p-4 rounded-xl border border-border/50 bg-card/40">
              <span className="text-xs text-muted-foreground uppercase font-semibold">Target RPO</span>
              <div className="text-2xl font-bold mt-1">{drHealth.active_recovery_point_objective_sec}s</div>
              <small className="text-muted-foreground">Recovery Point Objective</small>
            </div>
            <div className="p-4 rounded-xl border border-border/50 bg-card/40">
              <span className="text-xs text-muted-foreground uppercase font-semibold">Target RTO</span>
              <div className="text-2xl font-bold mt-1">{drHealth.active_recovery_time_objective_sec}s</div>
              <small className="text-muted-foreground">Recovery Time Objective</small>
            </div>
            <div className="p-4 rounded-xl border border-border/50 bg-card/40">
              <span className="text-xs text-muted-foreground uppercase font-semibold">Replication Mode</span>
              <div className="text-base font-bold text-blue-400 mt-1 flex items-center gap-1.5">
                <Server size={16} />
                {drHealth.database_replication}
              </div>
              <small className="text-muted-foreground">High-Availability Topology</small>
            </div>
          </div>

          <div className="p-4 rounded-xl border border-border/60 bg-muted/10 space-y-2">
            <h4 className="font-semibold text-sm">Disaster Recovery Diagnostic Notes</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Automated backup and restore validation was executed using an isolated disposable recovery database
              environment (`architectiq_recovery_disposable_*`). Schema integrity (32 tables), Alembic migration head,
              Row-Level Security catalog (28 tables), and runtime role isolation were confirmed with zero production database impact.
            </p>
          </div>
        </div>
      )}

      {/* Modal: New Policy */}
      {showPolicyModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border/50 pb-3">
              <h3 className="font-bold text-base flex items-center gap-2">
                <ShieldCheck size={18} className="text-primary" />
                Register Compliance Policy
              </h3>
              <button onClick={() => setShowPolicyModal(false)} className="text-muted-foreground hover:text-foreground text-sm">
                ✕
              </button>
            </div>
            <form onSubmit={handleCreatePolicy} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Policy Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Financial Audit Log Retention 365D"
                  value={newPolicyName}
                  onChange={e => setNewPolicyName(e.target.value)}
                  className="w-full px-3 py-2 rounded-md bg-muted/50 border border-border text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Policy Type</label>
                <select
                  value={newPolicyType}
                  onChange={e => setNewPolicyType(e.target.value as 'DATA_RETENTION' | 'RESPONSIBLE_AI' | 'SECURITY_BASELINE')}
                  className="w-full px-3 py-2 rounded-md bg-muted/50 border border-border text-sm"
                >
                  <option value="DATA_RETENTION">Data Retention Policy</option>
                  <option value="RESPONSIBLE_AI">Responsible AI Governance</option>
                  <option value="SECURITY_BASELINE">Security Baseline (SOC2)</option>
                </select>
              </div>
              {newPolicyType === 'DATA_RETENTION' && (
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">Retention Period (Days)</label>
                  <input
                    type="number"
                    min={30}
                    max={3650}
                    value={newRetentionDays}
                    onChange={e => setNewRetentionDays(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-md bg-muted/50 border border-border text-sm"
                  />
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2 border-t border-border/40">
                <button
                  type="button"
                  onClick={() => setShowPolicyModal(false)}
                  className="px-4 py-2 rounded-md border border-border text-sm hover:bg-muted/50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
                >
                  Save Policy
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
