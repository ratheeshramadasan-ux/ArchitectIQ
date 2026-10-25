import { useState, useEffect, useCallback } from 'react'
import {
  FileText,
  Filter,
  RefreshCw,
  Clock,
  User,
  AlertCircle,
  Database,
  Search,
} from 'lucide-react'

export interface ActivityRecord {
  id: string
  resource_kind: string
  resource_id: string
  operation: string
  actor_id: string | null
  happened_at: string
  old_values: Record<string, unknown> | null
  new_values: Record<string, unknown> | null
}

interface ActivityAuditViewerProps {
  token: string
  tenant: string
  projectId?: string
}

export default function ActivityAuditViewer({ token, tenant }: ActivityAuditViewerProps) {
  const [activities, setActivities] = useState<ActivityRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [filterKind, setFilterKind] = useState<string>('')
  const [searchId, setSearchId] = useState<string>('')
  const [limit, setLimit] = useState(50)

  useEffect(() => {
    if (!token || !tenant) return
    let cancelled = false
    let url = `/api/v1/tenants/${tenant}/workspace/activity?limit=${limit}`
    if (filterKind) url += `&resource_kind=${encodeURIComponent(filterKind)}`
    if (searchId) url += `&resource_id=${encodeURIComponent(searchId)}`

    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(async res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to load activity logs`)
        return res.json()
      })
      .then(data => {
        if (!cancelled) {
          setActivities(Array.isArray(data) ? data : [])
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
  }, [token, tenant, filterKind, searchId, limit])

  const handleRefresh = useCallback(async () => {
    if (!token || !tenant) return
    setLoading(true)
    setError('')
    try {
      let url = `/api/v1/tenants/${tenant}/workspace/activity?limit=${limit}`
      if (filterKind) url += `&resource_kind=${encodeURIComponent(filterKind)}`
      if (searchId) url += `&resource_id=${encodeURIComponent(searchId)}`

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to load activity logs`)
      const data = await res.json()
      setActivities(Array.isArray(data) ? data : [])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [token, tenant, filterKind, searchId, limit])

  return (
    <div className="activity-audit-viewer p-6 space-y-6" data-testid="activity-audit-viewer">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/50 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
              <FileText size={24} />
            </span>
            <h1 className="text-2xl font-bold tracking-tight">Activity & Audit Logs</h1>
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            Immutable, tenant-scoped audit trail recording all structural creations, updates, moves, and deletions.
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-sm hover:bg-muted/50 disabled:opacity-50 self-start md:self-auto"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh Log
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="p-4 rounded-xl border border-border/60 bg-muted/20 flex flex-wrap items-center gap-4 text-sm">
        <div className="flex items-center gap-2">
          <Filter size={15} className="text-muted-foreground" />
          <span className="font-semibold text-xs uppercase text-muted-foreground">Resource Type:</span>
          <select
            value={filterKind}
            onChange={e => setFilterKind(e.target.value)}
            className="px-2.5 py-1 rounded-md bg-muted/60 border border-border text-xs"
          >
            <option value="">All Resources</option>
            <option value="organization">Organization</option>
            <option value="folder">Folder</option>
            <option value="project">Project</option>
            <option value="environment">Environment</option>
          </select>
        </div>

        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <Search size={15} className="text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by UUID..."
            value={searchId}
            onChange={e => setSearchId(e.target.value)}
            className="w-full px-2.5 py-1 rounded-md bg-muted/60 border border-border text-xs"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Limit:</span>
          <select
            value={limit}
            onChange={e => setLimit(Number(e.target.value))}
            className="px-2 py-1 rounded-md bg-muted/60 border border-border text-xs"
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2 text-red-400 text-sm" role="alert">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Log Entries */}
      <div className="space-y-3" data-testid="activity-records-list">
        {activities.length === 0 ? (
          <div className="p-12 text-center border border-dashed border-border rounded-xl text-muted-foreground">
            No activity records match the selected criteria.
          </div>
        ) : (
          activities.map(record => (
            <div
              key={record.id}
              className="p-4 rounded-xl border border-border bg-card/30 hover:bg-card/50 transition-colors space-y-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 font-mono">
                  <span className={`px-2 py-0.5 rounded font-bold uppercase ${
                    record.operation === 'INSERT'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                      : record.operation === 'UPDATE'
                      ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
                      : 'bg-red-500/10 text-red-400 border border-red-500/30'
                  }`}>
                    {record.operation}
                  </span>
                  <span className="font-semibold text-foreground flex items-center gap-1">
                    <Database size={13} className="text-primary/70" />
                    {record.resource_kind}
                  </span>
                  <span className="text-muted-foreground">{record.resource_id}</span>
                </div>
                <div className="flex items-center gap-3 text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <User size={13} />
                    {record.actor_id ? record.actor_id.slice(0, 8) : 'system'}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock size={13} />
                    {new Date(record.happened_at).toLocaleString()}
                  </span>
                </div>
              </div>

              {(record.old_values || record.new_values) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-2 border-t border-border/30 text-xs font-mono">
                  {record.old_values && (
                    <div className="p-2 rounded bg-muted/30 border border-border/40">
                      <span className="text-muted-foreground block text-[10px] uppercase font-bold mb-1">Previous Values</span>
                      <pre className="overflow-x-auto whitespace-pre-wrap text-muted-foreground">
                        {JSON.stringify(record.old_values, null, 2)}
                      </pre>
                    </div>
                  )}
                  {record.new_values && (
                    <div className="p-2 rounded bg-muted/30 border border-border/40">
                      <span className="text-emerald-400 block text-[10px] uppercase font-bold mb-1">New Values</span>
                      <pre className="overflow-x-auto whitespace-pre-wrap text-emerald-300">
                        {JSON.stringify(record.new_values, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
