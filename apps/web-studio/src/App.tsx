import WorkspaceLive from './WorkspaceLive'
import ManageFoldersStudio from './ManageFoldersStudio'
import FlowStudio from './FlowStudio'
import JobsMonitor from './JobsMonitor'
import ApprovalsInbox from './ApprovalsInbox'
import AgentStudio from './AgentStudio'
import DocumentStudio from './DocumentStudio'
import ObservabilityConsole from './ObservabilityConsole'
import GovernanceConsole from './GovernanceConsole'
import ActivityAuditViewer from './ActivityAuditViewer'
import LoginScreen from './LoginScreen'
import ThemeAppearanceStudio from './ThemeAppearanceStudio'
import type { ThemeConfig, FontName, TextSize } from './ThemeAppearanceStudio'
import IamRolesStudio from './IamRolesStudio'
import AccessDirectoryStudio from './AccessDirectoryStudio'
import TenantApplicationsStudio from './TenantApplicationsStudio'
import TenantIntegrationsStudio from './TenantIntegrationsStudio'
import EnvironmentTenantModal from './EnvironmentTenantModal'
import ArtifactsRegistryStudio from './ArtifactsRegistryStudio'
import KnowledgeStudio from './KnowledgeStudio'
import TestStudio from './TestStudio'
import DeploymentReleasesStudio from './DeploymentReleasesStudio'
import PlatformControlCenterStudio from './PlatformControlCenterStudio'
import GuideModal from './GuideModal'
import FooterInfoModal, { type FooterModalTab } from './FooterInfoModal'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  AppWindow,
  ArrowRight,
  BarChart3,
  Bell,
  BookOpen,
  Bot,
  Boxes,
  Building2,
  CalendarClock,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Command,
  Cpu,
  CreditCard,
  Database,
  FileText,
  FlaskConical,
  Folder,
  FolderClosed,
  FolderKanban,
  FolderTree,
  Gauge,
  GitBranch,
  GitMerge,
  HardDrive,
  HeartPulse,
  KeyRound,
  Layers3,
  LayoutDashboard,
  ListTodo,
  LockKeyhole,
  LogOut,
  MoreHorizontal,
  Network,
  PackageCheck,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  RefreshCw,
  Rocket,
  Search,
  Server,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Terminal,
  Users,
  Workflow,
  Zap
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import './App.css'


const fontFamilies: Record<FontName, string> = {
  'Inter': "'Inter', sans-serif",
  'Roboto': "'Roboto', sans-serif",
  'Open Sans': "'Open Sans', sans-serif",
  'Lato': "'Lato', sans-serif",
  'Montserrat': "'Montserrat', sans-serif",
  'Helvetica': "'Helvetica', 'Arial', sans-serif",
  'Avenir': "'Avenir Next', 'Segoe UI', sans-serif",
  'Playfair Display': "'Playfair Display', serif",
  'Cambria': "'Cambria', 'Georgia', serif",
  'JetBrains Mono': "'JetBrains Mono', monospace",
  'Plus Jakarta Sans': "'Plus Jakarta Sans', sans-serif",
}

const textSizeScales: Record<TextSize, string> = {
  'Tiny': '0.85rem',
  'Small': '0.92rem',
  'Regular': '1rem',
  'Large': '1.08rem',
  'Extra Large': '1.18rem',
  'Gigantic': '1.3rem',
}

const themeStorageKey = 'nextgen.theme.config.v2'
const GLASS_THEMES = ['Aurora Glass', 'Frosted Glass', 'Obsidian Glass', 'Silk Glass', 'Horizon Glass', 'Lavender Mist', 'Champagne Glass']
const DARK_THEMES = ['Woodland', 'Midnight Aurora', 'Wraith', 'Next Gen Ultra', 'Deep Space', 'Cyberpunk Neon', 'Emerald Empire', 'Crimson Velvet', 'Oceanic Depth', 'Jet Black', 'Obsidian Glass', 'Aurora Glass']

export function isLuminanceDark(hexColor?: string): boolean {
  if (!hexColor) return false
  const hex = hexColor.trim().replace('#', '')
  if (hex.length === 3) {
    const r = parseInt(hex[0] + hex[0], 16)
    const g = parseInt(hex[1] + hex[1], 16)
    const b = parseInt(hex[2] + hex[2], 16)
    return (0.299 * r + 0.587 * g + 0.114 * b) < 140
  }
  if (hex.length === 6) {
    const r = parseInt(hex.substring(0, 2), 16)
    const g = parseInt(hex.substring(2, 4), 16)
    const b = parseInt(hex.substring(4, 6), 16)
    return (0.299 * r + 0.587 * g + 0.114 * b) < 140
  }
  return false
}

export function computeIsDarkBackdrop(config: ThemeConfig): boolean {
  if (Boolean(config.activeBackground)) return true
  if (config.backgroundColor && isLuminanceDark(config.backgroundColor)) return true
  if (config.cardColor && isLuminanceDark(config.cardColor)) return true
  return DARK_THEMES.includes(config.activeTheme)
}

function loadThemeConfig(): ThemeConfig {
  try {
    const raw = JSON.parse(localStorage.getItem(themeStorageKey) || 'null')
    if (raw && typeof raw === 'object' && raw.activeTheme) return raw
  } catch {}
  return {
    activeTheme: 'Champagne Glass',
    activeFont: 'Plus Jakarta Sans',
    activeIconSet: 'Glassmorphic Hologram',
    activeTextSize: 'Small',
    panelOpacity: 0.85,
    activeBackground: null,
  }
}

type TenantOption = {id:string;name:string;slug:string}
type TreeNode = { id: string; name: string; kind: 'org'|'folder'|'project'|'environment'; children?: TreeNode[] }

interface NavItem {
  name: string
  icon: LucideIcon
}

interface NavSubSection {
  id: string
  title: string
  icon: LucideIcon
  links: NavItem[]
}

interface NavGroup {
  title: string
  links?: NavItem[]
  subSections?: NavSubSection[]
}

const groups: NavGroup[] = [
  {
    title: 'HOME & WORKSPACE',
    links: [
      { name: 'Dashboard', icon: LayoutDashboard },
      { name: 'Workspaces & Folders', icon: FolderTree },
      { name: 'Artifacts Registry', icon: Boxes },
      { name: 'My Tasks', icon: ListTodo },
    ],
  },
  {
    title: 'DESIGN STUDIOS',
    links: [
      { name: 'Flow Studio', icon: Workflow },
      { name: 'Agent Studio', icon: Bot },
      { name: 'App Studio', icon: AppWindow },
      { name: 'Document Studio', icon: FileText },
      { name: 'Knowledge Studio', icon: Database },
      { name: 'Test Studio', icon: FlaskConical },
    ],
  },
  {
    title: 'DEPLOYMENT & RELEASES',
    links: [
      { name: 'Release Manager', icon: Rocket },
      { name: 'Deployment Pipelines', icon: GitBranch },
      { name: 'Packages & Versions', icon: PackageCheck },
    ],
  },
  {
    title: 'OPERATIONS & ORCHESTRATION',
    links: [
      { name: 'Execution Center', icon: Play },
      { name: 'Queues & Transactions', icon: Layers3 },
      { name: 'Schedules & Triggers', icon: CalendarClock },
      { name: 'Human Tasks & Approvals', icon: CheckSquare },
      { name: 'Runners & Workers', icon: Cpu },
    ],
  },
  {
    title: 'MONITORING & SUPPORT',
    links: [
      { name: 'Observability Dashboard', icon: Activity },
      { name: 'SLA & Performance', icon: Gauge },
      { name: 'Incidents & Alerts', icon: AlertTriangle },
      { name: 'Support & Runbooks', icon: BookOpen },
      { name: 'Analytics & Reports', icon: BarChart3 },
    ],
  },
  {
    title: 'ADMINISTRATION',
    links: [
      { name: 'Organization & Tenants', icon: Building2 },
      { name: 'Environments', icon: GitMerge },
      { name: 'Users, Groups & Teams', icon: Users },
      { name: 'Roles & Permissions', icon: LockKeyhole },
      { name: 'Identity & SSO', icon: Network },
      { name: 'Integrations & MCP', icon: Database },
      { name: 'Repositories & APIs', icon: Terminal },
      { name: 'Compute & Capacity', icon: Server },
      { name: 'Licensing & Usage', icon: CreditCard },
    ],
  },
  {
    title: 'SECURITY & GOVERNANCE',
    links: [
      { name: 'Governance Console', icon: ShieldCheck },
      { name: 'Activity Audit Logs', icon: FileText },
      { name: 'Security Policies & MFA', icon: KeyRound },
      { name: 'Data Protection & PII', icon: ShieldAlert },
      { name: 'AI Model Governance', icon: Sparkles },
      { name: 'Compliance & Attestation', icon: ClipboardCheck },
    ],
  },
  {
    title: 'PLATFORM MANAGEMENT',
    links: [
      { name: 'Platform Control Center', icon: HeartPulse },
      { name: 'Platform Overview & Health', icon: Activity },
      { name: 'Infrastructure Inventory', icon: HardDrive },
      { name: 'Background Jobs & Maintenance', icon: RefreshCw },
      { name: 'Platform Configuration & Flags', icon: Settings2 },
    ],
  },
]

