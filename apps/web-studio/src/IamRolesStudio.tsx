import { useState, useMemo } from 'react'
import {
  Shield,
  Layers,
  Users,
  AlertTriangle,
  Plus,
  Search,
  Edit,
  Trash2,
  Copy,
  Check,
  X,
  ShieldCheck,
  Code,
  Play
} from 'lucide-react'
import './IamRolesStudio.css'

export type IamTab = 'roles' | 'builder' | 'matrix' | 'sod'

export interface PermissionItem {
  id: string
  resource: string
  action: string
  displayName: string
  category: 'AI Agents' | 'Workflows' | 'MCP Servers' | 'Infrastructure & Compute' | 'Bots & Runners' | 'Vector Storage' | 'Governance & Compliance'
  description: string
}

export interface RoleItem {
  id: string
  name: string
  code: string
  description: string
  scope: 'Platform' | 'Customer' | 'Tenant'
  isSystem: boolean
  isCustom: boolean
  color: string
  icon: string
  userCount: number
  permissions: Record<string, 'ALLOW' | 'DENY'>
}

export interface SodRuleItem {
  id: string
  roleA: string
  roleB: string
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM'
  description: string
  enforcement: 'STRICT_BLOCK' | 'REQUIRE_DUAL_APPROVAL'
  active: boolean
}

