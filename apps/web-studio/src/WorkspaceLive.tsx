import { useCallback, useEffect, useState } from 'react'
import {
  Activity,
  Archive,
  Building2,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderPlus,
  Layers3,
  LockKeyhole,
  Play,
  RefreshCw,
  RotateCcw,
  Server,
  Settings2,
  ShieldCheck,
  Tag,
  Timer,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react'

type Node = {
  id: string
  name: string
  kind: 'org' | 'folder' | 'project' | 'environment'
  lifecycle_status?: 'ACTIVE' | 'ARCHIVED' | 'SUSPENDED'
  criticality?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  data_classification?: 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED'
  children: Node[]
}
type AuditEvent = {
  id: string
  resource_kind: string
  resource_id: string
  operation: string
  actor_id: string | null
  happened_at: string
  old_values: Record<string, unknown> | null
  new_values: Record<string, unknown> | null
}
type Counts = {
  organizations: number
  folders: number
  projects: number
  active_projects?: number
  archived_projects?: number
  environments: number
}

type ProjectMetadata = {
  id: string
  name: string
  folder_id: string
  lifecycle_status: 'ACTIVE' | 'ARCHIVED' | 'SUSPENDED'
  description: string | null
  tags: string[]
  criticality: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  data_classification: 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED'
  cost_center: string | null
  archived_at: string | null
  archived_by: string | null
  created_at: string | null
}

type ProjectMember = {
  id: string
  project_id: string
  user_id: string
  display_name: string
  role: 'OWNER' | 'ADMIN' | 'EDITOR' | 'VIEWER'
  created_at: string
  granted_by: string | null
}

type ProjectPermissions = {
  can_view: boolean
  can_edit: boolean
  can_manage_members: boolean
  can_delete: boolean
}

const endpoint = '/api/v1/tenants'

export default function WorkspaceLive({
  token,
  tenant,
  tenantName,
  onUnauthorized,
  onChanged,
  view = 'Explorer',
}: {
  token: string
  tenant: string
  tenantName: string
  onUnauthorized: () => void
  onChanged: () => void
  view?: string
}) {
  const [resourceTab, setResourceTab] = useState<'Overview' | 'Activity' | 'Access' | 'Jobs' | 'Triggers' | 'Settings'>('Overview')
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditError, setAuditError] = useState('')
  const [auditLimit, setAuditLimit] = useState(25)
  const [auditOperation, setAuditOperation] = useState('ALL')
  const [auditRefresh, setAuditRefresh] = useState(0)

  // Access management state
  const [members, setMembers] = useState<ProjectMember[]>([])
  const [userPermissions, setUserPermissions] = useState<ProjectPermissions | null>(null)
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null)
  const [accessLoading, setAccessLoading] = useState(false)
  const [accessError, setAccessError] = useState('')
  const [accessRefresh, setAccessRefresh] = useState(0)
  const [newMemberId, setNewMemberId] = useState('')
  const [newMemberRole, setNewMemberRole] = useState<'OWNER' | 'ADMIN' | 'EDITOR' | 'VIEWER'>('VIEWER')

  // Project lifecycle and metadata state
  const [projectMeta, setProjectMeta] = useState<ProjectMetadata | null>(null)
  const [metaLoading, setMetaLoading] = useState(false)
  const [metaError, setMetaError] = useState('')
  const [metaRefresh, setMetaRefresh] = useState(0)
  const [showArchived, setShowArchived] = useState(false)
  const [metaDesc, setMetaDesc] = useState('')
  const [metaTags, setMetaTags] = useState('')
  const [metaCriticality, setMetaCriticality] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>('MEDIUM')
  const [metaDataClass, setMetaDataClass] = useState<'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED'>('INTERNAL')
  const [metaCostCenter, setMetaCostCenter] = useState('')

  const [tree, setTree] = useState<Node[]>([])
  const [counts, setCounts] = useState<Counts | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Node | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [newName, setNewName] = useState('')
  const [slug, setSlug] = useState('')
  const [renameName, setRenameName] = useState('')
  const [moveTarget, setMoveTarget] = useState('')
  const [dragged, setDragged] = useState<Node | null>(null)
  const [kind, setKind] = useState<'organization' | 'folder' | 'project' | 'environment'>('organization')

  const base = `${endpoint}/${tenant}/workspace`

  const call = useCallback(
    async (path: string, init?: RequestInit) => {
      const res = await fetch(`${base}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...init?.headers,
        },
      })
      if (res.status === 401) onUnauthorized()
      if (!res.ok) throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 250)}`)
      if (res.status === 204) return null
      return res.json()
    },
    [base, token, onUnauthorized]
  )

  const refresh = useCallback(async () => {
    if (!tenant || !token) return
    setBusy(true)
    setError('')
    try {
      const [t, s] = await Promise.all([
        call(showArchived ? '/tree?include_archived=true' : '/tree'),
        call('/summary'),
      ])
      setTree(t)
      setCounts(s)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection failed')
    } finally {
      setBusy(false)
    }
  }, [call, tenant, token, showArchived])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [refresh])

  const selectedId = selected?.id
  const selectedKind = selected?.kind

  // Audit activity loader
  useEffect(() => {
    if (resourceTab !== 'Activity' || !selectedId || !selectedKind || !tenant || !token) return
    let cancelled = false
    const load = async () => {
      setAuditLoading(true)
      setAuditError('')
      try {
        const kind = selectedKind === 'org' ? 'organization' : selectedKind
        const params = new URLSearchParams({
          resource_kind: kind,
          resource_id: selectedId,
          limit: String(auditLimit),
        })
        const data: AuditEvent[] = await call(`/activity?${params}`)
        if (!cancelled) setEvents(data)
      } catch (e) {
        if (!cancelled) {
          setEvents([])
          setAuditError(e instanceof Error ? e.message : 'Unable to retrieve activity')
        }
      } finally {
        if (!cancelled) setAuditLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [resourceTab, selectedId, selectedKind, tenant, token, auditLimit, auditRefresh, call])

  // Project access loader
  useEffect(() => {
    if (resourceTab !== 'Access' || selectedKind !== 'project' || !selectedId || !token || !tenant) return
    let cancelled = false
    const load = async () => {
      setAccessLoading(true)
      setAccessError('')
      try {
        const [perms, mems] = await Promise.all([
          call(`/projects/${selectedId}/permissions`),
          call(`/projects/${selectedId}/members`),
        ])
        if (!cancelled) {
          setUserPermissions(perms.permissions)
          setCurrentUserRole(perms.role)
          setMembers(mems)
        }
      } catch (e) {
        if (!cancelled) {
          setAccessError(e instanceof Error ? e.message : 'Failed to load access information')
        }
      } finally {
        if (!cancelled) setAccessLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [resourceTab, selectedKind, selectedId, token, tenant, call, accessRefresh])

  // Project details & governance metadata loader
  useEffect(() => {
    let cancelled = false
    if (selectedKind !== 'project' || !selectedId || !token || !tenant) {
      return
    }
    const load = async () => {
      setMetaLoading(true)
      setMetaError('')
      try {
        const [meta, perms] = await Promise.all([
          call(`/projects/${selectedId}`),
          call(`/projects/${selectedId}/permissions`).catch(() => null),
        ])
        if (!cancelled) {
          setProjectMeta(meta)
          setMetaDesc(meta.description || '')
          setMetaTags((meta.tags || []).join(', '))
          setMetaCriticality(meta.criticality || 'MEDIUM')
          setMetaDataClass(meta.data_classification || 'INTERNAL')
          setMetaCostCenter(meta.cost_center || '')
          if (perms) {
            setUserPermissions(perms.permissions)
            setCurrentUserRole(perms.role)
          }
        }
      } catch (e) {
        if (!cancelled) {
          setMetaError(e instanceof Error ? e.message : 'Failed to load project metadata')
        }
      } finally {
        if (!cancelled) setMetaLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [selectedKind, selectedId, token, tenant, call, metaRefresh])

  async function handleArchiveProject() {
    if (!selectedId || selectedKind !== 'project') return
    if (!window.confirm('Are you sure you want to archive this project? It will be hidden from default workspace views.')) return
    setBusy(true)
    setError('')
    try {
      await call(`/projects/${selectedId}/archive`, { method: 'POST' })
      setMetaRefresh((x) => x + 1)
      await refresh()
      setAuditRefresh((x) => x + 1)
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to archive project')
    } finally {
      setBusy(false)
    }
  }

  async function handleRestoreProject() {
    if (!selectedId || selectedKind !== 'project') return
    setBusy(true)
    setError('')
    try {
      await call(`/projects/${selectedId}/restore`, { method: 'POST' })
      setMetaRefresh((x) => x + 1)
      await refresh()
      setAuditRefresh((x) => x + 1)
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to restore project')
    } finally {
      setBusy(false)
    }
  }

  async function handleSaveMetadata() {
    if (!selectedId || selectedKind !== 'project') return
    setBusy(true)
    setError('')
    try {
      const parsedTags = metaTags.split(',').map((t) => t.trim()).filter(Boolean)
      await call(`/projects/${selectedId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          description: metaDesc.trim() || null,
          tags: parsedTags,
          criticality: metaCriticality,
          data_classification: metaDataClass,
          cost_center: metaCostCenter.trim() || null,
        }),
      })
      setMetaRefresh((x) => x + 1)
      await refresh()
      setAuditRefresh((x) => x + 1)
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update metadata')
    } finally {
      setBusy(false)
    }
  }

  async function handleDeleteFolder() {
    if (!selectedId || selectedKind !== 'folder') return
    if (!window.confirm('Are you sure you want to delete this folder? The folder must be completely empty.')) return
    setBusy(true)
    setError('')
    try {
      await call(`/folders/${selectedId}`, { method: 'DELETE' })
      setSelected(null)
      await refresh()
      setAuditRefresh((x) => x + 1)
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete folder')
    } finally {
      setBusy(false)
    }
  }

  async function handleAddMember() {
    if (!newMemberId.trim() || selectedKind !== 'project' || !selectedId) return
    setBusy(true)
    setAccessError('')
    try {
      await call(`/projects/${selectedId}/members`, {
        method: 'POST',
        body: JSON.stringify({ user_id: newMemberId.trim(), role: newMemberRole }),
      })
      setNewMemberId('')
      setAccessRefresh((x) => x + 1)
    } catch (e) {
      setAccessError(e instanceof Error ? e.message : 'Failed to add member')
    } finally {
      setBusy(false)
    }
  }

  async function handleUpdateMemberRole(userId: string, role: string) {
    if (selectedKind !== 'project' || !selectedId) return
    setBusy(true)
    setAccessError('')
    try {
      await call(`/projects/${selectedId}/members/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      })
      setAccessRefresh((x) => x + 1)
    } catch (e) {
      setAccessError(e instanceof Error ? e.message : 'Failed to update member role')
    } finally {
      setBusy(false)
    }
  }

  async function handleRemoveMember(userId: string, memberRole: string) {
    if (selectedKind !== 'project' || !selectedId) return
    const isOwner = memberRole === 'OWNER'
    const warning = isOwner
      ? 'Are you sure you want to remove this project OWNER? If this is the last owner, the operation will be rejected.'
      : 'Are you sure you want to remove this member from the project?'
    if (!window.confirm(warning)) return

    setBusy(true)
    setAccessError('')
    try {
      await call(`/projects/${selectedId}/members/${userId}`, {
        method: 'DELETE',
      })
      setAccessRefresh((x) => x + 1)
    } catch (e) {
      setAccessError(e instanceof Error ? e.message : 'Failed to remove member')
    } finally {
      setBusy(false)
    }
  }

  function activityDescription(event: AuditEvent): string {
    const before = event.old_values || {}
    const after = event.new_values || {}
    const label = event.resource_kind.replaceAll('_', ' ')
    if (event.operation === 'UPDATE' && before.folder_id !== after.folder_id && ('folder_id' in before || 'folder_id' in after)) return `${label} moved`
    if (event.operation === 'UPDATE' && before.parent_folder_id !== after.parent_folder_id && ('parent_folder_id' in before || 'parent_folder_id' in after)) return `${label} moved`
    if (event.operation === 'UPDATE' && before.name !== after.name) return `${label} renamed`
    return `${label} ${event.operation.toLowerCase()}`
  }

  function changedFields(event: AuditEvent): string[] {
    const before = event.old_values || {}
    const after = event.new_values || {}
    return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
      (k) => JSON.stringify(before[k]) !== JSON.stringify(after[k])
    )
  }

  function auditPanel() {
    const filtered = events.filter((e) => auditOperation === 'ALL' || e.operation === auditOperation)
    return (
      <div className="activity-console">
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
          <label>
            Operation{' '}
            <select aria-label="Filter activity operation" value={auditOperation} onChange={(e) => setAuditOperation(e.target.value)}>
              <option value="ALL">All</option>
              <option value="INSERT">Created</option>
              <option value="UPDATE">Updated / moved</option>
              <option value="DELETE">Deleted</option>
            </select>
          </label>
          <label>
            Records{' '}
            <select aria-label="Activity record limit" value={auditLimit} onChange={(e) => setAuditLimit(Number(e.target.value))}>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
            </select>
          </label>
          <button className="primary-button" disabled={auditLoading} onClick={() => setAuditRefresh((x) => x + 1)}>
            <RefreshCw size={14} /> Refresh activity
          </button>
        </div>
        {auditError && <p role="alert" style={{ color: '#ff8c9b' }}>{auditError}</p>}
        {auditLoading ? (
          <p>Loading activity…</p>
        ) : filtered.length === 0 ? (
          <div className="resource-empty">
            <Activity size={22} />
            <h4>No recorded activity</h4>
            <p>No audit events were returned for this exact resource and filter.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {filtered.map((event) => (
              <article key={event.id} className="glass" style={{ border: '1px solid rgba(255,255,255,.12)', borderRadius: 12, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <strong>{activityDescription(event)}</strong>
                  <time dateTime={event.happened_at}>{new Date(event.happened_at).toLocaleString()}</time>
                </div>
                <small>Actor: {event.actor_id || 'System'} · Event #{event.id} · {event.operation}</small>
                {changedFields(event).length > 0 && (
                  <details style={{ marginTop: 8 }}>
                    <summary>Changed fields ({changedFields(event).length})</summary>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', textAlign: 'left', fontSize: 12 }}>
                        <thead>
                          <tr>
                            <th>Field</th>
                            <th>Before</th>
                            <th>After</th>
                          </tr>
                        </thead>
                        <tbody>
                          {changedFields(event).map((field) => (
                            <tr key={field}>
                              <td>{field}</td>
                              <td><code>{JSON.stringify(event.old_values?.[field]) ?? '—'}</code></td>
                              <td><code>{JSON.stringify(event.new_values?.[field]) ?? '—'}</code></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                )}
              </article>
            ))}
          </div>
        )}
        <p style={{ fontSize: 12, opacity: 0.7, marginTop: 12 }}>
          Showing activity for the selected resource only. Descendant rollups and server-side pagination are not yet supported.
        </p>
      </div>
    )
  }

  function accessPanel() {
    if (selectedKind !== 'project') {
      return (
        <div className="resource-empty">
          <Users size={22} />
          <h4>Project Access Scoping</h4>
          <p>Role-Based Access Control is managed at the project level. Select a project in the hierarchy to inspect or configure member assignments.</p>
        </div>
      )
    }

    const canManage = !!userPermissions?.can_manage_members

    return (
      <div className="access-console" style={{ display: 'grid', gap: 16 }}>
        {/* Effective permissions banner */}
        <div className="glass" style={{ padding: 14, borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ShieldCheck size={18} style={{ color: '#a18aff' }} />
              <strong>Your Effective Role:</strong>
              <span className="state-pill success" style={{ textTransform: 'uppercase' }}>
                {currentUserRole || 'DEFAULT DENY'}
              </span>
            </div>
            <small style={{ opacity: 0.8, marginTop: 4, display: 'block' }}>
              Capabilities: {userPermissions?.can_view ? 'View' : ''}{userPermissions?.can_edit ? ', Edit' : ''}{userPermissions?.can_manage_members ? ', Manage Members' : ''}{userPermissions?.can_delete ? ', Delete' : ''}
              {!currentUserRole ? 'No granted project capabilities' : ''}
            </small>
          </div>
          <button className="secondary-button" disabled={accessLoading || busy} onClick={() => setAccessRefresh((x) => x + 1)}>
            <RefreshCw size={14} /> Refresh Access
          </button>
        </div>

        {accessError && <p role="alert" style={{ color: '#ff8c9b' }}>{accessError}</p>}

        {/* Add member form (visible only if caller has can_manage_members) */}
        {canManage && (
          <div className="glass" style={{ padding: 14, borderRadius: 10 }}>
            <h4 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 10px 0' }}>
              <UserPlus size={16} /> Assign Project Member
            </h4>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <label style={{ flex: 1, minWidth: 200 }}>
                User ID (UUID)
                <input
                  aria-label="New member user ID"
                  value={newMemberId}
                  onChange={(e) => setNewMemberId(e.target.value)}
                  placeholder="e.g. aaaa1111-..."
                />
              </label>
              <label style={{ width: 140 }}>
                Role
                <select
                  aria-label="New member role"
                  value={newMemberRole}
                  onChange={(e) => setNewMemberRole(e.target.value as typeof newMemberRole)}
                >
                  {currentUserRole === 'OWNER' && <option value="OWNER">OWNER</option>}
                  <option value="ADMIN">ADMIN</option>
                  <option value="EDITOR">EDITOR</option>
                  <option value="VIEWER">VIEWER</option>
                </select>
              </label>
              <button
                className="primary-button"
                disabled={busy || !newMemberId.trim()}
                onClick={handleAddMember}
              >
                Assign
              </button>
            </div>
            <small style={{ opacity: 0.7, marginTop: 6, display: 'block' }}>
              Database constraint: The assigned user must belong to active tenant memberships. Cross-tenant assignments are rejected by PostgreSQL triggers.
            </small>
          </div>
        )}

        {/* Members list */}
        {accessLoading ? (
          <p>Loading project members…</p>
        ) : members.length === 0 ? (
          <div className="resource-empty">
            <Users size={22} />
            <h4>No Members Found</h4>
            <p>This project has no explicit memberships recorded.</p>
          </div>
        ) : (
          <div className="glass" style={{ borderRadius: 10, overflow: 'hidden' }}>
            <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <th style={{ padding: 10 }}>Member</th>
                  <th style={{ padding: 10 }}>Role</th>
                  <th style={{ padding: 10 }}>Assigned</th>
                  <th style={{ padding: 10 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: 10 }}>
                      <strong>{m.display_name || 'User'}</strong>
                      <div style={{ fontSize: 11, opacity: 0.6 }}>{m.user_id}</div>
                    </td>
                    <td style={{ padding: 10 }}>
                      {canManage && (currentUserRole === 'OWNER' || m.role !== 'OWNER') ? (
                        <select
                          aria-label={`Role for ${m.display_name}`}
                          value={m.role}
                          disabled={busy}
                          onChange={(e) => handleUpdateMemberRole(m.user_id, e.target.value)}
                        >
                          {currentUserRole === 'OWNER' && <option value="OWNER">OWNER</option>}
                          <option value="ADMIN">ADMIN</option>
                          <option value="EDITOR">EDITOR</option>
                          <option value="VIEWER">VIEWER</option>
                        </select>
                      ) : (
                        <span className="state-pill success">{m.role}</span>
                      )}
                    </td>
                    <td style={{ padding: 10, fontSize: 12, opacity: 0.8 }}>
                      {new Date(m.created_at).toLocaleDateString()}
                    </td>
                    <td style={{ padding: 10 }}>
                      {canManage && (currentUserRole === 'OWNER' || m.role !== 'OWNER') && (
                        <button
                          className="icon-button"
                          aria-label={`Remove ${m.display_name}`}
                          title="Remove member"
                          disabled={busy}
                          onClick={() => handleRemoveMember(m.user_id, m.role)}
                        >
                          <Trash2 size={15} style={{ color: '#ff8c9b' }} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )
  }

  async function create() {
    if (!newName.trim()) return
    const parent = selected
    let path: string
    let body: Record<string, string | null> = { name: newName.trim() }
    if (kind === 'organization') {
      path = '/organizations'
      body.slug = slug
    } else if (kind === 'folder') {
      if (!parent || !['org', 'folder'].includes(parent.kind)) return setError('Select an organization or folder')
      const findOrg = (items: Node[], id: string, org?: string): string | undefined => {
        for (const n of items) {
          const current = n.kind === 'org' ? n.id : org
          if (n.id === id) return current
          const found = findOrg(n.children || [], id, current)
          if (found) return found
        }
      }
      const org = findOrg(tree, parent.id)
      if (!org) return setError('Organization not found')
      path = '/folders'
      body.organization_id = org
      body.parent_folder_id = parent.kind === 'folder' ? parent.id : null
    } else if (kind === 'project') {
      if (parent?.kind !== 'folder') return setError('Select a folder')
      path = '/projects'
      body.folder_id = parent.id
    } else {
      if (parent?.kind !== 'org') return setError('Select an organization')
      path = `/organizations/${parent.id}/environments`
      body = { environment: newName.trim().toUpperCase() }
    }
    setBusy(true)
    setError('')
    try {
      await call(path, { method: 'POST', body: JSON.stringify(body) })
      setNewName('')
      await refresh()
      setAuditRefresh((x) => x + 1)
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed')
    } finally {
      setBusy(false)
    }
  }

  async function rename() {
    if (!selected || !renameName.trim() || selected.kind === 'environment') return
    const segment = selected.kind === 'org' ? 'organizations' : selected.kind === 'folder' ? 'folders' : 'projects'
    setBusy(true)
    setError('')
    try {
      await call(`/${segment}/${selected.id}`, { method: 'PATCH', body: JSON.stringify({ name: renameName.trim() }) })
      setRenameName('')
      await refresh()
      setAuditRefresh((x) => x + 1)
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rename failed')
    } finally {
      setBusy(false)
    }
  }

  async function moveResource(source: Node, destination: Node) {
    if (source.id === destination.id || !['folder', 'project'].includes(source.kind)) return
    if (source.kind === 'folder' && !['org', 'folder'].includes(destination.kind))
      return setError('Folders can move only under folders or their organization')
    if (source.kind === 'project' && destination.kind !== 'folder')
      return setError('Projects must move into development folders')
    const locateOrg = (nodes: Node[], id: string, org?: string): string | undefined => {
      for (const node of nodes) {
        const owner = node.kind === 'org' ? node.id : org
        if (node.id === id) return owner
        const found = locateOrg(node.children || [], id, owner)
        if (found) return found
      }
    }
    if (locateOrg(tree, source.id) !== locateOrg(tree, destination.id)) return setError('Cross-organization moves are prohibited')
    const path = source.kind === 'folder' ? `/folders/${source.id}/move` : `/projects/${source.id}/move`
    const body = source.kind === 'folder' ? { parent_folder_id: destination.kind === 'org' ? null : destination.id } : { folder_id: destination.id }
    setBusy(true)
    setError('')
    try {
      await call(path, { method: 'PATCH', body: JSON.stringify(body) })
      setMoveTarget('')
      setDragged(null)
      await refresh()
      setAuditRefresh((x) => x + 1)
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Move failed')
    } finally {
      setBusy(false)
    }
  }

  function renderNode(n: Node, depth = 0): React.ReactNode {
    const open = expanded.has(n.id)
    return (
      <div key={n.id}>
        <button
          draggable={n.kind === 'folder' || n.kind === 'project'}
          onDragStart={(e) => {
            if (n.kind === 'folder' || n.kind === 'project') {
              setDragged(n)
              e.dataTransfer.setData('text/plain', n.id)
              e.dataTransfer.effectAllowed = 'move'
            }
          }}
          onDragOver={(e) => {
            if (dragged && (n.kind === 'folder' || n.kind === 'org')) e.preventDefault()
          }}
          onDrop={(e) => {
            e.preventDefault()
            if (dragged) void moveResource(dragged, n)
          }}
          onDragEnd={() => setDragged(null)}
          className={`tree-row ${selected?.id === n.id ? 'tree-selected' : ''}`}
          style={{ paddingLeft: 12 + depth * 17 }}
          onClick={() => {
            setSelected(n)
            setResourceTab('Overview')
            setExpanded((s) => {
              const next = new Set(s)
              if (next.has(n.id)) next.delete(n.id)
              else next.add(n.id)
              return next
            })
          }}
        >
          {n.children?.length ? (
            open ? <ChevronDown size={15} /> : <ChevronRight size={15} />
          ) : (
            <span style={{ width: 15 }} />
          )}
          {n.kind === 'org' ? <Building2 size={16} /> : n.kind === 'folder' ? <Folder size={16} /> : n.kind === 'project' ? <Layers3 size={16} /> : <Server size={16} />}
          <span>{n.name}</span>
          {n.lifecycle_status === 'ARCHIVED' && (
            <span
              style={{
                fontSize: 10,
                padding: '1px 6px',
                borderRadius: 4,
                background: '#78350f',
                color: '#fef3c7',
                marginLeft: 6,
                fontWeight: 600,
              }}
            >
              ARCHIVED
            </span>
          )}
        </button>
        {open && n.children?.map((c) => renderNode(c, depth + 1))}
      </div>
    )
  }

  const flatten = (items: Node[]): Node[] => items.flatMap((n) => [n, ...flatten(n.children || [])])
  const all = flatten(tree)
  const visible = view === 'Projects' ? all.filter((n) => n.kind === 'project') : view === 'Environments' ? all.filter((n) => n.kind === 'environment') : []

  return (
    <section className="workspace-panel glass" style={{ padding: 18, minHeight: 360 }}>
      <h1>{view === 'Explorer' ? 'Enterprise Workspace' : view}</h1>
      <p>Authenticated tenant data · No sample records</p>
      <div style={{ display: 'flex', gap: 12, margin: '20px 0' }}>
        <span>Tenant: {tenantName}</span>
        <button className="primary-button" disabled={busy} onClick={refresh}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>
      {error && <p role="alert" style={{ color: '#ff8c9b' }}>{error}</p>}
      {counts && (
        <div style={{ display: 'flex', gap: 10, margin: '12px 0', flexWrap: 'wrap' }}>
          {Object.entries(counts).map(([k, v]) => (
            <div className="metric-card glass" style={{ minWidth: 125, padding: 12 }} key={k}>
              <small>{k}</small>
              <h2>{v}</h2>
            </div>
          ))}
        </div>
      )}
      {view !== 'Explorer' && (
        <div style={{ margin: '12px 0' }}>
          <h3>{view === 'Projects' ? 'Development projects' : 'Organization environments'}</h3>
          {visible.length ? (
            visible.map((n) => (
              <button key={n.id} className="tree-row" onClick={() => { setSelected(n); setResourceTab('Overview') }}>
                {n.name}
              </button>
            ))
          ) : (
            <p>No {view.toLowerCase()} found.</p>
          )}
        </div>
      )}
      {view === 'Explorer' && (
        <div className="resource-console">
          <aside className="resource-tree">
            <div className="resource-pane-heading">
              <h3>Resource hierarchy</h3>
              <small>Organization / folders / projects</small>
            </div>
            <div
              style={{
                padding: '6px 12px 10px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 12,
                borderBottom: '1px solid rgba(255,255,255,0.08)',
                marginBottom: 8,
              }}
            >
              <input
                type="checkbox"
                id="show-archived-toggle"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
              />
              <label htmlFor="show-archived-toggle" style={{ cursor: 'pointer', userSelect: 'none', color: 'rgba(255,255,255,0.8)' }}>
                Show archived projects
              </label>
            </div>
            {tree.length ? tree.map((n) => renderNode(n)) : <p>No workspace resources found.</p>}
          </aside>
          <div className="resource-main">
            <div className="resource-pane-heading">
              <h3>{selected?.name || 'Select a resource'}</h3>
              <small>{selected ? `${selected.kind.toUpperCase()} · ${tenantName}` : 'Select a resource in the hierarchy to inspect it'}</small>
            </div>
            {selected && (
              <>
                <div className="resource-tabs" role="tablist" aria-label="Resource management">
                  {(['Overview', 'Activity', 'Access', 'Jobs', 'Triggers', 'Settings'] as const).map((tab) => {
                    const Icon = tab === 'Activity' ? Activity : tab === 'Access' ? LockKeyhole : tab === 'Jobs' ? Play : tab === 'Triggers' ? Timer : tab === 'Settings' ? Settings2 : Layers3
                    return (
                      <button
                        key={tab}
                        role="tab"
                        aria-selected={resourceTab === tab}
                        className={resourceTab === tab ? 'resource-tab active' : 'resource-tab'}
                        onClick={() => setResourceTab(tab)}
                      >
                        <Icon size={14} />
                        {tab}
                      </button>
                    )
                  })}
                </div>
                <div className="resource-tab-panel" role="tabpanel">
                  {resourceTab === 'Overview' ? (
                    selected.kind === 'project' ? (
                      metaLoading ? (
                        <p>Loading project details...</p>
                      ) : metaError ? (
                        <p role="alert" style={{ color: '#ff8c9b' }}>{metaError}</p>
                      ) : projectMeta ? (
                        <div className="project-overview-panel">
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
                          <span
                            style={{
                              padding: '4px 10px',
                              borderRadius: 4,
                              fontSize: 12,
                              fontWeight: 600,
                              background:
                                projectMeta.lifecycle_status === 'ACTIVE'
                                  ? '#065f46'
                                  : projectMeta.lifecycle_status === 'ARCHIVED'
                                  ? '#78350f'
                                  : '#831843',
                              color: '#fff',
                            }}
                          >
                            STATUS: {projectMeta.lifecycle_status}
                          </span>
                          <span style={{ padding: '4px 10px', borderRadius: 4, fontSize: 12, background: 'rgba(255,255,255,0.08)' }}>
                            Criticality: <strong>{projectMeta.criticality}</strong>
                          </span>
                          <span style={{ padding: '4px 10px', borderRadius: 4, fontSize: 12, background: 'rgba(255,255,255,0.08)' }}>
                            Classification: <strong>{projectMeta.data_classification}</strong>
                          </span>
                          {projectMeta.cost_center && (
                            <span style={{ padding: '4px 10px', borderRadius: 4, fontSize: 12, background: 'rgba(255,255,255,0.08)' }}>
                              Cost Center: <strong>{projectMeta.cost_center}</strong>
                            </span>
                          )}
                        </div>

                        {projectMeta.description && (
                          <div style={{ margin: '12px 0', padding: 12, background: 'rgba(255,255,255,0.04)', borderRadius: 6 }}>
                            <small style={{ color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 4 }}>Description</small>
                            <p style={{ margin: 0, fontSize: 14 }}>{projectMeta.description}</p>
                          </div>
                        )}

                        {projectMeta.tags && projectMeta.tags.length > 0 && (
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', margin: '10px 0' }}>
                            <Tag size={13} style={{ color: 'rgba(255,255,255,0.5)' }} />
                            {projectMeta.tags.map((t) => (
                              <span
                                key={t}
                                style={{
                                  fontSize: 11,
                                  padding: '2px 8px',
                                  borderRadius: 12,
                                  background: 'rgba(56, 189, 248, 0.15)',
                                  color: '#38bdf8',
                                }}
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        )}

                        <div style={{ display: 'flex', gap: 12, marginTop: 18, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 14 }}>
                          {projectMeta.lifecycle_status === 'ACTIVE' ? (
                            <button
                              className="danger-button"
                              disabled={busy || !userPermissions?.can_delete}
                              onClick={handleArchiveProject}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                            >
                              <Archive size={14} /> Archive Project
                            </button>
                          ) : (
                            <button
                              className="primary-button"
                              disabled={busy || !userPermissions?.can_delete}
                              onClick={handleRestoreProject}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                            >
                              <RotateCcw size={14} /> Restore Project
                            </button>
                          )}
                          {!userPermissions?.can_delete && (
                            <small style={{ color: 'rgba(255,255,255,0.5)', alignSelf: 'center' }}>
                              (Requires project OWNER role to archive or restore)
                            </small>
                          )}
                        </div>
                      </div>
                    ) : null) : (
                      <div>
                        <p>Manage this {selected.kind} using the actions below. Changes are saved through the authenticated workspace API.</p>
                        {selected.kind === 'folder' && (
                          <div style={{ marginTop: 16 }}>
                            <button
                              className="danger-button"
                              disabled={busy}
                              onClick={handleDeleteFolder}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                            >
                              <Trash2 size={14} /> Delete Empty Folder
                            </button>
                            <small style={{ display: 'block', color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>
                              Folders containing subfolders or projects cannot be deleted until emptied.
                            </small>
                          </div>
                        )}
                      </div>
                    )
                  ) : resourceTab === 'Activity' ? (
                    auditPanel()
                  ) : resourceTab === 'Access' ? (
                    accessPanel()
                  ) : resourceTab === 'Jobs' ? (
                    <div className="resource-empty">
                      <Play size={22} />
                      <h4>No connected execution service</h4>
                      <p>Jobs will be scoped to deployed workloads and aggregated across descendant resources.</p>
                    </div>
                  ) : resourceTab === 'Triggers' ? (
                    <div className="resource-empty">
                      <Timer size={22} />
                      <h4>Triggers not yet available</h4>
                      <p>Scheduling and event triggers require the runtime orchestration service.</p>
                    </div>
                  ) : selected.kind === 'project' ? (
                    <div className="project-settings-panel" style={{ padding: 6 }}>
                      <h4>Project Governance & Metadata</h4>
                      <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, marginBottom: 14 }}>
                        Configure enterprise criticality, data classification, and accounting cost center.
                      </p>
                      <div style={{ display: 'grid', gap: 12, maxWidth: 500 }}>
                        <label>
                          Description
                          <textarea
                            aria-label="Project description"
                            value={metaDesc}
                            onChange={(e) => setMetaDesc(e.target.value)}
                            rows={3}
                            style={{ width: '100%', borderRadius: 6, padding: 8, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
                            placeholder="Brief purpose and scope of this automation project..."
                          />
                        </label>
                        <label>
                          Tags (comma-separated)
                          <input
                            aria-label="Project tags"
                            value={metaTags}
                            onChange={(e) => setMetaTags(e.target.value)}
                            placeholder="finance, batch, external-api"
                          />
                        </label>
                        <div style={{ display: 'flex', gap: 12 }}>
                          <label style={{ flex: 1 }}>
                            Criticality
                            <select
                              aria-label="Project criticality"
                              value={metaCriticality}
                              onChange={(e) => setMetaCriticality(e.target.value as typeof metaCriticality)}
                            >
                              <option value="LOW">LOW</option>
                              <option value="MEDIUM">MEDIUM</option>
                              <option value="HIGH">HIGH</option>
                              <option value="CRITICAL">CRITICAL</option>
                            </select>
                          </label>
                          <label style={{ flex: 1 }}>
                            Data Classification
                            <select
                              aria-label="Project data classification"
                              value={metaDataClass}
                              onChange={(e) => setMetaDataClass(e.target.value as typeof metaDataClass)}
                            >
                              <option value="PUBLIC">PUBLIC</option>
                              <option value="INTERNAL">INTERNAL</option>
                              <option value="CONFIDENTIAL">CONFIDENTIAL</option>
                              <option value="RESTRICTED">RESTRICTED</option>
                            </select>
                          </label>
                        </div>
                        <label>
                          Cost Center
                          <input
                            aria-label="Project cost center"
                            value={metaCostCenter}
                            onChange={(e) => setMetaCostCenter(e.target.value)}
                            placeholder="e.g. CC-9042"
                          />
                        </label>
                        <button
                          className="primary-button"
                          disabled={busy || !userPermissions?.can_edit}
                          onClick={handleSaveMetadata}
                          style={{ justifySelf: 'start', marginTop: 8 }}
                        >
                          Save Governance Metadata
                        </button>
                        {!userPermissions?.can_edit && (
                          <small style={{ color: '#ff8c9b' }}>You need Editor or higher role to modify metadata.</small>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="resource-empty">
                      <Settings2 size={22} />
                      <h4>Resource settings</h4>
                      <p>Use the authenticated rename action below. Additional resource policies are not yet implemented.</p>
                    </div>
                  )}
                </div>
              </>
            )}
            <div className="resource-actions">
              {selected && (selected.kind === 'folder' || selected.kind === 'project') && (
                <div className="resource-form">
                  <h3>Move selected resource</h3>
                  <label>
                    Destination
                    <select aria-label="Move destination" value={moveTarget} onChange={(e) => setMoveTarget(e.target.value)}>
                      <option value="">Choose destination</option>
                      {all
                        .filter((n) => (selected.kind === 'project' ? n.kind === 'folder' : n.kind === 'folder' || n.kind === 'org'))
                        .filter((n) => n.id !== selected.id)
                        .map((n) => (
                          <option key={n.id} value={n.id}>
                            {n.kind}: {n.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <button
                    className="primary-button"
                    disabled={busy || !moveTarget}
                    onClick={() => {
                      const dest = all.find((n) => n.id === moveTarget)
                      if (dest) void moveResource(selected, dest)
                    }}
                  >
                    Move
                  </button>
                  <small>Drag a folder or project onto a destination in the tree, or choose a destination here. The API validates organization boundaries and cycles.</small>
                </div>
              )}
              <div className="resource-form">
                <h3>Create resource</h3>
                <label>
                  Type
                  <select aria-label="Resource type" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
                    <option value="organization">Organization</option>
                    <option value="folder">Folder / subfolder</option>
                    <option value="project">Project</option>
                    <option value="environment">Environment</option>
                  </select>
                </label>
                <label>
                  Name
                  <input
                    aria-label="Resource name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder={kind === 'environment' ? 'DEV / TEST / UAT / PROD' : 'Name'}
                  />
                </label>
                {kind === 'organization' && (
                  <label>
                    Slug
                    <input
                      aria-label="Organization slug"
                      value={slug}
                      onChange={(e) => setSlug(e.target.value)}
                      placeholder="my-organization"
                    />
                  </label>
                )}
                <button className="primary-button" disabled={busy || !token} onClick={create}>
                  <FolderPlus size={16} /> Create
                </button>
              </div>
              {selected && selected.kind !== 'environment' && (
                <div className="resource-form">
                  <h3>Rename selected resource</h3>
                  <label>
                    New name
                    <input
                      aria-label="New resource name"
                      value={renameName}
                      onChange={(e) => setRenameName(e.target.value)}
                      placeholder="New name"
                    />
                  </label>
                  <button className="primary-button" disabled={busy || !renameName.trim()} onClick={rename}>
                    Rename
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
