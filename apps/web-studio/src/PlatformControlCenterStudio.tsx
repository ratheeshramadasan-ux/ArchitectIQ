import React, { useState, useEffect, useCallback } from 'react'
import {
  Building2,
  Server,
  ShieldCheck,
  Activity,
  Layers,
  Cpu,
  RefreshCw,
  Search,
  Plus,
  AlertTriangle,
  CheckCircle2,
  Radio,
  Sliders,
  HardDrive,
  ChevronRight,
  Flame,
  X
} from 'lucide-react'

export interface PlatformMetrics {
  organizations_total: number
  organizations_active: number
  tenants_total: number
  environments_total: number
  active_pods: number
  active_break_glass_leases: number
}

export interface ComputeMetrics {
  total_cpu_cores: number
  allocated_cpu_cores: number
  cpu_utilization_pct: number
  total_memory_gb: number
  allocated_memory_gb: number
  memory_utilization_pct: number
}

export interface ConsumptionMetrics {
  monthly_token_budget: number
  tokens_consumed: number
  token_utilization_pct: number
  storage_quota_gb: number
  storage_used_gb: number
}

export interface PlatformOrg {
  id: string
  name: string
  slug: string
  tier: string
  region: string
  status: string
  contact_email: string
  logo_url?: string | null
  created_at: string
  subscription?: {
    tier: string
    max_tenants: number
    max_workers: number
    monthly_tokens: number
    tokens_consumed: number
    status: string
  }
}

export interface FleetTenant {
  id: string
  name: string
  slug: string
  organization_id: string | null
  organization_name: string
  created_at: string
  environments: Array<{
    id: string
    name: string
    display_name: string
    is_enabled: boolean
    is_default: boolean
  }>
}

export interface InfraPool {
  id: string
  name: string
  region: string
  cluster_type: string
  total_cpu_cores: number
  allocated_cpu_cores: number
  total_memory_gb: number
  allocated_memory_gb: number
  active_pods: number
  status: string
}

export interface BreakGlassRequest {
  id: string
  organization_id: string
  organization_name: string
  requester_email: string
  reason: string
  status: string
  approver_email: string | null
  lease_hours: number
  lease_expires_at: string | null
  created_at: string
}

export interface AuditEvent {
  id: string
  actor_email: string
  actor_role: string
  action: string
  target_type: string
  target_id: string
  outcome: 'SUCCESS' | 'FAILED' | 'DENIED'
  details: Record<string, unknown>
  created_at: string
}

export interface FeatureFlag {
  id: string
  key: string
  name: string
  description: string
  is_enabled: boolean
  target_tier: string
}

interface PlatformControlCenterProps {
  token: string
  initialTab?: string
}