const flatLinks = groups.flatMap(g => [
  ...(g.links || []),
  ...((g.subSections || []).flatMap(s => s.links)),
])
const authStorage='architectiq.native.session.v1'
type SavedSession={token:string;tenant:string}
function readSession():SavedSession|null {
 try {const v=JSON.parse(sessionStorage.getItem(authStorage)||'null');return typeof v?.token==='string'&&typeof v?.tenant==='string'?v:null}catch{return null}
}
function clearSession(){sessionStorage.removeItem(authStorage)}

function TreeItem({node,depth,expanded,toggle,selected,select}:{node:TreeNode;depth:number;expanded:Set<string>;toggle:(id:string)=>void;selected:string;select:(node:TreeNode)=>void}) {
 const has=!!node.children?.length;const open=expanded.has(node.id);const Icon=node.kind==='org'?Database:node.kind==='folder'?(open?Folder:FolderClosed):node.kind==='project'?Layers3:Zap;
 return <div><button className={`tree-row ${selected===node.id?'tree-selected':''}`} style={{paddingLeft:10+depth*16}} onClick={()=>{select(node);if(has)toggle(node.id)}} aria-expanded={has?open:undefined}><span className="tree-chevron">{has?(open?<ChevronDown size={13}/>:<ChevronRight size={13}/>):null}</span><Icon size={15}/><span>{node.name}</span></button>{has&&open&&node.children?.map(child=><TreeItem key={child.id} node={child} depth={depth+1} expanded={expanded} toggle={toggle} selected={selected} select={select}/>)}</div>
}

function TrendChart(){
 return (
  <div className="trend-visual">
   <div className="chart-legend"><span><i className="legend-purple"/> Execution throughput</span><span><i className="legend-cyan"/> Queue arrivals</span></div>
   <svg viewBox="0 0 720 225" preserveAspectRatio="none" role="img" aria-label="Illustrative execution throughput and queue arrivals trends">
    <defs>
     <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#aa82ff" stopOpacity=".38"/><stop offset="1" stopColor="#aa82ff" stopOpacity="0"/></linearGradient>
     <linearGradient id="trendStroke"><stop stopColor="#8b7aff"/><stop offset="1" stopColor="#65d5f7"/></linearGradient>
    </defs>
    {[45,90,135,180].map(y=><line key={y} x1="0" x2="720" y1={y} y2={y} stroke="currentColor" strokeOpacity=".10" strokeDasharray="4 8"/>)}
    <path d="M0 174 C50 165 72 183 120 160 S193 180 235 145 S295 80 345 100 S405 30 455 74 S520 175 565 126 S635 40 720 35 L720 225 L0 225 Z" fill="url(#trendFill)"/>
    <path d="M0 174 C50 165 72 183 120 160 S193 180 235 145 S295 80 345 100 S405 30 455 74 S520 175 565 126 S635 40 720 35" fill="none" stroke="url(#trendStroke)" strokeWidth="4" strokeLinecap="round"/>
    <path d="M0 195 C80 205 120 178 170 188 S260 165 320 182 S430 128 500 142 S610 95 720 115" fill="none" stroke="#43d6c6" strokeWidth="2.5" strokeDasharray="8 7" strokeLinecap="round"/>
    <circle cx="455" cy="74" r="7" fill="#c3a5ff" stroke="#241d48" strokeWidth="4"/>
   </svg>
   <div className="chart-times"><span>00:00</span><span>04:00</span><span>08:00</span><span>12:00</span><span>16:00</span><span>20:00</span><span>23:59</span></div>
  </div>
 )
}

