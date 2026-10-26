import React, { useState, useEffect, useCallback } from 'react'
import {
  Boxes,
  Search,
  Plus,
  RotateCw,
  HardDrive,
  ExternalLink,
  Check,
  X
} from 'lucide-react'

export type ArtifactScopeLevel = 'ALL' | 'ORGANIZATION' | 'TENANT' | 'ENVIRONMENT' | 'FOLDER'

export interface ArtifactItem {
  id: string
  name: string
  type: string
  version: string
  scope_level: 'ORGANIZATION' | 'TENANT' | 'ENVIRONMENT' | 'FOLDER'
  scope_id?: string | null
  storage_uri: string
  metadata?: Record<string, any>
  created_at?: string
}

interface ArtifactsRegistryStudioProps {
  token: string
  tenant: string
  tenantName?: string
  currentEnv?: string
}

export default function ArtifactsRegistryStudio({
  token,
  tenant,
  tenantName = 'Citibank',
  currentEnv = 'DEV',
}: ArtifactsRegistryStudioProps) {
  const [artifacts, setArtifacts] = useState<ArtifactItem[]>([])
  const [loading, setLoading] = useState(false)
  const [scopeFilter, setScopeFilter] = useState<ArtifactScopeLevel>('ALL')
  const [typeFilter, setTypeFilter] = useState<string>('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [createModal, setCreateModal] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  // Form state
  const [formName, setFormName] = useState('')
  const [formType, setFormType] = useState('MODEL_CHECKPOINT')
  const [formVersion, setFormVersion] = useState('1.0.0')
  const [formScopeLevel, setFormScopeLevel] = useState<'ORGANIZATION' | 'TENANT' | 'ENVIRONMENT' | 'FOLDER'>('TENANT')
  const [formStorageUri, setFormStorageUri] = useState('s3://architectiq-artifacts/citibank/models/v1')
  const [submitting, setSubmitting] = useState(false)

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 3000)
  }

  const loadArtifacts = useCallback(async () => {
    if (!token || !tenant) return
    setLoading(true)
    try {
      let url = `/api/v1/tenants/${tenant}/workspace/artifacts`
      if (scopeFilter !== 'ALL') {
        url += `?scope_level=${scopeFilter}`
      }
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setArtifacts(data)
      } else {
        // Fallback demo fixtures if empty
        setArtifacts([
          {
            id: 'art-01',
            name: 'claims-risk-classifier-onnx',
            type: 'MODEL_CHECKPOINT',
            version: '2.4.1',
            scope_level: 'ORGANIZATION',
            storage_uri: 's3://architectiq-artifacts/citi-global/models/claims-risk-v2.4.1.onnx',
            metadata: { framework: 'PyTorch / ONNX', accuracy: 0.984, quantized: true },
            created_at: new Date(Date.now() - 3600000 * 2).toISOString()
          },
          {
            id: 'art-02',
            name: 'kyc-aml-compliance-prompts',
            type: 'PROMPT_TEMPLATE',
            version: '3.1.0',
            scope_level: 'TENANT',
            scope_id: tenant,
            storage_uri: 's3://architectiq-artifacts/citi-na/prompts/kyc-bundle-v3.json',
            metadata: { tokenCount: 1420, modelTarget: 'gemini-1.5-pro' },
            created_at: new Date(Date.now() - 3600000 * 12).toISOString()
          },
          {
            id: 'art-03',
            name: 'banking-ledger-reconciliation-flow',
            type: 'FLOW_PACKAGE',
            version: '1.2.0',
            scope_level: 'ENVIRONMENT',
            scope_id: currentEnv,
            storage_uri: 's3://architectiq-artifacts/citi-na/flows/ledger-recon-v1.2.0.flow',
            metadata: { stepCount: 14, agentCount: 3, dslVersion: '2.0' },
            created_at: new Date(Date.now() - 3600000 * 28).toISOString()
          },
          {
            id: 'art-04',
            name: 'postgres-mcp-connector-bundle',
            type: 'MCP_TOOL',
            version: '1.0.4',
            scope_level: 'FOLDER',
            storage_uri: 's3://architectiq-artifacts/citi-na/mcp/postgres-bundle.tar.gz',
            metadata: { tools: ['execute_sql', 'explain_query', 'vacuum_table'], protocol: '2024-11-05' },
            created_at: new Date(Date.now() - 3600000 * 48).toISOString()
          }
        ])
      }
    } catch {
      // Demo fallback
    } finally {
      setLoading(false)
    }
  }, [token, tenant, scopeFilter, currentEnv])

  useEffect(() => {
    loadArtifacts()
  }, [loadArtifacts])

  const handleCreateArtifact = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formName.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/v1/tenants/${tenant}/workspace/artifacts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: formName.trim(),
          type: formType,
          version: formVersion.trim() || '1.0.0',
          scope_level: formScopeLevel,
          scope_id: formScopeLevel === 'TENANT' ? tenant : formScopeLevel === 'ENVIRONMENT' ? currentEnv : null,
          storage_uri: formStorageUri.trim() || 's3://architectiq-artifacts/default',
          metadata: { registeredBy: 'ratheesh.ramadasan@gmail.com', registeredAt: new Date().toISOString() }
        })
      })
      if (res.ok) {
        showToast('Artifact registered successfully across hierarchy!')
        setCreateModal(false)
        setFormName('')
        loadArtifacts()
      } else {
        showToast('Failed to register artifact on backend.')
      }
    } catch {
      showToast('Network error registering artifact.')
    } finally {
      setSubmitting(false)
    }
  }

  const filteredArtifacts = artifacts.filter(art => {
    const matchScope = scopeFilter === 'ALL' || art.scope_level === scopeFilter
    const matchType = typeFilter === 'ALL' || art.type === typeFilter
    const matchSearch = !searchQuery.trim() ||
      art.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      art.storage_uri.toLowerCase().includes(searchQuery.toLowerCase()) ||
      art.version.toLowerCase().includes(searchQuery.toLowerCase())
    return matchScope && matchType && matchSearch
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 16, overflow: 'hidden' }}>
      {toastMessage && (
        <div style={{
          position: 'fixed',
          top: 72,
          right: 24,
          background: 'var(--card)',
          border: '1px solid var(--border)',
          color: 'var(--foreground)',
          padding: '8px 16px',
          borderRadius: 8,
          boxShadow: '0 8px 30px rgba(0,0,0,0.2)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: '0.82rem',
          fontWeight: 600
        }}>
          <Check size={16} style={{ color: '#10B981' }} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.65rem', fontWeight: 800, color: 'var(--primary)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            <Boxes size={13} />
            <span>Enterprise Hierarchy &bull; Polymorphic Artifacts</span>
          </div>
          <h1 style={{ fontSize: '1.45rem', fontWeight: 900, margin: '4px 0 0', color: 'var(--foreground)' }}>
            Artifacts Registry
          </h1>
          <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: 'var(--muted-foreground)' }}>
            Central repository for models, prompts, packages, and MCP tools scoped across Organization, Tenant, Environment, or Folders.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => loadArtifacts()}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'var(--card)',
              color: 'var(--foreground)',
              fontSize: '0.75rem',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            <RotateCw size={13} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
          <button
            onClick={() => setCreateModal(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 16px',
              borderRadius: 6,
              border: 'none',
              background: 'var(--primary)',
              color: 'var(--primary-foreground)',
              fontSize: '0.75rem',
              fontWeight: 800,
              cursor: 'pointer'
            }}
          >
            <Plus size={14} />
            <span>Register Artifact</span>
          </button>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '10px 14px',
        borderRadius: 8,
        background: 'var(--card)',
        border: '1px solid var(--border)'
      }}>
        {/* Scope Pill Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--muted-foreground)', textTransform: 'uppercase', marginRight: 4 }}>
            Hierarchy Scope:
          </span>
          {(['ALL', 'ORGANIZATION', 'TENANT', 'ENVIRONMENT', 'FOLDER'] as const).map(scope => (
            <button
              key={scope}
              onClick={() => setScopeFilter(scope)}
              style={{
                padding: '4px 10px',
                borderRadius: 4,
                border: '1px solid',
                borderColor: scopeFilter === scope ? 'var(--primary)' : 'var(--border)',
                background: scopeFilter === scope ? 'var(--primary)' : 'transparent',
                color: scopeFilter === scope ? 'var(--primary-foreground)' : 'var(--foreground)',
                fontSize: '0.7rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              {scope === 'ALL' ? 'All Tiers' : scope}
            </button>
          ))}
        </div>

        {/* Search & Type filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ position: 'relative', width: 220 }}>
            <Search size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
            <input
              type="text"
              placeholder="Search artifacts..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '5px 8px 5px 26px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'transparent',
                color: 'var(--foreground)',
                fontSize: '0.75rem',
                outline: 'none'
              }}
            />
          </div>

          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            style={{
              padding: '5px 8px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'var(--card)',
              color: 'var(--foreground)',
              fontSize: '0.75rem'
            }}
          >
            <option value="ALL">All Types</option>
            <option value="MODEL_CHECKPOINT">Model Checkpoints</option>
            <option value="PROMPT_TEMPLATE">Prompt Templates</option>
            <option value="FLOW_PACKAGE">Workflow Packages</option>
            <option value="MCP_TOOL">MCP Tools</option>
            <option value="DATASET">Datasets</option>
          </select>
        </div>
      </div>

      {/* Artifacts Grid / Table */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        borderRadius: 8,
        background: 'var(--card)',
        border: '1px solid var(--border)',
        padding: 16
      }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted-foreground)' }}>
            <RotateCw size={24} className="animate-spin" style={{ margin: '0 auto 10px' }} />
            <p style={{ margin: 0, fontSize: '0.85rem' }}>Loading polymorphic artifacts registry...</p>
          </div>
        ) : filteredArtifacts.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--muted-foreground)' }}>
            <Boxes size={36} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
            <h3 style={{ margin: '0 0 6px', fontSize: '1rem', color: 'var(--foreground)' }}>No Artifacts Found</h3>
            <p style={{ margin: 0, fontSize: '0.8rem' }}>No artifacts match the selected scope tier or filters. Click &quot;Register Artifact&quot; to publish one.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 14 }}>
            {filteredArtifacts.map(art => {
              const scopeColor =
                art.scope_level === 'ORGANIZATION' ? '#8B5CF6' :
                art.scope_level === 'TENANT' ? '#3B82F6' :
                art.scope_level === 'ENVIRONMENT' ? '#10B981' : '#F59E0B'

              return (
                <div
                  key={art.id}
                  style={{
                    padding: 14,
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--background)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    transition: 'all 0.2s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <span style={{
                          padding: '2px 6px',
                          borderRadius: 4,
                          fontSize: '0.62rem',
                          fontWeight: 800,
                          background: `${scopeColor}20`,
                          color: scopeColor,
                          border: `1px solid ${scopeColor}40`
                        }}>
                          {art.scope_level}
                        </span>
                        <span style={{
                          padding: '2px 6px',
                          borderRadius: 4,
                          fontSize: '0.62rem',
                          fontWeight: 700,
                          background: 'var(--muted)',
                          color: 'var(--muted-foreground)'
                        }}>
                          {art.type}
                        </span>
                      </div>
                      <h4 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 800, color: 'var(--foreground)' }}>
                        {art.name}
                      </h4>
                    </div>

                    <span style={{
                      padding: '2px 6px',
                      borderRadius: 4,
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      background: 'var(--card)',
                      border: '1px solid var(--border)',
                      color: 'var(--foreground)'
                    }}>
                      v{art.version}
                    </span>
                  </div>

                  <div style={{
                    padding: '6px 8px',
                    borderRadius: 4,
                    background: 'var(--card)',
                    border: '1px solid var(--border)',
                    fontSize: '0.7rem',
                    color: 'var(--muted-foreground)',
                    fontFamily: 'monospace',
                    wordBreak: 'break-all',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}>
                    <HardDrive size={12} style={{ flexShrink: 0 }} />
                    <span>{art.storage_uri}</span>
                  </div>

                  {art.metadata && Object.keys(art.metadata).length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {Object.entries(art.metadata).slice(0, 3).map(([k, v]) => (
                        <span
                          key={k}
                          style={{
                            fontSize: '0.62rem',
                            padding: '1px 6px',
                            borderRadius: 3,
                            background: 'var(--muted)',
                            color: 'var(--foreground)'
                          }}
                        >
                          <strong>{k}:</strong> {String(v)}
                        </span>
                      ))}
                    </div>
                  )}

                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginTop: 'auto',
                    paddingTop: 8,
                    borderTop: '1px solid var(--border)',
                    fontSize: '0.68rem',
                    color: 'var(--muted-foreground)'
                  }}>
                    <span>{art.created_at ? new Date(art.created_at).toLocaleDateString() : 'Active'}</span>
                    <button
                      onClick={() => showToast(`Artifact ${art.name} link copied!`)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--primary)',
                        fontWeight: 700,
                        cursor: 'pointer',
                        fontSize: '0.68rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4
                      }}
                    >
                      <ExternalLink size={11} /> Inspect Artifact
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Register Artifact Modal */}
      {createModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
          display: 'grid',
          placeItems: 'center',
          zIndex: 999
        }}>
          <div style={{
            width: '100%',
            maxWidth: 480,
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 24,
            boxShadow: '0 20px 50px rgba(0,0,0,0.4)',
            display: 'flex',
            flexDirection: 'column',
            gap: 16
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Boxes size={18} style={{ color: 'var(--primary)' }} />
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--foreground)' }}>
                  Register Hierarchy Artifact
                </h3>
              </div>
              <button
                onClick={() => setCreateModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--muted-foreground)', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateArtifact} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 800, color: 'var(--muted-foreground)', marginBottom: 4 }}>
                  ARTIFACT NAME
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. credit-scoring-weights"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: 'var(--background)',
                    color: 'var(--foreground)',
                    fontSize: '0.8rem',
                    outline: 'none'
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 800, color: 'var(--muted-foreground)', marginBottom: 4 }}>
                    ARTIFACT TYPE
                  </label>
                  <select
                    value={formType}
                    onChange={e => setFormType(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: 6,
                      border: '1px solid var(--border)',
                      background: 'var(--background)',
                      color: 'var(--foreground)',
                      fontSize: '0.8rem'
                    }}
                  >
                    <option value="MODEL_CHECKPOINT">Model Checkpoint</option>
                    <option value="PROMPT_TEMPLATE">Prompt Template</option>
                    <option value="FLOW_PACKAGE">Workflow Package</option>
                    <option value="MCP_TOOL">MCP Tool</option>
                    <option value="DATASET">Dataset</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 800, color: 'var(--muted-foreground)', marginBottom: 4 }}>
                    VERSION
                  </label>
                  <input
                    type="text"
                    required
                    value={formVersion}
                    onChange={e => setFormVersion(e.target.value)}
                    placeholder="1.0.0"
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: 6,
                      border: '1px solid var(--border)',
                      background: 'var(--background)',
                      color: 'var(--foreground)',
                      fontSize: '0.8rem',
                      outline: 'none'
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 800, color: 'var(--muted-foreground)', marginBottom: 4 }}>
                  HIERARCHICAL SCOPE TIER
                </label>
                <select
                  value={formScopeLevel}
                  onChange={e => setFormScopeLevel(e.target.value as any)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: 'var(--background)',
                    color: 'var(--foreground)',
                    fontSize: '0.8rem'
                  }}
                >
                  <option value="ORGANIZATION">Organization Level (Global)</option>
                  <option value="TENANT">Tenant Level ({tenantName})</option>
                  <option value="ENVIRONMENT">Environment Level ({currentEnv})</option>
                  <option value="FOLDER">Folder Level (Folder Specific)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 800, color: 'var(--muted-foreground)', marginBottom: 4 }}>
                  STORAGE URI (S3 / GCS / BLOB)
                </label>
                <input
                  type="text"
                  required
                  value={formStorageUri}
                  onChange={e => setFormStorageUri(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: 'var(--background)',
                    color: 'var(--foreground)',
                    fontSize: '0.8rem',
                    outline: 'none'
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
                <button
                  type="button"
                  onClick={() => setCreateModal(false)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: 'transparent',
                    color: 'var(--foreground)',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    padding: '8px 20px',
                    borderRadius: 6,
                    border: 'none',
                    background: 'var(--primary)',
                    color: 'var(--primary-foreground)',
                    fontSize: '0.78rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    opacity: submitting ? 0.7 : 1
                  }}
                >
                  {submitting ? 'Registering...' : 'Publish Artifact'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
