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
  AlertCircle,
  Bot,
  Check,
  ClipboardCheck,
  FileText,
  GitBranch,
  Layers3,
  Network,
  Play,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud,
  Zap,
} from 'lucide-react'

const elk = new ELK()

export type WorkflowNodeData = {
  label: string
  nodeType: 'TRIGGER' | 'ACTION' | 'DECISION' | 'AI_AGENT' | 'APPROVAL' | 'INTEGRATION' | 'DOCUMENT_AI' | 'RULE' | 'NOTIFICATION' | 'TERMINAL'
  config: Record<string, unknown>
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
  stats: {
    node_count: number
    edge_count: number
    variable_count: number
    trigger_count: number
  }
}

// Custom Node Component for React Flow
function ArchitectNode({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as WorkflowNodeData
  const nodeType = nodeData.nodeType || 'ACTION'

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
      case 'RULE':
        return { icon: ClipboardCheck, color: '#eab308', borderColor: 'rgba(234, 179, 8, 0.6)', badge: 'RULE' }
      default:
        return { icon: Play, color: '#60a5fa', borderColor: 'rgba(96, 165, 250, 0.6)', badge: 'ACTION' }
    }
  }, [nodeType])

  return (
    <div
      style={{
        padding: '10px 14px',
        borderRadius: 12,
        background: 'rgba(15, 23, 42, 0.90)',
        border: `1.5px solid ${selected ? '#a18aff' : borderColor}`,
        boxShadow: selected ? '0 0 16px rgba(161, 138, 255, 0.4)' : '0 4px 18px rgba(0,0,0,0.3)',
        minWidth: 165,
        color: '#f8fafc',
        backdropFilter: 'blur(12px)',
        fontSize: 12,
      }}
    >
      {nodeType !== 'TRIGGER' && (
        <Handle
          type="target"
          position={Position.Left}
          style={{ background: color, width: 8, height: 8 }}
        />
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
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
      <div style={{ fontWeight: 600, fontSize: 13, wordBreak: 'break-word' }}>
        {nodeData.label || id}
      </div>
      {Boolean(nodeData.config && Object.keys(nodeData.config).length) && (
        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>
          {Object.entries(nodeData.config)[0][0]}: {String(Object.entries(nodeData.config)[0][1])}
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

  const [inspectorTab, setInspectorTab] = useState<'Properties' | 'Variables' | 'Validation' | 'Versions'>('Properties')
  const [validationReport, setValidationReport] = useState<ValidationReport | null>(null)
  const [statusMessage, setStatusMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [busy, setBusy] = useState(false)

  // Versioning state
  const [versions, setVersions] = useState<{ id: string; version: number; status: string; change_summary: string }[]>([])
  const [publishModal, setPublishModal] = useState(false)
  const [publishSummary, setPublishSummary] = useState('')

  // Create workflow modal
  const [createModal, setCreateModal] = useState(false)
  const [newWorkflowName, setNewWorkflowName] = useState('')
  const [newWorkflowDesc, setNewWorkflowDesc] = useState('')

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
  const addNodeFromPalette = (type: WorkflowNodeData['nodeType'], label: string) => {
    const id = `${type.toLowerCase()}-${nodeCounterRef.current++}`
    const newNode: Node = {
      id,
      type: 'architectNode',
      position: { x: 120 + nodes.length * 30, y: 120 + nodes.length * 30 },
      data: {
        label,
        nodeType: type,
        config: {},
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
          'elk.layered.spacing.nodeNodeBetweenLayers': '60',
        },
        children: nodes.map((n) => ({
          id: n.id,
          width: 175,
          height: 75,
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
      // First save current state as draft
      const def = getSerializedDefinition()
      await callApi(`/workflows/${activeWorkflowId}/draft`, {
        method: 'PUT',
        body: JSON.stringify({ definition: def }),
      })

      // Publish
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

  return (
    <div className="flow-studio-container" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)', minHeight: 600 }}>
      {/* Top Studio Control Bar */}
      <header
        className="glass"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 18px',
          borderRadius: 14,
          marginBottom: 12,
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
        </div>
      </header>

      {/* Main Studio Area: Palette -> Canvas -> Inspector */}
      <div style={{ display: 'grid', gridTemplateColumns: '190px 1fr 310px', gap: 12, flex: 1, minHeight: 0 }}>
        {/* Left Palette */}
        <aside className="glass" style={{ padding: 14, borderRadius: 14, overflowY: 'auto' }}>
          <h3 style={{ fontSize: 12, margin: '0 0 10px 0', textTransform: 'uppercase', letterSpacing: 1, color: '#94a3b8' }}>
            Node Palette
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {[
              { type: 'TRIGGER', label: 'Trigger', icon: Zap, color: '#f59e0b' },
              { type: 'ACTION', label: 'Action', icon: Play, color: '#60a5fa' },
              { type: 'DECISION', label: 'Decision', icon: GitBranch, color: '#38bdf8' },
              { type: 'AI_AGENT', label: 'AI Agent', icon: Bot, color: '#a855f7' },
              { type: 'APPROVAL', label: 'Approval Gate', icon: ShieldCheck, color: '#ec4899' },
              { type: 'DOCUMENT_AI', label: 'Document AI', icon: FileText, color: '#10b981' },
              { type: 'INTEGRATION', label: 'Integration', icon: Network, color: '#6366f1' },
              { type: 'RULE', label: 'Business Rule', icon: ClipboardCheck, color: '#eab308' },
            ].map(({ type, label, icon: Icon, color }) => (
              <button
                key={type}
                type="button"
                onClick={() => addNodeFromPalette(type as WorkflowNodeData['nodeType'], label)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  padding: '8px 10px',
                  borderRadius: 9,
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: 'rgba(255,255,255,0.02)',
                  color: '#e2e8f0',
                  fontSize: 12,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background 0.15s',
                }}
              >
                <Icon size={14} color={color} />
                <span>{label}</span>
                <Plus size={12} style={{ marginLeft: 'auto', opacity: 0.5 }} />
              </button>
            ))}
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

        {/* Right Inspector & Drawer */}
        <aside className="glass" style={{ padding: 14, borderRadius: 14, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
          {/* Inspector Tabs */}
          <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 8, marginBottom: 12 }}>
            {(['Properties', 'Variables', 'Validation', 'Versions'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setInspectorTab(tab)}
                style={{
                  border: 'none',
                  background: inspectorTab === tab ? 'rgba(161, 138, 255, 0.2)' : 'transparent',
                  color: inspectorTab === tab ? '#a18aff' : '#94a3b8',
                  padding: '4px 8px',
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
              {selectedNode ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <h4 style={{ margin: 0, fontSize: 13 }}>Node Inspector</h4>
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
                      <Trash2 size={14} />
                    </button>
                  </div>

                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: '#94a3b8' }}>
                    Node Label
                    <input
                      value={(selectedNode.data as unknown as WorkflowNodeData).label || ''}
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
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', padding: '6px 8px', borderRadius: 6, color: '#f8fafc' }}
                    />
                  </label>

                  <div style={{ fontSize: 11, color: '#94a3b8' }}>
                    Node ID: <code style={{ color: '#a18aff' }}>{selectedNode.id}</code>
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>
                    Node Type: <strong style={{ color: '#f8fafc' }}>{(selectedNode.data as unknown as WorkflowNodeData).nodeType}</strong>
                  </div>
                </div>
              ) : (
                <p style={{ fontSize: 12, color: '#94a3b8' }}>Select any node on the canvas to configure its properties.</p>
              )}
            </div>
          )}

          {/* Variables Tab */}
          {inspectorTab === 'Variables' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <h4 style={{ margin: 0, fontSize: 13 }}>Workflow Variables</h4>
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
                  <Plus size={14} />
                </button>
              </div>

              {variables.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {variables.map((v, i) => (
                    <div key={v.name + i} style={{ padding: 8, borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <code style={{ fontSize: 11, color: '#38bdf8' }}>{v.name}</code>
                        <button
                          type="button"
                          className="icon-button"
                          onClick={() => setVariables((prev) => prev.filter((_, idx) => idx !== i))}
                          style={{ color: '#f87171' }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                      <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                        Type: {v.type} · Secret: {v.is_secret ? 'Yes' : 'No'}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: 12, color: '#94a3b8' }}>No variables declared. Click + to add typed workflow variables.</p>
              )}
            </div>
          )}

          {/* Validation Tab */}
          {inspectorTab === 'Validation' && (
            <div>
              <h4 style={{ margin: '0 0 10px 0', fontSize: 13 }}>Structural Integrity</h4>
              {validationReport ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8, borderRadius: 8, background: validationReport.is_valid ? 'rgba(34, 197, 94, 0.1)' : 'rgba(248, 113, 113, 0.1)' }}>
                    {validationReport.is_valid ? <Check size={16} color="#4ade80" /> : <AlertCircle size={16} color="#f87171" />}
                    <span style={{ fontSize: 12, fontWeight: 600, color: validationReport.is_valid ? '#4ade80' : '#f87171' }}>
                      {validationReport.is_valid ? 'Graph is Valid for Publishing' : `${validationReport.errors.length} Issue(s) Detected`}
                    </span>
                  </div>

                  {validationReport.errors.map((err, i) => (
                    <div key={i} style={{ fontSize: 11, color: '#f87171', background: 'rgba(248,113,113,0.06)', padding: 6, borderRadius: 6 }}>
                      • {err}
                    </div>
                  ))}
                  {validationReport.warnings.map((warn, i) => (
                    <div key={i} style={{ fontSize: 11, color: '#fbbf24', background: 'rgba(251,191,36,0.06)', padding: 6, borderRadius: 6 }}>
                      ⚠ {warn}
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: 12, color: '#94a3b8' }}>Click Validate on the toolbar to check graph integrity.</p>
              )}
            </div>
          )}

          {/* Versions Tab */}
          {inspectorTab === 'Versions' && (
            <div>
              <h4 style={{ margin: '0 0 10px 0', fontSize: 13 }}>Version History</h4>
              {versions.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {versions.map((ver) => (
                    <div key={ver.id} style={{ padding: 8, borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontWeight: 600, fontSize: 12 }}>v{ver.version}</span>
                        <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: ver.status === 'PUBLISHED' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(234, 179, 8, 0.2)', color: ver.status === 'PUBLISHED' ? '#4ade80' : '#fde047' }}>
                          {ver.status}
                        </span>
                      </div>
                      <small style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginTop: 4 }}>
                        {ver.change_summary || 'No summary'}
                      </small>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: 12, color: '#94a3b8' }}>No historical versions loaded.</p>
              )}
            </div>
          )}
        </aside>
      </div>

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
