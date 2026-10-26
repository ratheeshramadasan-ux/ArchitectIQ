import { useState } from 'react'
import {
  Users,
  Network,
  ShieldCheck,
  Plus,
  Search,
  Key,
  Globe,
  Trash2,
  Edit,
  Check,
  X,
  User,
  ExternalLink,
  Bot
} from 'lucide-react'
import './AccessDirectoryStudio.css'

export type AccessTab = 'groups' | 'security' | 'mappings' | 'users' | 'approvals'

export interface GroupItem {
  id: string
  name: string
  description: string
  assignedRole: string
  folderScope: string
  memberCount: number
  lead: string
  isIdpSynced: boolean
}

export interface IdpItem {
  id: string
  name: string
  protocol: 'OIDC' | 'SAML 2.0'
  issuerUrl: string
  clientId: string
  status: 'ACTIVE' | 'TESTING' | 'DISABLED'
  certExpires: string
  jitEnabled: boolean
}

export interface GroupMappingItem {
  id: string
  idpClaim: string
  targetRole: string
  targetFolder: string
  syncedUsersCount: number
}

export interface DirectoryUserItem {
  id: string
  name: string
  email: string
  type: 'HUMAN' | 'SERVICE_ACCOUNT' | 'AI_AGENT_IDENTITY'
  status: 'ACTIVE' | 'INVITED' | 'SUSPENDED'
  roles: string[]
  groups: string[]
  mfaEnforced: boolean
  lastActive: string
}

export interface ApprovalRequestItem {
  id: string
  requester: string
  email: string
  requestedRole: string
  resourceScope: string
  reason: string
  timestamp: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
}

const DEFAULT_GROUPS: GroupItem[] = [
  {
    id: 'grp-1',
    name: 'FinTech Automation Engineers',
    description: 'Authors and debugs automated flows, agent prompts, and custom tools.',
    assignedRole: 'AI Agent & Flow Architect',
    folderScope: 'Banking / Core Ledger',
    memberCount: 14,
    lead: 'Ratheesh Ramadasan',
    isIdpSynced: true
  },
  {
    id: 'grp-2',
    name: 'SRE & Runner Operations Fleet',
    description: 'Manages Kubernetes pod runners, VM worker pools, and production schedules.',
    assignedRole: 'Production Operations & Bot Lead',
    folderScope: 'Global Tenant Scope',
    memberCount: 8,
    lead: 'Lachu Reshmi',
    isIdpSynced: false
  },
  {
    id: 'grp-3',
    name: 'SOX Compliance & Security Reviewers',
    description: 'Performs read-only audit inspections and segregation-of-duties certifications.',
    assignedRole: 'Security & Compliance Auditor',
    folderScope: 'Global Tenant Scope',
    memberCount: 5,
    lead: 'Compliance Officer',
    isIdpSynced: true
  }
]

const DEFAULT_IDPS: IdpItem[] = [
  {
    id: 'idp-1',
    name: 'Microsoft Entra ID (Azure AD)',
    protocol: 'OIDC',
    issuerUrl: 'https://login.microsoftonline.com/citi-corp-tenant-uuid/v2.0',
    clientId: 'citi-architectiq-sso-client-app',
    status: 'ACTIVE',
    certExpires: '2027-04-12',
    jitEnabled: true
  },
  {
    id: 'idp-2',
    name: 'Okta Universal Directory',
    protocol: 'SAML 2.0',
    issuerUrl: 'https://citigroup.okta.com/app/architectiq_saml/sso',
    clientId: 'okta-saml-citigroup-prod',
    status: 'ACTIVE',
    certExpires: '2026-11-30',
    jitEnabled: true
  }
]

