import { useState, useEffect, useCallback } from 'react'
import {
  Settings2,
  Boxes,
  Building,
  RefreshCw,
  GitBranch,
  FolderTree,
  AlertCircle,
  Copy,
  Plus,
  Layers,
} from 'lucide-react'

export interface ProjectTemplateItem {
  id: string
  name: string
  description?: string
  category: string
  template_manifest: Record<string, unknown>
  created_at: string
}

export interface OrgSettings {
  organization_id: string
  folder_hierarchy_strategy: string
  strategy_editable: boolean
}

interface AdminConsoleProps {
  token: string
  tenant: string
  projectId?: string
}

export default function AdminConsole({ token, tenant }: AdminConsoleProps) {
  const [tab, setTab] = useState<'templates' | 'org_settings'>('templates')
  const [templates, setTemplates] = useState<ProjectTemplateItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // New Template modal
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [templateCategory, setTemplateCategory] = useState('INTELLIGENT_AUTOMATION')
  const [templateDesc, setTemplateDesc] = useState('')

  useEffect(() => {
    if (!token || !tenant) return
    let cancelled = false
    fetch(`/api/v1/tenants/${tenant}/workspace/project-templates`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to load templates`)
        return res.json()
      })
      .then(data => {
        if (!cancelled) {
          setTemplates(Array.isArray(data) ? data : [])
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
      const res = await fetch(`/api/v1/tenants/${tenant}/workspace/project-templates`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to load templates`)
      const data = await res.json()
      setTemplates(Array.isArray(data) ? data : [])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [token, tenant])

  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!templateName.trim()) return
    setError('')
    try {
      const res = await fetch(`/api/v1/tenants/${tenant}/workspace/project-templates`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: templateName.trim(),
          category: templateCategory,
          description: templateDesc.trim(),
          template_manifest: {
            version: '1.0.0',
            workflows: [],
            rules: [],
            agents: [],
          },
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to create template`)
      const created = await res.json()
      setTemplates(prev => [created, ...prev])
      setShowTemplateModal(false)
      setTemplateName('')
      setTemplateDesc('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="admin-console p-6 space-y-6" data-testid="admin-console">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/50 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
              <Settings2 size={24} />
            </span>
            <h1 className="text-2xl font-bold tracking-tight">Enterprise Administration & Setup</h1>
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            Manage organization folder strategies, environment definitions, and solution template catalogs.
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
            onClick={() => setShowTemplateModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
          >
            <Plus size={15} />
            Create Template
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2 text-red-400 text-sm" role="alert">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-border/40 gap-6 text-sm font-medium">
        <button
          onClick={() => setTab('templates')}
          className={`pb-2 border-b-2 flex items-center gap-2 ${tab === 'templates' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          <Boxes size={15} />
          Solution Templates ({templates.length})
        </button>
        <button
          onClick={() => setTab('org_settings')}
          className={`pb-2 border-b-2 flex items-center gap-2 ${tab === 'org_settings' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          <Building size={15} />
          Architecture & Environment Governance
        </button>
      </div>

      {tab === 'templates' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4" data-testid="templates-grid">
            {templates.length === 0 ? (
              <div className="col-span-3 p-12 text-center border border-dashed border-border rounded-xl text-muted-foreground">
                No solution templates registered in catalog. Create a template to accelerate project scaffolding.
              </div>
            ) : (
              templates.map(tmpl => (
                <div key={tmpl.id} className="p-5 rounded-xl border border-border bg-card/30 hover:border-primary/50 transition-colors space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="p-2 rounded-lg bg-primary/10 text-primary">
                      <Layers size={18} />
                    </span>
                    <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-muted uppercase tracking-wider text-muted-foreground">
                      {tmpl.category}
                    </span>
                  </div>
                  <div>
                    <h3 className="font-bold text-base">{tmpl.name}</h3>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {tmpl.description || 'Pre-packaged enterprise automation bundle.'}
                    </p>
                  </div>
                  <div className="pt-2 border-t border-border/40 flex items-center justify-between text-xs text-muted-foreground">
                    <span>Created {new Date(tmpl.created_at).toLocaleDateString()}</span>
                    <span className="flex items-center gap-1 font-mono text-[10px] text-primary">
                      <Copy size={12} /> ID: {tmpl.id.slice(0, 8)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {tab === 'org_settings' && (
        <div className="space-y-4">
          <div className="p-6 rounded-xl border border-border bg-card/30 space-y-4">
            <h3 className="font-bold text-base flex items-center gap-2">
              <FolderTree size={18} className="text-primary" />
              Folder Hierarchy & Environment Strategies
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              ArchitectIQ supports dual folder hierarchy strategies for enterprise organizations:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="p-4 rounded-lg border border-border/60 bg-muted/20 space-y-2">
                <span className="font-semibold text-foreground flex items-center gap-1.5">
                  <GitBranch size={15} className="text-blue-400" />
                  Strategy 1: Projects Contain Environments
                </span>
                <p className="text-xs text-muted-foreground">
                  Individual projects own bindings across DEV, TEST, UAT, and PROD.
                  Promotions transition workflow definitions and environment variable bindings atomically between tiers.
                </p>
              </div>
              <div className="p-4 rounded-lg border border-border/60 bg-muted/20 space-y-2">
                <span className="font-semibold text-foreground flex items-center gap-1.5">
                  <Building size={15} className="text-emerald-400" />
                  Strategy 2: Environments Contain Folders
                </span>
                <p className="text-xs text-muted-foreground">
                  Environments serve as the top-level architectural boundary within an organization,
                  isolating folder trees and production permissions completely.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: New Template */}
      {showTemplateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border/50 pb-3">
              <h3 className="font-bold text-base flex items-center gap-2">
                <Boxes size={18} className="text-primary" />
                Register Solution Template
              </h3>
              <button onClick={() => setShowTemplateModal(false)} className="text-muted-foreground hover:text-foreground text-sm">
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateTemplate} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Template Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Accounts Payable Invoice Automation"
                  value={templateName}
                  onChange={e => setTemplateName(e.target.value)}
                  className="w-full px-3 py-2 rounded-md bg-muted/50 border border-border text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Category</label>
                <select
                  value={templateCategory}
                  onChange={e => setTemplateCategory(e.target.value)}
                  className="w-full px-3 py-2 rounded-md bg-muted/50 border border-border text-sm"
                >
                  <option value="INTELLIGENT_AUTOMATION">Intelligent Automation</option>
                  <option value="DOCUMENT_PROCESSING">Document AI Processing</option>
                  <option value="FINANCIAL_RECONCILIATION">Financial Reconciliation</option>
                  <option value="CUSTOMER_OPERATIONS">Customer Operations</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Description</label>
                <textarea
                  rows={3}
                  placeholder="Summary of flows, rules, and connectors packaged in this template..."
                  value={templateDesc}
                  onChange={e => setTemplateDesc(e.target.value)}
                  className="w-full px-3 py-2 rounded-md bg-muted/50 border border-border text-sm"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-border/40">
                <button
                  type="button"
                  onClick={() => setShowTemplateModal(false)}
                  className="px-4 py-2 rounded-md border border-border text-sm hover:bg-muted/50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
                >
                  Save Template
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
