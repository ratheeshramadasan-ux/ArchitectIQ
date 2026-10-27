import React, { useState, useEffect } from 'react'
import {
  Shield,
  Monitor,
  Lock,
  Download,
  Plus,
  X,
  Sliders,
  Database,
  FileText,
  Key,
  Users,
  Eye,
  Check
} from 'lucide-react'

export interface ProcessCaptureAdminProps {
  token: string
  tenant?: { id: string; name: string } | null
}

interface OverviewMetrics {
  tenant_id: string
  fleet_health: {
    total_agents: number
    online_agents: number
    offline_agents: number
  }
  capture_metrics: {
    total_sessions: number
    active_sessions: number
    total_steps_captured: number
  }
  governance_metrics: {
    active_policy_rules: number
    mandatory_platform_rules: number
  }
  timestamp: string
}

interface ApplicationCatalogItem {
  id: string
  tenant_id?: string | null
  name: string
  executable_name: string
  publisher_signature?: string | null
  classification: string
  policy_action: string
  created_at: string
}

interface AgentItem {
  id: string
  agent_hostname: string
  os_version: string
  agent_version: string
  status: 'ONLINE' | 'OFFLINE'
  last_heartbeat_at: string
}

export const ProcessCaptureAdmin: React.FC<ProcessCaptureAdminProps> = ({ token, tenant }) => {
  const activeTenantId = tenant?.id || '242c817b-d701-4583-8e29-c22c99b381e6'
  const [activeTab, setActiveTab] = useState<
    'OVERVIEW' | 'CATALOG' | 'POLICIES' | 'AGENTS' | 'PROFILES' | 'PRIVACY' | 'RETENTION' | 'GOVERNANCE' | 'AUDIT'
  >('OVERVIEW')

  const [metrics, setMetrics] = useState<OverviewMetrics | null>(null)
  const [apps, setApps] = useState<ApplicationCatalogItem[]>([])
  const [agents, setAgents] = useState<AgentItem[]>([])
  const [, setLoading] = useState<boolean>(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Modals
  const [showAddAppModal, setShowAddAppModal] = useState<boolean>(false)
  const [showEnrollModal, setShowEnrollModal] = useState<boolean>(false)

  // Add App Form State
  const [newAppName, setNewAppName] = useState<string>('')
  const [newAppExe, setNewAppExe] = useState<string>('')
  const [newAppPublisher, setNewAppPublisher] = useState<string>('')
  const [newAppPolicy, setNewAppPolicy] = useState<'ALLOW' | 'CONDITIONAL' | 'DENY'>('ALLOW')

  // Enroll Device State
  const [deviceUserCode, setDeviceUserCode] = useState<string>('')

  // Fetch Overview Metrics
  const fetchOverview = async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/v1/capture/admin/overview?tenant_id=${activeTenantId}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        setMetrics(await res.json())
      }
    } catch (err) {
      console.error('Failed to load capture overview:', err)
    } finally {
      setLoading(false)
    }
  }

  // Fetch Application Catalog
  const fetchApps = async () => {
    try {
      const res = await fetch(`/api/v1/capture/admin/applications?tenant_id=${activeTenantId}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        setApps(await res.json())
      }
    } catch (err) {
      console.error('Failed to load application catalog:', err)
    }
  }

  // Fetch Registered Agents
  const fetchAgents = async () => {
    try {
      const res = await fetch(`/api/v1/capture/agents?tenant_id=${activeTenantId}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        setAgents(await res.json())
      }
    } catch (err) {
      console.error('Failed to load agents:', err)
    }
  }

  useEffect(() => {
    fetchOverview()
    fetchApps()
    fetchAgents()
  }, [activeTenantId, token])

  // Handle Add App
  const handleAddApp = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const res = await fetch('/api/v1/capture/admin/applications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          tenant_id: activeTenantId,
          name: newAppName,
          executable_name: newAppExe.toLowerCase(),
          publisher_signature: newAppPublisher || null,
          policy_action: newAppPolicy,
          classification: newAppPolicy === 'DENY' ? 'PROHIBITED' : 'STANDARD'
        })
      })

      if (res.ok) {
        const added = await res.json()
        setApps(prev => [...prev, added])
        setShowAddAppModal(false)
        setNewAppName('')
        setNewAppExe('')
        setNewAppPublisher('')
        setFeedback({ type: 'success', text: `Application '${added.name}' registered with policy ${added.policy_action}.` })
      } else {
        const err = await res.json()
        setFeedback({ type: 'error', text: err.detail || 'Failed to register application.' })
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message })
    }
  }

  // Handle Device Enrollment Authorization
  const handleAuthorizeDevice = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const res = await fetch('/api/v1/capture/agents/enroll/authorize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          user_code: deviceUserCode,
          tenant_id: activeTenantId
        })
      })

      if (res.ok) {
        const authData = await res.json()
        setShowEnrollModal(false)
        setDeviceUserCode('')
        setFeedback({
          type: 'success',
          text: `Device '${authData.agent_hostname}' authorized for tenant successfully.`
        })
        fetchAgents()
        fetchOverview()
      } else {
        const err = await res.json()
        setFeedback({ type: 'error', text: err.detail || 'Authorization failed. Verify user code.' })
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message })
    }
  }

  const tabs = [
    { id: 'OVERVIEW', label: 'Overview', icon: Monitor },
    { id: 'CATALOG', label: 'Application Catalog', icon: Database },
    { id: 'POLICIES', label: 'Capture Policies', icon: Shield },
    { id: 'AGENTS', label: 'Agent Management', icon: Users },
    { id: 'PROFILES', label: 'Capture Profiles', icon: Sliders },
    { id: 'PRIVACY', label: 'Privacy & Redaction', icon: Lock },
    { id: 'RETENTION', label: 'Evidence & Retention', icon: FileText },
    { id: 'GOVERNANCE', label: 'Process Governance', icon: Key },
    { id: 'AUDIT', label: 'Audit & Monitoring', icon: Eye }
  ] as const

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        background: 'var(--background)',
        color: 'var(--foreground)',
        overflow: 'hidden'
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 20px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--card)',
          flexShrink: 0
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 8,
              background: 'color-mix(in srgb, var(--accent, #BA9731) 15%, transparent)',
              border: '1px solid var(--accent, #BA9731)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Shield size={18} color="var(--accent, #BA9731)" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0 }}>
                Process Capture Administration
              </h2>
              <span
                style={{
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  padding: '1px 6px',
                  borderRadius: 4,
                  background: 'color-mix(in srgb, var(--accent, #BA9731) 20%, transparent)',
                  color: 'var(--accent, #BA9731)',
                  border: '1px solid var(--accent, #BA9731)'
                }}
              >
                PCA-01 CONTROL PLANE
              </span>
            </div>
            <p style={{ fontSize: '0.74rem', color: 'var(--muted-foreground)', margin: 0 }}>
              Tenant Fleet Governance, Application Catalog, Policy Inheritance &amp; Device Enrollment
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => setShowEnrollModal(true)}
            className="secondary-button"
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', fontSize: '0.76rem' }}
          >
            <Key size={13} color="var(--accent, #BA9731)" />
            <span>Authorize Device Code</span>
          </button>
          <a
            href="/downloads/ArchitectIQ-CaptureAgent-Setup.msi"
            download
            className="primary-button"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 14px',
              fontSize: '0.76rem',
              fontWeight: 700,
              textDecoration: 'none'
            }}
          >
            <Download size={14} />
            <span>Download Agent (MSI)</span>
          </a>
        </div>
      </div>

      {/* Feedback banner */}
      {feedback && (
        <div
          style={{
            padding: '8px 16px',
            background:
              feedback.type === 'success'
                ? 'color-mix(in srgb, #10b981 15%, transparent)'
                : 'color-mix(in srgb, #ef4444 15%, transparent)',
            borderBottom: `1px solid ${feedback.type === 'success' ? '#10b981' : '#ef4444'}`,
            color: feedback.type === 'success' ? '#10b981' : '#ef4444',
            fontSize: '0.78rem',
            fontWeight: 600,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <span>{feedback.text}</span>
          <button onClick={() => setFeedback(null)} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer' }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* 9 Administration Tabs */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--border)',
          background: 'color-mix(in srgb, var(--card) 60%, transparent)',
          padding: '0 16px',
          gap: 2,
          overflowX: 'auto',
          flexShrink: 0
        }}
      >
        {tabs.map(t => {
          const Icon = t.icon
          const isActive = activeTab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as any)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '10px 14px',
                fontSize: '0.76rem',
                fontWeight: 700,
                border: 'none',
                borderBottom: isActive ? '2px solid var(--accent, #BA9731)' : '2px solid transparent',
                background: 'transparent',
                color: isActive ? 'var(--accent, #BA9731)' : 'var(--muted-foreground)',
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              <Icon size={14} />
              <span>{t.label}</span>
            </button>
          )
        })}
      </div>

      {/* Tab Content Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        {/* 1. OVERVIEW TAB */}
        {activeTab === 'OVERVIEW' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1100 }}>
            {/* KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
              <div className="glass-card" style={{ padding: 14, borderRadius: 8, background: 'var(--card)', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--muted-foreground)', fontWeight: 600 }}>ONLINE AGENTS</span>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: 4, color: '#10b981' }}>
                  {metrics?.fleet_health.online_agents || 0}
                  <small style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', marginLeft: 6 }}>
                    / {metrics?.fleet_health.total_agents || 0} Total
                  </small>
                </div>
              </div>

              <div className="glass-card" style={{ padding: 14, borderRadius: 8, background: 'var(--card)', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--muted-foreground)', fontWeight: 600 }}>ACTIVE RECORDINGS</span>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: 4, color: '#ef4444' }}>
                  {metrics?.capture_metrics.active_sessions || 0}
                  <small style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', marginLeft: 6 }}>
                    / {metrics?.capture_metrics.total_sessions || 0} Sessions
                  </small>
                </div>
              </div>

              <div className="glass-card" style={{ padding: 14, borderRadius: 8, background: 'var(--card)', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--muted-foreground)', fontWeight: 600 }}>TOTAL PROCESS STEPS</span>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: 4, color: 'var(--foreground)' }}>
                  {metrics?.capture_metrics.total_steps_captured || 0}
                </div>
              </div>

              <div className="glass-card" style={{ padding: 14, borderRadius: 8, background: 'var(--card)', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--muted-foreground)', fontWeight: 600 }}>POLICY GUARDRAILS</span>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: 4, color: 'var(--accent, #BA9731)' }}>
                  {metrics?.governance_metrics.active_policy_rules || 4}
                  <small style={{ fontSize: '0.75rem', color: '#10b981', marginLeft: 6 }}>Mandatory</small>
                </div>
              </div>
            </div>

            {/* Platform Baseline Notice */}
            <div
              style={{
                padding: '12px 16px',
                background: 'color-mix(in srgb, var(--accent, #BA9731) 10%, transparent)',
                border: '1px solid var(--accent, #BA9731)',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 12
              }}
            >
              <Shield size={20} color="var(--accent, #BA9731)" />
              <div>
                <strong style={{ fontSize: '0.82rem', color: 'var(--foreground)' }}>
                  Four-Tier Policy Invariant Active:
                </strong>
                <p style={{ margin: '2px 0 0', fontSize: '0.74rem', color: 'var(--muted-foreground)' }}>
                  Effective Policy = Platform ∩ Tenant ∩ Process Capture ∩ Session. Platform prohibitions (Bitwarden, 1Password, KeePass) and mandatory PII masking (PAN cards, SSN, passwords) cannot be relaxed by tenant administrators.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 2. APPLICATION CATALOG TAB */}
        {activeTab === 'CATALOG' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 1100 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800 }}>Approved &amp; Prohibited Applications</h3>
                <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--muted-foreground)' }}>
                  Govern executable scope across all captured endpoints.
                </p>
              </div>
              <button
                onClick={() => setShowAddAppModal(true)}
                className="primary-button"
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', fontSize: '0.76rem' }}
              >
                <Plus size={14} />
                <span>Add Application</span>
              </button>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--muted-foreground)' }}>
                  <th style={{ padding: '8px 10px' }}>Application Name</th>
                  <th style={{ padding: '8px 10px' }}>Executable</th>
                  <th style={{ padding: '8px 10px' }}>Publisher Signature</th>
                  <th style={{ padding: '8px 10px' }}>Classification</th>
                  <th style={{ padding: '8px 10px' }}>Policy Action</th>
                </tr>
              </thead>
              <tbody>
                {apps.map(a => (
                  <tr key={a.id} style={{ borderBottom: '1px solid color-mix(in srgb, var(--border) 50%, transparent)' }}>
                    <td style={{ padding: '8px 10px', fontWeight: 700 }}>{a.name}</td>
                    <td style={{ padding: '8px 10px', fontFamily: 'monospace' }}>{a.executable_name}</td>
                    <td style={{ padding: '8px 10px', color: 'var(--muted-foreground)' }}>{a.publisher_signature || 'Standard OS / Generic'}</td>
                    <td style={{ padding: '8px 10px' }}>{a.classification}</td>
                    <td style={{ padding: '8px 10px' }}>
                      <span
                        style={{
                          fontSize: '0.68rem',
                          fontWeight: 800,
                          padding: '2px 8px',
                          borderRadius: 4,
                          background:
                            a.policy_action === 'ALLOW'
                              ? 'rgba(16, 185, 129, 0.2)'
                              : a.policy_action === 'CONDITIONAL'
                              ? 'rgba(245, 158, 11, 0.2)'
                              : 'rgba(239, 68, 68, 0.2)',
                          color:
                            a.policy_action === 'ALLOW'
                              ? '#10b981'
                              : a.policy_action === 'CONDITIONAL'
                              ? '#f59e0b'
                              : '#ef4444'
                        }}
                      >
                        {a.policy_action}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 3. CAPTURE POLICIES TAB */}
        {activeTab === 'POLICIES' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 1000 }}>
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800 }}>Multi-Tier Governance &amp; Policy Rules</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { name: 'PCI-DSS PAN Payment Card Redaction', type: 'LUHN_CARD', tier: 'PLATFORM (Mandatory)', scope: 'Metadata & Video Frames' },
                { name: 'US Social Security Number (SSN)', type: 'US_SSN', tier: 'PLATFORM (Mandatory)', scope: 'OCR & Structured Fields' },
                { name: 'Canadian Social Insurance Number (SIN)', type: 'CA_SIN', tier: 'PLATFORM (Mandatory)', scope: 'OCR & Structured Fields' },
                { name: 'UI Password Suppression', type: 'UI_PASSWORD', tier: 'PLATFORM (Mandatory)', scope: 'Keystrokes & Accessibility' },
                { name: 'Bearer & OAuth Authorization Tokens', type: 'REGEX', tier: 'PLATFORM (Mandatory)', scope: 'HTTP & DOM Attributes' }
              ].map((p, idx) => (
                <div
                  key={idx}
                  className="glass-card"
                  style={{
                    padding: 12,
                    borderRadius: 6,
                    background: 'var(--card)',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Lock size={15} color="#10b981" />
                    <div>
                      <strong style={{ fontSize: '0.8rem' }}>{p.name}</strong>
                      <span style={{ fontSize: '0.72rem', color: 'var(--muted-foreground)', marginLeft: 8 }}>
                        Pattern: <code>{p.type}</code> · Scope: {p.scope}
                      </span>
                    </div>
                  </div>
                  <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#10b981', background: 'rgba(16, 185, 129, 0.15)', padding: '2px 8px', borderRadius: 4 }}>
                    {p.tier}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 4. AGENTS TAB */}
        {activeTab === 'AGENTS' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 1100 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800 }}>Enrolled Capture Agent Fleet</h3>
                <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--muted-foreground)' }}>
                  Endpoints registered to this tenant via RFC 8628 Device Authorization Grant.
                </p>
              </div>
              <button
                onClick={() => setShowEnrollModal(true)}
                className="primary-button"
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', fontSize: '0.76rem' }}
              >
                <Plus size={14} />
                <span>Pair New Device</span>
              </button>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--muted-foreground)' }}>
                  <th style={{ padding: '8px 10px' }}>Hostname</th>
                  <th style={{ padding: '8px 10px' }}>Operating System</th>
                  <th style={{ padding: '8px 10px' }}>Agent Version</th>
                  <th style={{ padding: '8px 10px' }}>Status</th>
                  <th style={{ padding: '8px 10px' }}>Last Heartbeat</th>
                </tr>
              </thead>
              <tbody>
                {agents.map(ag => (
                  <tr key={ag.id} style={{ borderBottom: '1px solid color-mix(in srgb, var(--border) 50%, transparent)' }}>
                    <td style={{ padding: '8px 10px', fontWeight: 700 }}>{ag.agent_hostname}</td>
                    <td style={{ padding: '8px 10px' }}>{ag.os_version}</td>
                    <td style={{ padding: '8px 10px' }}>v{ag.agent_version}</td>
                    <td style={{ padding: '8px 10px' }}>
                      <span
                        style={{
                          fontSize: '0.68rem',
                          fontWeight: 800,
                          padding: '2px 8px',
                          borderRadius: 4,
                          background: ag.status === 'ONLINE' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                          color: ag.status === 'ONLINE' ? '#10b981' : '#f59e0b'
                        }}
                      >
                        {ag.status}
                      </span>
                    </td>
                    <td style={{ padding: '8px 10px', color: 'var(--muted-foreground)' }}>
                      {new Date(ag.last_heartbeat_at).toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 5. PROFILES TAB */}
        {activeTab === 'PROFILES' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 900 }}>
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800 }}>Recording Profiles</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {[
                { name: 'Balanced Interactive', fps: '1.0 Hz', res: '1080p', dom: true, uia: true, isDefault: true },
                { name: 'High-Precision Audit', fps: '5.0 Hz', res: '1440p', dom: true, uia: true, isDefault: false },
                { name: 'Low-Bandwidth Lean', fps: '0.5 Hz', res: '720p', dom: false, uia: true, isDefault: false }
              ].map((prof, i) => (
                <div key={i} className="glass-card" style={{ padding: 14, borderRadius: 8, background: 'var(--card)', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <strong style={{ fontSize: '0.82rem' }}>{prof.name}</strong>
                    {prof.isDefault && <span style={{ fontSize: '0.66rem', fontWeight: 800, color: '#10b981' }}>DEFAULT</span>}
                  </div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--accent, #BA9731)', fontWeight: 700, marginBottom: 8 }}>
                    {prof.fps} · {prof.res}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--muted-foreground)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span>UI Automation: {prof.uia ? 'Enabled' : 'Disabled'}</span>
                    <span>DOM Tree Inspection: {prof.dom ? 'Enabled' : 'Disabled'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 6. PRIVACY & REDACTION TAB */}
        {activeTab === 'PRIVACY' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 850 }}>
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800 }}>Privacy Engine &amp; Sensitive Field Exclusions</h3>
            <p style={{ margin: 0, fontSize: '0.74rem', color: 'var(--muted-foreground)' }}>
              Sensitive patterns are redacted on the endpoint before screenshots or events leave the local machine.
            </p>
            <div style={{ padding: 14, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: '0.76rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#10b981', marginBottom: 8 }}>
                <Check size={14} />
                <strong>Endpoint Keystroke Redaction:</strong> Password inputs (<code>is_password=true</code>) are never recorded.
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#10b981', marginBottom: 8 }}>
                <Check size={14} />
                <strong>Local Luhn Verification:</strong> Credit and debit card numbers are redacted to <code>[REDACTED_CARD_NUMBER]</code>.
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#10b981' }}>
                <Check size={14} />
                <strong>Solid-Black Frame Overlay:</strong> Prohibited applications immediately blank capture frames.
              </div>
            </div>
          </div>
        )}

        {/* 7. RETENTION TAB */}
        {activeTab === 'RETENTION' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 800 }}>
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800 }}>Evidence Storage &amp; Retention Boundaries</h3>
            <div style={{ padding: 14, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: '0.76rem', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div><strong>Retention Ceiling:</strong> 90 Days (Mandated by Platform Policy)</div>
              <div><strong>Quarantine Policy:</strong> Raw unprocessed video frames quarantined until reviewer sign-off.</div>
              <div><strong>Legal Hold:</strong> Disabled</div>
            </div>
          </div>
        )}

        {/* 8. GOVERNANCE TAB */}
        {activeTab === 'GOVERNANCE' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 800 }}>
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800 }}>Process Governance &amp; Publishing Rights</h3>
            <div style={{ padding: 14, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: '0.76rem', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div><strong>Operator Consent Mandate:</strong> Enforced on all sessions before transition to RECORDING.</div>
              <div><strong>Reviewer Approval Required:</strong> Yes, prior to Flow Studio graph synthesis.</div>
            </div>
          </div>
        )}

        {/* 9. AUDIT TAB */}
        {activeTab === 'AUDIT' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 900 }}>
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800 }}>Administrative Audit Trail</h3>
            <p style={{ margin: 0, fontSize: '0.74rem', color: 'var(--muted-foreground)' }}>
              Immutable audit log of agent pairing, policy overrides, and session transitions.
            </p>
            <div style={{ padding: 12, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: '0.74rem' }}>
              <div style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <code>[AUDIT]</code> CAPTURE_AGENT_ENROLLED — Endpoint paired via RFC 8628 user code.
              </div>
              <div style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <code>[AUDIT]</code> CAPTURE_POLICY_EVALUATED — Platform baseline verified; 0 policy conflicts.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MODAL: ADD APPLICATION TO CATALOG */}
      {showAddAppModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="glass-card" style={{ width: 460, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 18, color: 'var(--foreground)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 800 }}>Add Catalog Application</h3>
              <button onClick={() => setShowAddAppModal(false)} style={{ background: 'transparent', border: 'none', color: 'var(--muted-foreground)', cursor: 'pointer' }}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleAddApp}>
              <div style={{ marginBottom: 10 }}>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, marginBottom: 3 }}>Application Display Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. In-House Treasury Workstation"
                  value={newAppName}
                  onChange={e => setNewAppName(e.target.value)}
                  style={{ width: '100%', padding: '6px 8px', background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 5, color: 'var(--foreground)', fontSize: '0.78rem' }}
                />
              </div>

              <div style={{ marginBottom: 10 }}>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, marginBottom: 3 }}>Executable Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. treasury_app.exe"
                  value={newAppExe}
                  onChange={e => setNewAppExe(e.target.value)}
                  style={{ width: '100%', padding: '6px 8px', background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 5, color: 'var(--foreground)', fontSize: '0.78rem' }}
                />
              </div>

              <div style={{ marginBottom: 10 }}>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, marginBottom: 3 }}>Publisher Signature (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Acme Corp Internal CA"
                  value={newAppPublisher}
                  onChange={e => setNewAppPublisher(e.target.value)}
                  style={{ width: '100%', padding: '6px 8px', background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 5, color: 'var(--foreground)', fontSize: '0.78rem' }}
                />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, marginBottom: 3 }}>Policy Action</label>
                <select
                  value={newAppPolicy}
                  onChange={e => setNewAppPolicy(e.target.value as any)}
                  style={{ width: '100%', padding: '6px 8px', background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 5, color: 'var(--foreground)', fontSize: '0.78rem' }}
                >
                  <option value="ALLOW">ALLOW (Capture Permitted)</option>
                  <option value="CONDITIONAL">CONDITIONAL (Require Approval)</option>
                  <option value="DENY">DENY (Prohibited / Blanked)</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" onClick={() => setShowAddAppModal(false)} className="secondary-button" style={{ padding: '5px 12px', fontSize: '0.76rem' }}>
                  Cancel
                </button>
                <button type="submit" className="primary-button" style={{ padding: '5px 16px', fontSize: '0.76rem' }}>
                  Save Application
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: AUTHORIZE DEVICE ENROLLMENT */}
      {showEnrollModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="glass-card" style={{ width: 440, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 18, color: 'var(--foreground)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Key size={16} color="var(--accent, #BA9731)" />
                <h3 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 800 }}>Authorize Capture Device</h3>
              </div>
              <button onClick={() => setShowEnrollModal(false)} style={{ background: 'transparent', border: 'none', color: 'var(--muted-foreground)', cursor: 'pointer' }}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleAuthorizeDevice}>
              <p style={{ margin: '0 0 10px', fontSize: '0.72rem', color: 'var(--muted-foreground)' }}>
                Enter the 8-character user activation code displayed in the desktop agent console or installation banner:
              </p>

              <div style={{ marginBottom: 14 }}>
                <input
                  type="text"
                  required
                  placeholder="e.g. ABCD-EFGH"
                  value={deviceUserCode}
                  onChange={e => setDeviceUserCode(e.target.value.toUpperCase())}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    background: 'var(--background)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    color: 'var(--foreground)',
                    fontSize: '1rem',
                    textAlign: 'center',
                    fontFamily: 'monospace',
                    letterSpacing: '0.15em',
                    fontWeight: 800
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" onClick={() => setShowEnrollModal(false)} className="secondary-button" style={{ padding: '5px 12px', fontSize: '0.76rem' }}>
                  Cancel
                </button>
                <button type="submit" className="primary-button" style={{ padding: '5px 16px', fontSize: '0.76rem' }}>
                  Authorize Device
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default ProcessCaptureAdmin
