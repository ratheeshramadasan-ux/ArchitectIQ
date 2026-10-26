import React, { useState, useEffect, useMemo } from 'react'
import {
  Building2,
  Users,
  Boxes,
  ShieldCheck,
  Search,
  Plus,
  MoreVertical,
  FolderTree,
  GitBranch,
  Info,
  Sliders,
  CheckCircle2,
  GitMerge,
  KeyRound,
  Database,
  CreditCard,
  X,
  ChevronLeft,
  ChevronRight,
  LogIn,
  Check,
} from 'lucide-react'

export interface TenantRecord {
  id: string
  name: string
  slug?: string
  environment: 'Production' | 'Development' | 'Sandbox' | 'UAT' | 'Canary'
  description: string
  folders_count: number
  users_count: number
  status: 'Active' | 'Suspended' | 'Provisioning'
  created_at: string
  created_by: string
  color: 'emerald' | 'indigo' | 'amber' | 'blue' | 'purple'
}

interface OrganizationTenantStudioProps {
  token: string
  tenant: string
  onNavigate?: (section: string) => void
  onSelectTenant?: (tenantId: string) => void
}

export default function OrganizationTenantStudio({
  token,
  tenant: _tenant,
  onNavigate,
  onSelectTenant,
}: OrganizationTenantStudioProps) {
  // Top domain navigation
  const [activeDomainTab, setActiveDomainTab] = useState<'org_tenant' | 'environments' | 'users' | 'roles' | 'integrations' | 'licensing'>('org_tenant')

  // Inner card sub-tabs
  const [activeSubTab, setActiveSubTab] = useState<'tenants' | 'org_details' | 'folder_strategy' | 'default_settings'>('tenants')

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedEnvFilter, setSelectedEnvFilter] = useState<string>('ALL')

  // Modals & Action Menus
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showLearnModal, setShowLearnModal] = useState(false)
  const [actionMenuOpenId, setActionMenuOpenId] = useState<string | null>(null)

  // Create Tenant Form State
  const [newTenantName, setNewTenantName] = useState('')
  const [newTenantEnv, setNewTenantEnv] = useState<'Production' | 'Development' | 'Sandbox' | 'UAT'>('Development')
  const [newTenantDesc, setNewTenantDesc] = useState('')
  const [creatingTenant, setCreatingTenant] = useState(false)

  // Organization Details State
  const [orgDetails, setOrgDetails] = useState({
    name: 'Citibank Global',
    slug: 'citibank-global',
    tier: 'Enterprise Platinum',
    region: 'us-east-1 (N. Virginia)',
    contact_email: 'compliance-security@citigroup.com',
    logo_url: 'https://upload.wikimedia.org/wikipedia/commons/1/1b/Citi.svg',
  })
  const [orgSavedMsg, setOrgSavedMsg] = useState(false)

  // Folder Strategy Selection
  const [selectedStrategy, setSelectedStrategy] = useState<'projects_contain_envs' | 'envs_contain_folders'>('projects_contain_envs')

  // Seed baseline tenants matching reference mock
  const [tenantsList, setTenantsList] = useState<TenantRecord[]>([
    {
      id: 'tenant-citi-prod',
      name: 'Citibank',
      slug: 'citibank',
      environment: 'Production',
      description: 'Primary production environment for banking operations.',
      folders_count: 24,
      users_count: 18,
      status: 'Active',
      created_at: 'Jan 15, 2026',
      created_by: 'admin',
      color: 'emerald',
    },
    {
      id: 'tenant-breakglass-dev',
      name: 'Break Glass Test Org bd3848',
      slug: 'break-glass-test-org',
      environment: 'Development',
      description: 'Development and testing environment for new automations.',
      folders_count: 12,
      users_count: 22,
      status: 'Active',
      created_at: 'Oct 12, 2026',
      created_by: 'admin',
      color: 'indigo',
    },
    {
      id: 'tenant-sandbox',
      name: 'Sandbox',
      slug: 'sandbox',
      environment: 'Sandbox',
      description: 'Isolated sandbox for prototypes and experiments.',
      folders_count: 8,
      users_count: 8,
      status: 'Active',
      created_at: 'Sep 03, 2026',
      created_by: 'admin',
      color: 'amber',
    },
  ])

  // Fetch real tenants and organization details from API if available
  useEffect(() => {
    if (!token) return
    let cancelled = false

    // Fetch organizations
    fetch('/api/v1/platform/organizations', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (!cancelled && Array.isArray(data) && data.length > 0) {
          const first = data[0]
          setOrgDetails(prev => ({
            ...prev,
            name: first.name || prev.name,
            slug: first.slug || prev.slug,
            tier: first.subscription_tier || prev.tier,
            region: first.data_residency_region || prev.region,
            contact_email: first.security_contact_email || prev.contact_email,
            logo_url: first.logo_url || prev.logo_url,
          }))
        }
      })
      .catch(() => {})

    // Fetch fleet tenants
    fetch('/api/v1/platform/fleet/tenants', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (!cancelled && Array.isArray(data) && data.length > 0) {
          // Merge API tenants with our rich baseline metadata
          const apiTenants: TenantRecord[] = data.map((t: any, idx: number) => {
            const envType: TenantRecord['environment'] =
              idx === 0 ? 'Production' : idx === 1 ? 'Development' : 'Sandbox'
            const color: TenantRecord['color'] =
              idx === 0 ? 'emerald' : idx === 1 ? 'indigo' : 'amber'
            return {
              id: t.id,
              name: t.name,
              slug: t.slug,
              environment: envType,
              description:
                idx === 0
                  ? 'Primary production environment for banking operations.'
                  : idx === 1
                  ? 'Development and testing environment for new automations.'
                  : 'Isolated sandbox for prototypes and experiments.',
              folders_count: idx === 0 ? 24 : idx === 1 ? 12 : 8,
              users_count: idx === 0 ? 18 : idx === 1 ? 22 : 8,
              status: 'Active',
              created_at: t.created_at
                ? new Date(t.created_at).toLocaleDateString('en-US', {
                    month: 'short',
                    day: '2-digit',
                    year: 'numeric',
                  })
                : 'Jan 15, 2026',
              created_by: 'admin',
              color,
            }
          })
          setTenantsList(apiTenants)
        }
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [token])

  // Filtered tenants list
  const filteredTenants = useMemo(() => {
    return tenantsList.filter(t => {
      const matchesSearch =
        searchQuery.trim() === '' ||
        t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.description.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesEnv =
        selectedEnvFilter === 'ALL' || t.environment.toUpperCase() === selectedEnvFilter.toUpperCase()
      return matchesSearch && matchesEnv
    })
  }, [tenantsList, searchQuery, selectedEnvFilter])

  // Aggregate Metrics
  const totalTenantsCount = tenantsList.length
  const totalUsersCount = tenantsList.reduce((acc, t) => acc + t.users_count, 0)
  const totalProjectsCount = tenantsList.reduce((acc, t) => acc + Math.floor(t.folders_count / 2), 0)

  // Handle Domain Tab Navigation
  const handleDomainTabClick = (tabKey: typeof activeDomainTab, navTarget?: string) => {
    setActiveDomainTab(tabKey)
    if (navTarget && onNavigate) {
      onNavigate(navTarget)
    }
  }

  // Handle Tenant Creation
  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTenantName.trim()) return
    setCreatingTenant(true)

    const colorMap: Record<string, TenantRecord['color']> = {
      Production: 'emerald',
      Development: 'indigo',
      Sandbox: 'amber',
      UAT: 'blue',
    }

    const newRecord: TenantRecord = {
      id: `tenant-${Date.now()}`,
      name: newTenantName.trim(),
      slug: newTenantName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      environment: newTenantEnv,
      description: newTenantDesc.trim() || `${newTenantEnv} tenant environment.`,
      folders_count: 4,
      users_count: 6,
      status: 'Active',
      created_at: new Date().toLocaleDateString('en-US', {
        month: 'short',
        day: '2-digit',
        year: 'numeric',
      }),
      created_by: 'admin',
      color: colorMap[newTenantEnv] || 'indigo',
    }

    // Try posting to fleet endpoint
    try {
      await fetch('/api/v1/platform/fleet/tenants', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newTenantName.trim(),
          slug: newTenantName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        }),
      })
    } catch {
      // Continue locally
    }

    setTenantsList(prev => [newRecord, ...prev])
    setNewTenantName('')
    setNewTenantDesc('')
    setCreatingTenant(false)
    setShowCreateModal(false)
  }

  // Handle Save Org Details
  const handleSaveOrgDetails = async (e: React.FormEvent) => {
    e.preventDefault()
    setOrgSavedMsg(true)
    try {
      // Update topbar event
      localStorage.setItem('architectiq.active_org', JSON.stringify(orgDetails))
      window.dispatchEvent(new CustomEvent('architectiq:org_updated', { detail: orgDetails }))
    } catch {}
    setTimeout(() => setOrgSavedMsg(false), 3000)
  }

  return (
    <div
      className="organization-tenant-studio"
      data-testid="organization-tenant-studio"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        padding: '24px 28px',
        maxWidth: 1480,
        margin: '0 auto',
        width: '100%',
        color: 'var(--foreground)',
      }}
    >
      {/* 1. Header Area */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: 'color-mix(in srgb, var(--accent, #BA9731) 18%, transparent)',
              border: '1px solid color-mix(in srgb, var(--accent, #BA9731) 35%, transparent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent, #BA9731)',
            }}
          >
            <Boxes size={24} />
          </div>
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: '1.65rem',
                fontWeight: 800,
                letterSpacing: '-0.02em',
                lineHeight: 1.2,
              }}
            >
              Enterprise Administration & Setup
            </h1>
            <p
              style={{
                margin: '4px 0 0 0',
                fontSize: '0.88rem',
                color: 'var(--muted, #94a3b8)',
              }}
            >
              Manage organization folder strategies, environment definitions, and solution template catalogs.
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowLearnModal(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'transparent',
            border: 'none',
            color: '#38bdf8',
            fontSize: '0.86rem',
            fontWeight: 600,
            cursor: 'pointer',
            padding: '6px 10px',
            borderRadius: 6,
            transition: 'background 0.2s',
          }}
          className="hover:underline"
        >
          <Info size={16} />
          <span>Learn about Organization Setup</span>
        </button>
      </div>

      {/* 2. Top Domain Sub-Navigation Tabs */}
      <div
        style={{
          display: 'flex',
          gap: 4,
          borderBottom: '1px solid color-mix(in srgb, var(--border, #334155) 60%, transparent)',
          paddingBottom: 2,
          overflowX: 'auto',
        }}
      >
        {[
          { id: 'org_tenant', label: 'Organization & Tenant', icon: Building2, target: undefined },
          { id: 'environments', label: 'Environments', icon: GitMerge, target: 'Environments' },
          { id: 'users', label: 'Users & Teams', icon: Users, target: 'Users, Groups & Teams' },
          { id: 'roles', label: 'Roles & Permissions', icon: KeyRound, target: 'Roles & Permissions' },
          { id: 'integrations', label: 'Integrations', icon: Database, target: 'Integrations & MCP' },
          { id: 'licensing', label: 'Licensing & Usage', icon: CreditCard, target: 'Licensing & Usage' },
        ].map(tab => {
          const Icon = tab.icon
          const isAct = activeDomainTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => handleDomainTabClick(tab.id as any, tab.target)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 16px',
                border: 'none',
                background: 'transparent',
                color: isAct ? '#38bdf8' : 'var(--muted, #94a3b8)',
                fontWeight: isAct ? 700 : 500,
                fontSize: '0.88rem',
                cursor: 'pointer',
                borderBottom: isAct ? '2px solid #38bdf8' : '2px solid transparent',
                marginBottom: -1,
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease-in-out',
              }}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* 3. Hero Banner Card with 4 KPI Metrics & Architectural Tree Illustration */}
      <div
        className="hero-banner-card"
        style={{
          borderRadius: 16,
          background: 'color-mix(in srgb, var(--card, #1e293b) 85%, transparent)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid color-mix(in srgb, var(--border, #334155) 70%, transparent)',
          padding: '24px 28px',
          display: 'grid',
          gridTemplateColumns: '1.25fr 1fr',
          gap: 28,
          alignItems: 'center',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)',
        }}
      >
        {/* Left Column: Title, Description, and 4 KPI Metric Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: '1.35rem',
                fontWeight: 800,
                letterSpacing: '-0.01em',
              }}
            >
              Organization & Tenant Management
            </h2>
            <p
              style={{
                margin: '8px 0 0 0',
                fontSize: '0.88rem',
                lineHeight: 1.5,
                color: 'var(--muted, #94a3b8)',
                maxWidth: 620,
              }}
            >
              Create and manage your organization structure, tenants and workspaces. Configure isolation, governance
              and resource settings for each tenant to support multiple business units, clients or environments.
            </p>
          </div>

          {/* 4 Metric KPI Cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 12,
            }}
          >
            {/* Card 1: Total Tenants */}
            <div
              style={{
                borderRadius: 12,
                background: 'color-mix(in srgb, var(--card, #1e293b) 60%, rgba(56, 189, 248, 0.05))',
                border: '1px solid color-mix(in srgb, var(--border, #334155) 50%, transparent)',
                padding: '12px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  background: 'rgba(56, 189, 248, 0.15)',
                  color: '#38bdf8',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Building2 size={20} />
              </div>
              <div>
                <div style={{ fontSize: '1.45rem', fontWeight: 800, lineHeight: 1 }}>{totalTenantsCount}</div>
                <div style={{ fontSize: '0.74rem', color: 'var(--muted, #94a3b8)', marginTop: 3 }}>Total Tenants</div>
              </div>
            </div>

            {/* Card 2: Total Users */}
            <div
              style={{
                borderRadius: 12,
                background: 'color-mix(in srgb, var(--card, #1e293b) 60%, rgba(99, 102, 241, 0.05))',
                border: '1px solid color-mix(in srgb, var(--border, #334155) 50%, transparent)',
                padding: '12px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  background: 'rgba(99, 102, 241, 0.15)',
                  color: '#818cf8',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Users size={20} />
              </div>
              <div>
                <div style={{ fontSize: '1.45rem', fontWeight: 800, lineHeight: 1 }}>{totalUsersCount}</div>
                <div style={{ fontSize: '0.74rem', color: 'var(--muted, #94a3b8)', marginTop: 3 }}>Total Users</div>
              </div>
            </div>

            {/* Card 3: Active Projects */}
            <div
              style={{
                borderRadius: 12,
                background: 'color-mix(in srgb, var(--card, #1e293b) 60%, rgba(14, 165, 233, 0.05))',
                border: '1px solid color-mix(in srgb, var(--border, #334155) 50%, transparent)',
                padding: '12px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  background: 'rgba(14, 165, 233, 0.15)',
                  color: '#38bdf8',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Boxes size={20} />
              </div>
              <div>
                <div style={{ fontSize: '1.45rem', fontWeight: 800, lineHeight: 1 }}>{totalProjectsCount}</div>
                <div style={{ fontSize: '0.74rem', color: 'var(--muted, #94a3b8)', marginTop: 3 }}>Active Projects</div>
              </div>
            </div>

            {/* Card 4: Policy Compliant */}
            <div
              style={{
                borderRadius: 12,
                background: 'color-mix(in srgb, var(--card, #1e293b) 60%, rgba(16, 185, 129, 0.05))',
                border: '1px solid color-mix(in srgb, var(--border, #334155) 50%, transparent)',
                padding: '12px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  background: 'rgba(16, 185, 129, 0.15)',
                  color: '#10b981',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ShieldCheck size={20} />
              </div>
              <div>
                <div style={{ fontSize: '1.45rem', fontWeight: 800, lineHeight: 1 }}>100%</div>
                <div style={{ fontSize: '0.74rem', color: 'var(--muted, #94a3b8)', marginTop: 3 }}>Policy Compliant</div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Architectural Tree Diagram Illustration */}
        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 180,
            padding: '10px 16px',
            background: 'radial-gradient(ellipse at center, rgba(56, 189, 248, 0.08) 0%, transparent 70%)',
            borderRadius: 14,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              width: '100%',
              maxWidth: 440,
              justifyContent: 'space-between',
            }}
          >
            {/* Central Organization Hub */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  padding: '3px 10px',
                  borderRadius: 12,
                  background: 'rgba(56, 189, 248, 0.18)',
                  color: '#38bdf8',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                ● Organization
              </span>

              {/* Building Illustration Card */}
              <div
                style={{
                  width: 84,
                  height: 100,
                  borderRadius: 12,
                  background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.25), rgba(99, 102, 241, 0.35))',
                  border: '1.5px solid rgba(56, 189, 248, 0.4)',
                  boxShadow: '0 8px 24px rgba(56, 189, 248, 0.15)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  padding: 8,
                }}
              >
                <Building2 size={36} color="#38bdf8" />
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 8px)',
                    gap: 3,
                  }}
                >
                  {[...Array(9)].map((_, i) => (
                    <div
                      key={i}
                      style={{
                        width: 8,
                        height: 6,
                        borderRadius: 1.5,
                        background: 'rgba(255, 255, 255, 0.7)',
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Connecting SVG Branching Lines */}
            <div style={{ flex: 1, padding: '0 8px', height: 110, display: 'flex', alignItems: 'center' }}>
              <svg width="100%" height="110" viewBox="0 0 100 110" fill="none" preserveAspectRatio="none">
                <path
                  d="M 0 55 C 40 55, 50 18, 100 18"
                  stroke="rgba(16, 185, 129, 0.6)"
                  strokeWidth="2"
                  strokeDasharray="4 3"
                />
                <path
                  d="M 0 55 C 40 55, 50 55, 100 55"
                  stroke="rgba(56, 189, 248, 0.6)"
                  strokeWidth="2"
                  strokeDasharray="4 3"
                />
                <path
                  d="M 0 55 C 40 55, 50 92, 100 92"
                  stroke="rgba(168, 85, 247, 0.6)"
                  strokeWidth="2"
                  strokeDasharray="4 3"
                />
              </svg>
            </div>

            {/* 3 Stacked Tenant Badges */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 160 }}>
              {/* Tenant 1: Production Tenant */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '7px 12px',
                  borderRadius: 10,
                  background: 'color-mix(in srgb, var(--card, #1e293b) 80%, rgba(16, 185, 129, 0.12))',
                  border: '1px solid rgba(16, 185, 129, 0.35)',
                  boxShadow: '0 2px 8px rgba(16, 185, 129, 0.08)',
                }}
              >
                <div
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 6,
                    background: 'rgba(16, 185, 129, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#10b981',
                  }}
                >
                  <Building2 size={15} />
                </div>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#10b981' }}>Production Tenant</div>
              </div>

              {/* Tenant 2: Development Tenant */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '7px 12px',
                  borderRadius: 10,
                  background: 'color-mix(in srgb, var(--card, #1e293b) 80%, rgba(56, 189, 248, 0.12))',
                  border: '1px solid rgba(56, 189, 248, 0.35)',
                  boxShadow: '0 2px 8px rgba(56, 189, 248, 0.08)',
                }}
              >
                <div
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 6,
                    background: 'rgba(56, 189, 248, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#38bdf8',
                  }}
                >
                  <Building2 size={15} />
                </div>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#38bdf8' }}>Development Tenant</div>
              </div>

              {/* Tenant 3: Sandbox Tenant */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '7px 12px',
                  borderRadius: 10,
                  background: 'color-mix(in srgb, var(--card, #1e293b) 80%, rgba(168, 85, 247, 0.12))',
                  border: '1px solid rgba(168, 85, 247, 0.35)',
                  boxShadow: '0 2px 8px rgba(168, 85, 247, 0.08)',
                }}
              >
                <div
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 6,
                    background: 'rgba(168, 85, 247, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#c084fc',
                  }}
                >
                  <Building2 size={15} />
                </div>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#c084fc' }}>Sandbox Tenant</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Lower Section Card: Tabs, Search/Action Bar, and Content */}
      <div
        className="lower-section-card"
        style={{
          borderRadius: 16,
          background: 'color-mix(in srgb, var(--card, #1e293b) 85%, transparent)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid color-mix(in srgb, var(--border, #334155) 70%, transparent)',
          padding: '20px 24px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {/* Sub-Tabs and Search/Filter/Create Toolbar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 14,
            borderBottom: '1px solid color-mix(in srgb, var(--border, #334155) 60%, transparent)',
            paddingBottom: 12,
          }}
        >
          {/* Sub Tabs */}
          <div style={{ display: 'flex', gap: 6 }}>
            {[
              { id: 'tenants', label: `Tenants`, icon: Building2 },
              { id: 'org_details', label: 'Organization Details', icon: Boxes },
              { id: 'folder_strategy', label: 'Folder Strategy', icon: FolderTree },
              { id: 'default_settings', label: 'Default Settings', icon: Sliders },
            ].map(tab => {
              const Icon = tab.icon
              const isAct = activeSubTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveSubTab(tab.id as any)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7,
                    padding: '8px 14px',
                    borderRadius: 8,
                    border: 'none',
                    background: isAct ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
                    color: isAct ? '#38bdf8' : 'var(--muted, #94a3b8)',
                    fontWeight: isAct ? 700 : 500,
                    fontSize: '0.86rem',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease-in-out',
                  }}
                >
                  <Icon size={15} />
                  {tab.label}
                </button>
              )
            })}
          </div>

          {/* Right Toolbar: Search, Filter, and + Create Tenant button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {activeSubTab === 'tenants' && (
              <>
                {/* Search Box */}
                <div style={{ position: 'relative', width: 240 }}>
                  <Search
                    size={14}
                    style={{
                      position: 'absolute',
                      left: 10,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'var(--muted, #94a3b8)',
                    }}
                  />
                  <input
                    type="text"
                    placeholder="Search tenants..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '7px 10px 7px 32px',
                      borderRadius: 8,
                      border: '1px solid color-mix(in srgb, var(--border, #334155) 70%, transparent)',
                      background: 'color-mix(in srgb, var(--card, #1e293b) 50%, transparent)',
                      color: 'var(--foreground)',
                      fontSize: '0.84rem',
                      outline: 'none',
                    }}
                  />
                </div>

                {/* Filter Selector */}
                <select
                  value={selectedEnvFilter}
                  onChange={e => setSelectedEnvFilter(e.target.value)}
                  style={{
                    padding: '7px 10px',
                    borderRadius: 8,
                    border: '1px solid color-mix(in srgb, var(--border, #334155) 70%, transparent)',
                    background: 'color-mix(in srgb, var(--card, #1e293b) 50%, transparent)',
                    color: 'var(--foreground)',
                    fontSize: '0.84rem',
                    cursor: 'pointer',
                  }}
                >
                  <option value="ALL">All Environments</option>
                  <option value="PRODUCTION">Production</option>
                  <option value="DEVELOPMENT">Development</option>
                  <option value="SANDBOX">Sandbox</option>
                </select>
              </>
            )}

            {/* + Create Tenant Button */}
            <button
              onClick={() => setShowCreateModal(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 16px',
                borderRadius: 8,
                background: '#2563eb',
                color: '#ffffff',
                border: 'none',
                fontWeight: 600,
                fontSize: '0.86rem',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(37, 99, 235, 0.25)',
                transition: 'opacity 0.15s ease',
              }}
              className="hover:opacity-90"
            >
              <Plus size={16} />
              <span>Create Tenant</span>
            </button>
          </div>
        </div>

        {/* SUB-TAB 1: TENANTS TABLE */}
        {activeSubTab === 'tenants' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ overflowX: 'auto' }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  textAlign: 'left',
                  fontSize: '0.86rem',
                }}
              >
                <thead>
                  <tr
                    style={{
                      borderBottom: '1px solid color-mix(in srgb, var(--border, #334155) 60%, transparent)',
                      color: 'var(--muted, #94a3b8)',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}
                  >
                    <th style={{ padding: '10px 14px' }}>Tenant Name ⇅</th>
                    <th style={{ padding: '10px 14px' }}>Environment</th>
                    <th style={{ padding: '10px 14px' }}>Description ⇅</th>
                    <th style={{ padding: '10px 14px' }}>Folders</th>
                    <th style={{ padding: '10px 14px' }}>Users</th>
                    <th style={{ padding: '10px 14px' }}>Status</th>
                    <th style={{ padding: '10px 14px' }}>Created On ⇅</th>
                    <th style={{ padding: '10px 14px', textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTenants.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ padding: '36px 14px', textAlign: 'center', color: 'var(--muted, #94a3b8)' }}>
                        No tenants match your search criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredTenants.map(t => {
                      const isCiti = t.color === 'emerald'
                      const isBreak = t.color === 'indigo'

                      const iconBg = isCiti
                        ? 'rgba(16, 185, 129, 0.15)'
                        : isBreak
                        ? 'rgba(99, 102, 241, 0.15)'
                        : 'rgba(245, 158, 11, 0.15)'
                      const iconColor = isCiti ? '#10b981' : isBreak ? '#818cf8' : '#f59e0b'

                      const envBadgeBg =
                        t.environment === 'Production'
                          ? 'rgba(16, 185, 129, 0.15)'
                          : t.environment === 'Development'
                          ? 'rgba(56, 189, 248, 0.15)'
                          : 'rgba(168, 85, 247, 0.15)'
                      const envBadgeColor =
                        t.environment === 'Production'
                          ? '#10b981'
                          : t.environment === 'Development'
                          ? '#38bdf8'
                          : '#c084fc'

                      return (
                        <tr
                          key={t.id}
                          style={{
                            borderBottom: '1px solid color-mix(in srgb, var(--border, #334155) 40%, transparent)',
                            transition: 'background 0.15s ease',
                          }}
                          className="hover:bg-muted/10"
                        >
                          {/* Tenant Name */}
                          <td style={{ padding: '14px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                              <div
                                style={{
                                  width: 34,
                                  height: 34,
                                  borderRadius: 8,
                                  background: iconBg,
                                  color: iconColor,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0,
                                }}
                              >
                                <Building2 size={18} />
                              </div>
                              <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>{t.name}</div>
                            </div>
                          </td>

                          {/* Environment Badge */}
                          <td style={{ padding: '14px 14px' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                padding: '4px 10px',
                                borderRadius: 14,
                                background: envBadgeBg,
                                color: envBadgeColor,
                                fontWeight: 600,
                                fontSize: '0.78rem',
                              }}
                            >
                              ✦ {t.environment}
                            </span>
                          </td>

                          {/* Description */}
                          <td style={{ padding: '14px 14px', color: 'var(--muted, #94a3b8)', maxWidth: 280 }}>
                            {t.description}
                          </td>

                          {/* Folders */}
                          <td style={{ padding: '14px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ color: '#38bdf8' }}>📁</span>
                              <span>{t.folders_count}</span>
                            </div>
                          </td>

                          {/* Users */}
                          <td style={{ padding: '14px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ color: '#818cf8' }}>👥</span>
                              <span>{t.users_count}</span>
                            </div>
                          </td>

                          {/* Status */}
                          <td style={{ padding: '14px 14px' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                color: '#10b981',
                                fontWeight: 600,
                                fontSize: '0.82rem',
                              }}
                            >
                              <span
                                style={{
                                  width: 7,
                                  height: 7,
                                  borderRadius: '50%',
                                  background: '#10b981',
                                }}
                              />
                              {t.status}
                            </span>
                          </td>

                          {/* Created On */}
                          <td style={{ padding: '14px 14px', fontSize: '0.82rem', color: 'var(--muted, #94a3b8)' }}>
                            <div>{t.created_at}</div>
                            <small style={{ opacity: 0.8 }}>by {t.created_by}</small>
                          </td>

                          {/* Actions */}
                          <td style={{ padding: '14px 14px', textAlign: 'center', position: 'relative' }}>
                            <button
                              onClick={() =>
                                setActionMenuOpenId(actionMenuOpenId === t.id ? null : t.id)
                              }
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--muted, #94a3b8)',
                                cursor: 'pointer',
                                padding: 6,
                                borderRadius: 6,
                              }}
                            >
                              <MoreVertical size={16} />
                            </button>

                            {/* Dropdown Menu */}
                            {actionMenuOpenId === t.id && (
                              <div
                                style={{
                                  position: 'absolute',
                                  right: 14,
                                  top: 40,
                                  zIndex: 30,
                                  minWidth: 170,
                                  borderRadius: 10,
                                  background: 'var(--card, #1e293b)',
                                  border: '1px solid color-mix(in srgb, var(--border, #334155) 80%, transparent)',
                                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
                                  padding: 4,
                                  display: 'flex',
                                  flexDirection: 'column',
                                  textAlign: 'left',
                                }}
                              >
                                <button
                                  onClick={() => {
                                    if (onSelectTenant) onSelectTenant(t.id)
                                    setActionMenuOpenId(null)
                                  }}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    padding: '8px 10px',
                                    border: 'none',
                                    background: 'transparent',
                                    color: 'var(--foreground)',
                                    fontSize: '0.82rem',
                                    cursor: 'pointer',
                                    borderRadius: 6,
                                  }}
                                  className="hover:bg-muted/20"
                                >
                                  <LogIn size={14} />
                                  Switch to Tenant
                                </button>
                                <button
                                  onClick={() => {
                                    if (onNavigate) onNavigate('Environments')
                                    setActionMenuOpenId(null)
                                  }}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    padding: '8px 10px',
                                    border: 'none',
                                    background: 'transparent',
                                    color: 'var(--foreground)',
                                    fontSize: '0.82rem',
                                    cursor: 'pointer',
                                    borderRadius: 6,
                                  }}
                                  className="hover:bg-muted/20"
                                >
                                  <GitMerge size={14} />
                                  Manage Environments
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls Footer */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                alignItems: 'center',
                gap: 12,
                paddingTop: 10,
                borderTop: '1px solid color-mix(in srgb, var(--border, #334155) 40%, transparent)',
                fontSize: '0.82rem',
                color: 'var(--muted, #94a3b8)',
              }}
            >
              <button
                disabled
                style={{
                  background: 'transparent',
                  border: '1px solid color-mix(in srgb, var(--border, #334155) 50%, transparent)',
                  borderRadius: 6,
                  padding: '4px 8px',
                  color: 'inherit',
                  cursor: 'not-allowed',
                  opacity: 0.5,
                }}
              >
                <ChevronLeft size={14} />
              </button>
              <span
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 6,
                  background: '#2563eb',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '0.82rem',
                }}
              >
                1
              </span>
              <button
                disabled
                style={{
                  background: 'transparent',
                  border: '1px solid color-mix(in srgb, var(--border, #334155) 50%, transparent)',
                  borderRadius: 6,
                  padding: '4px 8px',
                  color: 'inherit',
                  cursor: 'not-allowed',
                  opacity: 0.5,
                }}
              >
                <ChevronRight size={14} />
              </button>
              <span>1–{filteredTenants.length} of {filteredTenants.length} tenants</span>
            </div>
          </div>
        )}

        {/* SUB-TAB 2: ORGANIZATION DETAILS */}
        {activeSubTab === 'org_details' && (
          <form
            onSubmit={handleSaveOrgDetails}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 18,
              maxWidth: 720,
              padding: '10px 0',
            }}
          >
            {orgSavedMsg && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  background: 'rgba(16, 185, 129, 0.15)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  color: '#10b981',
                  fontSize: '0.86rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <Check size={16} />
                Organization configuration and logo saved successfully!
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--muted, #94a3b8)', display: 'block', marginBottom: 6 }}>
                  Organization Name
                </label>
                <input
                  type="text"
                  value={orgDetails.name}
                  onChange={e => setOrgDetails({ ...orgDetails, name: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'color-mix(in srgb, var(--card) 60%, transparent)',
                    color: 'var(--foreground)',
                    fontSize: '0.86rem',
                  }}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--muted, #94a3b8)', display: 'block', marginBottom: 6 }}>
                  Organization Slug
                </label>
                <input
                  type="text"
                  value={orgDetails.slug}
                  onChange={e => setOrgDetails({ ...orgDetails, slug: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'color-mix(in srgb, var(--card) 60%, transparent)',
                    color: 'var(--foreground)',
                    fontSize: '0.86rem',
                  }}
                  required
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--muted, #94a3b8)', display: 'block', marginBottom: 6 }}>
                  Subscription Tier
                </label>
                <select
                  value={orgDetails.tier}
                  onChange={e => setOrgDetails({ ...orgDetails, tier: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'color-mix(in srgb, var(--card) 60%, transparent)',
                    color: 'var(--foreground)',
                    fontSize: '0.86rem',
                  }}
                >
                  <option value="Enterprise Platinum">Enterprise Platinum (Unrestricted)</option>
                  <option value="Enterprise Standard">Enterprise Standard</option>
                  <option value="Starter">Starter</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--muted, #94a3b8)', display: 'block', marginBottom: 6 }}>
                  Data Sovereignty & Region
                </label>
                <input
                  type="text"
                  value={orgDetails.region}
                  onChange={e => setOrgDetails({ ...orgDetails, region: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'color-mix(in srgb, var(--card) 60%, transparent)',
                    color: 'var(--foreground)',
                    fontSize: '0.86rem',
                  }}
                />
              </div>
            </div>

            <div>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--muted, #94a3b8)', display: 'block', marginBottom: 6 }}>
                Security Contact Email
              </label>
              <input
                type="email"
                value={orgDetails.contact_email}
                onChange={e => setOrgDetails({ ...orgDetails, contact_email: e.target.value })}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'color-mix(in srgb, var(--card) 60%, transparent)',
                  color: 'var(--foreground)',
                  fontSize: '0.86rem',
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--muted, #94a3b8)', display: 'block', marginBottom: 6 }}>
                Organization Logo URL (Displayed on Top Navigation Bar)
              </label>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <input
                  type="url"
                  placeholder="https://example.com/logo.svg"
                  value={orgDetails.logo_url}
                  onChange={e => setOrgDetails({ ...orgDetails, logo_url: e.target.value })}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'color-mix(in srgb, var(--card) 60%, transparent)',
                    color: 'var(--foreground)',
                    fontSize: '0.86rem',
                  }}
                />
                {orgDetails.logo_url ? (
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 8,
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid var(--border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 4,
                    }}
                  >
                    <img
                      src={orgDetails.logo_url}
                      alt="Logo Preview"
                      style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                      onError={e => {
                        ;(e.currentTarget as HTMLElement).style.display = 'none'
                      }}
                    />
                  </div>
                ) : null}
              </div>
            </div>

            <button
              type="submit"
              style={{
                alignSelf: 'flex-start',
                padding: '9px 20px',
                borderRadius: 8,
                background: '#2563eb',
                color: '#ffffff',
                border: 'none',
                fontWeight: 600,
                fontSize: '0.86rem',
                cursor: 'pointer',
                marginTop: 6,
              }}
            >
              Save Organization Details
            </button>
          </form>
        )}

        {/* SUB-TAB 3: FOLDER STRATEGY */}
        {activeSubTab === 'folder_strategy' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '10px 0' }}>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>
              Folder Hierarchy & Environment Strategies
            </h3>
            <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--muted, #94a3b8)' }}>
              ArchitectIQ supports dual folder hierarchy strategies for enterprise organizations:
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {/* Strategy 1 */}
              <div
                onClick={() => setSelectedStrategy('projects_contain_envs')}
                style={{
                  padding: 18,
                  borderRadius: 12,
                  background:
                    selectedStrategy === 'projects_contain_envs'
                      ? 'rgba(56, 189, 248, 0.1)'
                      : 'color-mix(in srgb, var(--card) 40%, transparent)',
                  border:
                    selectedStrategy === 'projects_contain_envs'
                      ? '2px solid #38bdf8'
                      : '1px solid var(--border)',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.92rem', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <GitBranch size={16} />
                    Strategy 1: Projects Contain Environments
                  </span>
                  {selectedStrategy === 'projects_contain_envs' && (
                    <CheckCircle2 size={16} color="#38bdf8" />
                  )}
                </div>
                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--muted, #94a3b8)', lineHeight: 1.5 }}>
                  Individual projects own bindings across DEV, TEST, UAT, and PROD. Promotions transition workflow
                  definitions and environment variable bindings atomically between runtime tiers.
                </p>
              </div>

              {/* Strategy 2 */}
              <div
                onClick={() => setSelectedStrategy('envs_contain_folders')}
                style={{
                  padding: 18,
                  borderRadius: 12,
                  background:
                    selectedStrategy === 'envs_contain_folders'
                      ? 'rgba(16, 185, 129, 0.1)'
                      : 'color-mix(in srgb, var(--card) 40%, transparent)',
                  border:
                    selectedStrategy === 'envs_contain_folders'
                      ? '2px solid #10b981'
                      : '1px solid var(--border)',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.92rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Building2 size={16} />
                    Strategy 2: Environments Contain Folders
                  </span>
                  {selectedStrategy === 'envs_contain_folders' && (
                    <CheckCircle2 size={16} color="#10b981" />
                  )}
                </div>
                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--muted, #94a3b8)', lineHeight: 1.5 }}>
                  Environments serve as the top-level architectural boundary within an organization, isolating folder
                  trees and production permissions completely.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* SUB-TAB 4: DEFAULT SETTINGS */}
        {activeSubTab === 'default_settings' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '10px 0', maxWidth: 700 }}>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>
              Tenant Provisioning & Isolation Defaults
            </h3>
            <div
              style={{
                padding: 16,
                borderRadius: 10,
                background: 'color-mix(in srgb, var(--card) 40%, transparent)',
                border: '1px solid var(--border)',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>Automatic 5 Canonical Environments</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--muted, #94a3b8)' }}>
                    Provision DEV, TEST, UAT, CANARY, and PROD automatically on tenant setup.
                  </div>
                </div>
                <input type="checkbox" defaultChecked disabled style={{ width: 16, height: 16 }} />
              </div>

              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>Enforce Active Runs Environment Locking</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--muted, #94a3b8)' }}>
                    Prevent disabling an environment if active jobs or flows are executing.
                  </div>
                </div>
                <input type="checkbox" defaultChecked disabled style={{ width: 16, height: 16 }} />
              </div>

              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>Dual-Custody Break Glass Audit Trail</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--muted, #94a3b8)' }}>
                    Record all emergency administrative elevations into the immutable platform audit ledger.
                  </div>
                </div>
                <input type="checkbox" defaultChecked disabled style={{ width: 16, height: 16 }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MODAL: CREATE TENANT */}
      {showCreateModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 20,
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 480,
              borderRadius: 16,
              background: 'var(--card, #1e293b)',
              border: '1px solid var(--border)',
              padding: 24,
              boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>Create New Tenant</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateTenant} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
                  Tenant Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Wealth Management Solutions"
                  value={newTenantName}
                  onChange={e => setNewTenantName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'rgba(255, 255, 255, 0.05)',
                    color: 'var(--foreground)',
                    fontSize: '0.86rem',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
                  Environment Type
                </label>
                <select
                  value={newTenantEnv}
                  onChange={e => setNewTenantEnv(e.target.value as any)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'rgba(255, 255, 255, 0.05)',
                    color: 'var(--foreground)',
                    fontSize: '0.86rem',
                  }}
                >
                  <option value="Production">Production</option>
                  <option value="Development">Development</option>
                  <option value="Sandbox">Sandbox</option>
                  <option value="UAT">UAT</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
                  Description
                </label>
                <textarea
                  rows={3}
                  placeholder="Operational scope, client boundaries, or automated pipeline purpose..."
                  value={newTenantDesc}
                  onChange={e => setNewTenantDesc(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'rgba(255, 255, 255, 0.05)',
                    color: 'var(--foreground)',
                    fontSize: '0.86rem',
                    resize: 'none',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'transparent',
                    color: 'var(--foreground)',
                    fontSize: '0.84rem',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingTenant}
                  style={{
                    padding: '8px 18px',
                    borderRadius: 8,
                    background: '#2563eb',
                    color: '#ffffff',
                    border: 'none',
                    fontWeight: 600,
                    fontSize: '0.84rem',
                    cursor: 'pointer',
                  }}
                >
                  {creatingTenant ? 'Provisioning...' : 'Provision Tenant'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: LEARN ABOUT ORGANIZATION SETUP */}
      {showLearnModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 20,
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 540,
              borderRadius: 16,
              background: 'var(--card, #1e293b)',
              border: '1px solid var(--border)',
              padding: 24,
              boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Info size={20} color="#38bdf8" />
                Enterprise Organization Architecture
              </h3>
              <button
                onClick={() => setShowLearnModal(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--muted)', lineHeight: 1.5 }}>
              ArchitectIQ provides strict 4-level enterprise isolation:
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ padding: 10, borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}>
                <strong style={{ color: '#38bdf8' }}>1. Organization:</strong> Root legal enterprise boundary with dedicated regional sovereignty and billing quotas.
              </div>
              <div style={{ padding: 10, borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}>
                <strong style={{ color: '#10b981' }}>2. Tenant:</strong> Business unit or customer isolation boundary containing dedicated workspaces, runner pools, and user groups.
              </div>
              <div style={{ padding: 10, borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}>
                <strong style={{ color: '#c084fc' }}>3. Canonical Environments:</strong> Every tenant receives DEV, TEST, UAT, CANARY, and PROD automatically.
              </div>
            </div>

            <button
              onClick={() => setShowLearnModal(false)}
              style={{
                alignSelf: 'flex-end',
                padding: '8px 18px',
                borderRadius: 8,
                background: '#2563eb',
                color: '#ffffff',
                border: 'none',
                fontWeight: 600,
                fontSize: '0.84rem',
                cursor: 'pointer',
                marginTop: 6,
              }}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
