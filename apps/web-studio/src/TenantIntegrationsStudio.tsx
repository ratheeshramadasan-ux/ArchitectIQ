import { useState } from 'react'
import {
  Globe,
  Bot,
  Server,
  GitBranch,
  Terminal,
  Plus,
  Search,
  RotateCw,
  Check
} from 'lucide-react'
import './TenantIntegrationsStudio.css'

export type IntegrationTab = 'bots' | 'systems' | 'repos' | 'webhooks'

export interface BotAgentItem {
  id: string
  name: string
  type: 'UNATTENDED_ROBOT' | 'ATTENDED_ASSISTANT' | 'AGENT_WORKER_DAEMON'
  status: 'ONLINE' | 'EXECUTING' | 'IDLE' | 'OFFLINE'
  ipAddress: string
  hostname: string
  assignedFolder: string
  currentJob?: string
  cpuUsage: string
  memoryUsage: string
  heartbeat: string
}

export interface ConnectedSystemItem {
  id: string
  name: string
  type: 'MCP_SERVER' | 'DATABASE' | 'ERP_SAP' | 'CRM_SALESFORCE' | 'REST_API'
  endpoint: string
  authMethod: 'OAuth 2.0' | 'API Key' | 'mTLS' | 'Vault Secret Reference'
  status: 'HEALTHY' | 'WARNING' | 'DISCONNECTED'
  latencyMs: number
}

const DEFAULT_BOTS: BotAgentItem[] = [
  {
    id: 'bot-1',
    name: 'nyc-unattended-runner-01',
    type: 'UNATTENDED_ROBOT',
    status: 'EXECUTING',
    ipAddress: '10.240.12.84',
    hostname: 'vm-citi-prod-01.internal',
    assignedFolder: 'Banking / Core Ledger',
    currentJob: 'Ledger Reconciliation Run #4902',
    cpuUsage: '34%',
    memoryUsage: '1.4 GB / 8 GB',
    heartbeat: '2 seconds ago'
  },
  {
    id: 'bot-2',
    name: 'k8s-agent-pod-worker-02',
    type: 'AGENT_WORKER_DAEMON',
    status: 'ONLINE',
    ipAddress: '10.244.3.19',
    hostname: 'pod-agent-citi-prod-b',
    assignedFolder: 'Banking',
    cpuUsage: '12%',
    memoryUsage: '420 MB / 4 GB',
    heartbeat: '5 seconds ago'
  },
  {
    id: 'bot-3',
    name: 'london-attended-assistant-04',
    type: 'ATTENDED_ASSISTANT',
    status: 'IDLE',
    ipAddress: '10.210.8.102',
    hostname: 'ws-citi-ldn-401.internal',
    assignedFolder: 'Wealth Management',
    cpuUsage: '2%',
    memoryUsage: '310 MB / 16 GB',
    heartbeat: '18 seconds ago'
  }
]

const DEFAULT_SYSTEMS: ConnectedSystemItem[] = [
  {
    id: 'sys-1',
    name: 'Core SAP ERP & General Ledger Connector',
    type: 'ERP_SAP',
    endpoint: 'https://sap-gateway.citigroup.internal/odata/v4',
    authMethod: 'OAuth 2.0',
    status: 'HEALTHY',
    latencyMs: 42
  },
  {
    id: 'sys-2',
    name: 'Qdrant & Postgres MCP Model Context Protocol',
    type: 'MCP_SERVER',
    endpoint: 'mcp://internal-mcp-daemon:8088/v1',
    authMethod: 'Vault Secret Reference',
    status: 'HEALTHY',
    latencyMs: 14
  },
  {
    id: 'sys-3',
    name: 'Salesforce Enterprise CRM Gateway',
    type: 'CRM_SALESFORCE',
    endpoint: 'https://citigroup.my.salesforce.com/services/data/v58.0',
    authMethod: 'OAuth 2.0',
    status: 'HEALTHY',
    latencyMs: 88
  }
]

interface TenantIntegrationsStudioProps {
  initialTab?: IntegrationTab
  tenantName?: string
  currentEnv?: string
}

