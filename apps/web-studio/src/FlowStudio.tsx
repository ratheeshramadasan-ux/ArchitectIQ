import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
} from '@xyflow/react'
import type { Node, Edge, Connection, NodeProps } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import ELK from 'elkjs/lib/elk.bundled.js'
import {
  Activity,
  AlertCircle,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Clock,
  Cpu,
  FileText,
  GitBranch,
  Layers3,
  Network,
  Play,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Terminal,
  Trash2,
  UploadCloud,
  X,
  Zap,
} from 'lucide-react'

const elk = new ELK()

export type WorkflowNodeData = {
  label: string
  nodeType:
    | 'TRIGGER'
    | 'ACTION'
    | 'DECISION'
    | 'AI_AGENT'
    | 'APPROVAL'
    | 'INTEGRATION'
    | 'DOCUMENT_AI'
    | 'RULE'
    | 'NOTIFICATION'
    | 'TERMINAL'
    | 'MCP_TOOL'
    | 'PARALLEL_SPLIT'
    | 'TRY_CATCH'
    | 'FOR_EACH'
    | 'DELAY'
  config: Record<string, unknown>
  executionStatus?: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'SUSPENDED' | 'SKIPPED'
}

export type VariableDef = {
  name: string
  type: 'string' | 'number' | 'boolean' | 'json'
  default_value: unknown
  is_secret: boolean
  description?: string
}

export type ValidationReport = {
  is_valid: boolean
  errors: string[]
  warnings: string[]
  stats?: {
    node_count: number
    edge_count: number
    variable_count: number
    trigger_count: number
  }
}

export type AiModelRoute = {
  id: string
  route_key: string
  display_name: string
  primary_provider: string
  primary_model: string
  fallback_model?: string
  timeout_ms: number
  max_retries: number
  cost_limit_daily?: number
  is_active: boolean
}

export type TelemetrySpan = {
  span_id: string
  parent_span_id?: string
  node_id: string
  node_type: string
  status: string
  duration_ms: number
  started_at?: string
  completed_at?: string
  metrics?: { tokens?: number; cost_usd?: number }
  logs?: { timestamp: string; level: string; message: string }[]
  input_payload?: Record<string, unknown>
  output_payload?: Record<string, unknown>
  error_message?: string
}

export type ExecutionTelemetry = {
  run_id: string
  otel_trace_id?: string
  status: string
  started_at?: string
  completed_at?: string
  duration_ms: number
  metrics?: { total_tokens?: number; estimated_cost_usd?: number; latency_ms?: number }
  spans: TelemetrySpan[]
}

export type HumanTask = {
  id: string
  run_id: string
  step_run_id?: string
  node_id: string
  title: string
  description?: string
  required_role: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED'
  task_payload?: Record<string, unknown>
  created_at: string
}

// Custom Node Component for React Flow
function ArchitectNode({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as WorkflowNodeData
  const nodeType = nodeData.nodeType || 'ACTION'
  const execStatus = nodeData.executionStatus

  const { icon: Icon, color, borderColor, badge } = useMemo(() => {
    switch (nodeType) {
      case 'TRIGGER':
        return { icon: Zap, color: '#f59e0b', borderColor: 'rgba(245, 158, 11, 0.6)', badge: 'TRIGGER' }
      case 'DECISION':
        return { icon: GitBranch, color: '#38bdf8', borderColor: 'rgba(56, 189, 248, 0.6)', badge: 'DECISION' }
      case 'AI_AGENT':
        return { icon: Bot, color: '#a855f7', borderColor: 'rgba(168, 85, 247, 0.6)', badge: 'AI AGENT' }
      case 'APPROVAL':
        return { icon: ShieldCheck, color: '#ec4899', borderColor: 'rgba(236, 72, 153, 0.6)', badge: 'APPROVAL' }
      case 'DOCUMENT_AI':
        return { icon: FileText, color: '#10b981', borderColor: 'rgba(16, 185, 129, 0.6)', badge: 'DOCUMENT AI' }
      case 'INTEGRATION':
        return { icon: Network, color: '#6366f1', borderColor: 'rgba(99, 102, 241, 0.6)', badge: 'INTEGRATION' }
      case 'MCP_TOOL':
        return { icon: Cpu, color: '#06b6d4', borderColor: 'rgba(6, 182, 212, 0.6)', badge: 'MCP TOOL' }
      case 'RULE':
        return { icon: ClipboardCheck, color: '#eab308', borderColor: 'rgba(234, 179, 8, 0.6)', badge: 'RULE' }
      case 'TERMINAL':
        return { icon: Terminal, color: '#64748b', borderColor: 'rgba(100, 116, 139, 0.6)', badge: 'END' }
      default:
        return { icon: Play, color: '#60a5fa', borderColor: 'rgba(96, 165, 250, 0.6)', badge: 'ACTION' }
    }
  }, [nodeType])

  const statusColor = useMemo(() => {
    switch (execStatus) {
      case 'COMPLETED':
        return '#22c55e'
      case 'RUNNING':
        return '#3b82f6'
      case 'SUSPENDED':
        return '#f59e0b'
      case 'FAILED':
        return '#ef4444'
      default:
        return null
    }
  }, [execStatus])

  return (
    <div
      style={{
        padding: '10px 14px',
        borderRadius: 12,
        background: 'rgba(15, 23, 42, 0.92)',
        border: `1.5px solid ${selected ? '#a18aff' : statusColor || borderColor}`,
        boxShadow: selected
          ? '0 0 18px rgba(161, 138, 255, 0.45)'
          : statusColor
          ? `0 0 16px ${statusColor}44`
          : '0 4px 18px rgba(0,0,0,0.3)',
        minWidth: 175,
        color: '#f8fafc',
        backdropFilter: 'blur(12px)',
        fontSize: 12,
        position: 'relative',
      }}
    >
      {nodeType !== 'TRIGGER' && (
        <Handle
          type="target"
          position={Position.Left}
          style={{ background: color, width: 8, height: 8 }}
        />
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span
            style={{
              display: 'grid',
              placeItems: 'center',
              width: 24,
              height: 24,
              borderRadius: 6,
              background: `color-mix(in srgb, ${color} 20%, transparent)`,
              color,
            }}
          >
            <Icon size={14} />
          </span>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.8, color }}>
            {badge}
          </span>
        </div>
        {execStatus && (
          <span
            style={{
              fontSize: 8,
              fontWeight: 700,
              padding: '1px 5px',
              borderRadius: 4,
              background: `${statusColor}22`,
              color: statusColor || '#cbd5e1',
              border: `1px solid ${statusColor}55`,
            }}
          >
            {execStatus}
          </span>
        )}
      </div>
      <div style={{ fontWeight: 600, fontSize: 13, wordBreak: 'break-word' }}>
        {nodeData.label || id}
      </div>
      {Boolean(nodeData.config && Object.keys(nodeData.config).length) && (
        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {String(nodeData.config.route_key || nodeData.config.model || nodeData.config.tool_name || Object.entries(nodeData.config)[0]?.[1] || '')}
        </div>
      )}
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: color, width: 8, height: 8 }}
      />
    </div>
  )
}