const DEFAULT_MAPPINGS: GroupMappingItem[] = [
  {
    id: 'map-1',
    idpClaim: 'AZURE_CITI_AUTOMATION_DEVS',
    targetRole: 'AI Agent & Flow Architect',
    targetFolder: 'Banking',
    syncedUsersCount: 22
  },
  {
    id: 'map-2',
    idpClaim: 'OKTA_CITI_SEC_AUDIT',
    targetRole: 'Security & Compliance Auditor',
    targetFolder: 'Global Tenant Scope',
    syncedUsersCount: 7
  },
  {
    id: 'map-3',
    idpClaim: 'AZURE_CITI_POD_ADMINS',
    targetRole: 'Production Operations & Bot Lead',
    targetFolder: 'Global Tenant Scope',
    syncedUsersCount: 9
  }
]

const DEFAULT_USERS: DirectoryUserItem[] = [
  {
    id: 'usr-1',
    name: 'Ratheesh Ramadasan',
    email: 'ratheesh.ramadasan@gmail.com',
    type: 'HUMAN',
    status: 'ACTIVE',
    roles: ['Platform Administrator', 'Tenant Administrator'],
    groups: ['FinTech Automation Engineers'],
    mfaEnforced: true,
    lastActive: 'Just now'
  },
  {
    id: 'usr-2',
    name: 'Lachu Reshmi',
    email: 'lachu@architectiq.io',
    type: 'HUMAN',
    status: 'ACTIVE',
    roles: ['Tenant Administrator', 'Production Operations & Bot Lead'],
    groups: ['SRE & Runner Operations Fleet'],
    mfaEnforced: true,
    lastActive: '12 mins ago'
  },
  {
    id: 'usr-3',
    name: 'svc-reconciliation-agent-worker',
    email: 'svc-reconcile@citi.iam.gserviceaccount.com',
    type: 'AI_AGENT_IDENTITY',
    status: 'ACTIVE',
    roles: ['AI Agent & Flow Architect'],
    groups: ['FinTech Automation Engineers'],
    mfaEnforced: false,
    lastActive: '3 mins ago (Automated Job)'
  },
  {
    id: 'usr-4',
    name: 'Internal Compliance Reviewer',
    email: 'auditor@citigroup.com',
    type: 'HUMAN',
    status: 'ACTIVE',
    roles: ['Security & Compliance Auditor'],
    groups: ['SOX Compliance & Security Reviewers'],
    mfaEnforced: true,
    lastActive: '2 days ago'
  }
]

const DEFAULT_APPROVALS: ApprovalRequestItem[] = [
  {
    id: 'appr-1',
    requester: 'David Miller',
    email: 'david.miller@citigroup.com',
    requestedRole: 'Production Operations & Bot Lead',
    resourceScope: 'Folder: Banking / Core Ledger',
    reason: 'Required for scheduled Q4 core ledger balance reconciliation run.',
    timestamp: '28 mins ago',
    status: 'PENDING'
  },
  {
    id: 'appr-2',
    requester: 'Elena Rostova',
    email: 'elena.rostova@citigroup.com',
    requestedRole: 'AI Agent & Flow Architect',
    resourceScope: 'Workspace: Default Workspace',
    reason: 'Onboarding new quantitative analyst onto MCP tools workflow.',
    timestamp: '2 hours ago',
    status: 'PENDING'
  }
]

interface AccessDirectoryStudioProps {
  initialTab?: AccessTab
  tenantName?: string
  currentEnv?: string
}