const GRANULAR_PERMISSIONS: PermissionItem[] = [
  // 1. AI Agents
  { id: 'agent:create', resource: 'agent', action: 'create', displayName: 'Create AI Agent', category: 'AI Agents', description: 'Author new autonomous agents and custom system prompts' },
  { id: 'agent:edit', resource: 'agent', action: 'edit', displayName: 'Configure Model & Prompts', category: 'AI Agents', description: 'Modify model selection, temperature, and agent tool bindings' },
  { id: 'agent:publish', resource: 'agent', action: 'publish', displayName: 'Publish to Catalog', category: 'AI Agents', description: 'Promote agent definition to shared tenant service catalog' },
  { id: 'agent:execute', resource: 'agent', action: 'execute', displayName: 'Execute Agent Runs', category: 'AI Agents', description: 'Trigger real-time or scheduled execution of agent workloads' },
  { id: 'agent:debug', resource: 'agent', action: 'debug', displayName: 'Inspect Agent Reasoning', category: 'AI Agents', description: 'View full scratchpads, tool invocation logs, and internal CoT' },
  { id: 'agent:assign_compute', resource: 'agent', action: 'assign_compute', displayName: 'Assign Pod / Worker Pools', category: 'AI Agents', description: 'Bind agent workloads to specific Kubernetes pods or runner nodes' },

  // 2. Workflows
  { id: 'workflow:design', resource: 'workflow', action: 'design', displayName: 'Visual Flow Canvas Design', category: 'Workflows', description: 'Construct and edit step-by-step DAG workflows' },
  { id: 'workflow:test', resource: 'workflow', action: 'test', displayName: 'Execute Sandbox Dry-Runs', category: 'Workflows', description: 'Test flows with mock payloads and step-by-step breakpoints' },
  { id: 'workflow:deploy', resource: 'workflow', action: 'deploy', displayName: 'Deploy Workflow Package', category: 'Workflows', description: 'Package workflow revisions into immutable deployable units' },
  { id: 'workflow:run', resource: 'workflow', action: 'run', displayName: 'Trigger Production Flow', category: 'Workflows', description: 'Dispatch production workflow executions and handle queues' },
  { id: 'workflow:approve', resource: 'workflow', action: 'approve', displayName: 'Approve Production Promotion', category: 'Workflows', description: 'Authorize deployment from Development/UAT into Production' },

  // 3. MCP Servers (Model Context Protocol)
  { id: 'mcp:register_server', resource: 'mcp', action: 'register_server', displayName: 'Register MCP Server', category: 'MCP Servers', description: 'Connect external Model Context Protocol daemon servers' },
  { id: 'mcp:enable_tools', resource: 'mcp', action: 'enable_tools', displayName: 'Expose MCP Tools to Agents', category: 'MCP Servers', description: 'Authorize agents to call external tool definitions via MCP' },
  { id: 'mcp:inspect_prompts', resource: 'mcp', action: 'inspect_prompts', displayName: 'Audit MCP Context Prompts', category: 'MCP Servers', description: 'Inspect context strings injected dynamically into LLMs' },
  { id: 'mcp:manage_resources', resource: 'mcp', action: 'manage_resources', displayName: 'Access MCP File/Data Resources', category: 'MCP Servers', description: 'Query file systems and database schemas exposed via MCP' },
  { id: 'mcp:revoke_server', resource: 'mcp', action: 'revoke_server', displayName: 'Revoke MCP Daemon Access', category: 'MCP Servers', description: 'Instantly terminate connection to rogue or compromised MCP servers' },

  // 4. Infrastructure & Compute
  { id: 'compute:view_pods', resource: 'compute', action: 'view_pods', displayName: 'View K8s Pod Telemetry', category: 'Infrastructure & Compute', description: 'Read live CPU, RAM, and health metrics for worker pods' },
  { id: 'compute:autoscale', resource: 'compute', action: 'autoscale', displayName: 'Configure Autoscaling Rules', category: 'Infrastructure & Compute', description: 'Modify min/max replica limits and concurrency thresholds' },
  { id: 'compute:restart_pod', resource: 'compute', action: 'restart_pod', displayName: 'Restart Stalled Pods', category: 'Infrastructure & Compute', description: 'Perform container restarts and pod eviction operations' },
  { id: 'compute:assign_gpu', resource: 'compute', action: 'assign_gpu', displayName: 'Allocate GPU Hardware', category: 'Infrastructure & Compute', description: 'Attach NVIDIA T4/A10G GPU nodes to AI inference pipelines' },
  { id: 'compute:manage_vm_pools', resource: 'compute', action: 'manage_vm_pools', displayName: 'Manage Dedicated VM Pools', category: 'Infrastructure & Compute', description: 'Commission and assign unattended Windows/Linux VM hosts' },

  // 5. Bots & Runners
  { id: 'bot:provision', resource: 'bot', action: 'provision', displayName: 'Provision Automation Bot', category: 'Bots & Runners', description: 'Register unattended automation robot daemons' },
  { id: 'bot:assign_license', resource: 'bot', action: 'assign_license', displayName: 'Allocate Bot License Seat', category: 'Bots & Runners', description: 'Bind commercial runtime execution licenses to runner nodes' },
  { id: 'bot:start_stop', resource: 'bot', action: 'start_stop', displayName: 'Start / Stop Bot Daemon', category: 'Bots & Runners', description: 'Control operating state of local and remote bot agents' },
  { id: 'bot:view_telemetry', resource: 'bot', action: 'view_telemetry', displayName: 'Stream Execution Telemetry', category: 'Bots & Runners', description: 'Access live screen captures, keystroke audit, and logs' },

  // 6. Vector Storage
  { id: 'vector:create_collection', resource: 'vector', action: 'create_collection', displayName: 'Create Dedicated Vector DB', category: 'Vector Storage', description: 'Provision isolated pgvector / Qdrant RAG collections' },
  { id: 'vector:reindex', resource: 'vector', action: 'reindex', displayName: 'Trigger Embedding Re-index', category: 'Vector Storage', description: 'Chunk and vectorize knowledge documents into semantic vectors' },
  { id: 'vector:similarity_query', resource: 'vector', action: 'similarity_query', displayName: 'Query RAG Embeddings', category: 'Vector Storage', description: 'Execute semantic similarity searches against folder collections' },
  { id: 'vector:purge', resource: 'vector', action: 'purge', displayName: 'Purge Vector Collection', category: 'Vector Storage', description: 'Flush embeddings and wipe vector database partition' },

  // 7. Governance & Compliance
  { id: 'gov:lock_folder', resource: 'gov', action: 'lock_folder', displayName: 'Toggle Governance Lock', category: 'Governance & Compliance', description: 'Lock business folders to enforce immutable compliance policies' },
  { id: 'gov:approve_promotion', resource: 'gov', action: 'approve_promotion', displayName: 'Sign-Off Production Gate', category: 'Governance & Compliance', description: 'Dual-control authorization required to deploy to Production' },
  { id: 'gov:view_audit_trail', resource: 'gov', action: 'view_audit_trail', displayName: 'Read Enterprise Audit Log', category: 'Governance & Compliance', description: 'Access append-only historical log of security and config changes' }
]

