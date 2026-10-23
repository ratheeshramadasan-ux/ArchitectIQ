import { useCallback, useEffect, useState } from 'react'
import { Activity, Building2, ChevronDown, ChevronRight, Folder, FolderPlus, Layers3, LockKeyhole, Play, RefreshCw, Server, Settings2, Timer } from 'lucide-react'

type Node = { id: string; name: string; kind: 'org'|'folder'|'project'|'environment'; children: Node[] }
type AuditEvent = { id:string; resource_kind:string; resource_id:string; operation:string; actor_id:string|null; happened_at:string; old_values:Record<string,unknown>|null; new_values:Record<string,unknown>|null }
type Counts = { organizations: number; folders: number; projects: number; environments: number }
const endpoint = '/api/v1/tenants'
export default function WorkspaceLive({token,tenant,tenantName,onUnauthorized,onChanged,view="Explorer"}:{token:string;tenant:string;tenantName:string;onUnauthorized:()=>void;onChanged:()=>void;view?:string}) {
  const [resourceTab,setResourceTab] = useState<'Overview'|'Activity'|'Access'|'Jobs'|'Triggers'|'Settings'>('Overview')
  const [events,setEvents] = useState<AuditEvent[]>([])
  const [auditLoading,setAuditLoading] = useState(false)
  const [auditError,setAuditError] = useState('')
  const [auditLimit,setAuditLimit] = useState(25)
  const [auditOperation,setAuditOperation] = useState('ALL')
  const [auditRefresh,setAuditRefresh] = useState(0)
  const [tree, setTree] = useState<Node[]>([])
  const [counts, setCounts] = useState<Counts|null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Node|null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [newName, setNewName] = useState('')
  const [slug, setSlug] = useState('')
  const [renameName,setRenameName]=useState('')
  const [moveTarget,setMoveTarget] = useState('')
  const [dragged,setDragged] = useState<Node|null>(null)
  const [kind, setKind] = useState<'organization'|'folder'|'project'|'environment'>('organization')
  const base = `${endpoint}/${tenant}/workspace`
  const call = useCallback(async (path:string, init?:RequestInit) => {
    const res = await fetch(`${base}${path}`, { ...init, headers: {'Authorization': `Bearer ${token}`, 'Content-Type':'application/json', ...init?.headers} })
    if (res.status===401) onUnauthorized()
    if (!res.ok) throw new Error(`API ${res.status}: ${(await res.text()).slice(0,250)}`)
    return res.json()
  }, [base, token, onUnauthorized])
  const refresh = useCallback(async () => {
    if (!tenant || !token) return
    setBusy(true); setError('')
    try { const [t, s] = await Promise.all([call('/tree'), call('/summary')]); setTree(t); setCounts(s) }
    catch(e) { setError(e instanceof Error ? e.message : 'Connection failed') }
    finally { setBusy(false) }
  }, [call, tenant, token])
  useEffect(() => { const timer = window.setTimeout(() => { void refresh() }, 0); return () => window.clearTimeout(timer) }, [refresh])
  const selectedId = selected?.id
  const selectedKind = selected?.kind
  useEffect(() => {
    if (resourceTab !== 'Activity' || !selectedId || !selectedKind || !tenant || !token) return
    let cancelled = false
    const load = async () => {
      setAuditLoading(true); setAuditError('')
      try {
        // The current API filters exact resources; ancestor rollups require a future backend endpoint.
        const kind = selectedKind === 'org' ? 'organization' : selectedKind
        const params = new URLSearchParams({resource_kind:kind,resource_id:selectedId,limit:String(auditLimit)})
        const data:AuditEvent[] = await call(`/activity?${params}`)
        if (!cancelled) setEvents(data)
      } catch(e) {
        if (!cancelled) {setEvents([]);setAuditError(e instanceof Error?e.message:'Unable to retrieve activity')}
      } finally {if (!cancelled) setAuditLoading(false)}
    }
    void load()
    return () => {cancelled = true}
  }, [resourceTab,selectedId,selectedKind,tenant,token,auditLimit,auditRefresh,call])
  function activityDescription(event:AuditEvent):string {
    const before = event.old_values || {}
    const after = event.new_values || {}
    const label = event.resource_kind.replaceAll('_',' ')
    if (event.operation === 'UPDATE' && before.folder_id !== after.folder_id && ('folder_id' in before || 'folder_id' in after)) return `${label} moved`
    if (event.operation === 'UPDATE' && before.parent_folder_id !== after.parent_folder_id && ('parent_folder_id' in before || 'parent_folder_id' in after)) return `${label} moved`
    if (event.operation === 'UPDATE' && before.name !== after.name) return `${label} renamed`
    return `${label} ${event.operation.toLowerCase()}`
  }
  function changedFields(event:AuditEvent):string[] {
    const before = event.old_values || {}; const after = event.new_values || {}
    return [...new Set([...Object.keys(before),...Object.keys(after)])].filter(k=>JSON.stringify(before[k])!==JSON.stringify(after[k]))
  }
  function auditPanel() {
    const filtered=events.filter(e=>auditOperation==='ALL'||e.operation===auditOperation)
    return <div className="activity-console">
      <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',marginBottom:14}}>
        <label>Operation <select aria-label="Filter activity operation" value={auditOperation} onChange={e=>setAuditOperation(e.target.value)}><option value="ALL">All</option><option value="INSERT">Created</option><option value="UPDATE">Updated / moved</option><option value="DELETE">Deleted</option></select></label>
        <label>Records <select aria-label="Activity record limit" value={auditLimit} onChange={e=>setAuditLimit(Number(e.target.value))}><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option><option value={200}>200</option></select></label>
        <button className="primary-button" disabled={auditLoading} onClick={()=>setAuditRefresh(x=>x+1)}><RefreshCw size={14}/> Refresh activity</button>
      </div>
      {auditError&&<p role="alert" style={{color:'#ff8c9b'}}>{auditError}</p>}
      {auditLoading?<p>Loading activity…</p>:filtered.length===0?<div className="resource-empty"><Activity size={22}/><h4>No recorded activity</h4><p>No audit events were returned for this exact resource and filter.</p></div>:<div style={{display:'grid',gap:10}}>{filtered.map(event=><article key={event.id} className="glass" style={{border:'1px solid rgba(255,255,255,.12)',borderRadius:12,padding:12}}>
        <div style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}><strong>{activityDescription(event)}</strong><time dateTime={event.happened_at}>{new Date(event.happened_at).toLocaleString()}</time></div>
        <small>Actor: {event.actor_id||'System'} · Event #{event.id} · {event.operation}</small>
        {changedFields(event).length>0&&<details style={{marginTop:8}}><summary>Changed fields ({changedFields(event).length})</summary><div style={{overflowX:'auto'}}><table style={{width:'100%',textAlign:'left',fontSize:12}}><thead><tr><th>Field</th><th>Before</th><th>After</th></tr></thead><tbody>{changedFields(event).map(field=><tr key={field}><td>{field}</td><td><code>{JSON.stringify(event.old_values?.[field])??'—'}</code></td><td><code>{JSON.stringify(event.new_values?.[field])??'—'}</code></td></tr>)}</tbody></table></div></details>}
      </article>)}</div>}
      <p style={{fontSize:12,opacity:.7,marginTop:12}}>Showing activity for the selected resource only. Descendant rollups and server-side pagination are not yet supported.</p>
    </div>
  }
  async function create() {
    if (!newName.trim()) return
    const parent = selected
    let path: string; let body: Record<string,string|null> = {name:newName.trim()}
    if(kind==='organization') { path='/organizations'; body.slug=slug }
    else if(kind==='folder') {
      if(!parent || !['org','folder'].includes(parent.kind)) return setError('Select an organization or folder')
      const findOrg = (items:Node[], id:string, org?:string):string|undefined => { for(const n of items){const current=n.kind==='org'?n.id:org;if(n.id===id)return current;const found=findOrg(n.children||[],id,current);if(found)return found} }
      const org=findOrg(tree,parent.id); if(!org)return setError('Organization not found')
      path='/folders';body.organization_id=org;body.parent_folder_id=parent.kind==='folder'?parent.id:null
    } else if(kind==='project') {if(parent?.kind!=='folder')return setError('Select a folder');path='/projects';body.folder_id=parent.id}
    else {if(parent?.kind!=='org')return setError('Select an organization');path=`/organizations/${parent.id}/environments`;body={environment:newName.trim().toUpperCase()}}
    setBusy(true);setError('')
    try {await call(path,{method:'POST',body:JSON.stringify(body)});setNewName('');await refresh();setAuditRefresh(x=>x+1);onChanged()}
    catch(e){setError(e instanceof Error?e.message:'Create failed')}
    finally{setBusy(false)}
  }
  async function rename(){if(!selected||!renameName.trim()||selected.kind==='environment')return;const segment=selected.kind==='org'?'organizations':selected.kind==='folder'?'folders':'projects';setBusy(true);setError('');try{await call(`/${segment}/${selected.id}`,{method:'PATCH',body:JSON.stringify({name:renameName.trim()})});setRenameName('');await refresh();setAuditRefresh(x=>x+1);onChanged()}catch(e){setError(e instanceof Error?e.message:'Rename failed')}finally{setBusy(false)}}
  async function moveResource(source:Node, destination:Node) {
    if(source.id===destination.id || !['folder','project'].includes(source.kind)) return
    if(source.kind==='folder' && !['org','folder'].includes(destination.kind)) return setError('Folders can move only under folders or their organization')
    if(source.kind==='project' && destination.kind!=='folder') return setError('Projects must move into development folders')
    const locateOrg = (nodes:Node[], id:string, org?:string):string|undefined => {
      for(const node of nodes){const owner=node.kind==='org'?node.id:org;if(node.id===id)return owner;const found=locateOrg(node.children||[],id,owner);if(found)return found}
    }
    if(locateOrg(tree,source.id)!==locateOrg(tree,destination.id)) return setError('Cross-organization moves are prohibited')
    const path=source.kind==='folder'?`/folders/${source.id}/move`:`/projects/${source.id}/move`
    const body=source.kind==='folder'?{parent_folder_id:destination.kind==='org'?null:destination.id}:{folder_id:destination.id}
    setBusy(true);setError('')
    try{await call(path,{method:'PATCH',body:JSON.stringify(body)});setMoveTarget('');setDragged(null);await refresh();setAuditRefresh(x=>x+1);onChanged()}
    catch(e){setError(e instanceof Error?e.message:'Move failed')}
    finally{setBusy(false)}
  }
  function renderNode(n:Node, depth=0):React.ReactNode {
    const open=expanded.has(n.id)
    return <div key={n.id}><button draggable={n.kind==='folder'||n.kind==='project'} onDragStart={e=>{if(n.kind==='folder'||n.kind==='project'){setDragged(n);e.dataTransfer.setData('text/plain',n.id);e.dataTransfer.effectAllowed='move'}}} onDragOver={e=>{if(dragged && (n.kind==='folder'||n.kind==='org'))e.preventDefault()}} onDrop={e=>{e.preventDefault();if(dragged)void moveResource(dragged,n)}} onDragEnd={()=>setDragged(null)} className={`tree-row ${selected?.id===n.id?'tree-selected':''}`} style={{paddingLeft:12+depth*17}} onClick={()=>{setSelected(n);setResourceTab('Overview');setExpanded(s=>{const next=new Set(s);if(next.has(n.id))next.delete(n.id);else next.add(n.id);return next})}}>{n.children?.length?(open?<ChevronDown size={15}/>:<ChevronRight size={15}/>):<span style={{width:15}}/>}{n.kind==='org'?<Building2 size={16}/>:n.kind==='folder'?<Folder size={16}/>:n.kind==='project'?<Layers3 size={16}/>:<Server size={16}/>}<span>{n.name}</span></button>{open&&n.children?.map(c=>renderNode(c,depth+1))}</div>
  }
  const flatten = (items:Node[]):Node[] => items.flatMap(n=>[n,...flatten(n.children||[])])
  const all = flatten(tree)
  const visible = view==='Projects' ? all.filter(n=>n.kind==='project') : view==='Environments' ? all.filter(n=>n.kind==='environment') : []
  return <section className="workspace-panel glass" style={{padding:18,minHeight:360}}><h1>{view === "Explorer" ? "Enterprise Workspace" : view}</h1><p>Authenticated tenant data · No sample records</p><div style={{display:'flex',gap:12,margin:'20px 0'}}><span>Tenant: {tenantName}</span><button className="primary-button" disabled={busy} onClick={refresh}><RefreshCw size={16}/> Refresh</button></div>{error&&<p role="alert" style={{color:'#ff8c9b'}}>{error}</p>}{counts&&<div style={{display:'flex',gap:10,margin:'12px 0',flexWrap:'wrap'}}>{Object.entries(counts).map(([k,v])=><div className="metric-card glass" style={{minWidth:125,padding:12}} key={k}><small>{k}</small><h2>{v}</h2></div>)}</div>}{view!=='Explorer'&&<div style={{margin:'12px 0'}}><h3>{view==='Projects'?'Development projects':'Organization environments'}</h3>{visible.length?visible.map(n=><button key={n.id} className="tree-row" onClick={()=>{setSelected(n);setResourceTab('Overview')}}>{n.name}</button>):<p>No {view.toLowerCase()} found.</p>}</div>}{view==='Explorer'&&<div className="resource-console"><aside className="resource-tree"><div className="resource-pane-heading"><h3>Resource hierarchy</h3><small>Organization / folders / projects</small></div>{tree.length?tree.map(n=>renderNode(n)):<p>No workspace resources found.</p>}</aside><div className="resource-main"><div className="resource-pane-heading"><h3>{selected?.name||'Select a resource'}</h3><small>{selected?`${selected.kind.toUpperCase()} · ${tenantName}`:'Select a resource in the hierarchy to inspect it'}</small></div>{selected&&<><div className="resource-tabs" role="tablist" aria-label="Resource management">{(['Overview','Activity','Access','Jobs','Triggers','Settings'] as const).map(tab=>{const Icon=tab==='Activity'?Activity:tab==='Access'?LockKeyhole:tab==='Jobs'?Play:tab==='Triggers'?Timer:tab==='Settings'?Settings2:Layers3;return <button key={tab} role="tab" aria-selected={resourceTab===tab} className={resourceTab===tab?'resource-tab active':'resource-tab'} onClick={()=>setResourceTab(tab)}><Icon size={14}/>{tab}</button>})}</div><div className="resource-tab-panel" role="tabpanel">{resourceTab==='Overview'?<p>Manage this {selected.kind} using the actions below. Changes are saved through the authenticated workspace API.</p>:resourceTab==='Activity'?auditPanel():resourceTab==='Access'?<div className="resource-empty"><LockKeyhole size={22}/><h4>Access management pending</h4><p>Effective permissions and inherited grants will be displayed after the authorization API is implemented.</p></div>:resourceTab==='Jobs'?<div className="resource-empty"><Play size={22}/><h4>No connected execution service</h4><p>Jobs will be scoped to deployed workloads and aggregated across descendant resources.</p></div>:resourceTab==='Triggers'?<div className="resource-empty"><Timer size={22}/><h4>Triggers not yet available</h4><p>Scheduling and event triggers require the runtime orchestration service.</p></div>:<div className="resource-empty"><Settings2 size={22}/><h4>Resource settings</h4><p>Use the authenticated rename action below. Additional resource policies are not yet implemented.</p></div>}</div></>}<div className="resource-actions">{selected && (selected.kind==='folder'||selected.kind==='project') && <div className="resource-form"><h3>Move selected resource</h3><label>Destination<select aria-label="Move destination" value={moveTarget} onChange={e=>setMoveTarget(e.target.value)}><option value="">Choose destination</option>{all.filter(n=>selected.kind==='project'?n.kind==='folder':(n.kind==='folder'||n.kind==='org')).filter(n=>n.id!==selected.id).map(n=><option key={n.id} value={n.id}>{n.kind}: {n.name}</option>)}</select></label><button className="primary-button" disabled={busy||!moveTarget} onClick={()=>{const dest=all.find(n=>n.id===moveTarget);if(dest)void moveResource(selected,dest)}}>Move</button><small>Drag a folder or project onto a destination in the tree, or choose a destination here. The API validates organization boundaries and cycles.</small></div>}<div className="resource-form"><h3>Create resource</h3><label>Type<select aria-label="Resource type" value={kind} onChange={e=>setKind(e.target.value as typeof kind)}><option value="organization">Organization</option><option value="folder">Folder / subfolder</option><option value="project">Project</option><option value="environment">Environment</option></select></label><label>Name<input aria-label="Resource name" value={newName} onChange={e=>setNewName(e.target.value)} placeholder={kind==='environment'?'DEV / TEST / UAT / PROD':'Name'}/></label>{kind==='organization'&&<label>Slug<input aria-label="Organization slug" value={slug} onChange={e=>setSlug(e.target.value)} placeholder="my-organization"/></label>}<button className="primary-button" disabled={busy||!token} onClick={create}><FolderPlus size={16}/> Create</button></div>{selected&&selected.kind!=='environment'&&<div className="resource-form"><h3>Rename selected resource</h3><label>New name<input aria-label="New resource name" value={renameName} onChange={e=>setRenameName(e.target.value)} placeholder="New name"/></label><button className="primary-button" disabled={busy||!renameName.trim()} onClick={rename}>Rename</button></div>}</div></div></div>}</section>
}
