import { useState } from 'react'
import {
  FolderOpen,
  AppWindow,
  Settings,
  Plus,
  Search,
  Bot,
  Workflow,
  Trash2,
  Edit,
  Check,
  Server
} from 'lucide-react'
import './TenantApplicationsStudio.css'

export type AppViewTab = 'apps' | 'general'

export interface AppSolutionItem {
  id: string
  name: string
  code: string
  type: 'AI_AGENT' | 'WORKFLOW' | 'MULTI_AGENT_TEAM' | 'MCP_SERVER' | 'DOC_AI' | 'SCHEDULED_JOB'
  status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED'
  folderBinding: string
  version: string
  author: string
  deployments: { dev: boolean; test: boolean; uat: boolean; prod: boolean }
}

const DEFAULT_APPS: AppSolutionItem[] = [
  {
    id: 'app-1',
    name: 'Core Ledger Daily Reconciliation',
    code: 'APP_LEDGER_RECON',
    type: 'WORKFLOW',
    status: 'ACTIVE',
    folderBinding: 'Banking / Core Ledger',
    version: 'v2.4.1',
    author: 'admin@architectiq.io',
    deployments: { dev: true, test: true, uat: true, prod: true }
  },
  {
    id: 'app-2',
    name: 'KYC Document Intake & AML Analyzer',
    code: 'APP_KYC_AML_ANALYZER',
    type: 'AI_AGENT',
    status: 'ACTIVE',
    folderBinding: 'Banking',
    version: 'v3.1.0',
    author: 'lachu@architectiq.io',
    deployments: { dev: true, test: true, uat: true, prod: false }
  },
  {
    id: 'app-3',
    name: 'PostgreSQL & SAP Database MCP Server',
    code: 'MCP_PG_SAP_GATEWAY',
    type: 'MCP_SERVER',
    status: 'ACTIVE',
    folderBinding: 'Global Tenant Scope',
    version: 'v1.2.0',
    author: 'admin@architectiq.io',
    deployments: { dev: true, test: true, uat: true, prod: true }
  },
  {
    id: 'app-4',
    name: 'Autonomous Fraud Detection Multi-Agent Swarm',
    code: 'APP_FRAUD_SWARM',
    type: 'MULTI_AGENT_TEAM',
    status: 'ACTIVE',
    folderBinding: 'Banking',
    version: 'v1.0.4',
    author: 'admin@architectiq.io',
    deployments: { dev: true, test: true, uat: false, prod: false }
  }
]

interface TenantApplicationsStudioProps {
  initialTab?: AppViewTab
  tenantName?: string
  currentEnv?: string
}