function App(){
 const [savedSession]=useState(readSession);const [token,setToken]=useState(savedSession?.token||'');const [tenant,setTenant]=useState(savedSession?.tenant||'');const [tenants,setTenants]=useState<TenantOption[]>([]);const [restoring,setRestoring]=useState(!!savedSession);const [liveNodes,setLiveNodes]=useState<TreeNode[]>([]);const [workspaceError,setWorkspaceError]=useState('');const nodes=liveNodes;
 const [summaryData,setSummaryData]=useState<{organizations:number;folders:number;projects:number;active_projects:number;archived_projects:number}|null>(null);
 const [overviewData,setOverviewData]=useState<{throughput_24h?:number;open_incidents?:Record<string,number>;sla_health_pct?:number;service_health?:string}|null>(null);
 const [active,setActive]=useState('Folders & Hierarchy');const [currentEnv,setCurrentEnv]=useState<'DEV'|'TEST'|'UAT'|'CANARY'|'PROD'>('DEV');const [search,setSearch]=useState(false);const [query,setQuery]=useState('');const [collapsed,setCollapsed]=useState(false);const [mobile,setMobile]=useState(false);const [treeOpen,setTreeOpen]=useState<Set<string>>(new Set());const [selected,setSelected]=useState<TreeNode|null>(null);const [notification,setNotification]=useState(false);
 const [newTenantModal,setNewTenantModal]=useState(false);const [newTenantName,setNewTenantName]=useState('');const [tenantCreating,setTenantCreating]=useState(false);const [tenantCreateError,setTenantCreateError]=useState('');
 const [currentUserRole, setCurrentUserRole] = useState('Tenant Admin');
 const [envModalOpen, setEnvModalOpen] = useState(false);
 const [guideModalOpen, setGuideModalOpen] = useState(false);
 const [footerModalTab, setFooterModalTab] = useState<FooterModalTab | null>(null);
 const [expandedSubSections, setExpandedSubSections] = useState<Set<string>>(
   new Set(['tenant-envs', '2-roles', '3-groups', '4-sso', '5-users', '6-integrations'])
 );
 const toggleSubSection = (id: string) => {
   setExpandedSubSections(prev => {
     const next = new Set(prev)
     if (next.has(id)) next.delete(id)
     else next.add(id)
     return next
   })
 };
 const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
 const toggleGroup = (title: string) => {
   setCollapsedGroups(prev => {
     const next = new Set(prev);
     if (next.has(title)) next.delete(title);
     else next.add(title);
     return next;
   });
 };
 useEffect(()=>{if(!token)return;let cancelled=false;fetch(`/api/v1/tenants/${tenant}/workspace/tree`,{headers:{Authorization:`Bearer ${token}`}}).then(async r=>{if(r.status===401){clearSession();setToken('');throw new Error('Session expired')}if(!r.ok)throw new Error(`Workspace HTTP ${r.status}`);return r.json()}).then(data=>{if(!cancelled){setLiveNodes(data);setWorkspaceError('');if(data.length>0){setSelected(prev=>prev||data[0])}}}).catch(e=>{if(!cancelled)setWorkspaceError(String(e))});return()=>{cancelled=true}},[token,tenant]);
 useEffect(()=>{
  if(!token||!tenant)return;let cancelled=false;
  fetch(`/api/v1/tenants/${tenant}/workspace/summary`,{headers:{Authorization:`Bearer ${token}`}}).then(r=>r.ok?r.json():null).then(d=>{if(!cancelled&&d)setSummaryData(d)}).catch(()=>{});
  fetch(`/api/v1/tenants/${tenant}/workspace/observability/overview`,{headers:{Authorization:`Bearer ${token}`}}).then(r=>r.ok?r.json():null).then(d=>{if(!cancelled&&d)setOverviewData(d)}).catch(()=>{});
  return()=>{cancelled=true};
 },[token,tenant]);
 useEffect(()=>{
  if(!savedSession)return;
  const controller=new AbortController();
  fetch('/api/v1/me/tenants',{headers:{Authorization:`Bearer ${savedSession.token}`},signal:controller.signal})
   .then(async r=>{if(!r.ok)throw new Error(`Session verification failed (${r.status})`);return r.json()})
   .then((available:TenantOption[])=>{
     if(controller.signal.aborted)return;
     if(!Array.isArray(available)||!available.length)throw new Error('No authorized tenants');
     setTenants(available);
     if(!available.some(t=>t.id===savedSession.tenant)){
       setTenant(available[0].id);
       sessionStorage.setItem(authStorage,JSON.stringify({token:savedSession.token,tenant:available[0].id}));
     }
   })
   .catch(()=>{if(!controller.signal.aborted){clearSession();setToken('');setTenant('');setTenants([]);setLiveNodes([])}})
   .finally(()=>{if(!controller.signal.aborted)setRestoring(false)});
  return()=>controller.abort();
 },[savedSession]);
 const unauthorized=useCallback(()=>{clearSession();setToken('');setTenant('');setLiveNodes([]);setTenants([])},[]);
 const changed=useCallback(()=>{fetch(`/api/v1/tenants/${tenant}/workspace/tree`,{headers:{Authorization:`Bearer ${token}`}}).then(r=>r.ok?r.json():Promise.reject(new Error(`HTTP ${r.status}`))).then(setLiveNodes).catch(e=>setWorkspaceError(String(e)))},[tenant,token]);

 const [activeOrg, setActiveOrg] = useState<{ id?: string; name: string; logo_url?: string }>(() => {
   try {
     const saved = localStorage.getItem('architectiq.active_org')
     if (saved) return JSON.parse(saved)
   } catch {}
   return { name: 'Citibank Global', logo_url: 'https://upload.wikimedia.org/wikipedia/commons/1/1b/Citi.svg' }
 })

 useEffect(() => {
   const handleOrgUpdate = (e: Event) => {
     const detail = (e as CustomEvent).detail
     if (detail && detail.name) {
       setActiveOrg(prev => ({ ...prev, ...detail }))
     }
   }
   window.addEventListener('architectiq:org_updated', handleOrgUpdate)
   return () => window.removeEventListener('architectiq:org_updated', handleOrgUpdate)
 }, [])

 useEffect(() => {
   if (!token) return
   fetch('/api/v1/platform/organizations', {
     headers: { Authorization: `Bearer ${token}` }
   })
     .then(r => r.ok ? r.json() : null)
     .then((list: Array<{ id: string; name: string; slug: string; logo_url?: string }>) => {
       if (Array.isArray(list) && list.length > 0) {
         const current = list.find(o => o.slug === 'citibank-global') || list[0]
         setActiveOrg({ id: current.id, name: current.name, logo_url: current.logo_url || undefined })
       }
     })
     .catch(() => {})
 }, [token])
 async function logout(){try{await fetch('/api/v1/auth/native/logout',{method:'POST',headers:{Authorization:`Bearer ${token}`}})}finally{clearSession();setToken('');setTenant('');setLiveNodes([]);setTenants([])}}
 async function handleCreateTenant(e: React.FormEvent){
  e.preventDefault();
  if(!newTenantName.trim())return;
  setTenantCreating(true);
  setTenantCreateError('');
  try {
   const res = await fetch('/api/v1/tenants',{
    method: 'POST',
    headers: {'Content-Type':'application/json', Authorization: `Bearer ${token}`},
    body: JSON.stringify({name: newTenantName.trim()})
   });
   if(!res.ok) throw new Error(`Create failed (${res.status})`);
   const created: TenantOption = await res.json();
   setTenants(prev => [...prev, created]);
   setTenant(created.id);
   sessionStorage.setItem(authStorage, JSON.stringify({token, tenant: created.id}));
   setNewTenantName('');
   setNewTenantModal(false);
   setLiveNodes([]);
  } catch(err) {
   setTenantCreateError(err instanceof Error ? err.message : 'Failed to create tenant');
  } finally {
   setTenantCreating(false);
  }
 }
 const [themeConfig, setThemeConfig] = useState<ThemeConfig>(loadThemeConfig)
 const updateTheme = (updated: Partial<ThemeConfig>) => {
  setThemeConfig(prev => {
   const next = { ...prev, ...updated }
   localStorage.setItem(themeStorageKey, JSON.stringify(next))
   return next
  })
 }
 const themeClass = `theme-${themeConfig.activeTheme.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
 const isGlass = GLASS_THEMES.includes(themeConfig.activeTheme)
 const dark = DARK_THEMES.includes(themeConfig.activeTheme)

 useEffect(() => {
  document.documentElement.style.setProperty('--panel-opacity', themeConfig.panelOpacity.toString())
 }, [themeConfig.panelOpacity])

 useEffect(() => {
  const rootScaleMap: Record<TextSize, string> = {
    'Tiny': '13px',
    'Small': '14.5px',
    'Regular': '16px',
    'Large': '17.5px',
    'Extra Large': '19.5px',
    'Gigantic': '22px',
  }
  const targetPx = rootScaleMap[themeConfig.activeTextSize] || '14.5px'
  document.documentElement.style.fontSize = targetPx
  document.documentElement.style.setProperty('--app-font-size', targetPx)
 }, [themeConfig.activeTextSize])

 useEffect(() => {
  const root = document.documentElement
  const classes = Array.from(root.classList).filter(c => !c.startsWith('theme-') && c !== 'dark' && c !== 'glass-mode')
  classes.push(themeClass)
  if (dark) classes.push('dark')
  if (isGlass) classes.push('glass-mode')
  root.className = classes.join(' ')
  document.body.className = root.className

  if (themeConfig.primaryColor) root.style.setProperty('--primary', themeConfig.primaryColor)
  else root.style.removeProperty('--primary')

  if (themeConfig.primaryFg) root.style.setProperty('--primary-foreground', themeConfig.primaryFg)
  else root.style.removeProperty('--primary-foreground')

  if (themeConfig.accentColor) root.style.setProperty('--accent', themeConfig.accentColor)
  else root.style.removeProperty('--accent')

  if (themeConfig.accentFg) root.style.setProperty('--accent-foreground', themeConfig.accentFg)
  else root.style.removeProperty('--accent-foreground')

  if (themeConfig.backgroundColor) root.style.setProperty('--background', themeConfig.backgroundColor)
  else root.style.removeProperty('--background')

  if (themeConfig.foregroundColor) root.style.setProperty('--foreground', themeConfig.foregroundColor)
  else root.style.removeProperty('--foreground')

  if (themeConfig.cardColor) {
    root.style.setProperty('--card', themeConfig.cardColor)
    root.style.setProperty('--card-custom', themeConfig.cardColor)
  } else {
    root.style.removeProperty('--card')
    root.style.removeProperty('--card-custom')
  }

  if (themeConfig.cardFg) root.style.setProperty('--card-foreground', themeConfig.cardFg)
  else root.style.removeProperty('--card-foreground')

  if (themeConfig.borderColor) root.style.setProperty('--border', themeConfig.borderColor)
  else root.style.removeProperty('--border')
 }, [themeClass, dark, isGlass, themeConfig])

 const matches = useMemo(() => flatLinks.filter(x => x.name.toLowerCase().includes(query.toLowerCase())), [query])

 useEffect(() => {
  const f = (e: KeyboardEvent) => {
   if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    setSearch(true)
   }
   if (e.key === 'Escape') {
    setSearch(false)
    setMobile(false)
    setNotification(false)
   }
  }
  window.addEventListener('keydown', f)
  return () => window.removeEventListener('keydown', f)
 }, [])

 const hasWallpaper = Boolean(themeConfig.activeBackground)
 const rootStyle = {
  '--panel-opacity': themeConfig.panelOpacity,
  fontFamily: fontFamilies[themeConfig.activeFont] || "'Plus Jakarta Sans', sans-serif",
  fontSize: textSizeScales[themeConfig.activeTextSize] || '0.92rem',
  '--wallpaper-url': themeConfig.activeBackground ? `url('${themeConfig.activeBackground}')` : 'none',
  backgroundImage: themeConfig.activeBackground ? `url('${themeConfig.activeBackground}')` : undefined,
  backgroundSize: 'cover',
  backgroundPosition: 'center',
  backgroundAttachment: 'fixed',
  ...(themeConfig.primaryColor ? { '--primary': themeConfig.primaryColor } : {}),
  ...(themeConfig.primaryFg ? { '--primary-foreground': themeConfig.primaryFg } : {}),
  ...(themeConfig.accentColor ? { '--accent': themeConfig.accentColor } : {}),
  ...(themeConfig.accentFg ? { '--accent-foreground': themeConfig.accentFg } : {}),
  ...(themeConfig.backgroundColor ? { '--background': themeConfig.backgroundColor } : {}),
  ...(themeConfig.foregroundColor ? { '--foreground': themeConfig.foregroundColor } : {}),
  ...(themeConfig.cardColor ? { '--card': themeConfig.cardColor, '--card-custom': themeConfig.cardColor } : {}),
  ...(themeConfig.cardFg ? { '--card-foreground': themeConfig.cardFg } : {}),
  ...(themeConfig.borderColor ? { '--border': themeConfig.borderColor } : {}),
 } as React.CSSProperties

 const isDark = dark || (themeConfig.cardColor ? isLuminanceDark(themeConfig.cardColor) : false)
 const brandLogo = isDark ? '/brand/logo-dark.png' : '/brand/logo-light.png'
 const brandShield = isDark ? '/brand/shield-hd.png' : '/brand/shield-light.png'
 const ambientOverlay = isDark ? 'rgba(0, 0, 0, 0.35)' : 'rgba(255, 255, 255, 0.25)'

 if (restoring) return <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--background)', color: 'var(--foreground)' }}>Restoring secure session…</main>
 if (!token) {
  return (
   <div className={`app-root ${themeClass} ${isGlass ? 'glass-mode' : ''} ${dark ? 'dark' : ''} ${hasWallpaper ? 'has-wallpaper' : ''} icon-set-${themeConfig.activeIconSet.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`} style={rootStyle}>
    {themeConfig.activeBackground && (
     <div style={{ position: 'fixed', inset: 0, background: ambientOverlay, backdropFilter: 'blur(2px)', pointerEvents: 'none', zIndex: 1 }} />
    )}
    {isGlass && !themeConfig.activeBackground && (
     <div className="blob-container">
      <div className="blob blob-1" />
      <div className="blob blob-2" />
      <div className="blob blob-3" />
     </div>
    )}
    <LoginScreen
     brandLogo={brandLogo}
     activeTheme={themeConfig.activeTheme}
     onLogin={(value, t, available) => {
      sessionStorage.setItem(authStorage, JSON.stringify({ token: value, tenant: t }))
      setTenants(available)
      setTenant(t)
      setToken(value)
     }}
    />
   </div>
  )
 }

 const navigate = (name: string) => { setActive(name); setSearch(false); setMobile(false); setQuery('') }
 const toggle = (id: string) => setTreeOpen(old => { const n = new Set(old); if (n.has(id)) n.delete(id); else n.add(id); return n })
 const select = (n: TreeNode) => { setSelected(n); setActive('Explorer') }

 const isDashboard = active === 'Dashboard'
 const isFoldersStudio = (active === 'Folders & Hierarchy' || active === 'Explorer' || active === 'Workspaces & Folders' || active === 'Workspace Management') && !isDashboard
 const isArtifactsStudio = active === 'Artifacts Registry'
 const isKnowledgeStudio = active === 'Knowledge Studio'
 const isTestStudio = active === 'Test Studio'
 const isDeploymentReleasesStudio = active === 'Release Manager' || active === 'Deployment Pipelines' || active === 'Packages & Versions'
 const isTenantEnvs = active === 'Environments' || active === 'Environment Settings' || active === 'Tenant Environments'
 const isExplorer = active === 'Projects'
 const isTenantAppsStudio = active === 'Applications' || active === 'General Settings' || active === 'App Studio'
 const isIamStudio = active === 'Role Catalog' || active === 'Build Custom Role' || active === 'Permission Matrix' || active === 'Segregation of Duties' || active === 'Roles & Permissions'
 const isAccessDirectoryStudio = active === 'Access Groups' || active === 'Identity Providers' || active === 'Map IdP Groups' || active === 'User Directory' || active === 'Pending Approvals' || active === 'Groups & Teams' || active === 'SSO & Mapping' || active === 'Users & Access' || active === 'Users & Approvals' || active === 'Users, Groups & Teams' || active === 'Identity & SSO'
 const isTenantIntegrationsStudio = active === 'Bot Agents' || active === 'Connected Systems & MCP' || active === 'Connected Systems' || active === 'Code Repositories' || active === 'API & Webhooks' || active === 'Assets & Credentials' || active === '6. Integrations' || active === 'Integrations & MCP' || active === 'Repositories & APIs'
 const isJobsOperations = active === 'Execution Center' || active === 'Queues & Transactions' || active === 'Schedules & Triggers' || active === 'Runners & Workers' || active === 'Jobs & Executions' || active === 'Run & Operate' || active === 'Schedules' || active === 'Queues & Approvals'
 const isApprovalsInbox = active === 'My Tasks' || active === 'Human Tasks & Approvals' || active === 'Approvals'
 const isObservability = active === 'Observability Dashboard' || active === 'SLA & Performance' || active === 'Incidents & Alerts' || active === 'Support & Runbooks' || active === 'Analytics & Reports' || active === 'Monitoring' || active === 'Monitor & Analyse' || active === 'Observability Console'
 const isGovernance = active === 'Governance Console' || active === 'Security Policies & MFA' || active === 'Data Protection & PII' || active === 'AI Model Governance' || active === 'Compliance & Attestation' || active === 'Governance'
 const isAuditViewer = active === 'Activity Audit Logs' || active === 'Audit Logs'
 const isPlatformControlCenter =
   active === 'Platform Control Center' ||
   active === 'Platform Overview & Health' ||
   active === 'Infrastructure Inventory' ||
   active === 'Platform Configuration & Flags' ||
   active === 'Compute & Capacity' ||
   active === 'Licensing & Usage' ||
   active === 'Platform Administration' ||
   active === 'Organization & Tenants' ||
   active === 'Manage Organizations & Tenants' ||
   active === 'Manage Organization and Tenant' ||
   active === 'Manage Organization & Tenant' ||
   active === 'Manage Organizations' ||
   active === 'Tenants' ||
   active === 'Manage Tenants' ||
   active === 'Tenant Fleet'
 const isPlatformMgmt = false
 const isTenantMgmt = false
 const studio = flatLinks.some(l => l.name === active)
 const liveThroughput = overviewData?.throughput_24h ?? 0
 const hasRuns = liveThroughput > 0

 return (
  <div className={`app-root ${themeClass} ${isGlass ? 'glass-mode' : ''} ${dark ? 'dark' : ''} ${hasWallpaper ? 'has-wallpaper' : ''} icon-set-${themeConfig.activeIconSet.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`} style={rootStyle}>
   {themeConfig.activeBackground && (
    <div style={{ position: 'fixed', inset: 0, background: ambientOverlay, backdropFilter: 'blur(2px)', pointerEvents: 'none', zIndex: 1 }} />
   )}
   {isGlass && !themeConfig.activeBackground && (
    <div className="blob-container">
     <div className="blob blob-1" />
     <div className="blob blob-2" />
     <div className="blob blob-3" />
    </div>
   )}

   <div className="shell-container">
    {mobile && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobile(false)} />}
    <aside className={`nextgen-sidebar ${collapsed ? 'collapsed' : ''} ${mobile ? 'mobile-open' : ''}`}>
     <div className="sidebar-top-header">
      <button className="sidebar-brand-btn" onClick={() => navigate('Folders & Hierarchy')} title="ArchitectIQ Home">
      {collapsed ? (
       <img key={brandShield} src={brandShield} alt="ArchitectIQ" style={{ width: 28, height: 32, objectFit: 'contain' }} />
      ) : (
       <img key={brandLogo} src={brandLogo} alt="ArchitectIQ" style={{ height: 34, maxWidth: 175, objectFit: 'contain', display: 'block' }} />
      )}
     </button>
     <button
      type="button"
      className="sidebar-collapse-toggle-btn"
      onClick={() => setCollapsed(v => !v)}
      title={collapsed ? "Expand Menu Bar" : "Collapse Menu Bar into Icons"}
      aria-label={collapsed ? "Expand Menu Bar" : "Collapse Menu Bar into Icons"}
     >
      {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
     </button>
    </div>

     <nav aria-label="Main navigation" className="sidebar-nav-scroll">
      {groups.map(group => {
       const isGroupCollapsed = collapsedGroups.has(group.title)
       return (
        <div key={group.title} className={`nav-group-section ${isGroupCollapsed ? 'is-collapsed' : ''}`}>
         {!collapsed ? (
          <button
           type="button"
           className="nav-group-header-btn"
           onClick={() => toggleGroup(group.title)}
           title={isGroupCollapsed ? `Expand ${group.title}` : `Collapse ${group.title}`}
           aria-expanded={!isGroupCollapsed}
          >
           <span className="nav-group-chevron">
            {isGroupCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
           </span>
           <span className="nav-group-title-text">{group.title}</span>
          </button>
         ) : (
          <div className="nav-group-collapsed-divider" title={group.title} />
         )}

         {(!isGroupCollapsed || collapsed) && (
          <>
           {group.links && (
            <div className="nav-links-list">
             {group.links.map(({ name, icon: Icon }) => (
              <button
               key={name}
               title={name}
               className={`nextgen-nav-item ${active === name ? 'active' : ''}`}
               onClick={() => navigate(name)}
              >
               <Icon size={16} />
               {!collapsed && <span>{name}</span>}
               {active === name && <span className="nav-active-dot" />}
              </button>
             ))}
            </div>
           )}

           {group.subSections && (
            <div className="nav-subsections-list">
             {group.subSections.map(sub => {
              const isExpanded = expandedSubSections.has(sub.id)
              const isSubActive = sub.links.some(l => l.name === active)
              const SubIcon = sub.icon
              return (
               <div key={sub.id} className="nav-subsection">
                <button
                 className={`nav-subsection-btn ${isSubActive ? 'active-parent' : ''}`}
                 title={sub.title}
                 onClick={() => {
                   if (collapsed) {
                     navigate(sub.links[0].name)
                   } else {
                     toggleSubSection(sub.id)
                   }
                 }}
                >
                 <span className="nav-subsection-chevron">
                  {!collapsed && (isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />)}
                 </span>
                 <SubIcon size={15} />
                 {!collapsed && <span style={{ flex: 1, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{sub.title}</span>}
                </button>

                {!collapsed && isExpanded && (
                 <div className="nav-sublinks-container">
                  {sub.links.map(({ name, icon: Icon }) => (
                   <button
                    key={name}
                    title={name}
                    className={`nav-sublink-item ${active === name ? 'active' : ''}`}
                    onClick={() => navigate(name)}
                   >
                    <Icon size={13} style={{ opacity: 0.8 }} />
                    <span>{name}</span>
                    {active === name && <span className="nav-active-dot" />}
                   </button>
                  ))}
                 </div>
                )}
               </div>
              )
             })}
            </div>
           )}
          </>
         )}
        </div>
       )
      })}
     </nav>

     <div className="sidebar-foot">
      <button className="nextgen-nav-item" onClick={() => navigate('Theme / Icons')}>
       <Palette size={16} />
       {!collapsed && <span>Theme / Icons</span>}
      </button>
      <div className="user-identity-card">
       <span className="user-avatar-circle">A</span>
       {!collapsed && (
        <div className="user-names-stack">
         <strong>Enterprise Administrator</strong>
         <small>admin@architectiq.io</small>
        </div>
       )}
      </div>
     </div>
    </aside>

    <div className="nextgen-main-column">
     <header className="nextgen-topbar">
      <div className="topbar-left-cluster">


       {/* 1. Unified Customer Organization & Tenant Selector Pill */}
       <div className="topbar-hierarchy-pill" title={`Customer Organization: ${activeOrg.name} and Active Tenant`}>
        {activeOrg.logo_url ? (
          <img
            src={activeOrg.logo_url}
            alt={activeOrg.name}
            style={{
              width: 18,
              height: 18,
              objectFit: 'contain',
              borderRadius: 3,
            }}
            onError={(e) => {
              (e.currentTarget as HTMLElement).style.display = 'none';
            }}
          />
        ) : (
          <Building2 size={13} style={{ color: 'var(--accent, #BA9731)' }} />
        )}
        <span className="topbar-org-name">{activeOrg.name}</span>
        <span className="topbar-sep">/</span>
        <select
          aria-label="Active tenant selector"
          className="topbar-tenant-select"
          value={tenant}
          onChange={e => {
            setTenant(e.target.value)
            setLiveNodes([])
            sessionStorage.setItem(authStorage, JSON.stringify({ token, tenant: e.target.value }))
          }}
        >
          {tenants.map(t => (
            <option key={t.id} value={t.id} style={{ background: 'var(--card)', color: 'var(--foreground)' }}>
              {t.name}
            </option>
          ))}
        </select>
       </div>

       {/* 2. Environment Switcher Pill on Top */}
       <button
        className="topbar-tenant-pill"
        onClick={() => setEnvModalOpen(true)}
        title="Configure & Switch Tenant Environment (DEV, UAT, CANARY, PROD)"
       >
        <span
          className="env-status-dot"
          style={{
            background:
              currentEnv === 'PROD'
                ? '#EF4444'
                : currentEnv === 'CANARY'
                ? '#A855F7'
                : currentEnv === 'UAT'
                ? '#F59E0B'
                : '#10B981',
            boxShadow: `0 0 8px ${currentEnv === 'PROD' ? '#EF4444' : currentEnv === 'CANARY' ? '#A855F7' : currentEnv === 'UAT' ? '#F59E0B' : '#10B981'}80`
          }}
        />
        <strong>{currentEnv}</strong>
        <span className="env-label">
          ({currentEnv === 'DEV' ? 'Development' : currentEnv === 'CANARY' ? 'Canary' : currentEnv === 'UAT' ? 'UAT' : 'Production'})
        </span>
        <ChevronDown size={11} style={{ opacity: 0.6 }} />
       </button>
      </div>

      <div style={{ flex: 1, maxWidth: 360, margin: '0 8px' }}>
       <button className="topbar-search-btn" onClick={() => setSearch(true)}>
        <Search size={14} style={{ opacity: 0.6 }} />
        <span>Search folders, jobs, artifacts...</span>
        <kbd>Ctrl K</kbd>
       </button>
      </div>

      <div className="topbar-right-cluster">
       {/* 3. User Identity & Role — Pure Text Visual (Name in Bold, Role unbold below User Name) */}
       <div className="topbar-user-profile-stack" title={`Signed in as Enterprise Administrator (${currentUserRole})`}>
        <span className="topbar-user-name">Enterprise Administrator</span>
        <div className="topbar-user-role-wrap">
          <select
            aria-label="Active Identity and Role Tier"
            className="topbar-user-role-select"
            value={currentUserRole}
            onChange={e => setCurrentUserRole(e.target.value)}
          >
            <option value="Tenant Admin">Tenant Admin</option>
            <option value="Org Admin">Org Admin</option>
            <option value="Tenant Specific Admin">Tenant Admin</option>
            <option value="Environment Specific Admin">Env Admin ({currentEnv})</option>
            <option value="AI Agent & Flow Architect">Flow Architect</option>
            <option value="Compliance Auditor">Auditor</option>
          </select>
          <ChevronDown size={9} className="role-dropdown-chevron" />
        </div>
       </div>

       {/* 4. Guide Menu on Top Bar */}
       <button
         className="topbar-tool-btn"
         onClick={() => setGuideModalOpen(true)}
         title="ArchitectIQ User & Architecture Guide"
       >
        <BookOpen size={13} style={{ color: 'var(--accent, #BA9731)' }} />
        <span>Guide</span>
       </button>

       {/* 5. Theme / Appearance Button */}
       <button
         className="topbar-tool-btn"
         onClick={() => navigate('Theme / Icons')}
         title="Personalize Theme & Appearance"
       >
        <Palette size={13} />
        <span>Theme</span>
       </button>

       <button className="topbar-icon-action" aria-label="Notifications" onClick={() => setNotification(v => !v)}>
        <Bell size={14} />
       </button>

       {/* 6. Sign Out Icon Button */}
       <button className="topbar-icon-action signout-icon-btn" aria-label="Sign out" title="Sign out" onClick={logout}>
        <LogOut size={13} />
       </button>
      </div>
     </header>

     {notification && (
      <div className="notification-panel glass">
       <strong>Notifications</strong>
       <p>No live notifications. Connect the backend to receive operational events.</p>
      </div>
     )}

     <main className="dashboard-page-shell">
      {active === 'Theme / Icons' && (
       <ThemeAppearanceStudio config={themeConfig} onChange={updateTheme} brandLogo={brandLogo} isDarkBackdrop={isDark} />
      )}

      {active === 'Dashboard' && (
       <>
        <section className="glass-card panel-padded" style={{ marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', overflow: 'hidden' }}>
         <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.65rem', fontWeight: 800, color: 'var(--accent, #BA9731)', letterSpacing: '0.1em' }}>
           <span className="live-dot" /> YOUR INTELLIGENT WORKSPACE
          </div>
          <h1 style={{ fontSize: '1.9rem', fontWeight: 800, letterSpacing: '-0.03em', margin: '10px 0 6px', color: 'var(--foreground)' }}>
           Good to see you at <span style={{ color: 'var(--accent, #BA9731)' }}>ArchitectIQ.</span>
          </h1>
          <p style={{ color: 'var(--muted-foreground)', fontSize: '0.85rem', margin: 0, maxWidth: 540, lineHeight: 1.6 }}>
           Design, orchestrate and govern enterprise automation in one connected command center.
          </p>
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
           <button className="primary-button" onClick={() => navigate('Explorer')}>
            <FolderKanban size={15} /> Open workspace <ArrowRight size={15} />
           </button>
           <button className="secondary-button" onClick={() => navigate('Flow Studio')}>
            <Workflow size={15} /> Explore Flow Studio
           </button>
          </div>
         </div>
         <div className="hero-visual" aria-hidden="true">
          <div className="visual-halo" />
          <div className="visual-center"><Sparkles size={43} /></div>
          <div className="visual-mini v-one"><Workflow size={21} /></div>
          <div className="visual-mini v-two"><Bot size={21} /></div>
          <div className="visual-mini v-three"><ShieldCheck size={21} /></div>
         </div>
        </section>

        <div className="enterprise-section-title">
         <div><span className="section-overline">COMMAND CENTER</span><h2>Workspace overview</h2></div>
         <span className="preview-pill"><span className="live-dot" /> Live Telemetry</span>
        </div>
        <div className="metrics-grid">
         {[
          { label: 'Active projects', value: summaryData ? String(summaryData.active_projects).padStart(2, '0') : '00', sub: `Across ${summaryData?.folders ?? 0} folders`, icon: Layers3 },
          { label: 'Queue throughput', value: hasRuns ? liveThroughput.toLocaleString() : '00', sub: hasRuns ? 'Durable state machine' : '0 active items', icon: ListTodo },
          { label: 'SLA Resilience', value: hasRuns ? `${overviewData?.sla_health_pct ?? 0}%` : 'N/A', sub: hasRuns ? (overviewData?.service_health || 'Operational') : 'No runs recorded', icon: Play },
          { label: 'Active Incidents', value: overviewData?.open_incidents ? String(Object.values(overviewData.open_incidents).reduce((a, b) => a + b, 0)).padStart(2, '0') : '00', sub: 'SEV tracking', icon: ClipboardCheck },
         ].map((m, i) => (
          <div className="metric-card glass" key={m.label}>
           <div className="metric-top"><span>{m.label}</span><m.icon size={19} /></div>
           <strong>{m.value}</strong>
           <small>{m.sub}</small>
           <div className={`metric-line metric-line-${i}`} />
          </div>
         ))}
        </div>

        <div className="analytics-grid">
         <section className="analytics-main glass">
          <div className="panel-head">
           <div><span className="section-overline">EXECUTION INTELLIGENCE</span><h3>Automation performance</h3><p className="analytics-subtitle">Live throughput across your automation landscape</p></div>
           <span className="preview-pill"><span className="live-dot" /> TELEMETRY</span>
          </div>
          <div className="analytics-highlight">
           <strong>{hasRuns ? liveThroughput.toLocaleString() : '00'}</strong>
           <span className="trend-up" style={{ opacity: hasRuns ? 1 : 0.6 }}>
            {hasRuns ? 'Active telemetry' : 'Idle'}
           </span>
           <small>{hasRuns ? 'Completed transactions (last 24h)' : 'No transactions recorded (last 24h)'}</small>
          </div>
          {hasRuns ? (
           <TrendChart />
          ) : (
           <div style={{ height: 225, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--muted, #94a3b8)', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 12, margin: '16px 0' }}>
            <Activity size={32} style={{ opacity: 0.35, marginBottom: 8 }} />
            <span style={{ fontSize: '0.92rem', fontWeight: 600 }}>No execution telemetry recorded</span>
            <span style={{ fontSize: '0.8rem', opacity: 0.7, marginTop: 4 }}>Deploy and run workflows to stream live performance throughput.</span>
           </div>
          )}
         </section>
         <section className="analytics-side glass">
          <div className="panel-head">
           <div><span className="section-overline">OPERATIONAL HEALTH</span><h3>Execution mix</h3></div>
           <span className="preview-pill"><span className="live-dot" /> LIVE</span>
          </div>
          {hasRuns ? (
           <>
            <div className="donut-chart">
             <div className="donut-hole">
              <strong>{overviewData?.sla_health_pct ?? 0}%</strong>
              <small>SLA Health</small>
             </div>
            </div>
            <div className="donut-legend">
             <span><i style={{ background: '#8e7bff' }} /> SLA Health <strong>{overviewData?.sla_health_pct ?? 0}%</strong></span>
             <span><i style={{ background: '#43d6c6' }} /> Health status <strong>{overviewData?.service_health || 'Operational'}</strong></span>
            </div>
           </>
          ) : (
           <div style={{ height: 245, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--muted, #94a3b8)', textAlign: 'center', padding: '0 20px' }}>
            <div style={{ width: 110, height: 110, borderRadius: '50%', border: '4px dashed rgba(255,255,255,0.12)', display: 'grid', placeItems: 'center', marginBottom: 14 }}>
             <span style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--muted, #94a3b8)' }}>--</span>
            </div>
            <strong style={{ fontSize: '0.92rem', color: 'var(--fg, #e2e8f0)' }}>No execution data</strong>
            <small style={{ fontSize: '0.8rem', color: 'var(--muted, #94a3b8)', marginTop: 4 }}>SLA health metrics calculate automatically as workflows execute.</small>
           </div>
          )}
         </section>
        </div>

        <div className="dashboard-columns">
         <section className="workspace-panel glass">
          <div className="panel-head">
           <div><span className="section-overline">STRUCTURE</span><h3>Workspace explorer</h3></div>
           <button className="text-action" onClick={() => navigate('Explorer')}>Open explorer <ArrowRight size={15} /></button>
          </div>
          <div className="tree-wrap">
           {workspaceError && <p role="alert">{workspaceError}</p>}
           {!nodes.length && <p>No workspace resources found.</p>}
           {nodes.map(n => <TreeItem key={n.id} node={n} depth={0} expanded={treeOpen} toggle={toggle} selected={selected?.id || ''} select={select} />)}
          </div>
          <div className="panel-foot">Live tenant hierarchy</div>
         </section>

         <section className="workspace-panel glass">
          <div className="panel-head">
           <div><span className="section-overline">OPERATIONS</span><h3>Execution snapshot</h3></div>
           <span className="preview-pill"><span className="live-dot" /> LIVE</span>
          </div>
          <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted, #94a3b8)' }}>
           <Play size={26} style={{ opacity: 0.35, marginBottom: 8 }} />
           <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 500 }}>No recent workflow executions</p>
           <p style={{ marginTop: 4, fontSize: '0.82rem' }}>Launch Flow Studio to design and run automated enterprise workflows.</p>
          </div>
          <div className="panel-foot">Tenant execution stream</div>
         </section>
        </div>

        <div className="enterprise-section-title">
         <div><span className="section-overline">BUILD &amp; ORCHESTRATE</span><h2>Launch a studio</h2></div>
        </div>
        <div className="launch-grid">
         {[
          { name: 'Flow Studio', icon: Workflow, desc: 'Visual workflow orchestration' },
          { name: 'Agent Builder', icon: Bot, desc: 'Governed AI agents & tools' },
          { name: 'Document Studio', icon: FileText, desc: 'Intelligent document processing' },
          { name: 'App Studio', icon: AppWindow, desc: 'Enterprise app experiences' },
          { name: 'Theme / Icons', icon: Palette, desc: 'Personalize ArchitectIQ appearance' },
          { name: 'Governance', icon: ShieldCheck, desc: 'Policies, risks & controls' },
         ].map(({ name, icon: Icon, desc }) => (
          <button className="launch-card glass" key={name} onClick={() => navigate(name)}>
           <span className="launch-icon"><Icon size={23} /></span>
           <strong>{name}</strong>
           <small>{desc}</small>
           <ArrowRight className="launch-arrow" size={17} />
          </button>
         ))}
        </div>
       </>
      )}

      {active === 'Artifacts Registry' && (
       <ArtifactsRegistryStudio
        token={token}
        tenant={tenant}
        tenantName={tenants.find(t => t.id === tenant)?.name || 'Citibank'}
        currentEnv={currentEnv}
       />
      )}

      {isKnowledgeStudio && (
       <KnowledgeStudio
        token={token}
        tenant={tenants.find(t => t.id === tenant)?.name || 'Citibank'}
        currentEnv={currentEnv}
       />
      )}

      {isTestStudio && (
       <TestStudio
        token={token}
        tenant={tenants.find(t => t.id === tenant)?.name || 'Citibank'}
        currentEnv={currentEnv}
       />
      )}

      {isDeploymentReleasesStudio && (
       <DeploymentReleasesStudio
        token={token}
        tenant={tenants.find(t => t.id === tenant)?.name || 'Citibank'}
        currentEnv={currentEnv}
       />
      )}

      {isTenantEnvs && (
       <EnvironmentTenantModal
        isOpen={true}
        onClose={() => navigate('Workspaces & Folders')}
        currentEnv={currentEnv}
        onSelectEnv={setCurrentEnv}
        currentTenantId={tenant}
        tenants={tenants}
        onSelectTenant={(id) => {
          setTenant(id);
          setLiveNodes([]);
          sessionStorage.setItem(authStorage, JSON.stringify({ token, tenant: id }));
        }}
        userRole={currentUserRole}
       />
      )}

      {isFoldersStudio && (
       <ManageFoldersStudio
        token={token}
        tenant={tenant}
        tenantName={tenants.find(t => t.id === tenant)?.name || 'Citibank'}
        tenants={tenants}
        onSelectTenant={(id) => {
          setTenant(id);
          setLiveNodes([]);
          sessionStorage.setItem(authStorage, JSON.stringify({ token, tenant: id }));
        }}
        onOpenNewTenant={() => setNewTenantModal(true)}
        currentEnv={currentEnv}
        onSelectEnv={setCurrentEnv}
        onUnauthorized={unauthorized}
        onChanged={changed}
       />
      )}

      {isTenantAppsStudio && (
       <TenantApplicationsStudio
        initialTab={active === 'General Settings' ? 'general' : 'apps'}
        currentEnv={currentEnv}
        tenantName={tenants.find(t => t.id === tenant)?.name || 'Citibank'}
       />
      )}

      {isIamStudio && (
       <IamRolesStudio
        initialTab={
          active === 'Build Custom Role' ? 'builder' :
          active === 'Permission Matrix' ? 'matrix' :
          active === 'Segregation of Duties' ? 'sod' : 'roles'
        }
        currentEnv={currentEnv}
        tenantName={tenants.find(t => t.id === tenant)?.name || 'Citibank'}
       />
      )}

      {isAccessDirectoryStudio && (
       <AccessDirectoryStudio
        initialTab={
          active === 'Identity Providers' || active === 'Identity & SSO' ? 'security' :
          active === 'Map IdP Groups' ? 'mappings' :
          active === 'User Directory' ? 'users' :
          active === 'Pending Approvals' ? 'approvals' : 'groups'
        }
        currentEnv={currentEnv}
        tenantName={tenants.find(t => t.id === tenant)?.name || 'Citibank'}
       />
      )}

      {isTenantIntegrationsStudio && (
       <TenantIntegrationsStudio
        initialTab={
          active === 'Bot Agents' ? 'bots' :
          active === 'Code Repositories' || active === 'Repositories & APIs' ? 'repos' :
          active === 'API & Webhooks' ? 'webhooks' : 'systems'
        }
        currentEnv={currentEnv}
        tenantName={tenants.find(t => t.id === tenant)?.name || 'Citibank'}
       />
      )}

      {isExplorer && <WorkspaceLive view={active} token={token} tenant={tenant} tenantName={tenants.find(t => t.id === tenant)?.name || 'Workspace'} onUnauthorized={unauthorized} onChanged={changed} />}
      {active === 'Flow Studio' && <FlowStudio token={token} tenant={tenant} projectId={selected?.kind === 'project' ? selected.id : undefined} />}
      {(active === 'Agent Studio' || active === 'Agent Builder') && <AgentStudio token={token} tenant={tenant} projectId={selected?.kind === 'project' ? selected.id : undefined} />}
      {active === 'Document Studio' && <DocumentStudio token={token} tenant={tenant} projectId={selected?.kind === 'project' ? selected.id : undefined} />}
      {isJobsOperations && (
       <JobsMonitor token={token} tenant={tenant} projectId={selected?.kind === 'project' ? selected.id : undefined} />
      )}
      {isApprovalsInbox && <ApprovalsInbox token={token} tenant={tenant} projectId={selected?.kind === 'project' ? selected.id : undefined} />}
      {isObservability && (
       <ObservabilityConsole token={token} tenant={tenant} projectId={selected?.kind === 'project' ? selected.id : undefined} />
      )}
      {isGovernance && <GovernanceConsole token={token} tenant={tenant} projectId={selected?.kind === 'project' ? selected.id : undefined} />}
      {isAuditViewer && <ActivityAuditViewer token={token} tenant={tenant} projectId={selected?.kind === 'project' ? selected.id : undefined} />}
      {isPlatformControlCenter && (
       <PlatformControlCenterStudio
        token={token}
        initialTab={
          active === 'Organization & Tenants' || active === 'Manage Organizations' || active === 'Manage Organization and Tenant' || active === 'Manage Organization & Tenant' || active === 'Manage Organizations & Tenants' ? 'organizations' :
          active === 'Tenants' || active === 'Manage Tenants' || active === 'Tenant Fleet' ? 'fleet' :
          active === 'Infrastructure Inventory' || active === 'Compute & Capacity' ? 'infrastructure' :
          active === 'Platform Configuration & Flags' ? 'diagnostics' :
          active === 'Licensing & Usage' ? 'subscriptions' :
          'dashboard'
        }
       />
      )}

      {studio &&
       !isFoldersStudio &&
       !isArtifactsStudio &&
       !isKnowledgeStudio &&
       !isTestStudio &&
       !isDeploymentReleasesStudio &&
       !isTenantAppsStudio &&
       !isIamStudio &&
       !isAccessDirectoryStudio &&
       !isTenantIntegrationsStudio &&
       !isJobsOperations &&
       !isApprovalsInbox &&
       !isObservability &&
       !isGovernance &&
       !isAuditViewer &&
       !isPlatformControlCenter &&
       !isPlatformMgmt &&
       !isTenantMgmt &&
       active !== 'Flow Studio' &&
       active !== 'Agent Studio' &&
       active !== 'Agent Builder' &&
       active !== 'Document Studio' &&
       active !== 'Theme / Icons' &&
       active !== 'Dashboard' && (
       <>
        <div className="page-heading">
         <div>
          <span className="section-overline">ARCHITECTIQ MODULE</span>
          <h1>{active}</h1>
          <p>Enterprise orchestration, governance, and operational visibility.</p>
         </div>
         <span className="preview-pill"><span className="live-dot" /> LIVE ARCHITECTIQ</span>
        </div>
        <div className="module-layout">
         <section className="workspace-panel glass module-primary">
          <div className="module-toolbar">
           <span className="module-breadcrumb">ArchitectIQ / {active}</span>
           <div>
            <button className="tool-button" onClick={() => setSearch(true)}><Search size={15} /> Find</button>
            <button className="tool-button" onClick={() => navigate('Theme / Icons')}><Palette size={15} /> Appearance</button>
           </div>
          </div>
          <div className="module-canvas">
           <div className="canvas-decoration"><div /><div /><div /></div>
           <span className="module-emblem">{(() => { const Icon = flatLinks.find(n => n.name === active)?.icon || Command; return <Icon size={37} /> })()}</span>
           <h2>{active} workspace</h2>
           <p>Full ArchitectIQ framework active. Real-time telemetry, execution tracking, and tenant isolation enabled.</p>
           <button className="secondary-button" onClick={() => navigate('Explorer')}><FolderKanban size={17} /> Browse workspace</button>
          </div>
         </section>
         <aside className="workspace-panel glass module-side">
          <div className="panel-head"><h3>Workspace details</h3><MoreHorizontal size={18} /></div>
          <div className="detail-line"><span>Status</span><strong>Active</strong></div>
          <div className="detail-line"><span>Theme</span><strong>{themeConfig.activeTheme}</strong></div>
          <div className="detail-line"><span>Typography</span><strong>{themeConfig.activeFont}</strong></div>
          <div className="detail-line"><span>Density</span><strong>{themeConfig.activeTextSize}</strong></div>
          <div className="notice-box"><ShieldCheck size={18} /> Enterprise policy enforcement &amp; tenant security active.</div>
         </aside>
        </div>
       </>
      )}
     </main>
     <footer className="nextgen-footer">
      <div className="footer-left">
       <img src={brandShield} alt="ArchitectIQ" className="footer-logo-img" />
       <strong className="footer-tool-name">ArchitectIQ</strong>
       <span className="footer-sep">|</span>
       <span className="footer-copyright">© 2026 Ratheesh Technology Ltd. All rights reserved.</span>
      </div>
      <div className="footer-right">
       <button className="footer-nav-link" onClick={() => setFooterModalTab('about')}>About</button>
       <span className="footer-dot">•</span>
       <button className="footer-nav-link" onClick={() => setFooterModalTab('roadmap')}>Roadmap</button>
       <span className="footer-dot">•</span>
       <button className="footer-nav-link" onClick={() => setFooterModalTab('contact')}>Contact</button>
      </div>
     </footer>
    </div>
   </div>

   {search && (
    <div className="search-overlay" onMouseDown={e => { if (e.target === e.currentTarget) setSearch(false) }}>
     <div className="search-dialog glass" role="dialog" aria-modal="true" aria-label="Search navigation">
      <div className="search-input-wrap">
       <Search size={21} />
       <input autoFocus aria-label="Search studios and pages" placeholder="Search jobs, logs, studios and pages..." value={query} onChange={e => setQuery(e.target.value)} />
       <button className="escape-key" onClick={() => setSearch(false)}>ESC</button>
      </div>
      <div className="search-results">
       {matches.length ? matches.map(({ name, icon: Icon }) => (
        <button key={name} onClick={() => navigate(name)}>
         <Icon size={18} />{name}<ArrowRight size={16} />
        </button>
       )) : <p>No matching pages found.</p>}
      </div>
      <div className="search-footer">ArchitectIQ Enterprise Workspace</div>
     </div>
    </div>
   )}

   {newTenantModal && (
    <div className="search-overlay" onMouseDown={e => { if (e.target === e.currentTarget) setNewTenantModal(false) }}>
     <div className="search-dialog glass" style={{ maxWidth: 440, padding: 24 }} role="dialog" aria-modal="true" aria-label="Create New Tenant">
      <h2 style={{ margin: '0 0 8px', fontSize: '1.25rem' }}>Create New Tenant</h2>
      <p style={{ fontSize: '0.85rem', color: 'var(--muted, #94a3b8)', marginBottom: 16 }}>Add an isolated tenant organization to your ArchitectIQ workspace.</p>
      <form onSubmit={handleCreateTenant}>
       <label style={{ display: 'block', marginBottom: 12, fontSize: '0.85rem' }}>
        Tenant Name
        <input
         style={{ width: '100%', marginTop: 6, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface, #181c27)', color: 'inherit', boxSizing: 'border-box' }}
         autoFocus
         required
         placeholder="e.g. Citibank North America"
         value={newTenantName}
         onChange={e => setNewTenantName(e.target.value)}
        />
       </label>
       {tenantCreateError && <p role="alert" style={{ color: '#ff8c9b', fontSize: '0.85rem' }}>{tenantCreateError}</p>}
       <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
        <button type="button" className="secondary-button" onClick={() => setNewTenantModal(false)}>Cancel</button>
        <button type="submit" className="primary-button" disabled={tenantCreating}>{tenantCreating ? 'Creating…' : 'Create Tenant'}</button>
       </div>
      </form>
     </div>
    </div>
   )}

   <EnvironmentTenantModal
    isOpen={envModalOpen}
    onClose={() => setEnvModalOpen(false)}
    currentEnv={currentEnv}
    onSelectEnv={setCurrentEnv}
    currentTenantId={tenant}
    tenants={tenants}
    onSelectTenant={(id) => {
      setTenant(id);
      setLiveNodes([]);
      sessionStorage.setItem(authStorage, JSON.stringify({ token, tenant: id }));
    }}
    userRole={currentUserRole}
   />

   <GuideModal
    isOpen={guideModalOpen}
    onClose={() => setGuideModalOpen(false)}
   />

   <FooterInfoModal
    isOpen={footerModalTab !== null}
    initialTab={footerModalTab || 'about'}
    onClose={() => setFooterModalTab(null)}
    brandShield={brandShield}
   />
  </div>
 )
}

export default App