const DEFAULT_ROLES: RoleItem[] = [
  {
    id: 'role-platform-admin',
    name: 'Platform Administrator',
    code: 'PLATFORM_ADMIN',
    description: 'Unrestricted control across all customers, tenants, and infrastructure runtimes.',
    scope: 'Platform',
    isSystem: true,
    isCustom: false,
    color: '#8B5CF6',
    icon: 'Crown',
    userCount: 3,
    permissions: GRANULAR_PERMISSIONS.reduce((acc, p) => ({ ...acc, [p.id]: 'ALLOW' }), {})
  },
  {
    id: 'role-tenant-admin',
    name: 'Tenant Administrator',
    code: 'TENANT_ADMIN',
    description: 'Full governance and resource management inside the active customer tenant.',
    scope: 'Tenant',
    isSystem: true,
    isCustom: false,
    color: '#10B981',
    icon: 'ShieldCheck',
    userCount: 8,
    permissions: GRANULAR_PERMISSIONS.reduce((acc, p) => ({ ...acc, [p.id]: 'ALLOW' }), {})
  },
  {
    id: 'role-ai-engineer',
    name: 'AI Agent & Flow Architect',
    code: 'AI_ARCHITECT',
    description: 'Designs, debugs, and tunes AI agents, MCP servers, and DAG workflows.',
    scope: 'Tenant',
    isSystem: false,
    isCustom: true,
    color: '#0284C7',
    icon: 'Bot',
    userCount: 14,
    permissions: {
      'agent:create': 'ALLOW', 'agent:edit': 'ALLOW', 'agent:publish': 'ALLOW',
      'agent:execute': 'ALLOW', 'agent:debug': 'ALLOW', 'agent:assign_compute': 'ALLOW',
      'workflow:design': 'ALLOW', 'workflow:test': 'ALLOW', 'workflow:deploy': 'ALLOW',
      'mcp:register_server': 'ALLOW', 'mcp:enable_tools': 'ALLOW', 'mcp:inspect_prompts': 'ALLOW',
      'compute:view_pods': 'ALLOW', 'compute:restart_pod': 'ALLOW',
      'vector:create_collection': 'ALLOW', 'vector:reindex': 'ALLOW', 'vector:similarity_query': 'ALLOW',
      'gov:view_audit_trail': 'ALLOW'
    }
  },
  {
    id: 'role-production-operator',
    name: 'Production Operations & Bot Lead',
    code: 'PROD_OPERATOR',
    description: 'Supervises running robot fleets, pod scaling, and production incident response.',
    scope: 'Tenant',
    isSystem: true,
    isCustom: false,
    color: '#F59E0B',
    icon: 'Cpu',
    userCount: 6,
    permissions: {
      'agent:execute': 'ALLOW', 'agent:debug': 'ALLOW',
      'workflow:run': 'ALLOW', 'workflow:approve': 'ALLOW',
      'compute:view_pods': 'ALLOW', 'compute:autoscale': 'ALLOW', 'compute:restart_pod': 'ALLOW', 'compute:manage_vm_pools': 'ALLOW',
      'bot:provision': 'ALLOW', 'bot:assign_license': 'ALLOW', 'bot:start_stop': 'ALLOW', 'bot:view_telemetry': 'ALLOW',
      'gov:view_audit_trail': 'ALLOW', 'gov:approve_promotion': 'ALLOW'
    }
  },
  {
    id: 'role-security-auditor',
    name: 'Security & Compliance Auditor',
    code: 'SEC_AUDITOR',
    description: 'Read-only visibility into governance locks, audit trails, and segregation of duties.',
    scope: 'Tenant',
    isSystem: true,
    isCustom: false,
    color: '#64748B',
    icon: 'Shield',
    userCount: 4,
    permissions: {
      'agent:debug': 'ALLOW',
      'compute:view_pods': 'ALLOW',
      'bot:view_telemetry': 'ALLOW',
      'gov:lock_folder': 'ALLOW',
      'gov:view_audit_trail': 'ALLOW'
    }
  }
]

const DEFAULT_SOD_RULES: SodRuleItem[] = [
  {
    id: 'sod-1',
    roleA: 'AI Agent & Flow Architect',
    roleB: 'Production Operations & Bot Lead',
    severity: 'CRITICAL',
    description: 'Workflow and agent authors cannot self-approve production deployment or operate release gates.',
    enforcement: 'STRICT_BLOCK',
    active: true
  },
  {
    id: 'sod-2',
    roleA: 'Security & Compliance Auditor',
    roleB: 'Platform Administrator',
    severity: 'HIGH',
    description: 'Independent compliance auditors cannot hold administrative execution privileges.',
    enforcement: 'STRICT_BLOCK',
    active: true
  },
  {
    id: 'sod-3',
    roleA: 'AI Agent & Flow Architect',
    roleB: 'Tenant Administrator',
    severity: 'MEDIUM',
    description: 'Developers cannot modify folder governance policies or bypass immutability locks.',
    enforcement: 'REQUIRE_DUAL_APPROVAL',
    active: true
  }
]