const nodeTypes = {
  architectNode: ArchitectNode,
}

export default function FlowStudio({
  token,
  tenant,
  projectId,
  workflowId: initialWorkflowId,
}: {
  token: string
  tenant: string
  projectId?: string
  workflowId?: string
}) {
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(projectId || null)
  const effectiveProjectId = projectId || selectedProjectId

  const [workflows, setWorkflows] = useState<{ id: string; name: string; current_version: number; status: string }[]>([])
  const [activeWorkflowId, setActiveWorkflowId] = useState<string | null>(initialWorkflowId || null)
  const [activeWorkflowName, setActiveWorkflowName] = useState('New Workflow')
  const [currentVersion, setCurrentVersion] = useState(1)
  const [workflowStatus, setWorkflowStatus] = useState<'DRAFT' | 'PUBLISHED' | 'ARCHIVED'>('DRAFT')

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [variables, setVariables] = useState<VariableDef[]>([])
  const [selectedNode, setSelectedNode] = useState<Node | null>(null)

  const [inspectorTab, setInspectorTab] = useState<'Properties' | 'Governance' | 'Reliability' | 'Variables' | 'Validation' | 'Versions'>('Properties')
  const [validationReport, setValidationReport] = useState<ValidationReport | null>(null)
  const [statusMessage, setStatusMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [busy, setBusy] = useState(false)

  // AI Model Routes Catalog
  const [modelRoutes, setModelRoutes] = useState<AiModelRoute[]>([])

  // Live Telemetry & Execution State
  const [traceDrawerOpen, setTraceDrawerOpen] = useState(false)
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const [executionTelemetry, setExecutionTelemetry] = useState<ExecutionTelemetry | null>(null)
  const [humanTasks, setHumanTasks] = useState<HumanTask[]>([])
  const [approvalNotes, setApprovalNotes] = useState('')
  const [telemetryTab, setTelemetryTab] = useState<'Waterfall' | 'Logs'>('Waterfall')

  // Versioning state
  const [versions, setVersions] = useState<{ id: string; version: number; status: string; change_summary: string }[]>([])
  const [publishModal, setPublishModal] = useState(false)
  const [publishSummary, setPublishSummary] = useState('')

  // Create workflow modal
  const [createModal, setCreateModal] = useState(false)
  const [newWorkflowName, setNewWorkflowName] = useState('')
  const [newWorkflowDesc, setNewWorkflowDesc] = useState('')

  // Node Palette search & accordion state
  const [paletteSearch, setPaletteSearch] = useState('')
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    triggers: true,
    control: true,
    ai: true,
    integrations: true,
    human: true,
    reliability: true,
  })

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

  const nodeCounterRef = useRef(1)

  // Load Projects
  useEffect(() => {
    let cancelled = false
    if (projectId || !token) return

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
  }, [callApi, projectId, token, selectedProjectId])

  // Load Workflows
  useEffect(() => {
    let cancelled = false
    if (!effectiveProjectId || !token) return
    callApi(`/projects/${effectiveProjectId}/workflows`)
      .then((data) => {
        if (!cancelled) {
          setWorkflows(data)
          if (data.length > 0 && !activeWorkflowId) {
            setActiveWorkflowId(data[0].id)
          }
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [callApi, effectiveProjectId, token, activeWorkflowId])

  // Load Model Routes
  useEffect(() => {
    if (!token) return
    callApi('/ai-model-routes')
      .then((routes) => setModelRoutes(routes))
      .catch(() => {})
  }, [callApi, token])

  // Load Active Workflow
  useEffect(() => {
    let cancelled = false
    if (!activeWorkflowId || !token) return

    callApi(`/workflows/${activeWorkflowId}`)
      .then((data) => {
        if (cancelled) return
        setActiveWorkflowName(data.name)
        setCurrentVersion(data.current_version)
        setWorkflowStatus(data.status)

        const def = data.definition || {}
        const loadedNodes: Node[] = (def.nodes || []).map((n: { id: string; type: string; label: string; config?: Record<string, unknown>; position?: { x: number; y: number } }) => ({
          id: n.id,
          type: 'architectNode',
          position: n.position || { x: 100, y: 100 },
          data: {
            label: n.label,
            nodeType: n.type,
            config: n.config || {},
          },
        }))
        const loadedEdges: Edge[] = (def.edges || []).map((e: { id: string; source: string; target: string; label?: string }) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          label: e.label,
          animated: true,
          style: { stroke: '#a18aff', strokeWidth: 2 },
        }))

        setNodes(loadedNodes)
        setEdges(loadedEdges)
        setVariables(def.variables || [])
      })
      .catch((e) => {
        if (!cancelled) {
          setErrorMessage(e instanceof Error ? e.message : 'Failed to load workflow')
        }
      })

    return () => {
      cancelled = true
    }
  }, [activeWorkflowId, callApi, token, setNodes, setEdges])

  // Connect new edge
  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            animated: true,
            style: { stroke: '#a18aff', strokeWidth: 2 },
          },
          eds
        )
      )
    },
    [setEdges]
  )

  // Add node from palette
  const addNodeFromPalette = (type: WorkflowNodeData['nodeType'], label: string, initialConfig: Record<string, unknown> = {}) => {
    const id = `${type.toLowerCase()}-${nodeCounterRef.current++}`
    const newNode: Node = {
      id,
      type: 'architectNode',
      position: { x: 140 + (nodes.length % 5) * 40, y: 120 + (nodes.length % 5) * 35 },
      data: {
        label,
        nodeType: type,
        config: initialConfig,
      },
    }
    setNodes((nds) => [...nds, newNode])
    setSelectedNode(newNode)
  }

  // Auto-layout using ELK.js
  const autoLayout = async () => {
    if (!nodes.length) return
    setBusy(true)
    try {
      const elkGraph = {
        id: 'root',
        layoutOptions: {
          'elk.algorithm': 'layered',
          'elk.direction': 'RIGHT',
          'elk.spacing.nodeNode': '45',
          'elk.layered.spacing.nodeNodeBetweenLayers': '65',
        },
        children: nodes.map((n) => ({
          id: n.id,
          width: 185,
          height: 80,
        })),
        edges: edges.map((e) => ({
          id: e.id,
          sources: [e.source],
          targets: [e.target],
        })),
      }

      const layout = await elk.layout(elkGraph)
      if (layout.children) {
        setNodes((nds) =>
          nds.map((node) => {
            const elkNode = layout.children?.find((c) => c.id === node.id)
            return elkNode
              ? {
                  ...node,
                  position: { x: elkNode.x || 0, y: elkNode.y || 0 },
                }
              : node
          })
        )
      }
      setStatusMessage('Layout organized with ELK.js')
      setTimeout(() => setStatusMessage(''), 3000)
    } catch {
      setErrorMessage('Auto-layout failed')
    } finally {
      setBusy(false)
    }
  }

  // Graph serialization helper
  const getSerializedDefinition = () => ({
    nodes: nodes.map((n) => ({
      id: n.id,
      type: (n.data as unknown as WorkflowNodeData).nodeType,
      label: (n.data as unknown as WorkflowNodeData).label,
      config: (n.data as unknown as WorkflowNodeData).config || {},
      position: n.position,
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: typeof e.label === 'string' ? e.label : undefined,
    })),
    variables,
    metadata: {
      updated_at: new Date().toISOString(),
    },
  })

  // Validate graph
  const validateGraph = async () => {
    if (!activeWorkflowId) return
    setBusy(true)
    setErrorMessage('')
    try {
      const def = getSerializedDefinition()
      const report: ValidationReport = await callApi(`/workflows/${activeWorkflowId}/validate`, {
        method: 'POST',
        body: JSON.stringify(def),
      })
      setValidationReport(report)
      setInspectorTab('Validation')
      if (report.is_valid) {
        setStatusMessage('Workflow graph is valid')
      } else {
        setErrorMessage(`Graph validation found ${report.errors.length} error(s)`)
      }
      setTimeout(() => setStatusMessage(''), 4000)
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'Validation failed')
    } finally {
      setBusy(false)
    }
  }

  // Save Draft
  const saveDraft = async () => {
    if (!activeWorkflowId) return
    setBusy(true)
    setErrorMessage('')
    try {
      const def = getSerializedDefinition()
      const res = await callApi(`/workflows/${activeWorkflowId}/draft`, {
        method: 'PUT',
        body: JSON.stringify({
          definition: def,
          change_summary: `Draft saved from Flow Studio at ${new Date().toLocaleTimeString()}`,
        }),
      })
      setCurrentVersion(res.current_version)
      setWorkflowStatus(res.status)
      setStatusMessage(`Saved draft v${res.current_version}`)
      setTimeout(() => setStatusMessage(''), 4000)
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'Failed to save draft')
    } finally {
      setBusy(false)
    }
  }

  // Publish Workflow
  const handlePublish = async () => {
    if (!activeWorkflowId || !publishSummary.trim()) return
    setBusy(true)
    setErrorMessage('')
    try {
      const def = getSerializedDefinition()
      await callApi(`/workflows/${activeWorkflowId}/draft`, {
        method: 'PUT',
        body: JSON.stringify({ definition: def }),
      })

      const res = await callApi(`/workflows/${activeWorkflowId}/publish`, {
        method: 'POST',
        body: JSON.stringify({ change_summary: publishSummary.trim() }),
      })

      setWorkflowStatus('PUBLISHED')
      setPublishModal(false)
      setPublishSummary('')
      setStatusMessage(`Successfully published v${res.version}!`)
      setTimeout(() => setStatusMessage(''), 4000)
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'Publish failed')
    } finally {
      setBusy(false)
    }
  }

  // Trigger Run & Stream Telemetry
  const triggerTestRun = async () => {
    if (!effectiveProjectId || !activeWorkflowId) return
    setBusy(true)
    setErrorMessage('')
    try {
      const res = await callApi(`/projects/${effectiveProjectId}/workflows/${activeWorkflowId}/runs`, {
        method: 'POST',
        body: JSON.stringify({ trigger_type: 'MANUAL', trigger_payload: { initiated_by: 'flow_studio_designer' } }),
      })
      setActiveRunId(res.id)
      setTraceDrawerOpen(true)
      setStatusMessage(`Execution ${res.status}: ${res.id.slice(0, 8)}`)

      // Fetch telemetry and tasks
      await refreshExecutionState(res.id)
      setTimeout(() => setStatusMessage(''), 5000)
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'Execution failed')
    } finally {
      setBusy(false)
    }
  }

  // Refresh Execution State
  const refreshExecutionState = async (runId: string) => {
    if (!effectiveProjectId || !activeWorkflowId || !runId) return
    try {
      const [telem, tasks] = await Promise.all([
        callApi(`/projects/${effectiveProjectId}/workflows/${activeWorkflowId}/runs/${runId}/telemetry`),
        callApi(`/projects/${effectiveProjectId}/workflows/${activeWorkflowId}/runs/${runId}/tasks`).catch(() => []),
      ])
      setExecutionTelemetry(telem)
      setHumanTasks(tasks)

      // Annotate nodes on canvas with live status
      if (telem?.spans) {
        const statusMap = new Map<string, WorkflowNodeData['executionStatus']>()
        for (const s of telem.spans) {
          statusMap.set(s.node_id, s.status as WorkflowNodeData['executionStatus'])
        }
        setNodes((nds) =>
          nds.map((n) => ({
            ...n,
            data: {
              ...(n.data as unknown as WorkflowNodeData),
              executionStatus: statusMap.get(n.id),
            },
          }))
        )
      }
    } catch {}
  }

  // Resolve Human Task
  const resolveTask = async (taskId: string, decision: 'APPROVED' | 'REJECTED') => {
    if (!activeRunId) return
    setBusy(true)
    try {
      await callApi(`/runs/${activeRunId}/tasks/${taskId}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ decision, notes: approvalNotes || `Decided ${decision} in Flow Studio` }),
      })
      setStatusMessage(`Human task marked ${decision}`)
      setApprovalNotes('')
      await refreshExecutionState(activeRunId)
      setTimeout(() => setStatusMessage(''), 4000)
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'Task resolution failed')
    } finally {
      setBusy(false)
    }
  }

  // Create new workflow
  const handleCreateWorkflow = async () => {
    if (!effectiveProjectId || !newWorkflowName.trim()) return
    setBusy(true)
    setErrorMessage('')
    try {
      const res = await callApi(`/projects/${effectiveProjectId}/workflows`, {
        method: 'POST',
        body: JSON.stringify({
          name: newWorkflowName.trim(),
          description: newWorkflowDesc.trim() || undefined,
        }),
      })
      setCreateModal(false)
      setNewWorkflowName('')
      setNewWorkflowDesc('')
      const updated = await callApi(`/projects/${effectiveProjectId}/workflows`)
      setWorkflows(updated)
      setActiveWorkflowId(res.id)
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'Failed to create workflow')
    } finally {
      setBusy(false)
    }
  }

  // Load versions
  const loadVersions = async () => {
    if (!activeWorkflowId) return
    try {
      const data = await callApi(`/workflows/${activeWorkflowId}/versions`)
      setVersions(data)
      setInspectorTab('Versions')
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'Failed to load versions')
    }
  }

  // Palette Categories definition
  type PaletteItem = {
    type: WorkflowNodeData['nodeType']
    label: string
    icon: typeof Zap
    color: string
    desc: string
    initialConfig?: Record<string, unknown>
  }

  type PaletteCategory = {
    id: string
    title: string
    items: PaletteItem[]
  }

  const paletteCategories: PaletteCategory[] = [
    {
      id: 'triggers',
      title: '⚡ Triggers',
      items: [
        { type: 'TRIGGER' as const, label: 'Trigger', icon: Zap, color: '#f59e0b', desc: 'Webhook, cron, or manual trigger' },
      ],
    },
    {
      id: 'control',
      title: '🔀 Control Flow',
      items: [
        { type: 'DECISION' as const, label: 'Decision', icon: GitBranch, color: '#38bdf8', desc: 'Branch condition evaluation' },
        { type: 'TERMINAL' as const, label: 'End / Terminal', icon: Terminal, color: '#64748b', desc: 'Final process exit' },
      ],
    },
    {
      id: 'ai',
      title: '🤖 AI & Agents',
      items: [
        { type: 'AI_AGENT' as const, label: 'AI Agent', icon: Bot, color: '#a855f7', desc: 'Reasoning agent via model gateway', initialConfig: { route_key: 'claims-classifier-prod', model: 'gemini-1.5-pro' } },
        { type: 'DOCUMENT_AI' as const, label: 'Document AI', icon: FileText, color: '#10b981', desc: 'OCR & Schema Extraction' },
        { type: 'RULE' as const, label: 'Business Rule', icon: ClipboardCheck, color: '#eab308', desc: 'Decision table rules' },
      ],
    },
    {
      id: 'integrations',
      title: '🔌 Integrations & Tools',
      items: [
        { type: 'MCP_TOOL' as const, label: 'MCP Tool', icon: Cpu, color: '#06b6d4', desc: 'Invoke governed MCP tool' },
        { type: 'INTEGRATION' as const, label: 'Integration', icon: Network, color: '#6366f1', desc: 'External REST / Database' },
        { type: 'ACTION' as const, label: 'Action', icon: Play, color: '#60a5fa', desc: 'Deterministic system action' },
      ],
    },
    {
      id: 'human',
      title: '👤 Human Tasks',
      items: [
        { type: 'APPROVAL' as const, label: 'Approval Gate', icon: ShieldCheck, color: '#ec4899', desc: 'Suspends run for human sign-off', initialConfig: { required_role: 'ADMIN', timeout_hours: 24 } },
      ],
    },
  ]

  const selectedNodeData = selectedNode ? (selectedNode.data as unknown as WorkflowNodeData) : null

  return (
    <div className="flow-studio-container" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)', minHeight: 650 }}>
      {/* Top Studio Control Bar */}
      <header
        className="glass"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 18px',
          borderRadius: 14,
          marginBottom: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: 10, background: 'rgba(161, 138, 255, 0.2)', color: '#a18aff' }}>
            <Layers3 size={20} />
          </span>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2 style={{ fontSize: 16, margin: 0, fontWeight: 700 }}>{activeWorkflowName}</h2>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '2px 7px',
                  borderRadius: 6,
                  background: workflowStatus === 'PUBLISHED' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(234, 179, 8, 0.2)',
                  color: workflowStatus === 'PUBLISHED' ? '#4ade80' : '#fde047',
                  border: `1px solid ${workflowStatus === 'PUBLISHED' ? 'rgba(34, 197, 94, 0.4)' : 'rgba(234, 179, 8, 0.4)'}`,
                }}
              >
                v{currentVersion} · {workflowStatus}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 2 }}>
              {projects.length > 0 && !projectId && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>PROJECT:</span>
                  <select
                    aria-label="Select project"
                    value={selectedProjectId || ''}
                    onChange={(e) => {
                      setSelectedProjectId(e.target.value)
                      setActiveWorkflowId(null)
                    }}
                    style={{ fontSize: 11, background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#cbd5e1', borderRadius: 4, padding: '2px 6px', cursor: 'pointer' }}
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {workflows.length > 1 && (
                <select
                  aria-label="Select active workflow"
                  value={activeWorkflowId || ''}
                  onChange={(e) => setActiveWorkflowId(e.target.value)}
                  style={{ fontSize: 11, background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#cbd5e1', borderRadius: 4, padding: '2px 6px', cursor: 'pointer' }}
                >
                  {workflows.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} (v{w.current_version})
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </div>

        {/* Global Toolbar Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {statusMessage && (
            <span style={{ fontSize: 12, color: '#4ade80', display: 'flex', alignItems: 'center', gap: 5 }}>
              <Check size={14} /> {statusMessage}
            </span>
          )}
          {errorMessage && (
            <span style={{ fontSize: 12, color: '#f87171', display: 'flex', alignItems: 'center', gap: 5 }}>
              <AlertCircle size={14} /> {errorMessage}
            </span>
          )}

          {projectId && (
            <button
              type="button"
              className="icon-button"
              title="Create new workflow in project"
              onClick={() => setCreateModal(true)}
            >
              <Plus size={16} />
            </button>
          )}

          <button
            type="button"
            className="secondary-button"
            onClick={autoLayout}
            disabled={busy || !nodes.length}
            style={{ fontSize: 12, padding: '6px 11px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Sparkles size={14} /> Auto Layout
          </button>

          <button
            type="button"
            className="secondary-button"
            onClick={validateGraph}
            disabled={busy || !nodes.length}
            style={{ fontSize: 12, padding: '6px 11px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <ClipboardCheck size={14} /> Validate
          </button>

          <button
            type="button"
            className="secondary-button"
            onClick={loadVersions}
            disabled={busy || !activeWorkflowId}
            style={{ fontSize: 12, padding: '6px 11px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <RefreshCw size={14} /> Versions
          </button>

          <button
            type="button"
            className="primary-button"
            onClick={saveDraft}
            disabled={busy || !activeWorkflowId}
            style={{ fontSize: 12, padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Save size={14} /> Save Draft
          </button>

          <button
            type="button"
            className="primary-button"
            onClick={() => setPublishModal(true)}
            disabled={busy || !activeWorkflowId}
            style={{ fontSize: 12, padding: '6px 12px', background: '#16a34a', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <UploadCloud size={14} /> Publish
          </button>

          <button
            type="button"
            className="primary-button"
            onClick={triggerTestRun}
            disabled={busy || !activeWorkflowId}
            style={{ fontSize: 12, padding: '6px 12px', background: '#3b82f6', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Play size={14} /> Run
          </button>

          <button
            type="button"
            className="secondary-button"
            onClick={() => setTraceDrawerOpen(!traceDrawerOpen)}
            style={{
              fontSize: 12,
              padding: '6px 12px',
              border: traceDrawerOpen ? '1px solid #a18aff' : undefined,
              color: traceDrawerOpen ? '#a18aff' : undefined,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Activity size={14} /> Live Trace
          </button>
        </div>
      </header>

      {/* Main Studio Area: Palette -> Canvas -> Inspector */}
      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr 320px', gap: 10, flex: 1, minHeight: 0 }}>
        {/* Left Palette: Categorized Accordion */}
        <aside className="glass" style={{ padding: 12, borderRadius: 14, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ fontSize: 11, margin: 0, textTransform: 'uppercase', letterSpacing: 1, color: '#94a3b8' }}>
              Node Palette
            </h3>
            <span style={{ fontSize: 10, color: '#64748b' }}>Maestro v1.0</span>
          </div>

          {/* Palette Search */}
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 8, top: 8, color: '#64748b' }} />
            <input
              type="text"
              placeholder="Search nodes..."
              value={paletteSearch}
              onChange={(e) => setPaletteSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '6px 8px 6px 26px',
                borderRadius: 8,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#f8fafc',
                fontSize: 11,
              }}
            />
          </div>

          {/* Categorized Node Palette */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {paletteCategories.map((cat) => {
              const filteredItems = cat.items.filter((item) =>
                item.label.toLowerCase().includes(paletteSearch.toLowerCase()) ||
                item.desc.toLowerCase().includes(paletteSearch.toLowerCase())
              )
              if (!filteredItems.length) return null

              const isExpanded = expandedCategories[cat.id] ?? true
              return (
                <div key={cat.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <button
                    type="button"
                    onClick={() => setExpandedCategories((prev) => ({ ...prev, [cat.id]: !isExpanded }))}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'transparent',
                      border: 'none',
                      color: '#94a3b8',
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '4px 2px',
                      cursor: 'pointer',
                    }}
                  >
                    <span>{cat.title}</span>
                    {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  </button>

                  {isExpanded && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 4 }}>
                      {filteredItems.map(({ type, label, icon: Icon, color, desc, initialConfig }) => (
                        <button
                          key={type + label}
                          type="button"
                          onClick={() => addNodeFromPalette(type, label, initialConfig)}
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 8,
                            padding: '7px 8px',
                            borderRadius: 8,
                            border: '1px solid rgba(255,255,255,0.06)',
                            background: 'rgba(255,255,255,0.02)',
                            color: '#e2e8f0',
                            fontSize: 11,
                            cursor: 'pointer',
                            textAlign: 'left',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <span style={{ display: 'grid', placeItems: 'center', width: 22, height: 22, borderRadius: 5, background: `${color}22`, color, flexShrink: 0, marginTop: 1 }}>
                            <Icon size={13} />
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, color: '#f8fafc' }}>{label}</div>
                            <div style={{ fontSize: 9, color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{desc}</div>
                          </div>
                          <Plus size={11} style={{ opacity: 0.5, marginTop: 4 }} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </aside>

        {/* Center Canvas */}
        <main
          className="glass"
          style={{
            position: 'relative',
            borderRadius: 14,
            overflow: 'hidden',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            onNodeClick={(_e, node) => setSelectedNode(node)}
            fitView
          >
            <Background color="#334155" gap={20} size={1} />
            <Controls />
            <MiniMap style={{ background: '#0f172a', borderRadius: 8 }} nodeColor="#38bdf8" />
          </ReactFlow>
        </main>

        {/* Right Inspector & Governance Drawer */}
        <aside className="glass" style={{ padding: 12, borderRadius: 14, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
          {/* Inspector Tabs */}
          <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 6, marginBottom: 10, flexWrap: 'wrap' }}>
            {(['Properties', 'Governance', 'Reliability', 'Variables', 'Validation', 'Versions'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setInspectorTab(tab)}
                style={{
                  border: 'none',
                  background: inspectorTab === tab ? 'rgba(161, 138, 255, 0.2)' : 'transparent',
                  color: inspectorTab === tab ? '#a18aff' : '#94a3b8',
                  padding: '3px 7px',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Properties Tab */}
          {inspectorTab === 'Properties' && (
            <div>
              {selectedNode && selectedNodeData ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'rgba(161, 138, 255, 0.2)', color: '#a18aff' }}>
                        {selectedNodeData.nodeType}
                      </span>
                      <span style={{ fontSize: 11, color: '#64748b' }}>{selectedNode.id}</span>
                    </div>
                    <button
                      type="button"
                      className="icon-button"
                      title="Delete Node"
                      onClick={() => {
                        setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id))
                        setEdges((eds) => eds.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id))
                        setSelectedNode(null)
                      }}
                      style={{ color: '#f87171' }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>

                  <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: '#94a3b8' }}>
                    Node Label
                    <input
                      value={selectedNodeData.label || ''}
                      onChange={(e) => {
                        const val = e.target.value
                        setNodes((nds) =>
                          nds.map((n) =>
                            n.id === selectedNode.id
                              ? { ...n, data: { ...(n.data as unknown as WorkflowNodeData), label: val } }
                              : n
                          )
                        )
                        setSelectedNode((prev) => (prev ? { ...prev, data: { ...(prev.data as unknown as WorkflowNodeData), label: val } } : null))
                      }}
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', padding: '5px 8px', borderRadius: 6, color: '#f8fafc', fontSize: 11 }}
                    />
                  </label>

                  {/* AI Agent Node Properties */}
                  {selectedNodeData.nodeType === 'AI_AGENT' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 8, borderRadius: 8, background: 'rgba(168, 85, 247, 0.08)', border: '1px solid rgba(168, 85, 247, 0.2)' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#c084fc' }}>Agent Configuration</div>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 10, color: '#cbd5e1' }}>
                        Logical AI Model Route
                        <select
                          value={String(selectedNodeData.config.route_key || 'claims-classifier-prod')}
                          onChange={(e) => {
                            const val = e.target.value
                            const updatedConfig = { ...selectedNodeData.config, route_key: val }
                            setNodes((nds) =>
                              nds.map((n) =>
                                n.id === selectedNode.id
                                  ? { ...n, data: { ...selectedNodeData, config: updatedConfig } }
                                  : n
                              )
                            )
                            setSelectedNode((prev) => (prev ? { ...prev, data: { ...selectedNodeData, config: updatedConfig } } : null))
                          }}
                          style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', color: '#f8fafc', padding: '4px 6px', borderRadius: 6, fontSize: 11 }}
                        >
                          {modelRoutes.map((r) => (
                            <option key={r.route_key} value={r.route_key}>
                              {r.display_name} ({r.primary_model})
                            </option>
                          ))}
                          <option value="custom">Custom Logical Alias...</option>
                        </select>
                      </label>

                      <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 10, color: '#cbd5e1' }}>
                        System Instructions / Prompt
                        <textarea
                          rows={3}
                          value={String(selectedNodeData.config.system_prompt || '')}
                          placeholder="You are an autonomous decision agent..."
                          onChange={(e) => {
                            const val = e.target.value
                            const updatedConfig = { ...selectedNodeData.config, system_prompt: val }
                            setNodes((nds) =>
                              nds.map((n) =>
                                n.id === selectedNode.id
                                  ? { ...n, data: { ...selectedNodeData, config: updatedConfig } }
                                  : n
                              )
                            )
                            setSelectedNode((prev) => (prev ? { ...prev, data: { ...selectedNodeData, config: updatedConfig } } : null))
                          }}
                          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', padding: '5px 8px', borderRadius: 6, color: '#f8fafc', fontSize: 10 }}
                        />
                      </label>
                    </div>
                  )}

                  {/* Decision Node Properties */}
                  {selectedNodeData.nodeType === 'DECISION' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 8, borderRadius: 8, background: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.2)' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#38bdf8' }}>Branch Logic</div>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 10, color: '#cbd5e1' }}>
                        Condition Field
                        <input
                          placeholder="e.g. amount, risk_score"
                          value={String(selectedNodeData.config.field || 'status')}
                          onChange={(e) => {
                            const val = e.target.value
                            const updatedConfig = { ...selectedNodeData.config, field: val }
                            setNodes((nds) =>
                              nds.map((n) => (n.id === selectedNode.id ? { ...n, data: { ...selectedNodeData, config: updatedConfig } } : n))
                            )
                            setSelectedNode((prev) => (prev ? { ...prev, data: { ...selectedNodeData, config: updatedConfig } } : null))
                          }}
                          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', padding: '4px 6px', borderRadius: 6, color: '#f8fafc', fontSize: 11 }}
                        />
                      </label>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                        <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 10, color: '#cbd5e1' }}>
                          Operator
                          <select
                            value={String(selectedNodeData.config.operator || '==')}
                            onChange={(e) => {
                              const val = e.target.value
                              const updatedConfig = { ...selectedNodeData.config, operator: val }
                              setNodes((nds) =>
                                nds.map((n) => (n.id === selectedNode.id ? { ...n, data: { ...selectedNodeData, config: updatedConfig } } : n))
                              )
                              setSelectedNode((prev) => (prev ? { ...prev, data: { ...selectedNodeData, config: updatedConfig } } : null))
                            }}
                            style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', color: '#f8fafc', padding: '4px 6px', borderRadius: 6, fontSize: 11 }}
                          >
                            <option value="==">== (Equals)</option>
                            <option value="!=">!= (Not Equal)</option>
                            <option value=">">&gt; (Greater)</option>
                            <option value="<">&lt; (Less)</option>
                          </select>
                        </label>
                        <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 10, color: '#cbd5e1' }}>
                          Compare Value
                          <input
                            placeholder="true, 5000"
                            value={String(selectedNodeData.config.value ?? 'true')}
                            onChange={(e) => {
                              const val = e.target.value
                              const updatedConfig = { ...selectedNodeData.config, value: val }
                              setNodes((nds) =>
                                nds.map((n) => (n.id === selectedNode.id ? { ...n, data: { ...selectedNodeData, config: updatedConfig } } : n))
                              )
                              setSelectedNode((prev) => (prev ? { ...prev, data: { ...selectedNodeData, config: updatedConfig } } : null))
                            }}
                            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', padding: '4px 6px', borderRadius: 6, color: '#f8fafc', fontSize: 11 }}
                          />
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Approval Node Properties */}
                  {selectedNodeData.nodeType === 'APPROVAL' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 8, borderRadius: 8, background: 'rgba(236, 72, 153, 0.08)', border: '1px solid rgba(236, 72, 153, 0.2)' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#f472b6' }}>Human Gate Settings</div>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 10, color: '#cbd5e1' }}>
                        Required Approver Role
                        <select
                          value={String(selectedNodeData.config.required_role || 'ADMIN')}
                          onChange={(e) => {
                            const val = e.target.value
                            const updatedConfig = { ...selectedNodeData.config, required_role: val }
                            setNodes((nds) =>
                              nds.map((n) => (n.id === selectedNode.id ? { ...n, data: { ...selectedNodeData, config: updatedConfig } } : n))
                            )
                            setSelectedNode((prev) => (prev ? { ...prev, data: { ...selectedNodeData, config: updatedConfig } } : null))
                          }}
                          style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', color: '#f8fafc', padding: '4px 6px', borderRadius: 6, fontSize: 11 }}
                        >
                          <option value="ADMIN">ADMIN (Workspace Admin)</option>
                          <option value="FINANCE_APPROVER">FINANCE_APPROVER</option>
                          <option value="SECURITY_LEAD">SECURITY_LEAD</option>
                          <option value="OPERATIONS_MANAGER">OPERATIONS_MANAGER</option>
                        </select>
                      </label>
                    </div>
                  )}

                  {/* MCP Tool Node Properties */}
                  {selectedNodeData.nodeType === 'MCP_TOOL' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 8, borderRadius: 8, background: 'rgba(6, 182, 212, 0.08)', border: '1px solid rgba(6, 182, 212, 0.2)' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#06b6d4' }}>MCP Tool Connector</div>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 10, color: '#cbd5e1' }}>
                        Tool Name
                        <input
                          placeholder="e.g. fetch_policy_balance"
                          value={String(selectedNodeData.config.tool_name || '')}
                          onChange={(e) => {
                            const val = e.target.value
                            const updatedConfig = { ...selectedNodeData.config, tool_name: val }
                            setNodes((nds) =>
                              nds.map((n) => (n.id === selectedNode.id ? { ...n, data: { ...selectedNodeData, config: updatedConfig } } : n))
                            )
                            setSelectedNode((prev) => (prev ? { ...prev, data: { ...selectedNodeData, config: updatedConfig } } : null))
                          }}
                          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', padding: '4px 6px', borderRadius: 6, color: '#f8fafc', fontSize: 11 }}
                        />
                      </label>
                    </div>
                  )}
                </div>
              ) : (
                <p style={{ fontSize: 12, color: '#94a3b8' }}>Select any node on the canvas to configure its properties.</p>
              )}
            </div>
          )}

          {/* Governance Tab */}
          {inspectorTab === 'Governance' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <h4 style={{ margin: 0, fontSize: 12 }}>RBAC & Environment Locks</h4>
              <div style={{ padding: 8, borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#f8fafc' }}>Execution Permission Baseline</div>
                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                  Inherits from parent Project & Folder security perimeter.
                </div>
              </div>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: '#94a3b8' }}>
                Environment Promotion Gate
                <select
                  style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', color: '#f8fafc', padding: '5px 8px', borderRadius: 6, fontSize: 11 }}
                  defaultValue="DEV"
                >
                  <option value="DEV">DEV Only (Testing & Prototyping)</option>
                  <option value="UAT">UAT Certified (Pre-Production)</option>
                  <option value="PROD">PROD Ready (Strict Change Approval)</option>
                </select>
              </label>
            </div>
          )}

          {/* Reliability Tab */}
          {inspectorTab === 'Reliability' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <h4 style={{ margin: 0, fontSize: 12 }}>Fault Tolerance & Retry</h4>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: '#94a3b8' }}>
                Max Automatic Retries
                <select
                  style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', color: '#f8fafc', padding: '5px 8px', borderRadius: 6, fontSize: 11 }}
                  defaultValue="3"
                >
                  <option value="0">0 (Fail Immediately)</option>
                  <option value="1">1 Retry</option>
                  <option value="3">3 Retries (Exponential Backoff)</option>
                  <option value="5">5 Retries (Durable Queue)</option>
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: '#94a3b8' }}>
                Execution Timeout (Seconds)
                <input
                  type="number"
                  defaultValue="60"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', padding: '5px 8px', borderRadius: 6, color: '#f8fafc', fontSize: 11 }}
                />
              </label>
            </div>
          )}

          {/* Variables Tab */}
          {inspectorTab === 'Variables' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <h4 style={{ margin: 0, fontSize: 12 }}>Workflow Variables</h4>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() =>
                    setVariables((prev) => [
                      ...prev,
                      { name: `var_${prev.length + 1}`, type: 'string', default_value: '', is_secret: false },
                    ])
                  }
                >
                  <Plus size={13} />
                </button>
              </div>

              {variables.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {variables.map((v, i) => (
                    <div key={v.name + i} style={{ padding: 6, borderRadius: 6, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <code style={{ fontSize: 11, color: '#38bdf8' }}>{v.name}</code>
                        <button
                          type="button"
                          className="icon-button"
                          onClick={() => setVariables((prev) => prev.filter((_, idx) => idx !== i))}
                          style={{ color: '#f87171' }}
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                      <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 2 }}>
                        Type: {v.type} · Secret: {v.is_secret ? 'Yes' : 'No'}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: 11, color: '#94a3b8' }}>No variables declared. Click + to add typed variables.</p>
              )}
            </div>
          )}

          {/* Validation Tab */}
          {inspectorTab === 'Validation' && (
            <div>
              <h4 style={{ margin: '0 0 8px 0', fontSize: 12 }}>Structural Integrity</h4>
              {validationReport ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 6, borderRadius: 6, background: validationReport.is_valid ? 'rgba(34, 197, 94, 0.1)' : 'rgba(248, 113, 113, 0.1)' }}>
                    {validationReport.is_valid ? <Check size={14} color="#4ade80" /> : <AlertCircle size={14} color="#f87171" />}
                    <span style={{ fontSize: 11, fontWeight: 600, color: validationReport.is_valid ? '#4ade80' : '#f87171' }}>
                      {validationReport.is_valid ? 'Graph is Valid for Publishing' : `${validationReport.errors.length} Issue(s) Detected`}
                    </span>
                  </div>

                  {validationReport.errors.map((err, i) => (
                    <div key={i} style={{ fontSize: 10, color: '#f87171', background: 'rgba(248,113,113,0.06)', padding: 5, borderRadius: 5 }}>
                      • {err}
                    </div>
                  ))}
                  {validationReport.warnings.map((warn, i) => (
                    <div key={i} style={{ fontSize: 10, color: '#fbbf24', background: 'rgba(251,191,36,0.06)', padding: 5, borderRadius: 5 }}>
                      ⚠ {warn}
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: 11, color: '#94a3b8' }}>Click Validate on the toolbar to check graph integrity.</p>
              )}
            </div>
          )}

          {/* Versions Tab */}
          {inspectorTab === 'Versions' && (
            <div>
              <h4 style={{ margin: '0 0 8px 0', fontSize: 12 }}>Version History</h4>
              {versions.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {versions.map((ver) => (
                    <div key={ver.id} style={{ padding: 6, borderRadius: 6, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontWeight: 600, fontSize: 11 }}>v{ver.version}</span>
                        <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: ver.status === 'PUBLISHED' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(234, 179, 8, 0.2)', color: ver.status === 'PUBLISHED' ? '#4ade80' : '#fde047' }}>
                          {ver.status}
                        </span>
                      </div>
                      <small style={{ fontSize: 10, color: '#94a3b8', display: 'block', marginTop: 3 }}>
                        {ver.change_summary || 'No summary'}
                      </small>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: 11, color: '#94a3b8' }}>No historical versions loaded.</p>
              )}
            </div>
          )}
        </aside>
      </div>

      {/* Bottom Live Execution Trace Drawer */}
      {traceDrawerOpen && (
        <div
          className="glass"
          style={{
            marginTop: 10,
            borderRadius: 14,
            padding: 12,
            border: '1px solid rgba(161, 138, 255, 0.3)',
            background: 'rgba(15, 23, 42, 0.95)',
            boxShadow: '0 -8px 24px rgba(0,0,0,0.4)',
            maxHeight: 250,
            overflowY: 'auto',
          }}
        >
          {/* Drawer Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 8, marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Activity size={15} color="#a18aff" />
              <span style={{ fontSize: 12, fontWeight: 700, color: '#f8fafc' }}>
                Execution Telemetry Drawer
              </span>
              {executionTelemetry && (
                <>
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      padding: '2px 7px',
                      borderRadius: 4,
                      background:
                        executionTelemetry.status === 'COMPLETED'
                          ? 'rgba(34, 197, 94, 0.2)'
                          : executionTelemetry.status === 'SUSPENDED'
                          ? 'rgba(245, 158, 11, 0.2)'
                          : 'rgba(59, 130, 246, 0.2)',
                      color:
                        executionTelemetry.status === 'COMPLETED'
                          ? '#4ade80'
                          : executionTelemetry.status === 'SUSPENDED'
                          ? '#fbbf24'
                          : '#60a5fa',
                    }}
                  >
                    {executionTelemetry.status}
                  </span>
                  <span style={{ fontSize: 10, color: '#94a3b8' }}>
                    Run: <code>{executionTelemetry.run_id.slice(0, 8)}</code>
                  </span>
                  <span style={{ fontSize: 10, color: '#94a3b8' }}>
                    Latency: {executionTelemetry.duration_ms}ms
                  </span>
                  {Boolean(executionTelemetry.metrics?.total_tokens) && (
                    <span style={{ fontSize: 10, color: '#c084fc' }}>
                      Tokens: {executionTelemetry.metrics?.total_tokens}
                    </span>
                  )}
                  {Boolean(executionTelemetry.otel_trace_id) && (
                    <span style={{ fontSize: 9, color: '#64748b' }}>
                      OTel: {executionTelemetry.otel_trace_id?.slice(0, 12)}...
                    </span>
                  )}
                </>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                type="button"
                onClick={() => setTelemetryTab('Waterfall')}
                style={{
                  border: 'none',
                  background: telemetryTab === 'Waterfall' ? 'rgba(161, 138, 255, 0.2)' : 'transparent',
                  color: telemetryTab === 'Waterfall' ? '#a18aff' : '#94a3b8',
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontSize: 10,
                  cursor: 'pointer',
                }}
              >
                Waterfall
              </button>
              <button
                type="button"
                onClick={() => setTelemetryTab('Logs')}
                style={{
                  border: 'none',
                  background: telemetryTab === 'Logs' ? 'rgba(161, 138, 255, 0.2)' : 'transparent',
                  color: telemetryTab === 'Logs' ? '#a18aff' : '#94a3b8',
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontSize: 10,
                  cursor: 'pointer',
                }}
              >
                Logs
              </button>
              {activeRunId && (
                <button
                  type="button"
                  className="icon-button"
                  title="Refresh Telemetry"
                  onClick={() => refreshExecutionState(activeRunId)}
                >
                  <RefreshCw size={12} />
                </button>
              )}
              <button
                type="button"
                className="icon-button"
                title="Close Drawer"
                onClick={() => setTraceDrawerOpen(false)}
              >
                <X size={13} />
              </button>
            </div>
          </div>

          {/* Human Task Suspension Resolution Banner */}
          {humanTasks.length > 0 && humanTasks.some((t) => t.status === 'PENDING') && (
            <div
              style={{
                marginBottom: 10,
                padding: '8px 12px',
                borderRadius: 8,
                background: 'rgba(245, 158, 11, 0.12)',
                border: '1px solid rgba(245, 158, 11, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ShieldCheck size={14} color="#f59e0b" />
                  <strong style={{ fontSize: 11, color: '#fde047' }}>
                    Human Sign-off Gate Suspended: {humanTasks.find((t) => t.status === 'PENDING')?.title}
                  </strong>
                </div>
                <div style={{ fontSize: 10, color: '#cbd5e1', marginTop: 2 }}>
                  Role: <code style={{ color: '#fbbf24' }}>{humanTasks.find((t) => t.status === 'PENDING')?.required_role}</code> · {humanTasks.find((t) => t.status === 'PENDING')?.description}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  placeholder="Decision notes..."
                  value={approvalNotes}
                  onChange={(e) => setApprovalNotes(e.target.value)}
                  style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', padding: '3px 8px', borderRadius: 4, color: '#f8fafc', fontSize: 10 }}
                />
                <button
                  type="button"
                  onClick={() => {
                    const task = humanTasks.find((t) => t.status === 'PENDING')
                    if (task) resolveTask(task.id, 'APPROVED')
                  }}
                  style={{ background: '#16a34a', border: 'none', color: '#fff', borderRadius: 5, padding: '4px 10px', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}
                >
                  ✓ Approve
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const task = humanTasks.find((t) => t.status === 'PENDING')
                    if (task) resolveTask(task.id, 'REJECTED')
                  }}
                  style={{ background: '#dc2626', border: 'none', color: '#fff', borderRadius: 5, padding: '4px 10px', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}
                >
                  ✕ Reject
                </button>
              </div>
            </div>
          )}

          {/* Telemetry Waterfall Content */}
          {telemetryTab === 'Waterfall' && executionTelemetry?.spans && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {executionTelemetry.spans.map((span, idx) => (
                <div
                  key={span.span_id + idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 10px',
                    borderRadius: 6,
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.05)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 10, color: '#64748b' }}>#{idx + 1}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#f8fafc' }}>{span.node_id}</span>
                    <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', color: '#94a3b8' }}>
                      {span.node_type}
                    </span>
                    {span.metrics?.tokens ? (
                      <span style={{ fontSize: 9, color: '#c084fc' }}>{span.metrics.tokens} tok</span>
                    ) : null}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 10, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 3 }}>
                      <Clock size={11} /> {span.duration_ms}ms
                    </span>
                    <span
                      style={{
                        fontSize: 9,
                        padding: '1px 6px',
                        borderRadius: 4,
                        background:
                          span.status === 'COMPLETED'
                            ? 'rgba(34,197,94,0.15)'
                            : span.status === 'SUSPENDED'
                            ? 'rgba(245,158,11,0.15)'
                            : 'rgba(239,68,68,0.15)',
                        color:
                          span.status === 'COMPLETED'
                            ? '#4ade80'
                            : span.status === 'SUSPENDED'
                            ? '#fbbf24'
                            : '#f87171',
                      }}
                    >
                      {span.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Telemetry Logs Content */}
          {telemetryTab === 'Logs' && executionTelemetry?.spans && (
            <div style={{ fontFamily: 'monospace', fontSize: 10, background: 'rgba(0,0,0,0.4)', padding: 8, borderRadius: 6, maxHeight: 150, overflowY: 'auto', color: '#cbd5e1' }}>
              {executionTelemetry.spans.flatMap((s) => s.logs || []).map((log, i) => (
                <div key={i} style={{ marginBottom: 2 }}>
                  <span style={{ color: '#64748b' }}>[{log.timestamp.slice(11, 19)}]</span>{' '}
                  <span style={{ color: log.level === 'WARN' ? '#f59e0b' : '#38bdf8' }}>{log.level}:</span> {log.message}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Publish Modal */}
      {publishModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(8px)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 9999,
          }}
        >
          <div className="glass" style={{ width: 440, padding: 22, borderRadius: 16 }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: 16 }}>Publish Workflow Version</h3>
            <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 14px 0' }}>
              Publishing promotes the active draft into an immutable, versioned release ready for execution and environment promotion.
            </p>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
              Change Summary
              <textarea
                rows={3}
                aria-label="Change summary"
                placeholder="Describe what was changed in this version..."
                value={publishSummary}
                onChange={(e) => setPublishSummary(e.target.value)}
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8,
                  padding: 8,
                  color: '#f8fafc',
                }}
              />
            </label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <button type="button" className="secondary-button" onClick={() => setPublishModal(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={busy || !publishSummary.trim()}
                onClick={handlePublish}
                style={{ background: '#16a34a' }}
              >
                Confirm Publish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Workflow Modal */}
      {createModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(8px)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 9999,
          }}
        >
          <div className="glass" style={{ width: 420, padding: 22, borderRadius: 16 }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: 16 }}>Create New Workflow</h3>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, marginBottom: 12 }}>
              Workflow Name
              <input
                aria-label="Workflow name"
                placeholder="e.g. Accounts Payable Approval"
                value={newWorkflowName}
                onChange={(e) => setNewWorkflowName(e.target.value)}
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8,
                  padding: 8,
                  color: '#f8fafc',
                }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
              Description
              <textarea
                rows={2}
                placeholder="Optional description"
                value={newWorkflowDesc}
                onChange={(e) => setNewWorkflowDesc(e.target.value)}
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8,
                  padding: 8,
                  color: '#f8fafc',
                }}
              />
            </label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <button type="button" className="secondary-button" onClick={() => setCreateModal(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={busy || !newWorkflowName.trim()}
                onClick={handleCreateWorkflow}
              >
                Create Workflow
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
