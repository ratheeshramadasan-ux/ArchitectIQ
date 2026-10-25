import { useState, useEffect, useCallback } from 'react'
import {
  Link2,
  Play,
  Plus,
  RefreshCw,
  CheckCircle2,
  Copy,
  Download,
} from 'lucide-react'

export interface CredentialItem {
  id: string
  tenant_id: string
  name: string
  vault_provider: string
  vault_path: string
  secret_key: string
  environment: string
  masked_preview: string
  status: string
  created_at: string
  updated_at: string
}

export interface ConnectorItem {
  id: string
  tenant_id: string
  project_id: string
  credential_id?: string
  name: string
  slug: string
  connector_type: string
  base_url: string
  auth_type: string
  headers_template: Record<string, unknown>
  timeout_seconds: number
  status: string
  created_at: string
  updated_at: string
}

export interface IntegrationToolItem {
  id: string
  tenant_id: string
  project_id: string
  connector_id: string
  name: string
  slug: string
  description?: string
  method: string
  endpoint_path: string
  parameters_schema: Record<string, unknown>
  response_schema: Record<string, unknown>
  rate_limit_per_minute: number
  is_governed: boolean
  created_at: string
  updated_at: string
}

export interface ProjectTemplateItem {
  id: string
  tenant_id: string
  name: string
  slug: string
  category: string
  package_bundle: Record<string, unknown>
  created_at: string
}