interface IamRolesStudioProps {
  initialTab?: IamTab
  currentEnv?: string
  tenantName?: string
}

export default function IamRolesStudio({
  initialTab = 'roles',
  currentEnv = 'DEV',
  tenantName = 'Citibank'
}: IamRolesStudioProps) {
  const [activeTab, setActiveTab] = useState<IamTab>(initialTab)
  const [roles, setRoles] = useState<RoleItem[]>(DEFAULT_ROLES)
  const [sodRules, setSodRules] = useState<SodRuleItem[]>(DEFAULT_SOD_RULES)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL')

  // Custom Role Builder State
  const [builderRole, setBuilderRole] = useState<{
    id?: string
    name: string
    code: string
    description: string
    scope: 'Platform' | 'Customer' | 'Tenant'
    parentRole: string
    permissions: Record<string, 'ALLOW' | 'DENY'>
  }>({
    name: 'Custom Agent Auditor',
    code: 'CUSTOM_AGENT_AUDITOR',
    description: 'Custom granular role with targeted access to inspect AI agent prompts and MCP servers.',
    scope: 'Tenant',
    parentRole: 'AI Agent & Flow Architect',
    permissions: {
      'agent:execute': 'ALLOW',
      'agent:debug': 'ALLOW',
      'mcp:inspect_prompts': 'ALLOW',
      'gov:view_audit_trail': 'ALLOW'
    }
  })

  // Access Simulator State
  const [simState, setSimState] = useState<{
    simRole: string
    simAction: string
    simEnv: string
    result: 'ALLOWED' | 'DENIED' | null
    reason: string
  }>({
    simRole: 'AI Agent & Flow Architect',
    simAction: 'workflow:approve',
    simEnv: 'PROD',
    result: null,
    reason: ''
  })

  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 3000)
  }

  // Filter roles
  const filteredRoles = useMemo(() => {
    return roles.filter(r =>
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.code.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [roles, searchQuery])

  // Filter permissions
  const filteredPerms = useMemo(() => {
    return GRANULAR_PERMISSIONS.filter(p => {
      const matchCat = selectedCategory === 'ALL' || p.category === selectedCategory
      const matchSearch = !searchQuery.trim() ||
        p.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.id.toLowerCase().includes(searchQuery.toLowerCase())
      return matchCat && matchSearch
    })
  }, [selectedCategory, searchQuery])

  // Permission categories list
  const categories = useMemo(() => {
    const set = new Set<string>()
    GRANULAR_PERMISSIONS.forEach(p => set.add(p.category))
    return ['ALL', ...Array.from(set)]
  }, [])

  // Toggle permission effect in Builder
  const handleToggleBuilderPerm = (permId: string, effect: 'ALLOW' | 'DENY' | 'NONE') => {
    setBuilderRole(prev => {
      const next = { ...prev.permissions }
      if (effect === 'NONE') {
        delete next[permId]
      } else {
        next[permId] = effect
      }
      return { ...prev, permissions: next }
    })
  }

  // Simulate Access
  const handleRunSimulation = () => {
    const targetRole = roles.find(r => r.name === simState.simRole)
    if (!targetRole) return

    const permEffect = targetRole.permissions[simState.simAction]
    // Check SoD and Environment constraints
    if (simState.simEnv === 'PROD' && simState.simAction === 'workflow:approve') {
      if (targetRole.name === 'AI Agent & Flow Architect') {
        setSimState(prev => ({
          ...prev,
          result: 'DENIED',
          reason: 'SoD Policy Violation: Workflow authors cannot approve deployments into Production.'
        }))
        return
      }
    }

    if (permEffect === 'ALLOW') {
      setSimState(prev => ({
        ...prev,
        result: 'ALLOWED',
        reason: `Explicit ALLOW granted by role "${targetRole.name}" for action ${simState.simAction}.`
      }))
    } else {
      setSimState(prev => ({
        ...prev,
        result: 'DENIED',
        reason: `Action ${simState.simAction} is not assigned to role "${targetRole.name}". Default DENY applies.`
      }))
    }
  }

  return (
    <div className="iam-roles-studio-container">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="folders-floating-toast">
          <Check size={14} style={{ color: '#10B981' }} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Bar */}
      <header className="iam-header-strip">
        <div className="iam-header-title-block">
          <div className="folders-breadcrumb">
            <Shield size={12} />
            <span>Tenant / Roles &amp; Permissions</span>
          </div>
          <div className="folders-title-row">
            <h1>Roles &amp; Access Governance</h1>
            <div className="folders-divider-v" />
            <div className="context-tenant-badge">
              <span className="status-dot-green" />
              <span>{tenantName}</span>
            </div>
            <div className="context-scope-badge">
              <span>ACTIVE ENVIRONMENT: {currentEnv}</span>
            </div>
          </div>
        </div>

        {/* Tab Buttons */}
        <div className="iam-tabs-nav">
          <button
            className={`iam-tab-btn ${activeTab === 'roles' ? 'active' : ''}`}
            onClick={() => setActiveTab('roles')}
          >
            <ShieldCheck size={14} />
            <span>Role Catalog</span>
          </button>

          <button
            className={`iam-tab-btn ${activeTab === 'builder' ? 'active' : ''}`}
            onClick={() => setActiveTab('builder')}
          >
            <Code size={14} />
            <span>Build Custom Role</span>
          </button>

          <button
            className={`iam-tab-btn ${activeTab === 'matrix' ? 'active' : ''}`}
            onClick={() => setActiveTab('matrix')}
          >
            <Layers size={14} />
            <span>Permission Matrix</span>
          </button>

          <button
            className={`iam-tab-btn ${activeTab === 'sod' ? 'active' : ''}`}
            onClick={() => setActiveTab('sod')}
          >
            <AlertTriangle size={14} />
            <span>Segregation of Duties</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="iam-main-scroll-body">
        {/* TAB 1: ROLE CATALOG */}
        {activeTab === 'roles' && (
          <div className="iam-tab-view">
            <div className="iam-toolbar-row">
              <div className="folders-search-box" style={{ width: 320 }}>
                <Search size={13} />
                <input
                  type="text"
                  placeholder="Search roles by name or scope..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="folders-btn-primary"
                  onClick={() => {
                    setActiveTab('builder')
                    showToast('Switched to Custom Role Builder')
                  }}
                >
                  <Plus size={14} />
                  <span>+ New Custom Role</span>
                </button>
              </div>
            </div>

            {/* Roles Grid */}
            <div className="iam-roles-grid">
              {filteredRoles.map((role) => {
                const allowCount = Object.values(role.permissions).filter(v => v === 'ALLOW').length
                return (
                  <div key={role.id} className="iam-role-card glass-card">
                    <div className="iam-role-head">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div className="iam-role-icon-box" style={{ borderColor: role.color, color: role.color }}>
                          <Shield size={16} />
                        </div>
                        <div>
                          <div style={{ fontSize: '0.88rem', fontWeight: 900 }}>{role.name}</div>
                          <div style={{ fontSize: '0.65rem', color: 'var(--muted-foreground)' }}>{role.code}</div>
                        </div>
                      </div>

                      <span className={`iam-scope-badge ${role.scope.toLowerCase()}`}>
                        {role.scope} Scope
                      </span>
                    </div>

                    <p className="iam-role-desc">{role.description}</p>

                    <div className="iam-role-stats-row">
                      <div className="iam-stat-item">
                        <Users size={12} />
                        <span>{role.userCount} Assigned Users</span>
                      </div>
                      <div className="iam-stat-item">
                        <Check size={12} style={{ color: '#10B981' }} />
                        <span>{allowCount} / {GRANULAR_PERMISSIONS.length} Permissions</span>
                      </div>
                    </div>

                    <div className="iam-role-actions-row">
                      <button
                        className="folders-btn-secondary"
                        style={{ padding: '4px 10px', fontSize: '0.65rem' }}
                        onClick={() => {
                          setBuilderRole({
                            name: `Clone of ${role.name}`,
                            code: `CUSTOM_${role.code}_CLONE`,
                            description: `Customized policy derivative of ${role.name}.`,
                            scope: 'Tenant',
                            parentRole: role.name,
                            permissions: { ...role.permissions }
                          })
                          setActiveTab('builder')
                          showToast(`Loaded ${role.name} into Role Builder`)
                        }}
                      >
                        <Copy size={11} />
                        <span>Clone</span>
                      </button>

                      <button
                        className="folders-btn-secondary"
                        style={{ padding: '4px 10px', fontSize: '0.65rem' }}
                        onClick={() => {
                          setBuilderRole({
                            id: role.id,
                            name: role.name,
                            code: role.code,
                            description: role.description,
                            scope: role.scope,
                            parentRole: 'System Base',
                            permissions: { ...role.permissions }
                          })
                          setActiveTab('builder')
                        }}
                      >
                        <Edit size={11} />
                        <span>Inspect / Edit</span>
                      </button>

                      {!role.isSystem && (
                        <button
                          className="tree-icon-btn danger"
                          title="Delete Role"
                          onClick={() => {
                            if (confirm(`Delete role "${role.name}"?`)) {
                              setRoles(prev => prev.filter(r => r.id !== role.id))
                              showToast(`Role "${role.name}" deleted`)
                            }
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* TAB 2: BUILD CUSTOM ROLE */}
        {activeTab === 'builder' && (
          <div className="iam-tab-view">
            <div className="iam-builder-grid">
              {/* Left Column: Metadata & Parent Inheritance */}
              <div className="iam-builder-meta-card glass-card">
                <span className="pane-section-label">Role Metadata &amp; Hierarchy</span>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                  <div>
                    <label className="settings-toggle-sub" style={{ display: 'block', marginBottom: 4 }}>ROLE DISPLAY NAME</label>
                    <input
                      type="text"
                      className="settings-select-input"
                      value={builderRole.name}
                      onChange={(e) => setBuilderRole(prev => ({ ...prev, name: e.target.value }))}
                    />
                  </div>

                  <div>
                    <label className="settings-toggle-sub" style={{ display: 'block', marginBottom: 4 }}>UNIQUE CODE IDENTIFIER</label>
                    <input
                      type="text"
                      className="settings-select-input"
                      value={builderRole.code}
                      onChange={(e) => setBuilderRole(prev => ({ ...prev, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_') }))}
                    />
                  </div>

                  <div>
                    <label className="settings-toggle-sub" style={{ display: 'block', marginBottom: 4 }}>GOVERNANCE SCOPE</label>
                    <select
                      className="settings-select-input"
                      value={builderRole.scope}
                      onChange={(e: any) => setBuilderRole(prev => ({ ...prev, scope: e.target.value }))}
                    >
                      <option value="Tenant">Tenant Scope (Isolated to active tenant)</option>
                      <option value="Customer">Customer Scope (Applies across all tenants)</option>
                      <option value="Platform">Platform Operator Scope (Global)</option>
                    </select>
                  </div>

                  <div>
                    <label className="settings-toggle-sub" style={{ display: 'block', marginBottom: 4 }}>INHERIT FROM BASE ROLE</label>
                    <select
                      className="settings-select-input"
                      value={builderRole.parentRole}
                      onChange={(e) => {
                        const parent = roles.find(r => r.name === e.target.value)
                        setBuilderRole(prev => ({
                          ...prev,
                          parentRole: e.target.value,
                          permissions: parent ? { ...parent.permissions } : prev.permissions
                        }))
                        showToast(`Inherited capabilities from ${e.target.value}`)
                      }}
                    >
                      {roles.map(r => (
                        <option key={r.id} value={r.name}>{r.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="settings-toggle-sub" style={{ display: 'block', marginBottom: 4 }}>ROLE DESCRIPTION</label>
                    <textarea
                      rows={3}
                      className="modal-textarea"
                      value={builderRole.description}
                      onChange={(e) => setBuilderRole(prev => ({ ...prev, description: e.target.value }))}
                    />
                  </div>
                </div>

                {/* Save Role Action */}
                <div style={{ marginTop: 18 }}>
                  <button
                    className="folders-btn-primary"
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={() => {
                      if (!builderRole.name.trim()) {
                        showToast('Role name cannot be empty')
                        return
                      }
                      const newRole: RoleItem = {
                        id: builderRole.id || `role-${Date.now()}`,
                        name: builderRole.name,
                        code: builderRole.code,
                        description: builderRole.description,
                        scope: builderRole.scope,
                        isSystem: false,
                        isCustom: true,
                        color: '#0284C7',
                        icon: 'Bot',
                        userCount: 0,
                        permissions: builderRole.permissions
                      }

                      setRoles(prev => {
                        const filtered = prev.filter(r => r.id !== newRole.id)
                        return [...filtered, newRole]
                      })

                      showToast(`Custom role "${newRole.name}" published successfully!`)
                      setActiveTab('roles')
                    }}
                  >
                    <Check size={14} />
                    <span>Publish Custom Role</span>
                  </button>
                </div>
              </div>

              {/* Right Column: Granular Permission Tree Editor */}
              <div className="iam-builder-perm-card glass-card">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <span className="pane-section-label">Granular Permission Matrix Configuration</span>
                    <p style={{ fontSize: '0.68rem', color: 'var(--muted-foreground)', margin: '2px 0 0' }}>
                      Configure granular ALLOW or DENY policies across AI Agents, Workflows, MCP Servers, Pods, and Bots.
                    </p>
                  </div>

                  {/* Category Filter */}
                  <select
                    className="settings-select-input"
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                  >
                    {categories.map(c => (
                      <option key={c} value={c}>{c === 'ALL' ? 'All Resource Categories' : c}</option>
                    ))}
                  </select>
                </div>

                {/* Permissions List */}
                <div className="iam-perm-editor-scroll">
                  {filteredPerms.map((perm) => {
                    const currentEffect = builderRole.permissions[perm.id] || 'NONE'
                    return (
                      <div key={perm.id} className="iam-perm-row">
                        <div style={{ flex: 1, minWidth: 200 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: '0.74rem', fontWeight: 800 }}>{perm.displayName}</span>
                            <span className="iam-perm-code-tag">{perm.id}</span>
                          </div>
                          <div style={{ fontSize: '0.62rem', color: 'var(--muted-foreground)', marginTop: 2 }}>
                            {perm.description}
                          </div>
                        </div>

                        {/* Tri-State Control: ALLOW / DENY / NONE */}
                        <div className="iam-tristate-group">
                          <button
                            type="button"
                            className={`iam-tristate-btn allow ${currentEffect === 'ALLOW' ? 'active' : ''}`}
                            onClick={() => handleToggleBuilderPerm(perm.id, currentEffect === 'ALLOW' ? 'NONE' : 'ALLOW')}
                          >
                            <Check size={11} />
                            <span>ALLOW</span>
                          </button>
                          <button
                            type="button"
                            className={`iam-tristate-btn deny ${currentEffect === 'DENY' ? 'active' : ''}`}
                            onClick={() => handleToggleBuilderPerm(perm.id, currentEffect === 'DENY' ? 'NONE' : 'DENY')}
                          >
                            <X size={11} />
                            <span>DENY</span>
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: PERMISSION MATRIX */}
        {activeTab === 'matrix' && (
          <div className="iam-tab-view">
            <div className="matrix-table-wrap glass-card">
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="pane-section-label">Cross-Role Capability Evaluation Matrix</span>
                <span style={{ fontSize: '0.68rem', color: 'var(--muted-foreground)' }}>
                  Evaluated against resource scope and environment policies
                </span>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table className="iam-matrix-table">
                  <thead>
                    <tr>
                      <th style={{ minWidth: 260 }}>RESOURCE &amp; ACTION</th>
                      <th style={{ minWidth: 120 }}>CATEGORY</th>
                      {roles.map(r => (
                        <th key={r.id} style={{ minWidth: 140, textAlign: 'center' }}>
                          <span style={{ color: r.color }}>{r.name}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {GRANULAR_PERMISSIONS.map(p => (
                      <tr key={p.id}>
                        <td>
                          <div style={{ fontWeight: 800, fontSize: '0.74rem' }}>{p.displayName}</div>
                          <div style={{ fontSize: '0.62rem', color: 'var(--muted-foreground)' }}>{p.id}</div>
                        </td>
                        <td>
                          <span className="iam-category-pill">{p.category}</span>
                        </td>
                        {roles.map(r => {
                          const effect = r.permissions[p.id]
                          return (
                            <td key={r.id} style={{ textAlign: 'center' }}>
                              {effect === 'ALLOW' ? (
                                <span className="matrix-check-allowed" title="Allowed">✓</span>
                              ) : effect === 'DENY' ? (
                                <span className="matrix-check-denied" title="Explicitly Denied">✗</span>
                              ) : (
                                <span style={{ color: 'var(--border)', opacity: 0.5 }}>—</span>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: SEGREGATION OF DUTIES (SOD) */}
        {activeTab === 'sod' && (
          <div className="iam-tab-view">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16 }}>
              {/* Left Column: SoD Conflict Rules */}
              <div className="glass-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span className="pane-section-label">Enforced Anti-Conflict Policies</span>
                    <p style={{ fontSize: '0.68rem', color: 'var(--muted-foreground)', margin: '2px 0 0' }}>
                      Prevents toxic role combinations from being assigned to the same user or service account.
                    </p>
                  </div>
                  <button
                    className="folders-btn-primary"
                    style={{ padding: '4px 10px', fontSize: '0.65rem' }}
                    onClick={() => showToast('New SoD rule dialog ready')}
                  >
                    <Plus size={12} />
                    <span>Add SoD Rule</span>
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {sodRules.map((rule) => (
                    <div key={rule.id} className="sod-card-item">
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <AlertTriangle size={15} style={{ color: rule.severity === 'CRITICAL' ? '#EF4444' : '#F59E0B' }} />
                          <span style={{ fontSize: '0.78rem', fontWeight: 900 }}>
                            {rule.roleA} <span style={{ color: 'var(--muted-foreground)' }}>⚡</span> {rule.roleB}
                          </span>
                        </div>
                        <span className={`sod-sev-badge ${rule.severity.toLowerCase()}`}>{rule.severity}</span>
                      </div>

                      <p style={{ fontSize: '0.68rem', color: 'var(--muted-foreground)', margin: '6px 0' }}>
                        {rule.description}
                      </p>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.65rem', borderTop: '1px solid var(--border)', paddingTop: 6 }}>
                        <span style={{ fontWeight: 800 }}>Enforcement: {rule.enforcement}</span>
                        <button
                          className="tree-icon-btn danger"
                          onClick={() => {
                            setSodRules(prev => prev.filter(r => r.id !== rule.id))
                            showToast('SoD conflict rule removed')
                          }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Column: Interactive Access Simulator */}
              <div className="glass-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <span className="pane-section-label">Access &amp; Policy Decision Simulator</span>
                <p style={{ fontSize: '0.68rem', color: 'var(--muted-foreground)', margin: 0 }}>
                  Simulate authorization decisions combining Principal, Action, Resource, Scope, Environment, and SoD constraints.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                  <div>
                    <label className="settings-toggle-sub">TESTING ROLE</label>
                    <select
                      className="settings-select-input"
                      value={simState.simRole}
                      onChange={(e) => setSimState(prev => ({ ...prev, simRole: e.target.value }))}
                    >
                      {roles.map(r => (
                        <option key={r.id} value={r.name}>{r.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="settings-toggle-sub">TARGET ACTION</label>
                    <select
                      className="settings-select-input"
                      value={simState.simAction}
                      onChange={(e) => setSimState(prev => ({ ...prev, simAction: e.target.value }))}
                    >
                      {GRANULAR_PERMISSIONS.map(p => (
                        <option key={p.id} value={p.id}>{p.displayName} ({p.id})</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="settings-toggle-sub">TARGET ENVIRONMENT</label>
                    <select
                      className="settings-select-input"
                      value={simState.simEnv}
                      onChange={(e) => setSimState(prev => ({ ...prev, simEnv: e.target.value }))}
                    >
                      <option value="DEV">DEV (Development)</option>
                      <option value="TEST">TEST (QA / Staging)</option>
                      <option value="UAT">UAT (User Acceptance)</option>
                      <option value="PROD">PROD (Production)</option>
                    </select>
                  </div>

                  <button
                    className="folders-btn-primary"
                    style={{ marginTop: 6, justifyContent: 'center' }}
                    onClick={handleRunSimulation}
                  >
                    <Play size={12} />
                    <span>Evaluate Authorization Policy</span>
                  </button>

                  {simState.result && (
                    <div className={`sim-result-card ${simState.result.toLowerCase()}`}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 900 }}>
                        {simState.result === 'ALLOWED' ? <Check size={14} /> : <X size={14} />}
                        <span>DECISION: {simState.result}</span>
                      </div>
                      <p style={{ fontSize: '0.65rem', margin: '4px 0 0', lineHeight: 1.35 }}>
                        {simState.reason}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