export default function TenantIntegrationsStudio({
  initialTab = 'bots',
  tenantName = 'Citibank',
  currentEnv = 'DEV'
}: TenantIntegrationsStudioProps) {
  const [activeTab, setActiveTab] = useState<IntegrationTab>(initialTab)
  const [bots] = useState<BotAgentItem[]>(DEFAULT_BOTS)
  const [systems] = useState<ConnectedSystemItem[]>(DEFAULT_SYSTEMS)
  const [searchQuery, setSearchQuery] = useState('')
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 3000)
  }

  return (
    <div className="integrations-studio-container">
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
            <Globe size={12} />
            <span>Tenant / External Integrations &amp; Infrastructure</span>
          </div>
          <div className="folders-title-row">
            <h1>Integrations, Bots &amp; Connected Systems</h1>
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
            className={`iam-tab-btn ${activeTab === 'bots' ? 'active' : ''}`}
            onClick={() => setActiveTab('bots')}
          >
            <Bot size={14} />
            <span>Bot Agents &amp; Pods ({bots.length})</span>
          </button>

          <button
            className={`iam-tab-btn ${activeTab === 'systems' ? 'active' : ''}`}
            onClick={() => setActiveTab('systems')}
          >
            <Server size={14} />
            <span>Connected Systems &amp; MCP</span>
          </button>

          <button
            className={`iam-tab-btn ${activeTab === 'repos' ? 'active' : ''}`}
            onClick={() => setActiveTab('repos')}
          >
            <GitBranch size={14} />
            <span>Code Repositories</span>
          </button>

          <button
            className={`iam-tab-btn ${activeTab === 'webhooks' ? 'active' : ''}`}
            onClick={() => setActiveTab('webhooks')}
          >
            <Terminal size={14} />
            <span>API &amp; Webhooks</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="iam-main-scroll-body">
        {/* TAB 1: BOT AGENTS & RUNNERS */}
        {activeTab === 'bots' && (
          <div className="iam-tab-view">
            <div className="iam-toolbar-row">
              <div className="folders-search-box" style={{ width: 320 }}>
                <Search size={13} />
                <input
                  type="text"
                  placeholder="Search bots by name or IP..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <button className="folders-btn-primary" onClick={() => showToast('Provision Robot wizard ready')}>
                <Plus size={14} />
                <span>+ Provision Bot Agent</span>
              </button>
            </div>

            <div className="matrix-table-wrap glass-card">
              <table className="iam-matrix-table">
                <thead>
                  <tr>
                    <th>ROBOT / AGENT RUNNER</th>
                    <th>TYPE</th>
                    <th>STATUS</th>
                    <th>ASSIGNED FOLDER</th>
                    <th>IP &amp; HOSTNAME</th>
                    <th>RESOURCE LOAD</th>
                    <th>HEARTBEAT</th>
                    <th style={{ textAlign: 'right' }}>CONTROL</th>
                  </tr>
                </thead>
                <tbody>
                  {bots
                    .filter(b => b.name.toLowerCase().includes(searchQuery.toLowerCase()) || b.ipAddress.includes(searchQuery))
                    .map((bot) => (
                      <tr key={bot.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Bot size={16} style={{ color: 'var(--primary)' }} />
                            <div>
                              <div style={{ fontWeight: 800 }}>{bot.name}</div>
                              {bot.currentJob && (
                                <div style={{ fontSize: '0.62rem', color: '#10B981' }}>{bot.currentJob}</div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="iam-category-pill">{bot.type.replace(/_/g, ' ')}</span>
                        </td>
                        <td>
                          <span className={`ops-status-badge ${bot.status.toLowerCase()}`}>
                            {bot.status}
                          </span>
                        </td>
                        <td>{bot.assignedFolder}</td>
                        <td style={{ fontFamily: 'monospace', fontSize: '0.65rem' }}>
                          {bot.ipAddress} ({bot.hostname})
                        </td>
                        <td style={{ fontSize: '0.65rem' }}>
                          CPU: {bot.cpuUsage} • RAM: {bot.memoryUsage}
                        </td>
                        <td style={{ fontSize: '0.65rem', color: 'var(--muted-foreground)' }}>{bot.heartbeat}</td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            className="tree-icon-btn"
                            title="Restart Bot Service"
                            onClick={() => showToast(`Restarting ${bot.name}...`)}
                          >
                            <RotateCw size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: CONNECTED SYSTEMS & MCP SERVERS */}
        {activeTab === 'systems' && (
          <div className="iam-tab-view">
            <div className="iam-toolbar-row">
              <span className="pane-section-label">Enterprise Gateways &amp; MCP Tool Daemons</span>
              <button className="folders-btn-primary" onClick={() => showToast('Register Connector Wizard ready')}>
                <Plus size={14} />
                <span>+ Connect Enterprise System</span>
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {systems.map((sys) => (
                <div key={sys.id} className="glass-card access-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <Server size={20} style={{ color: sys.type === 'MCP_SERVER' ? '#8B5CF6' : 'var(--primary)' }} />
                      <div>
                        <div style={{ fontSize: '0.88rem', fontWeight: 900 }}>{sys.name}</div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--muted-foreground)' }}>
                          Endpoint: {sys.endpoint} • Auth: {sys.authMethod}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--primary)' }}>
                        {sys.latencyMs}ms latency
                      </span>
                      <span className="ops-status-badge success">{sys.status}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: CODE REPOSITORIES */}
        {activeTab === 'repos' && (
          <div className="iam-tab-view">
            <div className="glass-card access-card" style={{ padding: 24, textAlign: 'center' }}>
              <GitBranch size={32} style={{ color: 'var(--accent, #BA9731)', margin: '0 auto 8px' }} />
              <div style={{ fontSize: '0.92rem', fontWeight: 900 }}>Connected Git Repositories</div>
              <p style={{ fontSize: '0.72rem', color: 'var(--muted-foreground)', maxWidth: 440, margin: '4px auto 14px' }}>
                Manage GitHub Enterprise, GitLab, and Azure DevOps repositories connected for automated workflow CI/CD.
              </p>
              <button className="folders-btn-primary" style={{ margin: '0 auto' }} onClick={() => showToast('Connect Repository ready')}>
                <Plus size={14} />
                <span>Connect Git Repository</span>
              </button>
            </div>
          </div>
        )}

        {/* TAB 4: API & WEBHOOKS */}
        {activeTab === 'webhooks' && (
          <div className="iam-tab-view">
            <div className="glass-card access-card" style={{ padding: 24, textAlign: 'center' }}>
              <Terminal size={32} style={{ color: '#10B981', margin: '0 auto 8px' }} />
              <div style={{ fontSize: '0.92rem', fontWeight: 900 }}>Event Webhooks &amp; Inbound Triggers</div>
              <p style={{ fontSize: '0.72rem', color: 'var(--muted-foreground)', maxWidth: 440, margin: '4px auto 14px' }}>
                Configure secure HTTPS webhook endpoints to trigger AI agents and workflows upon external business events.
              </p>
              <button className="folders-btn-primary" style={{ margin: '0 auto' }} onClick={() => showToast('Add Webhook ready')}>
                <Plus size={14} />
                <span>+ Register New Webhook</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