export default function IntegrationsStudio({
  token,
  tenant,
  projectId: propProjectId,
}: {
  token: string
  tenant: string
  projectId?: string
}) {
  const [activeTab, setActiveTab] = useState<'Connectors' | 'Tools' | 'Credentials' | 'Templates'>('Connectors')
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(propProjectId || null)
  const effectiveProjectId = propProjectId || selectedProjectId

  // Data State
  const [connectors, setConnectors] = useState<ConnectorItem[]>([])
  const [selectedConnector, setSelectedConnector] = useState<ConnectorItem | null>(null)
  const [tools, setTools] = useState<IntegrationToolItem[]>([])
  const [selectedTool, setSelectedTool] = useState<IntegrationToolItem | null>(null)
  const [credentials, setCredentials] = useState<CredentialItem[]>([])
  const [templates, setTemplates] = useState<ProjectTemplateItem[]>([])

  // Invocation State
  const [toolArgumentsJson, setToolArgumentsJson] = useState('{\n  "id": "1001",\n  "query": "active"\n}')
  const [toolInvokeResult, setToolInvokeResult] = useState<Record<string, unknown> | null>(null)

  // Modals & Forms
  const [connectorModalOpen, setConnectorModalOpen] = useState(false)
  const [newConnName, setNewConnName] = useState('')
  const [newConnSlug, setNewConnSlug] = useState('')
  const [newConnUrl, setNewConnUrl] = useState('https://api.stripe.com/v1')
  const [newConnType, setNewConnType] = useState('REST')

  const [toolModalOpen, setToolModalOpen] = useState(false)
  const [newToolName, setNewToolName] = useState('')
  const [newToolSlug, setNewToolSlug] = useState('')
  const [newToolMethod, setNewToolMethod] = useState('POST')
  const [newToolPath, setNewToolPath] = useState('/charges')

  // Status & Feedback
  const [busy, setBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

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

  // Discover projects
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

  // Load connectors and tools for selected project
  useEffect(() => {
    let cancelled = false
    if (!token || !effectiveProjectId) return

    callApi(`/projects/${effectiveProjectId}/connectors`)
      .then((data: ConnectorItem[]) => {
        if (!cancelled && Array.isArray(data)) {
          setConnectors(data)
          if (data.length > 0 && !selectedConnector) setSelectedConnector(data[0])
        }
      })
      .catch(() => {})

    callApi(`/projects/${effectiveProjectId}/tools`)
      .then((data: IntegrationToolItem[]) => {
        if (!cancelled && Array.isArray(data)) {
          setTools(data)
          if (data.length > 0 && !selectedTool) setSelectedTool(data[0])
        }
      })
      .catch(() => {})

    callApi(`/credentials`)
      .then((data: CredentialItem[]) => {
        if (!cancelled && Array.isArray(data)) setCredentials(data)
      })
      .catch(() => {})

    callApi(`/project-templates`)
      .then((data: ProjectTemplateItem[]) => {
        if (!cancelled && Array.isArray(data)) setTemplates(data)
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [callApi, token, effectiveProjectId, selectedConnector, selectedTool])

  const refreshAll = () => {
    if (!effectiveProjectId) return
    setBusy(true)
    Promise.all([
      callApi(`/projects/${effectiveProjectId}/connectors`).then(setConnectors),
      callApi(`/projects/${effectiveProjectId}/tools`).then(setTools),
      callApi(`/credentials`).then(setCredentials),
      callApi(`/project-templates`).then(setTemplates),
    ]).finally(() => setBusy(false))
  }

  const handleCreateConnector = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!effectiveProjectId) return
    setBusy(true)
    setErrorMessage('')
    setSuccessMessage('')

    try {
      const payload = {
        name: newConnName,
        slug: newConnSlug || newConnName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        connector_type: newConnType,
        base_url: newConnUrl,
        auth_type: 'API_KEY',
      }
      const created = await callApi(`/projects/${effectiveProjectId}/connectors`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setConnectors([created, ...connectors])
      setSelectedConnector(created)
      setConnectorModalOpen(false)
      setSuccessMessage(`Connector '${created.name}' registered successfully!`)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to create connector')
    } finally {
      setBusy(false)
    }
  }

  const handleTestConnector = async () => {
    if (!selectedConnector) return
    setBusy(true)
    setErrorMessage('')
    setSuccessMessage('')

    try {
      const result = await callApi(`/connectors/${selectedConnector.id}/test`, {
        method: 'POST',
      })
      setSuccessMessage(`Connector test passed! Status: ${result.status} (${result.handshake_latency_ms}ms latency)`)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Handshake test failed')
    } finally {
      setBusy(false)
    }
  }

  const handleCreateTool = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!effectiveProjectId || !selectedConnector) return
    setBusy(true)
    setErrorMessage('')
    setSuccessMessage('')

    try {
      const payload = {
        connector_id: selectedConnector.id,
        name: newToolName,
        slug: newToolSlug || newToolName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        method: newToolMethod,
        endpoint_path: newToolPath,
        parameters_schema: { type: 'object' },
        response_schema: { type: 'object' },
        rate_limit_per_minute: 100,
        is_governed: true,
      }
      const created = await callApi(`/projects/${effectiveProjectId}/tools`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setTools([created, ...tools])
      setSelectedTool(created)
      setToolModalOpen(false)
      setSuccessMessage(`Tool '${created.name}' registered to marketplace!`)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to create tool')
    } finally {
      setBusy(false)
    }
  }

  const handleInvokeTool = async () => {
    if (!selectedTool) return
    setBusy(true)
    setErrorMessage('')
    setSuccessMessage('')

    try {
      let parsed = {}
      try {
        parsed = JSON.parse(toolArgumentsJson)
      } catch {
        throw new Error('Arguments must be valid JSON')
      }

      const res = await callApi(`/tools/${selectedTool.id}/invoke`, {
        method: 'POST',
        body: JSON.stringify({ arguments: parsed }),
      })
      setToolInvokeResult(res)
      setSuccessMessage(`Tool execution succeeded! (HTTP ${res.http_status} in ${res.latency_ms}ms)`)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Tool invocation failed')
    } finally {
      setBusy(false)
    }
  }

  const handleExportProject = async () => {
    if (!effectiveProjectId) return
    setBusy(true)
    setErrorMessage('')
    setSuccessMessage('')

    try {
      const bundle = await callApi(`/projects/${effectiveProjectId}/export`)
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `project-manifest-${effectiveProjectId.slice(0, 8)}.json`
      try {
        a.click()
      } catch {
        // Headless or test environment fallback
      }
      setSuccessMessage('Project manifest exported successfully!')
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setBusy(false)
    }
  }

  const handleCloneProject = async () => {
    if (!effectiveProjectId) return
    setBusy(true)
    setErrorMessage('')
    setSuccessMessage('')

    try {
      const clone = await callApi(`/projects/${effectiveProjectId}/clone`, {
        method: 'POST',
      })
      setSuccessMessage(`Project cloned successfully: '${clone.cloned_name}'!`)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Clone failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="integrations-studio-container" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)', minHeight: 600 }}>
      {/* Top Header */}
      <header className="glass" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderRadius: 14, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ display: 'grid', placeItems: 'center', width: 36, height: 36, borderRadius: 10, background: 'rgba(168, 85, 247, 0.2)', color: '#c084fc' }}>
            <Link2 size={20} />
          </span>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ fontSize: 17, margin: 0, fontWeight: 700 }}>Integration Registry & Tools</h2>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'rgba(168, 85, 247, 0.2)', color: '#e9d5ff', border: '1px solid rgba(168, 85, 247, 0.4)' }}>
                GOVERNED CONNECTORS & TOOLS
              </span>
            </div>
            {/* Tabs */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
              <div style={{ display: 'flex', gap: 4 }}>
                {(['Connectors', 'Tools', 'Credentials', 'Templates'] as const).map((tab) => (
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
                    {tab === 'Connectors' && `Connectors (${connectors.length})`}
                    {tab === 'Tools' && `Tool Registry (${tools.length})`}
                    {tab === 'Credentials' && `Vault Secrets (${credentials.length})`}
                    {tab === 'Templates' && `Packaging & Templates (${templates.length})`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {!propProjectId && projects.length > 0 && (
            <select
              aria-label="Target Project"
              value={selectedProjectId || ''}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc', padding: '6px 12px', borderRadius: 8, fontSize: 12 }}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id} style={{ background: '#0f172a' }}>
                  {p.name}
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            className="secondary-button"
            onClick={refreshAll}
            disabled={busy}
            style={{ fontSize: 12, padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <RefreshCw size={14} className={busy ? 'spin' : ''} /> Refresh
          </button>

          {activeTab === 'Connectors' && (
            <button
              type="button"
              className="primary-button"
              onClick={() => setConnectorModalOpen(true)}
              style={{ fontSize: 12, padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Plus size={14} /> New Connector
            </button>
          )}

          {activeTab === 'Tools' && (
            <button
              type="button"
              className="primary-button"
              onClick={() => setToolModalOpen(true)}
              disabled={connectors.length === 0}
              style={{ fontSize: 12, padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Plus size={14} /> Register Tool
            </button>
          )}

          {activeTab === 'Templates' && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="secondary-button"
                onClick={handleCloneProject}
                disabled={busy}
                style={{ fontSize: 12, padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Copy size={14} /> Clone Project
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={handleExportProject}
                disabled={busy}
                style={{ fontSize: 12, padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Download size={14} /> Export Manifest
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Feedback Messages */}
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

      {/* Main Split Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 14, flex: 1, minHeight: 0 }}>
        {/* Left Column */}
        <aside className="glass" style={{ padding: 14, borderRadius: 14, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {activeTab === 'Connectors' && (
            <>
              <h3 style={{ fontSize: 12, margin: 0, textTransform: 'uppercase', letterSpacing: 0.8, color: '#94a3b8' }}>
                Connectors ({connectors.length})
              </h3>
              {connectors.length === 0 ? (
                <div style={{ padding: '30px 10px', textAlign: 'center', color: '#64748b', fontSize: 12 }}>
                  No connectors configured. Click <strong>New Connector</strong> above.
                </div>
              ) : (
                connectors.map((conn) => {
                  const isSelected = selectedConnector?.id === conn.id
                  return (
                    <button
                      key={conn.id}
                      type="button"
                      onClick={() => setSelectedConnector(conn)}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                        padding: 12,
                        borderRadius: 10,
                        border: isSelected ? '1px solid #a855f7' : '1px solid rgba(255,255,255,0.06)',
                        background: isSelected ? 'rgba(168, 85, 247, 0.12)' : 'rgba(255,255,255,0.02)',
                        textAlign: 'left',
                        cursor: 'pointer',
                        color: '#f8fafc',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <strong style={{ fontSize: 13 }}>{conn.name}</strong>
                        <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'rgba(168, 85, 247, 0.2)', color: '#d8b4fe' }}>
                          {conn.connector_type}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: '#94a3b8', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                        {conn.base_url}
                      </div>
                    </button>
                  )
                })
              )}
            </>
          )}

          {activeTab === 'Tools' && (
            <>
              <h3 style={{ fontSize: 12, margin: 0, textTransform: 'uppercase', letterSpacing: 0.8, color: '#94a3b8' }}>
                Integration Tools ({tools.length})
              </h3>
              {tools.length === 0 ? (
                <div style={{ padding: '30px 10px', textAlign: 'center', color: '#64748b', fontSize: 12 }}>
                  No tools registered. Click <strong>Register Tool</strong> above.
                </div>
              ) : (
                tools.map((t) => {
                  const isSelected = selectedTool?.id === t.id
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelectedTool(t)}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                        padding: 12,
                        borderRadius: 10,
                        border: isSelected ? '1px solid #a855f7' : '1px solid rgba(255,255,255,0.06)',
                        background: isSelected ? 'rgba(168, 85, 247, 0.12)' : 'rgba(255,255,255,0.02)',
                        textAlign: 'left',
                        cursor: 'pointer',
                        color: '#f8fafc',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <strong style={{ fontSize: 13 }}>{t.name}</strong>
                        <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'rgba(59, 130, 246, 0.2)', color: '#93c5fd' }}>
                          {t.method}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>{t.endpoint_path}</div>
                    </button>
                  )
                })
              )}
            </>
          )}

          {activeTab === 'Credentials' && (
            <>
              <h3 style={{ fontSize: 12, margin: 0, textTransform: 'uppercase', letterSpacing: 0.8, color: '#94a3b8' }}>
                Secrets Vault References ({credentials.length})
              </h3>
              {credentials.map((c) => (
                <div key={c.id} style={{ padding: 10, borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <strong style={{ fontSize: 13 }}>{c.name}</strong>
                    <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: 'rgba(34, 197, 94, 0.2)', color: '#86efac' }}>
                      {c.environment}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{c.vault_provider} · {c.masked_preview}</div>
                </div>
              ))}
            </>
          )}

          {activeTab === 'Templates' && (
            <>
              <h3 style={{ fontSize: 12, margin: 0, textTransform: 'uppercase', letterSpacing: 0.8, color: '#94a3b8' }}>
                Marketplace Templates ({templates.length})
              </h3>
              {templates.map((tpl) => (
                <div key={tpl.id} style={{ padding: 10, borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <strong style={{ fontSize: 13 }}>{tpl.name}</strong>
                    <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: 'rgba(234, 179, 8, 0.2)', color: '#fde047' }}>
                      {tpl.category}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{tpl.slug}</div>
                </div>
              ))}
            </>
          )}
        </aside>

        {/* Right Detail Pane */}
        <main className="glass" style={{ padding: 18, borderRadius: 14, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {activeTab === 'Connectors' && (
            selectedConnector ? (
              <>
                <div style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 14, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div>
                    <h3 style={{ fontSize: 18, margin: 0, fontWeight: 700 }}>{selectedConnector.name}</h3>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                      Protocol: <strong>{selectedConnector.connector_type}</strong> · Auth: {selectedConnector.auth_type}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="primary-button"
                    onClick={handleTestConnector}
                    disabled={busy}
                    style={{ fontSize: 12, padding: '6px 14px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <CheckCircle2 size={13} /> Test Handshake
                  </button>
                </div>

                <div>
                  <h4 style={{ fontSize: 12, textTransform: 'uppercase', color: '#94a3b8', margin: '0 0 6px 0' }}>Base URL & Target</h4>
                  <pre style={{ margin: 0, padding: 12, borderRadius: 8, background: 'rgba(0,0,0,0.3)', fontSize: 12, color: '#cbd5e1' }}>
                    {selectedConnector.base_url}
                  </pre>
                </div>

                <div>
                  <h4 style={{ fontSize: 12, textTransform: 'uppercase', color: '#94a3b8', margin: '0 0 6px 0' }}>Default Headers Template</h4>
                  <pre style={{ margin: 0, padding: 12, borderRadius: 8, background: 'rgba(0,0,0,0.3)', fontSize: 12, color: '#4ade80' }}>
                    {JSON.stringify(selectedConnector.headers_template, null, 2)}
                  </pre>
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
                Select a connector from the sidebar to inspect or test.
              </div>
            )
          )}

          {activeTab === 'Tools' && (
            selectedTool ? (
              <>
                <div style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 14, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div>
                    <h3 style={{ fontSize: 18, margin: 0, fontWeight: 700 }}>{selectedTool.name}</h3>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                      Method: <strong>{selectedTool.method}</strong> · Path: <code>{selectedTool.endpoint_path}</code> · Governed: <strong>{selectedTool.is_governed ? 'Yes' : 'No'}</strong>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="primary-button"
                    onClick={handleInvokeTool}
                    disabled={busy}
                    style={{ fontSize: 12, padding: '6px 14px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <Play size={13} /> Execute Tool
                  </button>
                </div>

                <div>
                  <label htmlFor="tool-args-input" style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 6 }}>
                    Arguments Payload (JSON)
                  </label>
                  <textarea
                    id="tool-args-input"
                    rows={4}
                    value={toolArgumentsJson}
                    onChange={(e) => setToolArgumentsJson(e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box', padding: 10, borderRadius: 8, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc', fontSize: 12 }}
                  />
                </div>

                {toolInvokeResult && (
                  <div>
                    <h4 style={{ fontSize: 12, textTransform: 'uppercase', color: '#94a3b8', margin: '0 0 6px 0' }}>Execution Response Verdict</h4>
                    <pre style={{ margin: 0, padding: 14, borderRadius: 8, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(34, 197, 94, 0.2)', fontSize: 12, color: '#4ade80', maxHeight: 250, overflowY: 'auto' }}>
                      {JSON.stringify(toolInvokeResult, null, 2)}
                    </pre>
                  </div>
                )}
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
                Select a tool from the registry to invoke or review schemas.
              </div>
            )
          )}

          {activeTab === 'Credentials' && (
            <div>
              <h3 style={{ fontSize: 16, margin: '0 0 8px 0', fontWeight: 700 }}>Secrets Management & Identity Vaults</h3>
              <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 16px 0' }}>
                Secure external references to HashiCorp Vault, CyberArk Enterprise Vault, AWS Secrets Manager, and Azure Key Vault. Live values are resolved only inside isolated runtime workers.
              </p>
            </div>
          )}

          {activeTab === 'Templates' && (
            <div>
              <h3 style={{ fontSize: 16, margin: '0 0 8px 0', fontWeight: 700 }}>Project Packaging & Templates (WS-04)</h3>
              <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 16px 0' }}>
                Export whole automation projects as canonical packages, publish reusable solution templates, and clone projects with full dependency rebinding.
              </p>
            </div>
          )}
        </main>
      </div>

      {/* Create Connector Modal */}
      {connectorModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'grid', placeItems: 'center', zIndex: 100 }}>
          <div className="glass" style={{ width: 460, padding: 22, borderRadius: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Register New Connector</h3>
            <form onSubmit={handleCreateConnector} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label htmlFor="conn-name" style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8' }}>Connector Name</label>
                <input
                  id="conn-name"
                  required
                  value={newConnName}
                  onChange={(e) => setNewConnName(e.target.value)}
                  placeholder="e.g. Stripe Payments API"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 6, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc', fontSize: 12 }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 10 }}>
                <div>
                  <label htmlFor="conn-slug" style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8' }}>Identifier Slug</label>
                  <input
                    id="conn-slug"
                    value={newConnSlug}
                    onChange={(e) => setNewConnSlug(e.target.value)}
                    placeholder="stripe-payments"
                    style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 6, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc', fontSize: 12 }}
                  />
                </div>
                <div>
                  <label htmlFor="conn-type" style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8' }}>Type</label>
                  <select
                    id="conn-type"
                    value={newConnType}
                    onChange={(e) => setNewConnType(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 6, background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc', fontSize: 12 }}
                  >
                    <option value="REST">REST</option>
                    <option value="GRAPHQL">GraphQL</option>
                    <option value="DATABASE">Database</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="conn-url" style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8' }}>Base Endpoint URL</label>
                <input
                  id="conn-url"
                  required
                  value={newConnUrl}
                  onChange={(e) => setNewConnUrl(e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 6, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc', fontSize: 12 }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <button type="button" className="secondary-button" onClick={() => setConnectorModalOpen(false)} style={{ fontSize: 12, padding: '6px 14px' }}>
                  Cancel
                </button>
                <button type="submit" className="primary-button" disabled={busy} style={{ fontSize: 12, padding: '6px 14px' }}>
                  Create Connector
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Tool Modal */}
      {toolModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'grid', placeItems: 'center', zIndex: 100 }}>
          <div className="glass" style={{ width: 460, padding: 22, borderRadius: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Register Governed Tool</h3>
            <form onSubmit={handleCreateTool} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label htmlFor="tool-name" style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8' }}>Tool Name</label>
                <input
                  id="tool-name"
                  required
                  value={newToolName}
                  onChange={(e) => setNewToolName(e.target.value)}
                  placeholder="e.g. Create Charge"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 6, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc', fontSize: 12 }}
                />
              </div>

              <div>
                <label htmlFor="tool-slug" style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8' }}>Identifier Slug</label>
                <input
                  id="tool-slug"
                  value={newToolSlug}
                  onChange={(e) => setNewToolSlug(e.target.value)}
                  placeholder="create-charge"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 6, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc', fontSize: 12 }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 10 }}>
                <div>
                  <label htmlFor="tool-method" style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8' }}>Method</label>
                  <select
                    id="tool-method"
                    value={newToolMethod}
                    onChange={(e) => setNewToolMethod(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 6, background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc', fontSize: 12 }}
                  >
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="DELETE">DELETE</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="tool-path" style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8' }}>Endpoint Path</label>
                  <input
                    id="tool-path"
                    required
                    value={newToolPath}
                    onChange={(e) => setNewToolPath(e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 6, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc', fontSize: 12 }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <button type="button" className="secondary-button" onClick={() => setToolModalOpen(false)} style={{ fontSize: 12, padding: '6px 14px' }}>
                  Cancel
                </button>
                <button type="submit" className="primary-button" disabled={busy} style={{ fontSize: 12, padding: '6px 14px' }}>
                  Register Tool
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