export default function PlatformControlCenterStudio({ token, initialTab = 'dashboard' }: PlatformControlCenterProps) {
  const [activeTab, setActiveTab] = useState<string>(initialTab)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Data States
  const [metrics, setMetrics] = useState<PlatformMetrics | null>(null)
  const [compute, setCompute] = useState<ComputeMetrics | null>(null)
  const [consumption, setConsumption] = useState<ConsumptionMetrics | null>(null)
  const [orgs, setOrgs] = useState<PlatformOrg[]>([])
  const [fleetTenants, setFleetTenants] = useState<FleetTenant[]>([])
  const [infraPools, setInfraPools] = useState<InfraPool[]>([])
  const [breakGlassReqs, setBreakGlassReqs] = useState<BreakGlassRequest[]>([])
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([])
  const [featureFlags, setFeatureFlags] = useState<FeatureFlag[]>([])

  // Modals & Action States
  const [showNewOrgModal, setShowNewOrgModal] = useState(false)
  const [newOrgName, setNewOrgName] = useState('')
  const [newOrgSlug, setNewOrgSlug] = useState('')
  const [newOrgTier, setNewOrgTier] = useState('ENTERPRISE_CORE')
  const [newOrgRegion, setNewOrgRegion] = useState('us-east-1')
  const [newOrgEmail, setNewOrgEmail] = useState('')
  const [newOrgLogoUrl, setNewOrgLogoUrl] = useState('')

  // Edit Org States
  const [editingOrg, setEditingOrg] = useState<PlatformOrg | null>(null)
  const [editOrgName, setEditOrgName] = useState('')
  const [editOrgTier, setEditOrgTier] = useState('ENTERPRISE_CORE')
  const [editOrgRegion, setEditOrgRegion] = useState('us-east-1')
  const [editOrgEmail, setEditOrgEmail] = useState('')
  const [editOrgLogoUrl, setEditOrgLogoUrl] = useState('')

  const startEditOrg = (org: PlatformOrg) => {
    setEditingOrg(org)
    setEditOrgName(org.name)
    setEditOrgTier(org.tier)
    setEditOrgRegion(org.region)
    setEditOrgEmail(org.contact_email)
    setEditOrgLogoUrl(org.logo_url || '')
  }

  const [showNewTenantModal, setShowNewTenantModal] = useState(false)
  const [newTenantOrgId, setNewTenantOrgId] = useState('')
  const [newTenantName, setNewTenantName] = useState('')
  const [newTenantSlug, setNewTenantSlug] = useState('')

  const [showBreakGlassModal, setShowBreakGlassModal] = useState(false)
  const [bgOrgId, setBgOrgId] = useState('')
  const [bgEmail, setBgEmail] = useState('')
  const [bgReason, setBgReason] = useState('')
  const [bgHours, setBgHours] = useState(4)

  const [searchQuery, setSearchQuery] = useState('')
  const [tierFilter, setTierFilter] = useState('ALL')
  const [auditOutcomeFilter, setAuditOutcomeFilter] = useState('ALL')

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }

  const loadAllData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // 1. Dashboard summary
      const dashRes = await fetch('/api/v1/platform/dashboard', { headers: authHeaders })
      if (dashRes.ok) {
        const d = await dashRes.json()
        setMetrics(d.counts)
        setCompute(d.compute)
        setConsumption(d.consumption)
        if (d.recent_audit) setAuditEvents(d.recent_audit)
      }

      // 2. Organizations
      const orgsRes = await fetch('/api/v1/platform/organizations', { headers: authHeaders })
      if (orgsRes.ok) {
        const data = await orgsRes.json()
        setOrgs(Array.isArray(data) ? data : [])
      }

      // 3. Fleet Tenants
      const fleetRes = await fetch('/api/v1/platform/fleet/tenants', { headers: authHeaders })
      if (fleetRes.ok) {
        const data = await fleetRes.json()
        setFleetTenants(Array.isArray(data) ? data : [])
      }

      // 4. Infrastructure Pools
      const infraRes = await fetch('/api/v1/platform/infrastructure', { headers: authHeaders })
      if (infraRes.ok) {
        const data = await infraRes.json()
        setInfraPools(Array.isArray(data.pools) ? data.pools : [])
      }

      // 5. Break Glass Requests
      const bgRes = await fetch('/api/v1/platform/governance/break-glass', { headers: authHeaders })
      if (bgRes.ok) {
        const data = await bgRes.json()
        setBreakGlassReqs(Array.isArray(data) ? data : [])
      }

      // 6. Diagnostics & Feature Flags
      const diagRes = await fetch('/api/v1/platform/diagnostics', { headers: authHeaders })
      if (diagRes.ok) {
        const data = await diagRes.json()
        setFeatureFlags(data.feature_flags || [])
      }

      // 7. Platform Audit Trail
      const auditRes = await fetch('/api/v1/platform/audit-trail?limit=50', { headers: authHeaders })
      if (auditRes.ok) {
        const data = await auditRes.json()
        setAuditEvents(Array.isArray(data) ? data : [])
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    loadAllData()
  }, [loadAllData])

  // Org Creation
  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      const res = await fetch('/api/v1/platform/organizations', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          name: newOrgName,
          slug: newOrgSlug || undefined,
          tier: newOrgTier,
          region: newOrgRegion,
          contact_email: newOrgEmail,
          logo_url: newOrgLogoUrl.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const errJson = await res.json()
        throw new Error(errJson.detail || 'Failed to create organization')
      }
      const created = await res.json()
      setSuccessMsg(`Organization "${newOrgName}" created successfully!`)
      setShowNewOrgModal(false)
      setNewOrgName('')
      setNewOrgSlug('')
      setNewOrgEmail('')
      setNewOrgLogoUrl('')
      loadAllData()

      // Notify Top Bar
      if (created.logo_url) {
        const payload = { id: created.id, name: created.name, logo_url: created.logo_url }
        localStorage.setItem('architectiq.active_org', JSON.stringify(payload))
        window.dispatchEvent(new CustomEvent('architectiq:org_updated', { detail: payload }))
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  // Org Update / Edit (including logo)
  const handleUpdateOrg = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingOrg) return
    setError(null)
    try {
      const res = await fetch(`/api/v1/platform/organizations/${editingOrg.id}`, {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify({
          name: editOrgName,
          tier: editOrgTier,
          region: editOrgRegion,
          contact_email: editOrgEmail,
          logo_url: editOrgLogoUrl.trim() || null,
        }),
      })
      if (!res.ok) {
        const errJson = await res.json()
        throw new Error(errJson.detail || 'Failed to update organization')
      }
      setSuccessMsg(`Organization "${editOrgName}" updated successfully!`)
      setEditingOrg(null)
      loadAllData()

      // Notify Top Bar
      const payload = { id: editingOrg.id, name: editOrgName, logo_url: editOrgLogoUrl.trim() || undefined }
      localStorage.setItem('architectiq.active_org', JSON.stringify(payload))
      window.dispatchEvent(new CustomEvent('architectiq:org_updated', { detail: payload }))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  // Org Lifecycle Action
  const handleOrgLifecycle = async (orgId: string, action: 'suspend' | 'reactivate' | 'archive') => {
    setError(null)
    try {
      const res = await fetch(`/api/v1/platform/organizations/${orgId}/lifecycle`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ action, reason: `Platform administrator ${action} action` }),
      })
      if (!res.ok) {
        const errJson = await res.json()
        throw new Error(errJson.detail || `Action ${action} failed`)
      }
      setSuccessMsg(`Organization status updated to ${action.toUpperCase()}`)
      loadAllData()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  // Tenant Provisioning (Canonical 5-tier envs auto-created)
  const handleProvisionTenant = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      const res = await fetch('/api/v1/platform/fleet/tenants', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          organization_id: newTenantOrgId,
          name: newTenantName,
          slug: newTenantSlug || undefined,
        }),
      })
      if (!res.ok) {
        const errJson = await res.json()
        throw new Error(errJson.detail || 'Tenant provisioning failed')
      }
      setSuccessMsg(`Tenant "${newTenantName}" provisioned with 5 canonical environments (DEV, TEST, UAT, CANARY, PROD)!`)
      setShowNewTenantModal(false)
      setNewTenantName('')
      setNewTenantSlug('')
      loadAllData()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  // Environment Lifecycle Action
  const handleEnvLifecycle = async (envId: string, action: 'enable' | 'disable') => {
    setError(null)
    try {
      const res = await fetch(`/api/v1/platform/fleet/environments/${envId}/lifecycle`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ action, reason: `Operator requested ${action}` }),
      })
      if (!res.ok) {
        const errJson = await res.json()
        throw new Error(errJson.detail || `Failed to ${action} environment`)
      }
      setSuccessMsg(`Environment status updated successfully`)
      loadAllData()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  // Break-Glass Lease Request
  const handleRequestBreakGlass = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      const res = await fetch('/api/v1/platform/governance/break-glass', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          organization_id: bgOrgId,
          requester_email: bgEmail,
          reason: bgReason,
          lease_hours: Number(bgHours),
        }),
      })
      if (!res.ok) {
        const errJson = await res.json()
        throw new Error(errJson.detail || 'Break-glass request failed')
      }
      setSuccessMsg('Break-glass emergency request submitted for dual-custody approval')
      setShowBreakGlassModal(false)
      setBgReason('')
      loadAllData()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  // Break-Glass Action (Approve / Reject / Terminate)
  const handleBreakGlassAction = async (reqId: string, action: 'approve' | 'reject' | 'terminate') => {
    setError(null)
    try {
      const res = await fetch(`/api/v1/platform/governance/break-glass/${reqId}/action`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          action,
          approver_email: 'secops-lead@architectiq.io',
        }),
      })
      if (!res.ok) {
        const errJson = await res.json()
        throw new Error(errJson.detail || `Break-glass ${action} failed`)
      }
      setSuccessMsg(`Break-glass lease marked as ${action.toUpperCase()}`)
      loadAllData()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  // Toggle Feature Flag
  const handleToggleFlag = async (flagKey: string, currentVal: boolean) => {
    setError(null)
    try {
      const res = await fetch('/api/v1/platform/diagnostics/feature-flags', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ key: flagKey, is_enabled: !currentVal }),
      })
      if (!res.ok) {
        const errJson = await res.json()
        throw new Error(errJson.detail || 'Failed to toggle feature flag')
      }
      setFeatureFlags(prev => prev.map(f => f.key === flagKey ? { ...f, is_enabled: !currentVal } : f))
      setSuccessMsg(`Feature flag "${flagKey}" is now ${!currentVal ? 'ENABLED' : 'DISABLED'}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  // Verify Backup Trigger
  const handleVerifyBackup = async () => {
    setError(null)
    try {
      const res = await fetch('/api/v1/platform/diagnostics/verify-backup', {
        method: 'POST',
        headers: authHeaders,
      })
      if (!res.ok) {
        const errJson = await res.json()
        throw new Error(errJson.detail || 'Backup verification test failed')
      }
      const data = await res.json()
      setSuccessMsg(`Live Backup Verified! Snapshot: ${data.snapshot_id} (RPO: ${data.rpo_minutes}m, RTO: ${data.rto_minutes}m)`)
      loadAllData()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  // Filtered organizations
  const filteredOrgs = orgs.filter(o => {
    const matchesSearch = !searchQuery || o.name.toLowerCase().includes(searchQuery.toLowerCase()) || o.slug.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesTier = tierFilter === 'ALL' || o.tier === tierFilter
    return matchesSearch && matchesTier
  })

  // Filtered audit events
  const filteredAudits = auditEvents.filter(a => {
    if (auditOutcomeFilter === 'ALL') return true
    return a.outcome === auditOutcomeFilter
  })

  return (
    <div className="platform-control-center" style={{ padding: '24px 32px', color: 'var(--foreground)' }}>
      {/* 1. Header Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--accent, #BA9731)', textTransform: 'uppercase' }}>
              MODULE 01 · ENTERPRISE MASTER BLUEPRINT V3.0
            </span>
            <span className="preview-pill" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', padding: '2px 8px', borderRadius: 12, background: 'rgba(186,151,49,0.15)', color: 'var(--accent, #BA9731)', border: '1px solid rgba(186,151,49,0.3)' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981' }} /> ACTIVE CONTROL PLANE
            </span>
          </div>
          <h1 style={{ margin: '4px 0 0 0', fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
            Platform Control Center
          </h1>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.88rem', color: 'var(--muted, #94a3b8)' }}>
            Executive multi-organization fleet governance, canonical 5-tier environment lifecycle, shared infrastructure, and dual-custody break-glass controls.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={loadAllData}
            disabled={loading}
            className="secondary-button"
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, fontSize: '0.84rem' }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button
            onClick={() => setShowBreakGlassModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, fontSize: '0.84rem', background: 'rgba(239, 68, 68, 0.15)', color: '#EF4444', border: '1px solid rgba(239, 68, 68, 0.3)', fontWeight: 600, cursor: 'pointer' }}
          >
            <Flame size={14} /> Break-Glass Access
          </button>
          <button
            onClick={() => setShowNewTenantModal(true)}
            className="secondary-button"
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, fontSize: '0.84rem' }}
          >
            <Layers size={14} /> + Provision Tenant
          </button>
          <button
            onClick={() => setShowNewOrgModal(true)}
            className="primary-button"
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, fontSize: '0.84rem', fontWeight: 600 }}
          >
            <Plus size={15} /> + New Organization
          </button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderRadius: 8, background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#EF4444', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <AlertTriangle size={16} />
            <span style={{ fontSize: '0.88rem' }}>{error}</span>
          </div>
          <button onClick={() => setError(null)} style={{ background: 'transparent', border: 'none', color: '#EF4444', cursor: 'pointer' }}><X size={14} /></button>
        </div>
      )}
      {successMsg && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderRadius: 8, background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#10B981', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <CheckCircle2 size={16} />
            <span style={{ fontSize: '0.88rem' }}>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} style={{ background: 'transparent', border: 'none', color: '#10B981', cursor: 'pointer' }}><X size={14} /></button>
        </div>
      )}

      {/* 2. Executive KPI Ribbon */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 14, marginBottom: 20 }}>
        <div className="metric-card glass" style={{ padding: 14, borderRadius: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted, #94a3b8)', fontSize: '0.78rem', textTransform: 'uppercase' }}>
            <span>Organizations</span>
            <Building2 size={16} style={{ color: 'var(--accent, #BA9731)' }} />
          </div>
          <div style={{ fontSize: '1.65rem', fontWeight: 800, marginTop: 4 }}>
            {metrics?.organizations_total ?? orgs.length}
          </div>
          <small style={{ color: '#10B981', fontSize: '0.75rem', fontWeight: 500 }}>
            {metrics?.organizations_active ?? orgs.filter(o => o.status === 'ENABLED').length} Active
          </small>
        </div>

        <div className="metric-card glass" style={{ padding: 14, borderRadius: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted, #94a3b8)', fontSize: '0.78rem', textTransform: 'uppercase' }}>
            <span>Tenant Fleet</span>
            <Layers size={16} style={{ color: '#3B82F6' }} />
          </div>
          <div style={{ fontSize: '1.65rem', fontWeight: 800, marginTop: 4 }}>
            {metrics?.tenants_total ?? fleetTenants.length}
          </div>
          <small style={{ color: 'var(--muted, #94a3b8)', fontSize: '0.75rem' }}>Across all orgs</small>
        </div>

        <div className="metric-card glass" style={{ padding: 14, borderRadius: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted, #94a3b8)', fontSize: '0.78rem', textTransform: 'uppercase' }}>
            <span>5 Canonical Envs</span>
            <HardDrive size={16} style={{ color: '#8B5CF6' }} />
          </div>
          <div style={{ fontSize: '1.65rem', fontWeight: 800, marginTop: 4 }}>
            {metrics?.environments_total ?? fleetTenants.reduce((acc, t) => acc + (t.environments?.length || 0), 0)}
          </div>
          <small style={{ color: '#8B5CF6', fontSize: '0.75rem' }}>DEV·TEST·UAT·CANARY·PROD</small>
        </div>

        <div className="metric-card glass" style={{ padding: 14, borderRadius: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted, #94a3b8)', fontSize: '0.78rem', textTransform: 'uppercase' }}>
            <span>Compute Fleet</span>
            <Cpu size={16} style={{ color: '#EC4899' }} />
          </div>
          <div style={{ fontSize: '1.65rem', fontWeight: 800, marginTop: 4 }}>
            {compute?.allocated_cpu_cores ?? 100} / {compute?.total_cpu_cores ?? 256}
          </div>
          <small style={{ color: 'var(--muted, #94a3b8)', fontSize: '0.75rem' }}>
            {compute?.cpu_utilization_pct ?? 39.1}% vCPU Utilized
          </small>
        </div>

        <div className="metric-card glass" style={{ padding: 14, borderRadius: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted, #94a3b8)', fontSize: '0.78rem', textTransform: 'uppercase' }}>
            <span>Monthly AI Tokens</span>
            <Radio size={16} style={{ color: '#10B981' }} />
          </div>
          <div style={{ fontSize: '1.45rem', fontWeight: 800, marginTop: 4 }}>
            {consumption ? `${(consumption.tokens_consumed / 1_000_000).toFixed(1)}M` : '48.2M'}
          </div>
          <small style={{ color: '#10B981', fontSize: '0.75rem' }}>
            {consumption?.token_utilization_pct ?? 9.6}% of {(consumption?.monthly_token_budget ? consumption.monthly_token_budget / 1_000_000 : 500)}M budget
          </small>
        </div>

        <div className="metric-card glass" style={{ padding: 14, borderRadius: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted, #94a3b8)', fontSize: '0.78rem', textTransform: 'uppercase' }}>
            <span>Dual-Custody Leases</span>
            <Flame size={16} style={{ color: '#EF4444' }} />
          </div>
          <div style={{ fontSize: '1.65rem', fontWeight: 800, marginTop: 4 }}>
            {breakGlassReqs.filter(r => r.status === 'APPROVED').length}
          </div>
          <small style={{ color: breakGlassReqs.filter(r => r.status === 'PENDING').length > 0 ? '#F59E0B' : 'var(--muted, #94a3b8)', fontSize: '0.75rem' }}>
            {breakGlassReqs.filter(r => r.status === 'PENDING').length} Pending Approval
          </small>
        </div>
      </div>

      {/* 3. Section Navigation Tabs */}
      <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: 12, marginBottom: 20 }}>
        {[
          { id: 'dashboard', label: 'Platform Dashboard', icon: Activity },
          { id: 'organizations', label: `Organizations (${orgs.length})`, icon: Building2 },
          { id: 'fleet', label: `Tenant Fleet (${fleetTenants.length})`, icon: Layers },
          { id: 'infrastructure', label: `Infrastructure (${infraPools.length})`, icon: Server },
          { id: 'subscriptions', label: 'Subscriptions & Quotas', icon: HardDrive },
          { id: 'governance', label: `Governance & Break-Glass (${breakGlassReqs.length})`, icon: ShieldCheck },
          { id: 'diagnostics', label: 'Settings & Diagnostics', icon: Sliders },
        ].map(t => {
          const Icon = t.icon
          const isAct = activeTab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 14px',
                borderRadius: 8,
                background: isAct ? 'rgba(186, 151, 49, 0.2)' : 'transparent',
                color: isAct ? 'var(--accent, #BA9731)' : 'var(--muted, #94a3b8)',
                border: isAct ? '1px solid rgba(186, 151, 49, 0.4)' : '1px solid transparent',
                fontWeight: isAct ? 600 : 500,
                fontSize: '0.84rem',
                cursor: 'pointer',
              }}
            >
              <Icon size={14} />
              {t.label}
            </button>
          )
        })}
      </div>

      {/* TAB CONTENT: 1. DASHBOARD */}
      {activeTab === 'dashboard' && (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Fleet Health & Capacity Breakdown */}
            <div className="workspace-panel glass" style={{ padding: 20, borderRadius: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Fleet Health & SLA Status</h3>
                  <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: 'var(--muted, #94a3b8)' }}>Active regional clusters and multi-zone durability</p>
                </div>
                <span className="preview-pill" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10B981', padding: '3px 10px', borderRadius: 12, fontSize: '0.75rem', fontWeight: 600 }}>
                  99.98% FLEET SLA
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
                <div style={{ padding: 14, borderRadius: 8, background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--muted, #94a3b8)', fontWeight: 600 }}>US EAST (N. VIRGINIA)</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, marginTop: 4, color: '#10B981' }}>OPERATIONAL</div>
                  <small style={{ fontSize: '0.72rem', color: 'var(--muted, #94a3b8)' }}>1 Dedicated Mesh · 42 Active Pods</small>
                </div>
                <div style={{ padding: 14, borderRadius: 8, background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--muted, #94a3b8)', fontWeight: 600 }}>EUROPE (FRANKFURT)</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, marginTop: 4, color: '#10B981' }}>OPERATIONAL</div>
                  <small style={{ fontSize: '0.72rem', color: 'var(--muted, #94a3b8)' }}>1 Shared Cluster · 24 Active Pods</small>
                </div>
                <div style={{ padding: 14, borderRadius: 8, background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--muted, #94a3b8)', fontWeight: 600 }}>ASIA PACIFIC (SINGAPORE)</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, marginTop: 4, color: '#10B981' }}>OPERATIONAL</div>
                  <small style={{ fontSize: '0.72rem', color: 'var(--muted, #94a3b8)' }}>1 Shared Cluster · 16 Active Pods</small>
                </div>
              </div>

              {/* Resource Progress Bars */}
              <div style={{ marginTop: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: 4 }}>
                  <span>Compute Capacity (vCPU Cores)</span>
                  <strong>{compute?.allocated_cpu_cores ?? 100} / {compute?.total_cpu_cores ?? 256} Cores ({compute?.cpu_utilization_pct ?? 39.1}%)</strong>
                </div>
                <div style={{ width: '100%', height: 8, borderRadius: 4, background: 'rgba(255, 255, 255, 0.08)', overflow: 'hidden' }}>
                  <div style={{ width: `${compute?.cpu_utilization_pct ?? 39.1}%`, height: '100%', background: 'linear-gradient(90deg, #10B981, #BA9731)' }} />
                </div>
              </div>

              <div style={{ marginTop: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: 4 }}>
                  <span>Memory Allocation (RAM GB)</span>
                  <strong>{compute?.allocated_memory_gb ?? 400} / {compute?.total_memory_gb ?? 1024} GB ({compute?.memory_utilization_pct ?? 39.1}%)</strong>
                </div>
                <div style={{ width: '100%', height: 8, borderRadius: 4, background: 'rgba(255, 255, 255, 0.08)', overflow: 'hidden' }}>
                  <div style={{ width: `${compute?.memory_utilization_pct ?? 39.1}%`, height: '100%', background: 'linear-gradient(90deg, #3B82F6, #8B5CF6)' }} />
                </div>
              </div>
            </div>

            {/* Quick Fleet Table Preview */}
            <div className="workspace-panel glass" style={{ padding: 20, borderRadius: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Top Enterprise Organizations</h3>
                <button onClick={() => setActiveTab('organizations')} className="text-action" style={{ fontSize: '0.8rem' }}>
                  View All ({orgs.length}) <ChevronRight size={14} />
                </button>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.08)', color: 'var(--muted, #94a3b8)' }}>
                    <th style={{ padding: '8px 6px' }}>Organization</th>
                    <th style={{ padding: '8px 6px' }}>Tier</th>
                    <th style={{ padding: '8px 6px' }}>Region</th>
                    <th style={{ padding: '8px 6px' }}>Status</th>
                    <th style={{ padding: '8px 6px' }}>Contact</th>
                  </tr>
                </thead>
                <tbody>
                  {orgs.slice(0, 5).map(o => (
                    <tr key={o.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '10px 6px', fontWeight: 600 }}>{o.name}</td>
                      <td style={{ padding: '10px 6px' }}>
                        <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 600, background: o.tier.includes('ULTRA') ? 'rgba(186,151,49,0.2)' : 'rgba(59,130,246,0.2)', color: o.tier.includes('ULTRA') ? 'var(--accent, #BA9731)' : '#3B82F6' }}>
                          {o.tier}
                        </span>
                      </td>
                      <td style={{ padding: '10px 6px', color: 'var(--muted, #94a3b8)' }}>{o.region}</td>
                      <td style={{ padding: '10px 6px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: o.status === 'ENABLED' ? '#10B981' : '#F59E0B' }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: o.status === 'ENABLED' ? '#10B981' : '#F59E0B' }} />
                          {o.status}
                        </span>
                      </td>
                      <td style={{ padding: '10px 6px', color: 'var(--muted, #94a3b8)' }}>{o.contact_email}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right Column: Recent Audits & Active Break-Glass */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Active Break Glass Banner */}
            <div className="workspace-panel glass" style={{ padding: 18, borderRadius: 12, border: breakGlassReqs.some(r => r.status === 'PENDING') ? '1px solid rgba(245, 158, 11, 0.4)' : undefined }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, color: '#EF4444' }}>
                <Flame size={18} />
                <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700 }}>Break-Glass Leases</h4>
              </div>
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--muted, #94a3b8)', marginBottom: 12 }}>
                Dual-custody emergency platform access for Sev-1 incident triage.
              </p>

              {breakGlassReqs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--muted, #94a3b8)', fontSize: '0.8rem' }}>
                  No active emergency leases.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {breakGlassReqs.slice(0, 3).map(r => (
                    <div key={r.id} style={{ padding: 10, borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', fontSize: '0.78rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <strong>{r.organization_name}</strong>
                        <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: '0.68rem', fontWeight: 700, background: r.status === 'APPROVED' ? 'rgba(16,185,129,0.2)' : r.status === 'PENDING' ? 'rgba(245,158,11,0.2)' : 'rgba(239,68,68,0.2)', color: r.status === 'APPROVED' ? '#10B981' : r.status === 'PENDING' ? '#F59E0B' : '#EF4444' }}>
                          {r.status}
                        </span>
                      </div>
                      <div style={{ color: 'var(--muted, #94a3b8)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {r.reason}
                      </div>
                    </div>
                  ))}
                  <button onClick={() => setActiveTab('governance')} className="text-action" style={{ fontSize: '0.75rem', marginTop: 4 }}>
                    Manage Break-Glass Requests →
                  </button>
                </div>
              )}
            </div>

            {/* Recent Platform Audit Feed */}
            <div className="workspace-panel glass" style={{ padding: 18, borderRadius: 12, flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ShieldCheck size={16} style={{ color: '#10B981' }} />
                  <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700 }}>Platform Audit Activity</h4>
                </div>
                <button onClick={() => setActiveTab('governance')} className="text-action" style={{ fontSize: '0.75rem' }}>View All</button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {auditEvents.slice(0, 5).map(ev => (
                  <div key={ev.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: '0.78rem', borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: 8 }}>
                    <span style={{ marginTop: 2, padding: '2px 4px', borderRadius: 4, fontSize: '0.65rem', fontWeight: 700, background: ev.outcome === 'SUCCESS' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', color: ev.outcome === 'SUCCESS' ? '#10B981' : '#EF4444' }}>
                      {ev.outcome}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600 }}>{ev.action}</div>
                      <div style={{ color: 'var(--muted, #94a3b8)', fontSize: '0.72rem' }}>{ev.actor_email} · {ev.target_type}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: 2. ORGANIZATIONS */}
      {activeTab === 'organizations' && (
        <div className="workspace-panel glass" style={{ padding: 20, borderRadius: 12 }}>
          {/* Controls Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ position: 'relative', width: 280 }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--muted, #94a3b8)' }} />
                <input
                  type="text"
                  placeholder="Search organizations or slug..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{ width: '100%', padding: '7px 10px 7px 32px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--foreground)', fontSize: '0.84rem' }}
                />
              </div>

              <select
                value={tierFilter}
                onChange={e => setTierFilter(e.target.value)}
                style={{ padding: '7px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--foreground)', fontSize: '0.84rem' }}
              >
                <option value="ALL">All Tiers</option>
                <option value="ENTERPRISE_STARTER">Starter</option>
                <option value="ENTERPRISE_CORE">Core</option>
                <option value="ENTERPRISE_ULTRA">Ultra</option>
              </select>
            </div>

            <button
              onClick={() => setShowNewOrgModal(true)}
              className="primary-button"
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, fontSize: '0.84rem' }}
            >
              <Plus size={14} /> Add Organization
            </button>
          </div>

          {/* Organizations Table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.08)', color: 'var(--muted, #94a3b8)' }}>
                <th style={{ padding: '10px 8px' }}>Organization Name</th>
                <th style={{ padding: '10px 8px' }}>Slug</th>
                <th style={{ padding: '10px 8px' }}>Tier</th>
                <th style={{ padding: '10px 8px' }}>Region</th>
                <th style={{ padding: '10px 8px' }}>Status</th>
                <th style={{ padding: '10px 8px' }}>Contact Email</th>
                <th style={{ padding: '10px 8px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrgs.map(o => (
                <tr key={o.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '12px 8px', fontWeight: 600 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {o.logo_url ? (
                        <img
                          src={o.logo_url}
                          alt={o.name}
                          style={{ width: 22, height: 22, objectFit: 'contain', borderRadius: 4, background: 'rgba(255,255,255,0.06)', padding: 1 }}
                        />
                      ) : (
                        <div style={{ width: 22, height: 22, borderRadius: 4, background: 'rgba(186,151,49,0.15)', display: 'grid', placeItems: 'center', color: 'var(--accent, #BA9731)' }}>
                          <Building2 size={12} />
                        </div>
                      )}
                      <span>{o.name}</span>
                    </div>
                  </td>
                  <td style={{ padding: '12px 8px', color: 'var(--muted, #94a3b8)', fontFamily: 'monospace' }}>{o.slug}</td>
                  <td style={{ padding: '12px 8px' }}>
                    <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 600, background: o.tier.includes('ULTRA') ? 'rgba(186,151,49,0.2)' : 'rgba(59,130,246,0.2)', color: o.tier.includes('ULTRA') ? 'var(--accent, #BA9731)' : '#3B82F6' }}>
                      {o.tier}
                    </span>
                  </td>
                  <td style={{ padding: '12px 8px', color: 'var(--muted, #94a3b8)' }}>{o.region}</td>
                  <td style={{ padding: '12px 8px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 12, fontSize: '0.72rem', fontWeight: 600, background: o.status === 'ENABLED' ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)', color: o.status === 'ENABLED' ? '#10B981' : '#F59E0B' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: o.status === 'ENABLED' ? '#10B981' : '#F59E0B' }} />
                      {o.status}
                    </span>
                  </td>
                  <td style={{ padding: '12px 8px', color: 'var(--muted, #94a3b8)' }}>{o.contact_email}</td>
                  <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: 6 }}>
                      <button
                        onClick={() => startEditOrg(o)}
                        style={{ padding: '4px 10px', borderRadius: 6, fontSize: '0.72rem', background: 'rgba(59, 130, 246, 0.15)', color: '#3B82F6', border: '1px solid rgba(59, 130, 246, 0.3)', cursor: 'pointer', fontWeight: 600 }}
                      >
                        Edit
                      </button>
                      {o.status === 'ENABLED' ? (
                        <button
                          onClick={() => handleOrgLifecycle(o.id, 'suspend')}
                          style={{ padding: '4px 10px', borderRadius: 6, fontSize: '0.72rem', background: 'rgba(245, 158, 11, 0.15)', color: '#F59E0B', border: '1px solid rgba(245, 158, 11, 0.3)', cursor: 'pointer' }}
                        >
                          Suspend
                        </button>
                      ) : (
                        <button
                          onClick={() => handleOrgLifecycle(o.id, 'reactivate')}
                          style={{ padding: '4px 10px', borderRadius: 6, fontSize: '0.72rem', background: 'rgba(16, 185, 129, 0.15)', color: '#10B981', border: '1px solid rgba(16, 185, 129, 0.3)', cursor: 'pointer' }}
                        >
                          Reactivate
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB CONTENT: 3. TENANT FLEET */}
      {activeTab === 'fleet' && (
        <div className="workspace-panel glass" style={{ padding: 20, borderRadius: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Cross-Organization Tenant Fleet</h3>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: 'var(--muted, #94a3b8)' }}>
                Every tenant is provisioned with all 5 canonical environments: DEV, TEST, UAT, CANARY, and PROD.
              </p>
            </div>
            <button
              onClick={() => setShowNewTenantModal(true)}
              className="primary-button"
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, fontSize: '0.84rem' }}
            >
              <Plus size={14} /> Provision Tenant
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {fleetTenants.map(t => (
              <div key={t.id} style={{ padding: 16, borderRadius: 10, background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: '1rem', fontWeight: 700 }}>{t.name}</span>
                      <span style={{ padding: '2px 8px', borderRadius: 6, background: 'rgba(255, 255, 255, 0.06)', color: 'var(--muted, #94a3b8)', fontSize: '0.72rem', fontFamily: 'monospace' }}>
                        {t.slug}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--accent, #BA9731)', marginTop: 2 }}>
                      Organization: {t.organization_name}
                    </div>
                  </div>
                </div>

                {/* 5 Canonical Environments Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
                  {t.environments?.map(env => (
                    <div
                      key={env.id}
                      style={{
                        padding: 10,
                        borderRadius: 8,
                        background: env.is_enabled ? 'rgba(255,255,255,0.03)' : 'rgba(239, 68, 68, 0.05)',
                        border: env.is_enabled ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(239, 68, 68, 0.2)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <strong style={{ fontSize: '0.84rem', color: env.name === 'PROD' ? '#EF4444' : env.name === 'CANARY' ? '#A855F7' : env.name === 'UAT' ? '#F59E0B' : '#10B981' }}>
                          {env.name}
                        </strong>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: env.is_enabled ? '#10B981' : '#EF4444' }} />
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--muted, #94a3b8)', marginBottom: 8 }}>
                        {env.display_name}
                      </div>

                      <button
                        onClick={() => handleEnvLifecycle(env.id, env.is_enabled ? 'disable' : 'enable')}
                        style={{
                          width: '100%',
                          padding: '3px 6px',
                          borderRadius: 4,
                          fontSize: '0.68rem',
                          background: env.is_enabled ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                          color: env.is_enabled ? '#EF4444' : '#10B981',
                          border: 'none',
                          cursor: 'pointer',
                        }}
                      >
                        {env.is_enabled ? 'Disable' : 'Enable'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB CONTENT: 4. INFRASTRUCTURE & CAPACITY */}
      {activeTab === 'infrastructure' && (
        <div className="workspace-panel glass" style={{ padding: 20, borderRadius: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Infrastructure & Compute Fleet</h3>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: 'var(--muted, #94a3b8)' }}>
                Dedicated Kubernetes node groups and shared multi-tenant execution clusters.
              </p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            {infraPools.map(pool => (
              <div key={pool.id} style={{ padding: 16, borderRadius: 10, background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <strong style={{ fontSize: '0.92rem' }}>{pool.name}</strong>
                  <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: '0.68rem', fontWeight: 700, background: pool.cluster_type === 'DEDICATED' ? 'rgba(186, 151, 49, 0.2)' : 'rgba(59, 130, 246, 0.2)', color: pool.cluster_type === 'DEDICATED' ? 'var(--accent, #BA9731)' : '#3B82F6' }}>
                    {pool.cluster_type}
                  </span>
                </div>

                <div style={{ fontSize: '0.75rem', color: 'var(--muted, #94a3b8)', marginBottom: 12 }}>
                  Region: {pool.region} · Active Pods: {pool.active_pods}
                </div>

                <div style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: 2 }}>
                    <span>CPU Cores</span>
                    <strong>{pool.allocated_cpu_cores} / {pool.total_cpu_cores}</strong>
                  </div>
                  <div style={{ width: '100%', height: 6, borderRadius: 3, background: 'rgba(255, 255, 255, 0.08)', overflow: 'hidden' }}>
                    <div style={{ width: `${(pool.allocated_cpu_cores / pool.total_cpu_cores) * 100}%`, height: '100%', background: '#10B981' }} />
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: 2 }}>
                    <span>Memory (GB)</span>
                    <strong>{pool.allocated_memory_gb} / {pool.total_memory_gb} GB</strong>
                  </div>
                  <div style={{ width: '100%', height: 6, borderRadius: 3, background: 'rgba(255, 255, 255, 0.08)', overflow: 'hidden' }}>
                    <div style={{ width: `${(pool.allocated_memory_gb / pool.total_memory_gb) * 100}%`, height: '100%', background: '#3B82F6' }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB CONTENT: 5. SUBSCRIPTIONS & LICENSING */}
      {activeTab === 'subscriptions' && (
        <div className="workspace-panel glass" style={{ padding: 20, borderRadius: 12 }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, marginBottom: 4 }}>Organization Entitlements & Token Quotas</h3>
          <p style={{ margin: '0 0 16px 0', fontSize: '0.78rem', color: 'var(--muted, #94a3b8)' }}>
            Enterprise license tracking, max tenant caps, concurrent worker allocations, and monthly token budgets.
          </p>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.08)', color: 'var(--muted, #94a3b8)' }}>
                <th style={{ padding: '10px 8px' }}>Organization</th>
                <th style={{ padding: '10px 8px' }}>Tier</th>
                <th style={{ padding: '10px 8px' }}>Max Tenants</th>
                <th style={{ padding: '10px 8px' }}>Worker Concurrency</th>
                <th style={{ padding: '10px 8px' }}>Monthly Token Budget</th>
                <th style={{ padding: '10px 8px' }}>Tokens Consumed</th>
                <th style={{ padding: '10px 8px' }}>License Status</th>
              </tr>
            </thead>
            <tbody>
              {orgs.map(o => (
                <tr key={o.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '12px 8px', fontWeight: 600 }}>{o.name}</td>
                  <td style={{ padding: '12px 8px' }}>
                    <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 600, background: o.tier.includes('ULTRA') ? 'rgba(186,151,49,0.2)' : 'rgba(59,130,246,0.2)', color: o.tier.includes('ULTRA') ? 'var(--accent, #BA9731)' : '#3B82F6' }}>
                      {o.tier}
                    </span>
                  </td>
                  <td style={{ padding: '12px 8px' }}>{o.subscription?.max_tenants ?? 25} Tenants</td>
                  <td style={{ padding: '12px 8px' }}>{o.subscription?.max_workers ?? 50} Concurrent</td>
                  <td style={{ padding: '12px 8px' }}>
                    {o.subscription?.monthly_tokens ? `${(o.subscription.monthly_tokens / 1_000_000).toFixed(0)}M tokens` : '100M tokens'}
                  </td>
                  <td style={{ padding: '12px 8px', color: '#10B981', fontWeight: 600 }}>
                    {o.subscription?.tokens_consumed ? `${(o.subscription.tokens_consumed / 1_000_000).toFixed(2)}M` : '0M'}
                  </td>
                  <td style={{ padding: '12px 8px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#10B981', fontSize: '0.75rem', fontWeight: 600 }}>
                      <CheckCircle2 size={13} /> ACTIVE
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB CONTENT: 6. GOVERNANCE & BREAK-GLASS */}
      {activeTab === 'governance' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Break-Glass Approval Card */}
          <div className="workspace-panel glass" style={{ padding: 20, borderRadius: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#EF4444', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Flame size={18} /> Dual-Custody Break-Glass Emergency Leases
                </h3>
                <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: 'var(--muted, #94a3b8)' }}>
                  Enforces zero-standing privileged access. Any lease requires SecOps co-approval and automatically expires.
                </p>
              </div>
              <button
                onClick={() => setShowBreakGlassModal(true)}
                style={{ padding: '6px 12px', borderRadius: 6, fontSize: '0.8rem', background: 'rgba(239, 68, 68, 0.2)', color: '#EF4444', border: '1px solid rgba(239, 68, 68, 0.4)', fontWeight: 600, cursor: 'pointer' }}
              >
                + Request Emergency Lease
              </button>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.08)', color: 'var(--muted, #94a3b8)' }}>
                  <th style={{ padding: '8px 6px' }}>Organization</th>
                  <th style={{ padding: '8px 6px' }}>Requester</th>
                  <th style={{ padding: '8px 6px' }}>Incident Reason</th>
                  <th style={{ padding: '8px 6px' }}>Lease Duration</th>
                  <th style={{ padding: '8px 6px' }}>Status</th>
                  <th style={{ padding: '8px 6px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {breakGlassReqs.map(r => (
                  <tr key={r.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '10px 6px', fontWeight: 600 }}>{r.organization_name}</td>
                    <td style={{ padding: '10px 6px', color: 'var(--muted, #94a3b8)' }}>{r.requester_email}</td>
                    <td style={{ padding: '10px 6px', maxWidth: 260, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.reason}</td>
                    <td style={{ padding: '10px 6px' }}>{r.lease_hours}h</td>
                    <td style={{ padding: '10px 6px' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: '0.72rem', fontWeight: 700, background: r.status === 'APPROVED' ? 'rgba(16,185,129,0.2)' : r.status === 'PENDING' ? 'rgba(245,158,11,0.2)' : 'rgba(239,68,68,0.2)', color: r.status === 'APPROVED' ? '#10B981' : r.status === 'PENDING' ? '#F59E0B' : '#EF4444' }}>
                        {r.status}
                      </span>
                    </td>
                    <td style={{ padding: '10px 6px', textAlign: 'right' }}>
                      {r.status === 'PENDING' && (
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          <button
                            onClick={() => handleBreakGlassAction(r.id, 'approve')}
                            style={{ padding: '3px 8px', borderRadius: 4, fontSize: '0.72rem', background: '#10B981', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleBreakGlassAction(r.id, 'reject')}
                            style={{ padding: '3px 8px', borderRadius: 4, fontSize: '0.72rem', background: 'rgba(239, 68, 68, 0.2)', color: '#EF4444', border: '1px solid rgba(239, 68, 68, 0.4)', cursor: 'pointer' }}
                          >
                            Reject
                          </button>
                        </div>
                      )}
                      {r.status === 'APPROVED' && (
                        <button
                          onClick={() => handleBreakGlassAction(r.id, 'terminate')}
                          style={{ padding: '3px 8px', borderRadius: 4, fontSize: '0.72rem', background: 'rgba(239, 68, 68, 0.2)', color: '#EF4444', border: '1px solid rgba(239, 68, 68, 0.4)', cursor: 'pointer', fontWeight: 600 }}
                        >
                          Revoke Lease
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Immutable Audit Trail */}
          <div className="workspace-panel glass" style={{ padding: 20, borderRadius: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Platform Audit Trail</h3>
                <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: 'var(--muted, #94a3b8)' }}>
                  Tamper-evident log of SUCCESS, FAILED, and DENIED administrative actions.
                </p>
              </div>

              <select
                value={auditOutcomeFilter}
                onChange={e => setAuditOutcomeFilter(e.target.value)}
                style={{ padding: '6px 12px', borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--foreground)', fontSize: '0.8rem' }}
              >
                <option value="ALL">All Outcomes</option>
                <option value="SUCCESS">Success Only</option>
                <option value="DENIED">Denied / Blocked</option>
                <option value="FAILED">Failed</option>
              </select>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.08)', color: 'var(--muted, #94a3b8)' }}>
                  <th style={{ padding: '8px 6px' }}>Timestamp</th>
                  <th style={{ padding: '8px 6px' }}>Actor</th>
                  <th style={{ padding: '8px 6px' }}>Action</th>
                  <th style={{ padding: '8px 6px' }}>Target</th>
                  <th style={{ padding: '8px 6px' }}>Outcome</th>
                  <th style={{ padding: '8px 6px' }}>Details</th>
                </tr>
              </thead>
              <tbody>
                {filteredAudits.map(ev => (
                  <tr key={ev.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '10px 6px', color: 'var(--muted, #94a3b8)', whiteSpace: 'nowrap' }}>
                      {new Date(ev.created_at).toLocaleTimeString()}
                    </td>
                    <td style={{ padding: '10px 6px', fontWeight: 500 }}>{ev.actor_email}</td>
                    <td style={{ padding: '10px 6px', fontFamily: 'monospace', fontWeight: 600 }}>{ev.action}</td>
                    <td style={{ padding: '10px 6px', color: 'var(--muted, #94a3b8)' }}>{ev.target_type}:{ev.target_id.slice(0, 8)}</td>
                    <td style={{ padding: '10px 6px' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: '0.7rem', fontWeight: 700, background: ev.outcome === 'SUCCESS' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', color: ev.outcome === 'SUCCESS' ? '#10B981' : '#EF4444' }}>
                        {ev.outcome}
                      </span>
                    </td>
                    <td style={{ padding: '10px 6px', color: 'var(--muted, #94a3b8)', fontSize: '0.74rem', maxWidth: 300, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {JSON.stringify(ev.details)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB CONTENT: 7. SETTINGS & DIAGNOSTICS */}
      {activeTab === 'diagnostics' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {/* Feature Flags */}
          <div className="workspace-panel glass" style={{ padding: 20, borderRadius: 12 }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, marginBottom: 4 }}>Global Feature Flags</h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '0.78rem', color: 'var(--muted, #94a3b8)' }}>
              Dynamically activate platform capabilities across organization tiers.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {featureFlags.map(f => (
                <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.86rem' }}>{f.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--muted, #94a3b8)', marginTop: 2 }}>{f.description}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--accent, #BA9731)', marginTop: 4 }}>Tier: {f.target_tier}</div>
                  </div>

                  <button
                    onClick={() => handleToggleFlag(f.key, f.is_enabled)}
                    style={{
                      padding: '5px 12px',
                      borderRadius: 6,
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      background: f.is_enabled ? '#10B981' : 'rgba(255,255,255,0.1)',
                      color: f.is_enabled ? '#fff' : 'var(--muted, #94a3b8)',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    {f.is_enabled ? 'ENABLED' : 'DISABLED'}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Backup Verification & System Health */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="workspace-panel glass" style={{ padding: 20, borderRadius: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Continuous Backup Verification</h3>
                  <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: 'var(--muted, #94a3b8)' }}>
                    Automated PITR restore testing validating RPO &lt; 15m and RTO &lt; 1h SLAs.
                  </p>
                </div>
                <button
                  onClick={handleVerifyBackup}
                  className="secondary-button"
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 6, fontSize: '0.8rem' }}
                >
                  <RefreshCw size={13} /> Verify Now
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 }}>
                <div style={{ padding: 12, borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--muted, #94a3b8)' }}>RPO ACTUAL</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#10B981', marginTop: 2 }}>8 Minutes</div>
                  <small style={{ fontSize: '0.7rem', color: 'var(--muted, #94a3b8)' }}>Target: &lt; 15m (Exceeded)</small>
                </div>
                <div style={{ padding: 12, borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--muted, #94a3b8)' }}>RTO ACTUAL</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#10B981', marginTop: 2 }}>19 Minutes</div>
                  <small style={{ fontSize: '0.7rem', color: 'var(--muted, #94a3b8)' }}>Target: &lt; 60m (Exceeded)</small>
                </div>
              </div>
            </div>

            <div className="workspace-panel glass" style={{ padding: 20, borderRadius: 12 }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, marginBottom: 8 }}>Database & Cache Health</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.82rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <span style={{ color: 'var(--muted, #94a3b8)' }}>PostgreSQL Engine</span>
                  <strong>PostgreSQL 17 Enterprise (SYNC_ACTIVE)</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <span style={{ color: 'var(--muted, #94a3b8)' }}>Redis Cache Cluster</span>
                  <strong>3 Nodes Online (1.4ms latency)</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                  <span style={{ color: 'var(--muted, #94a3b8)' }}>Storage Encryption</span>
                  <strong>AES-256-GCM (Hardware HSM)</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: NEW ORGANIZATION */}
      {showNewOrgModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'grid', placeItems: 'center', zIndex: 9999 }}>
          <form onSubmit={handleCreateOrg} style={{ width: 440, background: 'var(--card, #1e293b)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12, padding: 24, color: 'var(--foreground)' }}>
            <h3 style={{ margin: '0 0 4px 0', fontSize: '1.15rem', fontWeight: 700 }}>Provision New Organization</h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '0.8rem', color: 'var(--muted, #94a3b8)' }}>
              Establishes a top-level enterprise boundary with automated subscription entitlements.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Organization Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Goldman Sachs Global"
                  value={newOrgName}
                  onChange={e => setNewOrgName(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: 'var(--foreground)' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Slug (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. goldman-sachs"
                  value={newOrgSlug}
                  onChange={e => setNewOrgSlug(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: 'var(--foreground)' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Subscription Tier</label>
                <select
                  value={newOrgTier}
                  onChange={e => setNewOrgTier(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: 'var(--foreground)' }}
                >
                  <option value="ENTERPRISE_STARTER">Enterprise Starter (10 Tenants, 25 Workers)</option>
                  <option value="ENTERPRISE_CORE">Enterprise Core (25 Tenants, 50 Workers)</option>
                  <option value="ENTERPRISE_ULTRA">Enterprise Ultra (50 Tenants, 200 Workers)</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Hosting Region</label>
                <select
                  value={newOrgRegion}
                  onChange={e => setNewOrgRegion(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: 'var(--foreground)' }}
                >
                  <option value="us-east-1">US East (N. Virginia)</option>
                  <option value="us-west-2">US West (Oregon)</option>
                  <option value="eu-central-1">Europe (Frankfurt)</option>
                  <option value="ap-southeast-1">Asia Pacific (Singapore)</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Primary Contact Email *</label>
                <input
                  type="email"
                  required
                  placeholder="admin@enterprise.example.com"
                  value={newOrgEmail}
                  onChange={e => setNewOrgEmail(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: 'var(--foreground)' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Organization Logo URL (Optional)</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="url"
                    placeholder="https://example.com/logo.svg"
                    value={newOrgLogoUrl}
                    onChange={e => setNewOrgLogoUrl(e.target.value)}
                    style={{ flex: 1, padding: '8px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: 'var(--foreground)' }}
                  />
                  {newOrgLogoUrl ? (
                    <img
                      src={newOrgLogoUrl}
                      alt="Logo preview"
                      style={{ width: 32, height: 32, objectFit: 'contain', borderRadius: 6, background: 'rgba(255,255,255,0.08)', padding: 2 }}
                    />
                  ) : null}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button type="button" onClick={() => setShowNewOrgModal(false)} className="secondary-button" style={{ padding: '8px 14px', borderRadius: 6 }}>
                Cancel
              </button>
              <button type="submit" className="primary-button" style={{ padding: '8px 16px', borderRadius: 6, fontWeight: 600 }}>
                Create Organization
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: EDIT ORGANIZATION */}
      {editingOrg && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'grid', placeItems: 'center', zIndex: 9999 }}>
          <form onSubmit={handleUpdateOrg} style={{ width: 440, background: 'var(--card, #1e293b)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12, padding: 24, color: 'var(--foreground)' }}>
            <h3 style={{ margin: '0 0 4px 0', fontSize: '1.15rem', fontWeight: 700 }}>Edit Organization</h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '0.8rem', color: 'var(--muted, #94a3b8)' }}>
              Update organization attributes, subscription tier, and custom platform logo.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Organization Name *</label>
                <input
                  type="text"
                  required
                  value={editOrgName}
                  onChange={e => setEditOrgName(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: 'var(--foreground)' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Subscription Tier</label>
                <select
                  value={editOrgTier}
                  onChange={e => setEditOrgTier(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: 'var(--foreground)' }}
                >
                  <option value="ENTERPRISE_STARTER">Enterprise Starter</option>
                  <option value="ENTERPRISE_CORE">Enterprise Core</option>
                  <option value="ENTERPRISE_ULTRA">Enterprise Ultra</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Hosting Region</label>
                <select
                  value={editOrgRegion}
                  onChange={e => setEditOrgRegion(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: 'var(--foreground)' }}
                >
                  <option value="us-east-1">US East (N. Virginia)</option>
                  <option value="us-west-2">US West (Oregon)</option>
                  <option value="eu-central-1">Europe (Frankfurt)</option>
                  <option value="ap-southeast-1">Asia Pacific (Singapore)</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Primary Contact Email *</label>
                <input
                  type="email"
                  required
                  value={editOrgEmail}
                  onChange={e => setEditOrgEmail(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: 'var(--foreground)' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Organization Logo URL</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="url"
                    placeholder="https://example.com/logo.svg"
                    value={editOrgLogoUrl}
                    onChange={e => setEditOrgLogoUrl(e.target.value)}
                    style={{ flex: 1, padding: '8px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: 'var(--foreground)' }}
                  />
                  {editOrgLogoUrl ? (
                    <img
                      src={editOrgLogoUrl}
                      alt="Logo preview"
                      style={{ width: 32, height: 32, objectFit: 'contain', borderRadius: 6, background: 'rgba(255,255,255,0.08)', padding: 2 }}
                    />
                  ) : null}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button type="button" onClick={() => setEditingOrg(null)} className="secondary-button" style={{ padding: '8px 14px', borderRadius: 6 }}>
                Cancel
              </button>
              <button type="submit" className="primary-button" style={{ padding: '8px 16px', borderRadius: 6, fontWeight: 600 }}>
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: PROVISION TENANT */}
      {showNewTenantModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'grid', placeItems: 'center', zIndex: 9999 }}>
          <form onSubmit={handleProvisionTenant} style={{ width: 440, background: 'var(--card, #1e293b)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12, padding: 24, color: 'var(--foreground)' }}>
            <h3 style={{ margin: '0 0 4px 0', fontSize: '1.15rem', fontWeight: 700 }}>Provision Tenant &amp; Canonical Fleet</h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '0.8rem', color: 'var(--muted, #94a3b8)' }}>
              Automatically provisions DEV, TEST, UAT, CANARY, and PROD environments.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Target Organization *</label>
                <select
                  required
                  value={newTenantOrgId}
                  onChange={e => setNewTenantOrgId(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: 'var(--foreground)' }}
                >
                  <option value="">Select Organization...</option>
                  {orgs.filter(o => o.status === 'ENABLED').map(o => (
                    <option key={o.id} value={o.id}>{o.name} ({o.tier})</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Tenant Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Payments Gateway"
                  value={newTenantName}
                  onChange={e => setNewTenantName(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: 'var(--foreground)' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Tenant Slug (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. payments-gateway"
                  value={newTenantSlug}
                  onChange={e => setNewTenantSlug(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: 'var(--foreground)' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button type="button" onClick={() => setShowNewTenantModal(false)} className="secondary-button" style={{ padding: '8px 14px', borderRadius: 6 }}>
                Cancel
              </button>
              <button type="submit" disabled={!newTenantOrgId} className="primary-button" style={{ padding: '8px 16px', borderRadius: 6, fontWeight: 600 }}>
                Provision Fleet
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: BREAK GLASS REQUEST */}
      {showBreakGlassModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'grid', placeItems: 'center', zIndex: 9999 }}>
          <form onSubmit={handleRequestBreakGlass} style={{ width: 440, background: 'var(--card, #1e293b)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 12, padding: 24, color: 'var(--foreground)' }}>
            <h3 style={{ margin: '0 0 4px 0', fontSize: '1.15rem', fontWeight: 700, color: '#EF4444', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Flame size={18} /> Request Emergency Break-Glass Lease
            </h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '0.8rem', color: 'var(--muted, #94a3b8)' }}>
              Dual-custody approval is strictly mandated. Every access action is logged into the immutable audit trail.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Target Organization *</label>
                <select
                  required
                  value={bgOrgId}
                  onChange={e => setBgOrgId(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: 'var(--foreground)' }}
                >
                  <option value="">Select Organization...</option>
                  {orgs.map(o => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Requester SRE Email *</label>
                <input
                  type="email"
                  required
                  placeholder="sre-oncall@architectiq.io"
                  value={bgEmail}
                  onChange={e => setBgEmail(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: 'var(--foreground)' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Incident Ticket &amp; Justification *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Sev-1 Incident #INC-94821: Triage database latency spike and memory exhaustion"
                  value={bgReason}
                  onChange={e => setBgReason(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: 'var(--foreground)', resize: 'none' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Requested Lease Duration</label>
                <select
                  value={bgHours}
                  onChange={e => setBgHours(Number(e.target.value))}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: 'var(--foreground)' }}
                >
                  <option value={1}>1 Hour</option>
                  <option value={2}>2 Hours</option>
                  <option value={4}>4 Hours (Standard)</option>
                  <option value={8}>8 Hours (Extended Incident)</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button type="button" onClick={() => setShowBreakGlassModal(false)} className="secondary-button" style={{ padding: '8px 14px', borderRadius: 6 }}>
                Cancel
              </button>
              <button type="submit" disabled={!bgOrgId || !bgReason} style={{ padding: '8px 16px', borderRadius: 6, background: '#EF4444', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer' }}>
                Submit Emergency Request
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