export default function TenantApplicationsStudio({
  initialTab = 'apps',
  tenantName = 'Citibank',
  currentEnv = 'DEV'
}: TenantApplicationsStudioProps) {
  const [activeTab, setActiveTab] = useState<AppViewTab>(initialTab)
  const [apps, setApps] = useState<AppSolutionItem[]>(DEFAULT_APPS)
  const [searchQuery, setSearchQuery] = useState('')
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [newAppModal, setNewAppModal] = useState(false)
  const [newAppName, setNewAppName] = useState('')
  const [newAppType, setNewAppType] = useState<AppSolutionItem['type']>('AI_AGENT')
  const [newAppFolder, setNewAppFolder] = useState('Banking')

  // General Settings state
  const [generalSettings, setGeneralSettings] = useState({
    defaultBranch: 'main',
    requireDualApprovalForProd: true,
    autoPromoteDevToTest: true,
    sandboxIsolation: 'Strict Airgap',
    smtpHost: 'smtp.citigroup.com',
    smtpPort: 587,
    notifyOnFailure: true
  })

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 3000)
  }

  return (
    <div className="apps-studio-container">
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
            <FolderOpen size={12} />
            <span>Tenant / Workspace Management</span>
          </div>
          <div className="folders-title-row">
            <h1>Applications &amp; General Configuration</h1>
            <div className="folders-divider-v" />
            <div className="context-tenant-badge">
              <span className="status-dot-green" />
              <span>{tenantName}</span>
            </div>
            <div className="context-scope-badge">
              <span>ENVIRONMENT: {currentEnv}</span>
            </div>
          </div>
        </div>

        {/* Tab Buttons */}
        <div className="iam-tabs-nav">
          <button
            className={`iam-tab-btn ${activeTab === 'apps' ? 'active' : ''}`}
            onClick={() => setActiveTab('apps')}
          >
            <AppWindow size={14} />
            <span>Applications ({apps.length})</span>
          </button>

          <button
            className={`iam-tab-btn ${activeTab === 'general' ? 'active' : ''}`}
            onClick={() => setActiveTab('general')}
          >
            <Settings size={14} />
            <span>General Settings</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="iam-main-scroll-body">
        {activeTab === 'apps' && (
          <div className="iam-tab-view">
            <div className="iam-toolbar-row">
              <div className="folders-search-box" style={{ width: 320 }}>
                <Search size={13} />
                <input
                  type="text"
                  placeholder="Search applications or MCP servers..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <button className="folders-btn-primary" onClick={() => setNewAppModal(true)}>
                <Plus size={14} />
                <span>+ Register New Application</span>
              </button>
            </div>

            <div className="apps-catalog-grid">
              {apps
                .filter(a => a.name.toLowerCase().includes(searchQuery.toLowerCase()) || a.code.toLowerCase().includes(searchQuery.toLowerCase()))
                .map((app) => (
                  <div key={app.id} className="glass-card access-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div className="access-icon-box">
                          {app.type === 'AI_AGENT' ? <Bot size={18} /> :
                           app.type === 'MCP_SERVER' ? <Server size={18} /> :
                           app.type === 'MULTI_AGENT_TEAM' ? <Bot size={18} /> :
                           <Workflow size={18} />}
                        </div>
                        <div>
                          <div style={{ fontSize: '0.88rem', fontWeight: 900 }}>{app.name}</div>
                          <div style={{ fontSize: '0.62rem', color: 'var(--muted-foreground)' }}>{app.code} • {app.version}</div>
                        </div>
                      </div>

                      <span className="ops-status-badge success">{app.status}</span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, background: 'rgba(255,255,255,0.2)', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem' }}>
                        <span style={{ color: 'var(--muted-foreground)' }}>APPLICATION TYPE</span>
                        <strong style={{ color: 'var(--primary)' }}>{app.type.replace(/_/g, ' ')}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem' }}>
                        <span style={{ color: 'var(--muted-foreground)' }}>FOLDER BINDING</span>
                        <strong>{app.folderBinding}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', alignItems: 'center', marginTop: 4 }}>
                        <span style={{ color: 'var(--muted-foreground)' }}>DEPLOYMENT ENVIRONMENTS</span>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <span className={`iam-scope-badge ${app.deployments.dev ? 'tenant' : ''}`}>DEV</span>
                          <span className={`iam-scope-badge ${app.deployments.test ? 'tenant' : ''}`}>TEST</span>
                          <span className={`iam-scope-badge ${app.deployments.uat ? 'customer' : ''}`}>UAT</span>
                          <span className={`iam-scope-badge ${app.deployments.prod ? 'platform' : ''}`}>PROD</span>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                      <span style={{ fontSize: '0.62rem', color: 'var(--muted-foreground)' }}>Author: {app.author}</span>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="folders-btn-secondary" style={{ padding: '3px 8px', fontSize: '0.62rem' }} onClick={() => showToast(`Opening designer for ${app.name}`)}>
                          <Edit size={11} />
                          <span>Open in Studio</span>
                        </button>
                        <button className="tree-icon-btn danger" onClick={() => {
                          if (confirm(`Archive application "${app.name}"?`)) {
                            setApps(prev => prev.filter(a => a.id !== app.id))
                            showToast(`Application "${app.name}" archived`)
                          }
                        }}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* TAB 2: GENERAL SETTINGS */}
        {activeTab === 'general' && (
          <div className="iam-tab-view">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {/* CI/CD & Promotion Policy */}
              <div className="glass-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <span className="pane-section-label">CI/CD &amp; Environment Promotion Controls</span>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div className="settings-toggle-row">
                    <div className="settings-toggle-info">
                      <span className="settings-toggle-title">Require Dual-Control Approval for Production</span>
                      <span className="settings-toggle-sub">Promotions to PROD must be approved by an authorized Production Operator</span>
                    </div>
                    <label className="toggle-switch-ui">
                      <input
                        type="checkbox"
                        checked={generalSettings.requireDualApprovalForProd}
                        onChange={(e) => setGeneralSettings(prev => ({ ...prev, requireDualApprovalForProd: e.target.checked }))}
                      />
                      <span className="toggle-slider" />
                    </label>
                  </div>

                  <div className="settings-toggle-row">
                    <div className="settings-toggle-info">
                      <span className="settings-toggle-title">Auto-Promote Passed Test Runs to UAT</span>
                      <span className="settings-toggle-sub">Trigger automated staging verification upon zero test regression</span>
                    </div>
                    <label className="toggle-switch-ui">
                      <input
                        type="checkbox"
                        checked={generalSettings.autoPromoteDevToTest}
                        onChange={(e) => setGeneralSettings(prev => ({ ...prev, autoPromoteDevToTest: e.target.checked }))}
                      />
                      <span className="toggle-slider" />
                    </label>
                  </div>

                  <div>
                    <label className="settings-toggle-sub">DEFAULT REPOSITORY MAIN BRANCH</label>
                    <input
                      type="text"
                      className="settings-select-input"
                      value={generalSettings.defaultBranch}
                      onChange={(e) => setGeneralSettings(prev => ({ ...prev, defaultBranch: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              {/* Communication & SMTP Settings */}
              <div className="glass-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <span className="pane-section-label">Enterprise Notification &amp; SMTP Gateway</span>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <label className="settings-toggle-sub">SMTP RELAY SERVER</label>
                    <input
                      type="text"
                      className="settings-select-input"
                      value={generalSettings.smtpHost}
                      onChange={(e) => setGeneralSettings(prev => ({ ...prev, smtpHost: e.target.value }))}
                    />
                  </div>

                  <div>
                    <label className="settings-toggle-sub">SMTP PORT</label>
                    <input
                      type="number"
                      className="settings-select-input"
                      value={generalSettings.smtpPort}
                      onChange={(e) => setGeneralSettings(prev => ({ ...prev, smtpPort: Number(e.target.value) }))}
                    />
                  </div>

                  <div className="settings-toggle-row">
                    <div className="settings-toggle-info">
                      <span className="settings-toggle-title">Send Incident Alerts on Worker Failure</span>
                      <span className="settings-toggle-sub">Dispatch real-time email notification if an agent pod or runner crashes</span>
                    </div>
                    <label className="toggle-switch-ui">
                      <input
                        type="checkbox"
                        checked={generalSettings.notifyOnFailure}
                        onChange={(e) => setGeneralSettings(prev => ({ ...prev, notifyOnFailure: e.target.checked }))}
                      />
                      <span className="toggle-slider" />
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="folders-btn-primary" onClick={() => showToast('Tenant general configuration saved')}>
                <Check size={14} />
                <span>Save General Configuration</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* New Application Modal */}
      {newAppModal && (
        <div className="modal-overlay-nextgen" onClick={() => setNewAppModal(false)}>
          <div className="modal-content-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Register New Application</h2>
              <p>Register a workflow, autonomous agent, MCP server, or multi-agent solution</p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input
                type="text"
                placeholder="Application Name (e.g. Mortgages Approval Agent)"
                className="settings-select-input"
                value={newAppName}
                onChange={(e) => setNewAppName(e.target.value)}
              />
              <select className="settings-select-input" value={newAppType} onChange={(e: any) => setNewAppType(e.target.value)}>
                <option value="AI_AGENT">Autonomous AI Agent</option>
                <option value="WORKFLOW">Visual DAG Workflow</option>
                <option value="MULTI_AGENT_TEAM">Multi-Agent Swarm / Team</option>
                <option value="MCP_SERVER">Model Context Protocol (MCP) Server</option>
                <option value="DOC_AI">Document Intelligence Model</option>
                <option value="SCHEDULED_JOB">Scheduled Batch Automation</option>
              </select>
              <input
                type="text"
                placeholder="Folder Scope Binding (e.g. Banking)"
                className="settings-select-input"
                value={newAppFolder}
                onChange={(e) => setNewAppFolder(e.target.value)}
              />
            </div>
            <div className="modal-actions" style={{ marginTop: 14 }}>
              <button className="folders-btn-secondary" onClick={() => setNewAppModal(false)}>Cancel</button>
              <button className="folders-btn-primary" onClick={() => {
                if (!newAppName.trim()) return
                setApps(prev => [
                  ...prev,
                  {
                    id: `app-${Date.now()}`,
                    name: newAppName,
                    code: `APP_${newAppName.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`,
                    type: newAppType,
                    status: 'DRAFT',
                    folderBinding: newAppFolder,
                    version: 'v1.0.0-draft',
                    author: 'Enterprise Administrator',
                    deployments: { dev: true, test: false, uat: false, prod: false }
                  }
                ])
                showToast(`Application "${newAppName}" registered in draft`)
                setNewAppModal(false)
              }}>Register Application</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