export default function AccessDirectoryStudio({
  initialTab = 'groups',
  tenantName = 'Citibank',
  currentEnv = 'DEV'
}: AccessDirectoryStudioProps) {
  const [activeTab, setActiveTab] = useState<AccessTab>(initialTab)
  const [groups, setGroups] = useState<GroupItem[]>(DEFAULT_GROUPS)
  const [idps] = useState<IdpItem[]>(DEFAULT_IDPS)
  const [mappings, setMappings] = useState<GroupMappingItem[]>(DEFAULT_MAPPINGS)
  const [users, setUsers] = useState<DirectoryUserItem[]>(DEFAULT_USERS)
  const [approvals, setApprovals] = useState<ApprovalRequestItem[]>(DEFAULT_APPROVALS)

  const [searchQuery, setSearchQuery] = useState('')
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 3000)
  }

  // Create group modal state
  const [newGroupModal, setNewGroupModal] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupDesc, setNewGroupDesc] = useState('')
  const [newGroupRole, setNewGroupRole] = useState('AI Agent & Flow Architect')
  const [newGroupFolder, setNewGroupFolder] = useState('Banking')

  // Create mapping modal state
  const [newMapModal, setNewMapModal] = useState(false)
  const [newMapClaim, setNewMapClaim] = useState('')
  const [newMapRole, setNewMapRole] = useState('AI Agent & Flow Architect')
  const [newMapFolder, setNewMapFolder] = useState('Banking')

  // Invite user modal state
  const [inviteModal, setInviteModal] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteRole, setInviteRole] = useState('AI Agent & Flow Architect')

  return (
    <div className="access-studio-container">
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
            <Network size={12} />
            <span>Tenant / Identity &amp; Access</span>
          </div>
          <div className="folders-title-row">
            <h1>Enterprise Directory &amp; Federation</h1>
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
            className={`iam-tab-btn ${activeTab === 'groups' ? 'active' : ''}`}
            onClick={() => setActiveTab('groups')}
          >
            <Network size={14} />
            <span>3. Groups &amp; Teams</span>
          </button>

          <button
            className={`iam-tab-btn ${activeTab === 'security' || activeTab === 'mappings' ? 'active' : ''}`}
            onClick={() => setActiveTab('security')}
          >
            <Key size={14} />
            <span>4. SSO &amp; Group Mapping</span>
          </button>

          <button
            className={`iam-tab-btn ${activeTab === 'users' ? 'active' : ''}`}
            onClick={() => setActiveTab('users')}
          >
            <Users size={14} />
            <span>5. Users ({users.length})</span>
          </button>

          <button
            className={`iam-tab-btn ${activeTab === 'approvals' ? 'active' : ''}`}
            onClick={() => setActiveTab('approvals')}
          >
            <ShieldCheck size={14} />
            <span>Pending Approvals ({approvals.filter(a => a.status === 'PENDING').length})</span>
          </button>
        </div>
      </header>

      {/* Sub-bar for SSO & Group Mapping */}
      {(activeTab === 'security' || activeTab === 'mappings') && (
        <div style={{ display: 'flex', gap: 10, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
          <button
            className={`folder-tab-btn ${activeTab === 'security' ? 'active' : ''}`}
            onClick={() => setActiveTab('security')}
          >
            Identity Providers (IdP)
          </button>
          <button
            className={`folder-tab-btn ${activeTab === 'mappings' ? 'active' : ''}`}
            onClick={() => setActiveTab('mappings')}
          >
            Mapped IdP Group Claims
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <div className="iam-main-scroll-body">
        {/* TAB 1: ACCESS GROUPS */}
        {activeTab === 'groups' && (
          <div className="iam-tab-view">
            <div className="iam-toolbar-row">
              <div className="folders-search-box" style={{ width: 320 }}>
                <Search size={13} />
                <input
                  type="text"
                  placeholder="Search groups or teams..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <button className="folders-btn-primary" onClick={() => setNewGroupModal(true)}>
                <Plus size={14} />
                <span>+ Create Access Group</span>
              </button>
            </div>

            <div className="access-groups-grid">
              {groups
                .filter(g => g.name.toLowerCase().includes(searchQuery.toLowerCase()) || g.description.toLowerCase().includes(searchQuery.toLowerCase()))
                .map((grp) => (
                  <div key={grp.id} className="glass-card access-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div className="access-icon-box">
                          <Network size={16} />
                        </div>
                        <div>
                          <div style={{ fontSize: '0.88rem', fontWeight: 900 }}>{grp.name}</div>
                          <div style={{ fontSize: '0.65rem', color: 'var(--muted-foreground)' }}>Lead: {grp.lead}</div>
                        </div>
                      </div>

                      <span className={`iam-scope-badge ${grp.isIdpSynced ? 'customer' : 'tenant'}`}>
                        {grp.isIdpSynced ? 'IdP Synced' : 'Local Group'}
                      </span>
                    </div>

                    <p style={{ fontSize: '0.72rem', color: 'var(--muted-foreground)', margin: '6px 0', lineHeight: 1.4 }}>
                      {grp.description}
                    </p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, background: 'rgba(255,255,255,0.2)', padding: '6px 10px', borderRadius: 4, border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem' }}>
                        <span style={{ color: 'var(--muted-foreground)' }}>ASSIGNED ROLE</span>
                        <strong style={{ color: 'var(--primary)' }}>{grp.assignedRole}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem' }}>
                        <span style={{ color: 'var(--muted-foreground)' }}>FOLDER SCOPE</span>
                        <strong>{grp.folderScope}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem' }}>
                        <span style={{ color: 'var(--muted-foreground)' }}>TOTAL MEMBERS</span>
                        <span style={{ fontWeight: 800 }}>{grp.memberCount} Principals</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                      <button className="folders-btn-secondary" style={{ padding: '3px 8px', fontSize: '0.62rem' }} onClick={() => showToast('Manage Group Members ready')}>
                        <Users size={11} />
                        <span>Members</span>
                      </button>
                      <button className="tree-icon-btn danger" onClick={() => {
                        if (confirm(`Remove group "${grp.name}"?`)) {
                          setGroups(prev => prev.filter(g => g.id !== grp.id))
                          showToast(`Group "${grp.name}" removed`)
                        }
                      }}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* TAB 2: IDENTITY PROVIDERS (SSO) */}
        {activeTab === 'security' && (
          <div className="iam-tab-view">
            <div className="iam-toolbar-row">
              <span className="pane-section-label">Enterprise Federated Identity Providers</span>
              <button className="folders-btn-primary" onClick={() => showToast('IdP Federation Wizard ready')}>
                <Plus size={14} />
                <span>+ Connect Identity Provider</span>
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {idps.map((idp) => (
                <div key={idp.id} className="glass-card access-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <Globe size={22} style={{ color: 'var(--accent, #BA9731)' }} />
                      <div>
                        <div style={{ fontSize: '0.92rem', fontWeight: 900 }}>{idp.name}</div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--muted-foreground)' }}>
                          Protocol: {idp.protocol} • Issuer: {idp.issuerUrl}
                        </div>
                      </div>
                    </div>
                    <span className="ops-status-badge success">Federated / Active</span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 10, background: 'rgba(255,255,255,0.2)', padding: 10, borderRadius: 6 }}>
                    <div>
                      <div style={{ fontSize: '0.6rem', color: 'var(--muted-foreground)', fontWeight: 800 }}>OIDC CLIENT ID / ENTITY ID</div>
                      <div style={{ fontSize: '0.74rem', fontWeight: 800 }}>{idp.clientId}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.6rem', color: 'var(--muted-foreground)', fontWeight: 800 }}>CERTIFICATE EXPIRY</div>
                      <div style={{ fontSize: '0.74rem', fontWeight: 800 }}>{idp.certExpires} (Valid)</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.6rem', color: 'var(--muted-foreground)', fontWeight: 800 }}>JIT PROVISIONING</div>
                      <div style={{ fontSize: '0.74rem', fontWeight: 800, color: '#10B981' }}>Enabled (Auto-Sync)</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                    <button className="folders-btn-secondary" style={{ padding: '4px 10px', fontSize: '0.65rem' }} onClick={() => showToast('SSO Ping Successful (Status 200 OK)')}>
                      <ExternalLink size={12} />
                      <span>Test SSO Connection</span>
                    </button>
                    <button className="folders-btn-secondary" style={{ padding: '4px 10px', fontSize: '0.65rem' }}>
                      <Edit size={12} />
                      <span>Configure Metadata</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: GROUP CLAIMS MAPPING */}
        {activeTab === 'mappings' && (
          <div className="iam-tab-view">
            <div className="iam-toolbar-row">
              <div>
                <span className="pane-section-label">External IdP Group Claim Mapping</span>
                <p style={{ fontSize: '0.68rem', color: 'var(--muted-foreground)', margin: '2px 0 0' }}>
                  Users logging in through SAML/OIDC are automatically granted roles and folder scopes based on corporate directory groups.
                </p>
              </div>
              <button className="folders-btn-primary" onClick={() => setNewMapModal(true)}>
                <Plus size={14} />
                <span>+ Add Group Claim Mapping</span>
              </button>
            </div>

            <div className="matrix-table-wrap glass-card">
              <table className="iam-matrix-table">
                <thead>
                  <tr>
                    <th>EXTERNAL IDP GROUP CLAIM</th>
                    <th>TARGET ROLE GRANTED</th>
                    <th>TARGET WORKSPACE FOLDER</th>
                    <th>SYNCED USERS</th>
                    <th style={{ textAlign: 'right' }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {mappings.map((m) => (
                    <tr key={m.id}>
                      <td style={{ fontWeight: 800, fontFamily: 'monospace', color: 'var(--primary)' }}>
                        {m.idpClaim}
                      </td>
                      <td>
                        <span className="license-status-tag">{m.targetRole}</span>
                      </td>
                      <td>{m.targetFolder}</td>
                      <td>{m.syncedUsersCount} Users Active</td>
                      <td style={{ textAlign: 'right' }}>
                        <button className="tree-icon-btn danger" onClick={() => {
                          setMappings(prev => prev.filter(x => x.id !== m.id))
                          showToast('Mapping rule removed')
                        }}>
                          <Trash2 size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 4: USERS DIRECTORY */}
        {activeTab === 'users' && (
          <div className="iam-tab-view">
            <div className="iam-toolbar-row">
              <div className="folders-search-box" style={{ width: 320 }}>
                <Search size={13} />
                <input
                  type="text"
                  placeholder="Search users by name or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <button className="folders-btn-primary" onClick={() => setInviteModal(true)}>
                <Plus size={14} />
                <span>+ Invite User</span>
              </button>
            </div>

            <div className="matrix-table-wrap glass-card">
              <table className="iam-matrix-table">
                <thead>
                  <tr>
                    <th>USER / PRINCIPAL</th>
                    <th>PRINCIPAL TYPE</th>
                    <th>STATUS</th>
                    <th>EFFECTIVE ROLES</th>
                    <th>ACCESS GROUPS</th>
                    <th>MFA STATUS</th>
                    <th>LAST ACTIVE</th>
                    <th style={{ textAlign: 'right' }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {users
                    .filter(u => u.name.toLowerCase().includes(searchQuery.toLowerCase()) || u.email.toLowerCase().includes(searchQuery.toLowerCase()))
                    .map((usr) => (
                      <tr key={usr.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div className="access-avatar-circle">
                              {usr.type === 'AI_AGENT_IDENTITY' ? <Bot size={13} /> : <User size={13} />}
                            </div>
                            <div>
                              <div style={{ fontWeight: 800 }}>{usr.name}</div>
                              <div style={{ fontSize: '0.62rem', color: 'var(--muted-foreground)' }}>{usr.email}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className={`iam-scope-badge ${usr.type === 'AI_AGENT_IDENTITY' ? 'platform' : 'customer'}`}>
                            {usr.type.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td>
                          <span className="ops-status-badge success">{usr.status}</span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {usr.roles.map(r => (
                              <span key={r} className="license-status-tag" style={{ fontSize: '0.58rem' }}>{r}</span>
                            ))}
                          </div>
                        </td>
                        <td>{usr.groups.join(', ') || 'Direct'}</td>
                        <td>
                          {usr.mfaEnforced ? (
                            <span style={{ color: '#10B981', fontWeight: 800, fontSize: '0.65rem' }}>✓ Enforced</span>
                          ) : (
                            <span style={{ color: 'var(--muted-foreground)', fontSize: '0.65rem' }}>—</span>
                          )}
                        </td>
                        <td style={{ fontSize: '0.65rem', color: 'var(--muted-foreground)' }}>{usr.lastActive}</td>
                        <td style={{ textAlign: 'right' }}>
                          <button className="tree-icon-btn" title="Modify Roles" onClick={() => showToast(`Modifying ${usr.name}`)}>
                            <Edit size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 5: PENDING APPROVALS */}
        {activeTab === 'approvals' && (
          <div className="iam-tab-view">
            <div className="iam-toolbar-row">
              <span className="pane-section-label">Pending Access &amp; Elevation Sign-Offs</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {approvals.map((req) => (
                <div key={req.id} className="glass-card access-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: '0.88rem', fontWeight: 900 }}>{req.requester}</span>
                        <span style={{ fontSize: '0.65rem', color: 'var(--muted-foreground)' }}>({req.email})</span>
                        <span className="ops-status-badge running">{req.status}</span>
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--primary)', fontWeight: 800, marginTop: 2 }}>
                        Requesting Role: {req.requestedRole} • Scope: {req.resourceScope}
                      </div>
                      <p style={{ fontSize: '0.68rem', color: 'var(--muted-foreground)', margin: '4px 0 0' }}>
                        Justification: "{req.reason}"
                      </p>
                    </div>

                    <div style={{ display: 'flex', gap: 8 }}>
                      {req.status === 'PENDING' ? (
                        <>
                          <button
                            className="folders-btn-primary"
                            style={{ padding: '4px 10px', fontSize: '0.65rem' }}
                            onClick={() => {
                              setApprovals(prev => prev.map(a => a.id === req.id ? { ...a, status: 'APPROVED' } : a))
                              showToast(`Approved role elevation for ${req.requester}`)
                            }}
                          >
                            <Check size={12} />
                            <span>Approve Request</span>
                          </button>
                          <button
                            className="folders-btn-secondary"
                            style={{ padding: '4px 10px', fontSize: '0.65rem' }}
                            onClick={() => {
                              setApprovals(prev => prev.map(a => a.id === req.id ? { ...a, status: 'REJECTED' } : a))
                              showToast(`Rejected request for ${req.requester}`)
                            }}
                          >
                            <X size={12} />
                            <span>Reject</span>
                          </button>
                        </>
                      ) : (
                        <span className={`ops-status-badge ${req.status.toLowerCase()}`}>{req.status}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Create Group Modal */}
      {newGroupModal && (
        <div className="modal-overlay-nextgen" onClick={() => setNewGroupModal(false)}>
          <div className="modal-content-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Create Access Group</h2>
              <p>Define an operational team or access group with automated role bindings</p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input
                type="text"
                placeholder="Group Name (e.g. AML Compliance Engineers)"
                className="settings-select-input"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
              />
              <textarea
                placeholder="Description of group purpose..."
                rows={2}
                className="modal-textarea"
                value={newGroupDesc}
                onChange={(e) => setNewGroupDesc(e.target.value)}
              />
              <select className="settings-select-input" value={newGroupRole} onChange={(e) => setNewGroupRole(e.target.value)}>
                <option value="AI Agent & Flow Architect">Role: AI Agent &amp; Flow Architect</option>
                <option value="Production Operations & Bot Lead">Role: Production Operations &amp; Bot Lead</option>
                <option value="Security & Compliance Auditor">Role: Security &amp; Compliance Auditor</option>
              </select>
              <input
                type="text"
                placeholder="Folder Scope (e.g. Banking)"
                className="settings-select-input"
                value={newGroupFolder}
                onChange={(e) => setNewGroupFolder(e.target.value)}
              />
            </div>
            <div className="modal-actions" style={{ marginTop: 14 }}>
              <button className="folders-btn-secondary" onClick={() => setNewGroupModal(false)}>Cancel</button>
              <button className="folders-btn-primary" onClick={() => {
                if (!newGroupName.trim()) return
                setGroups(prev => [
                  ...prev,
                  {
                    id: `grp-${Date.now()}`,
                    name: newGroupName,
                    description: newGroupDesc,
                    assignedRole: newGroupRole,
                    folderScope: newGroupFolder,
                    memberCount: 1,
                    lead: 'Enterprise Administrator',
                    isIdpSynced: false
                  }
                ])
                showToast(`Group "${newGroupName}" created successfully`)
                setNewGroupModal(false)
              }}>Create Group</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Group Mapping Modal */}
      {newMapModal && (
        <div className="modal-overlay-nextgen" onClick={() => setNewMapModal(false)}>
          <div className="modal-content-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Map IdP Group Claim</h2>
              <p>Bind an incoming SAML/OIDC claim to an internal role and folder</p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input
                type="text"
                placeholder="IdP Claim (e.g. OKTA_CITI_WEALTH_MANAGERS)"
                className="settings-select-input"
                value={newMapClaim}
                onChange={(e) => setNewMapClaim(e.target.value)}
              />
              <select className="settings-select-input" value={newMapRole} onChange={(e) => setNewMapRole(e.target.value)}>
                <option value="AI Agent & Flow Architect">Target Role: AI Agent &amp; Flow Architect</option>
                <option value="Production Operations & Bot Lead">Target Role: Production Operations &amp; Bot Lead</option>
                <option value="Security & Compliance Auditor">Target Role: Security &amp; Compliance Auditor</option>
              </select>
              <input
                type="text"
                placeholder="Target Folder (e.g. Banking / Wealth)"
                className="settings-select-input"
                value={newMapFolder}
                onChange={(e) => setNewMapFolder(e.target.value)}
              />
            </div>
            <div className="modal-actions" style={{ marginTop: 14 }}>
              <button className="folders-btn-secondary" onClick={() => setNewMapModal(false)}>Cancel</button>
              <button className="folders-btn-primary" onClick={() => {
                if (!newMapClaim.trim()) return
                setMappings(prev => [
                  ...prev,
                  {
                    id: `map-${Date.now()}`,
                    idpClaim: newMapClaim.trim(),
                    targetRole: newMapRole,
                    targetFolder: newMapFolder.trim(),
                    syncedUsersCount: 0
                  }
                ])
                showToast('IdP claim mapping registered')
                setNewMapModal(false)
              }}>Save Mapping</button>
            </div>
          </div>
        </div>
      )}

      {/* Invite User Modal */}
      {inviteModal && (
        <div className="modal-overlay-nextgen" onClick={() => setInviteModal(false)}>
          <div className="modal-content-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Invite Enterprise User</h2>
              <p>Issue an invitation to join the customer tenant workspace</p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input
                type="text"
                placeholder="Full Name (e.g. Sarah Jenkins)"
                className="settings-select-input"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
              />
              <input
                type="email"
                placeholder="Corporate Email (e.g. sarah.jenkins@citigroup.com)"
                className="settings-select-input"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
              <select className="settings-select-input" value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
                <option value="AI Agent & Flow Architect">Assigned Role: AI Agent &amp; Flow Architect</option>
                <option value="Production Operations & Bot Lead">Assigned Role: Production Operations &amp; Bot Lead</option>
                <option value="Security & Compliance Auditor">Assigned Role: Security &amp; Compliance Auditor</option>
              </select>
            </div>
            <div className="modal-actions" style={{ marginTop: 14 }}>
              <button className="folders-btn-secondary" onClick={() => setInviteModal(false)}>Cancel</button>
              <button className="folders-btn-primary" onClick={() => {
                if (!inviteEmail.trim()) return
                setUsers(prev => [
                  ...prev,
                  {
                    id: `usr-${Date.now()}`,
                    name: inviteName || inviteEmail.split('@')[0],
                    email: inviteEmail.trim(),
                    type: 'HUMAN',
                    status: 'INVITED',
                    roles: [inviteRole],
                    groups: ['Direct'],
                    mfaEnforced: true,
                    lastActive: 'Invitation Pending'
                  }
                ])
                showToast(`Invitation sent to ${inviteEmail}`)
                setInviteModal(false)
              }}>Send Invitation</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
