import React, { useState, useEffect, useMemo } from 'react'
import {
  Video,
  Play,
  Pause,
  Square,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Sparkles,
  ArrowRight,
  Shield,
  Monitor,
  ChevronRight,
  Plus,
  X,
  ChevronLeft,
  FileEdit,
  Check
} from 'lucide-react'

export interface ProcessCaptureStudioProps {
  token: string
  tenant?: { id: string; name: string } | null
  folderId?: string
  onNavigateFlowStudio?: (workflowId?: string) => void
}

interface CaptureAgent {
  id: string
  agent_hostname: string
  os_version: string
  agent_version: string
  status: 'ONLINE' | 'OFFLINE' | 'BUSY'
  last_heartbeat_at?: string
  capabilities?: Record<string, any>
}

interface DiscoveredAppWindow {
  window_id: string
  title: string
  is_foreground: boolean
  capture_allowed: boolean
}

interface DiscoveredApp {
  application_id: string
  display_name: string
  process_name: string
  publisher?: string
  publisher_verified?: boolean
  policy: 'ALLOW' | 'CONDITIONAL' | 'DENY'
  windows: DiscoveredAppWindow[]
  capture_capabilities: string[]
}

interface CaptureSession {
  id: string
  tenant_id: string
  folder_id?: string
  folder_name?: string
  name: string
  description?: string
  target_application?: string
  environment_name: string
  status: 'DRAFT' | 'RECORDING' | 'PAUSED' | 'COMPLETED' | 'APPROVED' | 'ARCHIVED'
  total_steps: number
  duration_ms: number
  consent_obtained: boolean
  consent_operator_name?: string
  consent_timestamp?: string
  security_exclusions?: {
    mask_passwords?: boolean
    redact_credit_cards?: boolean
    redact_ssn?: boolean
    excluded_processes?: string[]
    excluded_applications?: string[]
  }
  created_at: string
}

interface CaptureEvent {
  id: string
  session_id: string
  monotonic_offset_ms: number
  sequence_number: number
  event_type: string
  process_name: string
  window_title: string
  window_class?: string
  ui_element_metadata: {
    automation_id?: string
    control_type?: string
    name?: string
    class_name?: string
    sanitized_input_value?: string
    is_password?: boolean
    [key: string]: any
  }
  interaction_coordinates?: { x: number; y: number }
  evidence_id?: string
  is_redacted: boolean
  redaction_reason?: string
  annotation_title?: string
  annotation_description?: string
  business_rule?: string
  is_approved: boolean
  created_at: string
}

interface EvidenceDetails {
  id: string
  evidence_type: string
  mime_type: string
  base64_data: string
  byte_size: number
  metadata: {
    click_x?: number
    click_y?: number
    screen_width?: number
    screen_height?: number
    [key: string]: any
  }
}

interface RedactionRegion {
  id?: string
  region_id?: string
  evidence_id: string
  bounding_box: { x: number; y: number; width: number; height: number }
  redaction_type: string
  detected_category?: string
  confidence_score?: number
}

interface EffectivePolicy {
  tenant_id: string
  mandatory_pii_rules: Array<{
    rule_id: string
    rule_name: string
    pattern_type: string
    is_mandatory: boolean
  }>
  prohibited_executables: string[]
  retention_days_ceiling: number
}

export const ProcessCaptureStudio: React.FC<ProcessCaptureStudioProps> = ({
  token,
  tenant,
  folderId,
  onNavigateFlowStudio
}) => {
  const [agents, setAgents] = useState<CaptureAgent[]>([])
  const [sessions, setSessions] = useState<CaptureSession[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [events, setEvents] = useState<CaptureEvent[]>([])
  const [selectedEventIndex, setSelectedEventIndex] = useState<number>(0)
  const [evidenceCache, setEvidenceCache] = useState<Record<string, EvidenceDetails>>({})
  const [, setLoading] = useState<boolean>(false)
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'DONE' | 'APPROVED'>('ALL')
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false)
  const [synthesizing, setSynthesizing] = useState<boolean>(false)
  const [synthesizedWorkflow, setSynthesizedWorkflow] = useState<any | null>(null)
  const [editingEvent, setEditingEvent] = useState<CaptureEvent | null>(null)
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // PCS-02: 5-Step Guided Wizard State
  const [wizardStep, setWizardStep] = useState<number>(1)
  const [selectedAgentId, setSelectedAgentId] = useState<string>('')
  const [newSessionName, setNewSessionName] = useState<string>('')
  const [newDescription, setNewDescription] = useState<string>('')
  const [newEnvironment, setNewEnvironment] = useState<string>('DEV')
  const [discoveredApps, setDiscoveredApps] = useState<DiscoveredApp[]>([])
  const [loadingDiscovery, setLoadingDiscovery] = useState<boolean>(false)
  const [selectedApps, setSelectedApps] = useState<Record<string, { app: DiscoveredApp; selectedWindows: string[] }>>({})
  const [captureProfile, setCaptureProfile] = useState<'BALANCED' | 'PRECISION' | 'LEAN'>('BALANCED')
  const [captureDom, setCaptureDom] = useState<boolean>(true)
  const [captureUiAutomation, setCaptureUiAutomation] = useState<boolean>(true)
  const [customRegexRule, setCustomRegexRule] = useState<string>('')
  const [consentConfirmed, setConsentConfirmed] = useState<boolean>(false)
  const [showDevicePairModal, setShowDevicePairModal] = useState<boolean>(false)
  const [devicePairCode, setDevicePairCode] = useState<string>('')

  // PCS-02: Evidence Redaction Editor State
  const [showRedactionModal, setShowRedactionModal] = useState<boolean>(false)
  const [sessionRedactions, setSessionRedactions] = useState<RedactionRegion[]>([])
  const [newRedactionBox, setNewRedactionBox] = useState<{ x: number; y: number; width: number; height: number }>({
    x: 200,
    y: 200,
    width: 250,
    height: 60
  })
  const [redactionCategory, setRedactionCategory] = useState<string>('PCI_PAN')

  // PCS-02: Policy Administration & Governance Modal
  const [showPolicyAdmin, setShowPolicyAdmin] = useState<boolean>(false)
  const [effectivePolicy, setEffectivePolicy] = useState<EffectivePolicy | null>(null)

  const activeTenantId = tenant?.id || '242c817b-d701-4583-8e29-c22c99b381e6'

  // Fetch agents and sessions
  const fetchSessionsAndAgents = async () => {
    try {
      setLoading(true)
      const headers = { Authorization: `Bearer ${token}` }

      const [agentsRes, sessionsRes] = await Promise.all([
        fetch(`/api/v1/capture/agents?tenant_id=${activeTenantId}`, { headers }),
        fetch(`/api/v1/capture/sessions?tenant_id=${activeTenantId}`, { headers })
      ])

      if (agentsRes.ok) {
        const agentData = await agentsRes.json()
        setAgents(agentData)
        if (agentData.length > 0 && !selectedAgentId) {
          setSelectedAgentId(agentData[0].id)
        }
      }

      if (sessionsRes.ok) {
        const sessionData = await sessionsRes.json()
        setSessions(sessionData)
        if (!selectedSessionId && sessionData.length > 0) {
          const firstId = sessionData[0].id
          setSelectedSessionId(firstId)
          fetchSessionEvents(firstId)
        }
      }
    } catch (err: any) {
      console.error('Failed to load capture data:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSessionsAndAgents()
  }, [activeTenantId, token])

  // Fetch events & redactions when active session changes
  const fetchSessionEvents = async (sessionId: string) => {
    try {
      const headers = { Authorization: `Bearer ${token}` }
      const [eventsRes, redRes] = await Promise.all([
        fetch(`/api/v1/capture/sessions/${sessionId}/events`, { headers }),
        fetch(`/api/v1/capture/sessions/${sessionId}/redactions`, { headers })
      ])

      if (eventsRes.ok) {
        const data = await eventsRes.json()
        setEvents(data)
        if (data.length > 0) {
          setSelectedEventIndex(0)
        }
      }
      if (redRes.ok) {
        const redData = await redRes.json()
        setSessionRedactions(redData)
      }
    } catch (err) {
      console.error('Failed to load session details:', err)
    }
  }

  useEffect(() => {
    if (selectedSessionId) {
      fetchSessionEvents(selectedSessionId)
    } else {
      setEvents([])
      setSessionRedactions([])
    }
  }, [selectedSessionId, token])

  const selectedSession = useMemo(
    () => sessions.find(s => s.id === selectedSessionId) || null,
    [sessions, selectedSessionId]
  )

  // Polling when session is recording
  useEffect(() => {
    if (selectedSession?.status === 'RECORDING') {
      const interval = setInterval(() => {
        if (selectedSessionId) {
          fetchSessionEvents(selectedSessionId)
        }
      }, 3000)
      return () => clearInterval(interval)
    }
  }, [selectedSession?.status, selectedSessionId])

  // Fetch evidence keyframe when selected event changes
  const selectedEvent = events[selectedEventIndex] || null

  useEffect(() => {
    if (selectedEvent?.evidence_id && !evidenceCache[selectedEvent.evidence_id]) {
      const evidenceId = selectedEvent.evidence_id
      fetch(`/api/v1/capture/evidence/${evidenceId}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(r => r.json())
        .then(data => {
          if (data && data.evidence_id) {
            setEvidenceCache(prev => ({
              ...prev,
              [evidenceId]: {
                id: data.evidence_id,
                evidence_type: data.evidence_type,
                mime_type: data.mime_type,
                base64_data: data.base64_data,
                byte_size: data.byte_size,
                metadata: data.metadata || {}
              }
            }))
          }
        })
        .catch(console.error)
    }
  }, [selectedEvent, evidenceCache, token])

  // Fetch Endpoint Discovered Applications
  const fetchDiscoveredApplications = async (agentId: string) => {
    if (!agentId) return
    try {
      setLoadingDiscovery(true)
      const headers = { Authorization: `Bearer ${token}` }
      const res = await fetch(`/api/v1/capture/agents/${agentId}/discovery`, { headers })
      if (res.ok) {
        const data = await res.json()
        setDiscoveredApps(data.applications || [])
        // Pre-select allowed applications
        const initialSelection: Record<string, { app: DiscoveredApp; selectedWindows: string[] }> = {}
        ;(data.applications || []).forEach((app: DiscoveredApp) => {
          if (app.policy === 'ALLOW') {
            initialSelection[app.process_name] = {
              app,
              selectedWindows: (app.windows || []).map(w => w.title)
            }
          }
        })
        setSelectedApps(initialSelection)
      } else {
        // Fallback default enterprise catalog if offline
        setDiscoveredApps([
          {
            application_id: 'app-excel',
            display_name: 'Microsoft Excel',
            process_name: 'excel.exe',
            publisher: 'Microsoft Corporation',
            publisher_verified: true,
            policy: 'ALLOW',
            windows: [{ window_id: 'w1', title: 'Ledger_Reconciliation.xlsx', is_foreground: true, capture_allowed: true }],
            capture_capabilities: ['SCREEN', 'UI_ELEMENTS']
          },
          {
            application_id: 'app-sap',
            display_name: 'SAP GUI for Windows',
            process_name: 'saplogon.exe',
            publisher: 'SAP SE',
            publisher_verified: true,
            policy: 'ALLOW',
            windows: [{ window_id: 'w2', title: 'SAP Easy Access - Production', is_foreground: false, capture_allowed: true }],
            capture_capabilities: ['SCREEN', 'UI_ELEMENTS']
          }
        ])
      }
    } catch (err) {
      console.error('Failed to discover applications:', err)
    } finally {
      setLoadingDiscovery(false)
    }
  }

  // Load effective policy for governance preview
  const fetchEffectivePolicy = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` }
      const res = await fetch(`/api/v1/capture/policies/effective?tenant_id=${activeTenantId}`, { headers })
      if (res.ok) {
        const data = await res.json()
        setEffectivePolicy(data)
      }
    } catch (err) {
      console.error('Failed to load effective policy:', err)
    }
  }

  // Trigger app discovery when moving to Step 2
  useEffect(() => {
    if (showCreateModal && wizardStep === 2 && selectedAgentId) {
      fetchDiscoveredApplications(selectedAgentId)
    }
  }, [showCreateModal, wizardStep, selectedAgentId])

  // State transitions (START, PAUSE, RESUME, STOP, APPROVE)
  const handleTransition = async (action: 'START' | 'PAUSE' | 'RESUME' | 'STOP' | 'APPROVE') => {
    if (!selectedSessionId) return
    try {
      const res = await fetch(`/api/v1/capture/sessions/${selectedSessionId}/transition`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ action, consent_confirmed: true })
      })

      if (res.ok) {
        const updated = await res.json()
        setSessions(prev =>
          prev.map(s => (s.id === selectedSessionId ? { ...s, status: updated.status } : s))
        )
        setFeedbackMessage({
          type: 'success',
          text: `Capture session transitioned to ${updated.status}.`
        })
        setTimeout(() => setFeedbackMessage(null), 4000)
      } else {
        const err = await res.json()
        setFeedbackMessage({
          type: 'error',
          text: err.detail || 'Failed to update session state.'
        })
      }
    } catch (err: any) {
      setFeedbackMessage({ type: 'error', text: err.message })
    }
  }

  // Create new session via Guided Wizard
  const handlePairDevice = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const res = await fetch('/api/v1/capture/agents/enroll/authorize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          user_code: devicePairCode,
          tenant_id: activeTenantId
        })
      })

      if (res.ok) {
        const authData = await res.json()
        setShowDevicePairModal(false)
        setDevicePairCode('')
        setFeedbackMessage({
          type: 'success',
          text: `Device '${authData.agent_hostname}' successfully paired to tenant.`
        })
        fetchSessionsAndAgents()
      } else {
        const err = await res.json()
        alert(err.detail || 'Failed to authorize device code.')
      }
    } catch (err: any) {
      alert(err.message)
    }
  }

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!consentConfirmed) {
      alert('Operator consent must be confirmed before initiating a process capture session.')
      return
    }

    try {
      const selectedAppsList = Object.values(selectedApps).map(item => ({
        display_name: item.app.display_name,
        process_name: item.app.process_name,
        publisher: item.app.publisher,
        selected_windows: item.selectedWindows
      }))

      const targetAppName =
        selectedAppsList.length > 0
          ? selectedAppsList.map(a => a.display_name).slice(0, 3).join(', ')
          : 'Multi-Application Workflow'

      const payload = {
        tenant_id: activeTenantId,
        folder_id: folderId || null,
        name: newSessionName || 'Treasury & ERP Process Capture',
        description: newDescription || undefined,
        environment_name: newEnvironment,
        target_application: targetAppName,
        selected_applications: selectedAppsList,
        security_exclusions: {
          mask_passwords: true,
          redact_credit_cards: true,
          redact_ssn: true,
          custom_regex: customRegexRule || undefined,
          excluded_processes: ['1password.exe', 'bitwarden.exe', 'keepass.exe', 'credentialmanager.exe']
        },
        consent_operator_name: 'Authorized Operator'
      }

      const res = await fetch('/api/v1/capture/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      })

      if (res.ok) {
        const newSession = await res.json()
        setSessions(prev => [newSession, ...prev])
        setSelectedSessionId(newSession.id)
        setShowCreateModal(false)
        setWizardStep(1)
        setNewSessionName('')
        setNewDescription('')
        setConsentConfirmed(false)
        setFeedbackMessage({
          type: 'success',
          text: `Governed capture session '${newSession.name}' created.`
        })
      } else {
        const err = await res.json()
        alert(err.detail || 'Failed to create session')
      }
    } catch (err: any) {
      alert(err.message)
    }
  }

  // Submit solid black evidence redaction
  const handleSaveRedaction = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedSessionId || !selectedEvent?.evidence_id) return

    try {
      const payload = {
        evidence_id: selectedEvent.evidence_id,
        bounding_box: newRedactionBox,
        redaction_type: 'SOLID_BLACK',
        detected_category: redactionCategory,
        confidence_score: 1.0
      }

      const res = await fetch(`/api/v1/capture/sessions/${selectedSessionId}/redactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      })

      if (res.ok) {
        const saved = await res.json()
        setSessionRedactions(prev => [...prev, saved])
        setShowRedactionModal(false)
        setFeedbackMessage({
          type: 'success',
          text: `Solid black redaction applied for category ${redactionCategory}.`
        })
        setTimeout(() => setFeedbackMessage(null), 4000)
      } else {
        const err = await res.json()
        alert(err.detail || 'Failed to save redaction')
      }
    } catch (err: any) {
      alert(err.message)
    }
  }

  // Synthesize Flow Studio workflow
  const handleSynthesizeFlow = async () => {
    if (!selectedSessionId) return
    try {
      setSynthesizing(true)
      const res = await fetch(`/api/v1/capture/sessions/${selectedSessionId}/synthesize-flow`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          workflow_name: `Automated: ${selectedSession?.name || 'Captured Process Workflow'}`
        })
      })

      if (res.ok) {
        const data = await res.json()
        setSynthesizedWorkflow(data)
        setSessions(prev =>
          prev.map(s => (s.id === selectedSessionId ? { ...s, status: 'APPROVED' } : s))
        )
      } else {
        const err = await res.json()
        setFeedbackMessage({ type: 'error', text: err.detail || 'Synthesis failed.' })
      }
    } catch (err: any) {
      setFeedbackMessage({ type: 'error', text: err.message })
    } finally {
      setSynthesizing(false)
    }
  }

  // Save Step Annotation
  const handleSaveAnnotation = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingEvent || !selectedSessionId) return

    try {
      const res = await fetch(
        `/api/v1/capture/sessions/${selectedSessionId}/events/${editingEvent.id}/annotate`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            annotation_title: editingEvent.annotation_title,
            annotation_description: editingEvent.annotation_description,
            business_rule: editingEvent.business_rule,
            is_redacted: editingEvent.is_redacted,
            is_approved: editingEvent.is_approved
          })
        }
      )

      if (res.ok) {
        const updated = await res.json()
        setEvents(prev => prev.map(ev => (ev.id === updated.id ? { ...ev, ...updated } : ev)))
        setEditingEvent(null)
        setFeedbackMessage({ type: 'success', text: 'Step annotation saved.' })
        setTimeout(() => setFeedbackMessage(null), 3000)
      } else {
        const err = await res.json()
        alert(err.detail || 'Failed to save annotation')
      }
    } catch (err: any) {
      alert(err.message)
    }
  }

  const filteredSessions = useMemo(() => {
    if (statusFilter === 'ACTIVE') return sessions.filter(s => s.status === 'RECORDING' || s.status === 'PAUSED')
    if (statusFilter === 'DONE') return sessions.filter(s => s.status === 'COMPLETED')
    if (statusFilter === 'APPROVED') return sessions.filter(s => s.status === 'APPROVED')
    return sessions
  }, [sessions, statusFilter])

  const connectedAgent = agents[0] || null
  const currentEvidence = selectedEvent?.evidence_id ? evidenceCache[selectedEvent.evidence_id] : null
  const activeEvidenceRedactions = useMemo(
    () => sessionRedactions.filter(r => r.evidence_id === currentEvidence?.id),
    [sessionRedactions, currentEvidence?.id]
  )

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        background: 'var(--background)',
        color: 'var(--foreground)',
        overflow: 'hidden'
      }}
    >
      {/* Top Header Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 18px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--card)',
          flexShrink: 0
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'color-mix(in srgb, var(--accent, #BA9731) 15%, transparent)',
              border: '1px solid var(--accent, #BA9731)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Video size={17} color="var(--accent, #BA9731)" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0, letterSpacing: '-0.01em' }}>
                Process Capture Studio
              </h2>
              <span
                style={{
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  padding: '1px 6px',
                  borderRadius: 4,
                  background: 'color-mix(in srgb, var(--accent, #BA9731) 20%, transparent)',
                  color: 'var(--accent, #BA9731)',
                  border: '1px solid var(--accent, #BA9731)'
                }}
              >
                PCS-02 GOVERNED
              </span>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', margin: 0 }}>
              Cross-Platform Native Capture, Zero-Trust Application Catalog &amp; Evidence Privacy
            </p>
          </div>
        </div>

        {/* Action Controls & Agent Health Pill */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => setShowDevicePairModal(true)}
            className="secondary-button"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '6px 12px',
              fontSize: '0.76rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <Shield size={13} color="var(--accent, #BA9731)" />
            <span>Pair Agent</span>
          </button>
          <button
            onClick={() => {
              fetchEffectivePolicy()
              setShowPolicyAdmin(true)
            }}
            className="secondary-button"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              fontSize: '0.76rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <Shield size={13} color="var(--accent, #BA9731)" />
            <span>Policy Governance</span>
          </button>

          {/* Connected Agent Health Badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 10px',
              borderRadius: 6,
              background: 'color-mix(in srgb, var(--card) 80%, transparent)',
              border: '1px solid var(--border)',
              fontSize: '0.74rem'
            }}
          >
            <div
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: connectedAgent?.status === 'ONLINE' ? '#10b981' : '#f59e0b',
                boxShadow: `0 0 6px ${connectedAgent?.status === 'ONLINE' ? '#10b981' : '#f59e0b'}`
              }}
            />
            <span style={{ fontWeight: 600, color: 'var(--foreground)' }}>
              Agent: {connectedAgent?.agent_hostname || 'No agent registered'}
            </span>
            <span style={{ color: 'var(--muted-foreground)', fontSize: '0.68rem' }}>
              ({connectedAgent?.os_version || 'Windows'})
            </span>
          </div>

          <button
            onClick={() => {
              setShowCreateModal(true)
              setWizardStep(1)
            }}
            className="primary-button"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 14px',
              fontSize: '0.78rem',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            <Plus size={14} />
            <span>New Session</span>
          </button>
        </div>
      </div>

      {/* Sticky Recording Banner (Mandatory Active Indicator) */}
      {selectedSession?.status === 'RECORDING' && (
        <div
          style={{
            background: 'linear-gradient(90deg, rgba(239, 68, 68, 0.2) 0%, rgba(186, 151, 49, 0.15) 100%)',
            borderBottom: '1px solid #ef4444',
            padding: '8px 18px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: 0
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: '#ef4444',
                animation: 'pulse 1.5s infinite',
                boxShadow: '0 0 8px #ef4444'
              }}
            />
            <div>
              <span style={{ fontWeight: 700, fontSize: '0.8rem', color: '#ef4444' }}>
                ArchitectIQ Governed Recording Active
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--foreground)', marginLeft: 8 }}>
                Session: <strong>{selectedSession.name}</strong> | Target: {selectedSession.target_application} | Env: {selectedSession.environment_name}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => handleTransition('PAUSE')}
              className="secondary-button"
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', fontSize: '0.74rem' }}
            >
              <Pause size={12} />
              <span>Pause</span>
            </button>
            <button
              onClick={() => handleTransition('STOP')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '4px 12px',
                fontSize: '0.74rem',
                background: '#ef4444',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              <Square size={12} />
              <span>Stop &amp; Finalize</span>
            </button>
          </div>
        </div>
      )}

      {/* Paused Session Indicator */}
      {selectedSession?.status === 'PAUSED' && (
        <div
          style={{
            background: 'color-mix(in srgb, #f59e0b 15%, transparent)',
            borderBottom: '1px solid #f59e0b',
            padding: '6px 18px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: 0
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.78rem', color: '#f59e0b' }}>
            <AlertTriangle size={14} />
            <span>Recording Paused. Events and screenshots suspended until resumed.</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => handleTransition('RESUME')}
              className="primary-button"
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px', fontSize: '0.72rem' }}
            >
              <Play size={11} /> Resume
            </button>
            <button
              onClick={() => handleTransition('STOP')}
              className="secondary-button"
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px', fontSize: '0.72rem' }}
            >
              <Square size={11} /> Stop
            </button>
          </div>
        </div>
      )}

      {/* Toast Feedback */}
      {feedbackMessage && (
        <div
          style={{
            padding: '6px 16px',
            background:
              feedbackMessage.type === 'success'
                ? 'color-mix(in srgb, #10b981 15%, transparent)'
                : 'color-mix(in srgb, #ef4444 15%, transparent)',
            borderBottom: `1px solid ${feedbackMessage.type === 'success' ? '#10b981' : '#ef4444'}`,
            color: feedbackMessage.type === 'success' ? '#10b981' : '#ef4444',
            fontSize: '0.76rem',
            fontWeight: 600,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: 0
          }}
        >
          <span>{feedbackMessage.text}</span>
          <button onClick={() => setFeedbackMessage(null)} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer' }}>
            <X size={13} />
          </button>
        </div>
      )}

      {/* Main 3-Column Studio Workspace */}
      <div style={{ display: 'grid', gridTemplateColumns: '310px 1fr 340px', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {/* Left Column: Sessions Sidebar */}
        <div
          style={{
            borderRight: '1px solid var(--border)',
            background: 'color-mix(in srgb, var(--card) 40%, transparent)',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0
          }}
        >
          {/* Filter Tabs */}
          <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 4 }}>
            {(['ALL', 'ACTIVE', 'DONE', 'APPROVED'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setStatusFilter(tab)}
                style={{
                  flex: 1,
                  padding: '4px 6px',
                  borderRadius: 4,
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  border: 'none',
                  background: statusFilter === tab ? 'var(--accent, #BA9731)' : 'transparent',
                  color: statusFilter === tab ? '#000' : 'var(--muted-foreground)',
                  cursor: 'pointer'
                }}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Session List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
            {filteredSessions.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '0.78rem' }}>
                No capture sessions found.
              </div>
            ) : (
              filteredSessions.map(session => {
                const isSelected = session.id === selectedSessionId
                return (
                  <div
                    key={session.id}
                    onClick={() => {
                      setSelectedSessionId(session.id)
                      fetchSessionEvents(session.id)
                    }}
                    className="glass-card"
                    style={{
                      padding: 10,
                      marginBottom: 6,
                      borderRadius: 8,
                      border: isSelected ? '1px solid var(--accent, #BA9731)' : '1px solid var(--border)',
                      background: isSelected ? 'color-mix(in srgb, var(--accent, #BA9731) 12%, transparent)' : 'var(--card)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--foreground)' }}>
                        {session.name}
                      </span>
                      <span
                        style={{
                          fontSize: '0.64rem',
                          fontWeight: 700,
                          padding: '1px 5px',
                          borderRadius: 3,
                          background:
                            session.status === 'RECORDING'
                              ? 'rgba(239, 68, 68, 0.2)'
                              : session.status === 'APPROVED'
                              ? 'rgba(16, 185, 129, 0.2)'
                              : 'rgba(100, 116, 139, 0.2)',
                          color:
                            session.status === 'RECORDING'
                              ? '#ef4444'
                              : session.status === 'APPROVED'
                              ? '#10b981'
                              : 'var(--muted-foreground)'
                        }}
                      >
                        {session.status}
                      </span>
                    </div>

                    <div style={{ fontSize: '0.72rem', color: 'var(--muted-foreground)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        🎯 {session.target_application || 'Multi-App Workflow'}
                      </span>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2, fontSize: '0.68rem' }}>
                        <span>Env: <strong>{session.environment_name}</strong></span>
                        <span>{session.total_steps || 0} steps</span>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Center Column: Live Evidence Keyframe Viewer & Scrubber */}
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, borderRight: '1px solid var(--border)' }}>
          {selectedSession ? (
            <>
              {/* Evidence Header */}
              <div
                style={{
                  padding: '8px 14px',
                  borderBottom: '1px solid var(--border)',
                  background: 'var(--card)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexShrink: 0
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Monitor size={15} color="var(--accent, #BA9731)" />
                  <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>
                    Step #{selectedEvent?.sequence_number || 1} Evidence Keyframe
                  </span>
                  {selectedEvent?.is_redacted && (
                    <span
                      style={{
                        padding: '1px 6px',
                        borderRadius: 4,
                        background: 'rgba(239, 68, 68, 0.2)',
                        color: '#ef4444',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4
                      }}
                    >
                      <Lock size={11} /> Redacted Keyframe
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {currentEvidence?.base64_data && (
                    <button
                      onClick={() => setShowRedactionModal(true)}
                      className="secondary-button"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        padding: '3px 8px',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      <Shield size={12} color="#ef4444" />
                      <span>Solid-Black Redactor</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Visual Frame Canvas */}
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  padding: 12,
                  position: 'relative',
                  background: 'color-mix(in srgb, var(--card) 20%, #000)'
                }}
              >
                {currentEvidence?.base64_data ? (
                  <div
                    style={{
                      position: 'relative',
                      maxWidth: '100%',
                      maxHeight: '100%',
                      boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      overflow: 'hidden'
                    }}
                  >
                    <img
                      src={`data:${currentEvidence.mime_type};base64,${currentEvidence.base64_data}`}
                      alt="Capture Keyframe"
                      style={{ display: 'block', maxWidth: '100%', maxHeight: 'calc(100vh - 350px)', objectFit: 'contain' }}
                    />

                    {/* Interaction Target Pulse */}
                    {selectedEvent?.interaction_coordinates && (
                      <div
                        style={{
                          position: 'absolute',
                          left: `${(selectedEvent.interaction_coordinates.x / (currentEvidence.metadata.screen_width || 1920)) * 100}%`,
                          top: `${(selectedEvent.interaction_coordinates.y / (currentEvidence.metadata.screen_height || 1080)) * 100}%`,
                          transform: 'translate(-50%, -50%)',
                          width: 22,
                          height: 22,
                          borderRadius: '50%',
                          border: '2px solid #10b981',
                          background: 'rgba(16, 185, 129, 0.3)',
                          pointerEvents: 'none',
                          boxShadow: '0 0 10px #10b981'
                        }}
                      />
                    )}

                    {/* Active Solid-Black Redaction Overlays */}
                    {activeEvidenceRedactions.map((r, idx) => (
                      <div
                        key={idx}
                        title={`Redacted: ${r.detected_category || 'PII'}`}
                        style={{
                          position: 'absolute',
                          left: `${(r.bounding_box.x / (currentEvidence.metadata.screen_width || 1920)) * 100}%`,
                          top: `${(r.bounding_box.y / (currentEvidence.metadata.screen_height || 1080)) * 100}%`,
                          width: `${(r.bounding_box.width / (currentEvidence.metadata.screen_width || 1920)) * 100}%`,
                          height: `${(r.bounding_box.height / (currentEvidence.metadata.screen_height || 1080)) * 100}%`,
                          background: '#000000',
                          border: '1px dashed #ef4444',
                          zIndex: 10
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '0.82rem' }}>
                    {selectedEvent?.is_redacted ? (
                      <div>
                        <Lock size={32} style={{ margin: '0 auto 6px', color: '#ef4444' }} />
                        <p style={{ color: '#ef4444', fontWeight: 700, margin: '0 0 4px' }}>
                          Screenshot Redacted by Enterprise Security Policy
                        </p>
                        <small style={{ color: 'var(--muted-foreground)' }}>
                          {selectedEvent.redaction_reason || 'Password field or excluded application active.'}
                        </small>
                      </div>
                    ) : (
                      <div>
                        <Monitor size={32} style={{ margin: '0 auto 6px', opacity: 0.3 }} />
                        <p style={{ margin: 0 }}>No keyframe snapshot for selected step.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Scrubber Timeline Controls */}
              <div
                style={{
                  padding: '8px 14px',
                  borderTop: '1px solid var(--border)',
                  background: 'var(--card)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  flexShrink: 0
                }}
              >
                <button
                  disabled={selectedEventIndex <= 0}
                  onClick={() => setSelectedEventIndex(i => Math.max(0, i - 1))}
                  className="secondary-button"
                  style={{ padding: '4px 8px', fontSize: '0.72rem' }}
                >
                  <ChevronLeft size={13} />
                </button>

                <input
                  type="range"
                  min={0}
                  max={Math.max(0, events.length - 1)}
                  value={selectedEventIndex}
                  onChange={e => setSelectedEventIndex(Number(e.target.value))}
                  style={{ flex: 1, accentColor: 'var(--accent, #BA9731)', cursor: 'pointer' }}
                />

                <button
                  disabled={selectedEventIndex >= events.length - 1}
                  onClick={() => setSelectedEventIndex(i => Math.min(events.length - 1, i + 1))}
                  className="secondary-button"
                  style={{ padding: '4px 8px', fontSize: '0.72rem' }}
                >
                  <ChevronRight size={13} />
                </button>

                <span style={{ fontSize: '0.72rem', color: 'var(--muted-foreground)', minWidth: 60, textAlign: 'right' }}>
                  {events.length > 0 ? `${selectedEventIndex + 1} / ${events.length}` : '0 / 0'}
                </span>
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted-foreground)', fontSize: '0.85rem' }}>
              Select a capture session to inspect evidence.
            </div>
          )}
        </div>

        {/* Right Column: Step Event Stream & Synthesis Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--card)' }}>
          {/* Header */}
          <div
            style={{
              padding: '10px 14px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexShrink: 0
            }}
          >
            <div>
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--foreground)' }}>
                Event Log &amp; Synthesizer
              </span>
              <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--muted-foreground)' }}>
                {events.length} captured micro-interactions
              </p>
            </div>

            {selectedSession?.status === 'COMPLETED' && (
              <button
                onClick={handleSynthesizeFlow}
                disabled={synthesizing}
                className="primary-button"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '5px 10px',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                <Sparkles size={12} />
                <span>{synthesizing ? 'Synthesizing...' : 'Export to Flow Studio'}</span>
              </button>
            )}
          </div>

          {/* Workflow Synthesized Banner */}
          {synthesizedWorkflow && (
            <div
              style={{
                padding: '10px 14px',
                background: 'color-mix(in srgb, #10b981 12%, transparent)',
                borderBottom: '1px solid #10b981',
                flexShrink: 0
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#10b981', fontWeight: 700, fontSize: '0.78rem' }}>
                <CheckCircle2 size={14} />
                <span>Workflow Successfully Synthesized!</span>
              </div>
              <p style={{ fontSize: '0.72rem', margin: '4px 0 8px', color: 'var(--foreground)' }}>
                Generated <strong>{synthesizedWorkflow.synthesized_nodes_count || 4} nodes</strong> for Flow Studio.
              </p>
              <button
                onClick={() => onNavigateFlowStudio?.(synthesizedWorkflow.workflow_id)}
                className="primary-button"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '4px 10px',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                <span>Open in Flow Studio</span>
                <ArrowRight size={12} />
              </button>
            </div>
          )}

          {/* Event Stream List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
            {events.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 24, color: 'var(--muted-foreground)', fontSize: '0.78rem' }}>
                No events recorded yet.
              </div>
            ) : (
              events.map((ev, index) => {
                const isSelected = index === selectedEventIndex
                return (
                  <div
                    key={ev.id}
                    onClick={() => setSelectedEventIndex(index)}
                    className="glass-card"
                    style={{
                      padding: '8px 10px',
                      marginBottom: 6,
                      borderRadius: 6,
                      border: isSelected ? '1px solid var(--accent, #BA9731)' : '1px solid var(--border)',
                      background: isSelected ? 'color-mix(in srgb, var(--accent, #BA9731) 12%, transparent)' : 'var(--background)',
                      cursor: 'pointer'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span
                          style={{
                            fontSize: '0.64rem',
                            fontWeight: 800,
                            padding: '1px 5px',
                            borderRadius: 3,
                            background: 'var(--card)',
                            border: '1px solid var(--border)'
                          }}
                        >
                          #{ev.sequence_number}
                        </span>
                        <span style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--foreground)' }}>
                          {ev.annotation_title || ev.ui_element_metadata?.name || ev.event_type}
                        </span>
                      </div>

                      <button
                        onClick={e => {
                          e.stopPropagation()
                          setEditingEvent(ev)
                        }}
                        style={{ background: 'transparent', border: 'none', color: 'var(--muted-foreground)', cursor: 'pointer', padding: 2 }}
                        title="Annotate Step"
                      >
                        <FileEdit size={12} />
                      </button>
                    </div>

                    <div style={{ fontSize: '0.68rem', color: 'var(--muted-foreground)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        ⚙️ {ev.process_name} · {ev.window_title}
                      </span>
                      {ev.ui_element_metadata?.sanitized_input_value && (
                        <span style={{ color: ev.is_redacted ? '#ef4444' : 'var(--foreground)' }}>
                          Input: <code>{ev.ui_element_metadata.sanitized_input_value}</code>
                        </span>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* MODAL: PCS-02 5-STEP GUIDED SESSION CREATION WIZARD                 */}
      {/* ==================================================================== */}
      {showCreateModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
        >
          <div
            className="glass-card"
            style={{
              width: 580,
              maxHeight: '90vh',
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: 20,
              boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
              color: 'var(--foreground)',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            {/* Wizard Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Video size={18} color="var(--accent, #BA9731)" />
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>
                  Create Process Capture Session
                </h3>
              </div>
              <button onClick={() => setShowCreateModal(false)} style={{ background: 'transparent', border: 'none', color: 'var(--muted-foreground)', cursor: 'pointer' }}>
                <X size={17} />
              </button>
            </div>

            {/* 5-Step Tab Navigator */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(5, 1fr)',
                gap: 4,
                marginBottom: 16,
                padding: '4px',
                background: 'var(--background)',
                borderRadius: 8,
                border: '1px solid var(--border)'
              }}
            >
              {[
                { step: 1, label: '1. Context' },
                { step: 2, label: '2. Apps' },
                { step: 3, label: '3. Profile' },
                { step: 4, label: '4. Privacy' },
                { step: 5, label: '5. Review' }
              ].map(s => (
                <button
                  key={s.step}
                  type="button"
                  onClick={() => setWizardStep(s.step)}
                  style={{
                    padding: '6px 4px',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    borderRadius: 5,
                    border: 'none',
                    background: wizardStep === s.step ? 'var(--accent, #BA9731)' : 'transparent',
                    color: wizardStep === s.step ? '#000' : 'var(--muted-foreground)',
                    cursor: 'pointer'
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {/* Wizard Body Container */}
            <form onSubmit={handleCreateSession} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4, marginBottom: 14 }}>
                {/* STEP 1: CONTEXT & ENDPOINT */}
                {wizardStep === 1 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: 4 }}>
                        Session Name *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Treasury G/L Account Posting & Reconciliation"
                        value={newSessionName}
                        onChange={e => setNewSessionName(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '7px 10px',
                          background: 'var(--background)',
                          border: '1px solid var(--border)',
                          borderRadius: 6,
                          color: 'var(--foreground)',
                          fontSize: '0.82rem'
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: 4 }}>
                        Description (Optional)
                      </label>
                      <textarea
                        rows={2}
                        placeholder="High-level business objective of the process recording..."
                        value={newDescription}
                        onChange={e => setNewDescription(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '7px 10px',
                          background: 'var(--background)',
                          border: '1px solid var(--border)',
                          borderRadius: 6,
                          color: 'var(--foreground)',
                          fontSize: '0.82rem',
                          resize: 'vertical'
                        }}
                      />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: 4 }}>
                          Target Environment
                        </label>
                        <select
                          value={newEnvironment}
                          onChange={e => setNewEnvironment(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '7px 10px',
                            background: 'var(--background)',
                            border: '1px solid var(--border)',
                            borderRadius: 6,
                            color: 'var(--foreground)',
                            fontSize: '0.82rem'
                          }}
                        >
                          <option value="DEV">DEV (Development)</option>
                          <option value="TEST">TEST (QA / Test)</option>
                          <option value="UAT">UAT (User Acceptance)</option>
                          <option value="PROD">PROD (Production)</option>
                        </select>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: 4 }}>
                          Capture Endpoint Agent
                        </label>
                        <select
                          value={selectedAgentId}
                          onChange={e => setSelectedAgentId(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '7px 10px',
                            background: 'var(--background)',
                            border: '1px solid var(--border)',
                            borderRadius: 6,
                            color: 'var(--foreground)',
                            fontSize: '0.82rem'
                          }}
                        >
                          {agents.map(a => (
                            <option key={a.id} value={a.id}>
                              {a.agent_hostname} ({a.status})
                            </option>
                          ))}
                          {agents.length === 0 && <option value="">No registered agents</option>}
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {/* STEP 2: RUNNING APPLICATION DISCOVERY & MULTI-APP SCOPE */}
                {wizardStep === 2 && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 700 }}>
                        Discovered Applications on Selected Endpoint:
                      </span>
                      {loadingDiscovery && <span style={{ fontSize: '0.72rem', color: 'var(--accent, #BA9731)' }}>Scanning desktop...</span>}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 260, overflowY: 'auto' }}>
                      {discoveredApps.map(app => {
                        const isSelected = !!selectedApps[app.process_name]
                        return (
                          <div
                            key={app.process_name}
                            className="glass-card"
                            style={{
                              padding: 10,
                              borderRadius: 6,
                              border: isSelected ? '1px solid var(--accent, #BA9731)' : '1px solid var(--border)',
                              background: isSelected ? 'color-mix(in srgb, var(--accent, #BA9731) 8%, transparent)' : 'var(--card)'
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={e => {
                                    if (e.target.checked) {
                                      setSelectedApps(prev => ({
                                        ...prev,
                                        [app.process_name]: {
                                          app,
                                          selectedWindows: (app.windows || []).map(w => w.title)
                                        }
                                      }))
                                    } else {
                                      setSelectedApps(prev => {
                                        const next = { ...prev }
                                        delete next[app.process_name]
                                        return next
                                      })
                                    }
                                  }}
                                />
                                <div>
                                  <strong style={{ fontSize: '0.8rem', color: 'var(--foreground)' }}>
                                    {app.display_name}
                                  </strong>
                                  <span style={{ fontSize: '0.72rem', color: 'var(--muted-foreground)', marginLeft: 6 }}>
                                    ({app.process_name})
                                  </span>
                                </div>
                              </label>

                              <span
                                style={{
                                  fontSize: '0.66rem',
                                  fontWeight: 800,
                                  padding: '2px 6px',
                                  borderRadius: 4,
                                  background:
                                    app.policy === 'ALLOW'
                                      ? 'rgba(16, 185, 129, 0.2)'
                                      : app.policy === 'CONDITIONAL'
                                      ? 'rgba(245, 158, 11, 0.2)'
                                      : 'rgba(239, 68, 68, 0.2)',
                                  color:
                                    app.policy === 'ALLOW'
                                      ? '#10b981'
                                      : app.policy === 'CONDITIONAL'
                                      ? '#f59e0b'
                                      : '#ef4444'
                                }}
                              >
                                {app.policy}
                              </span>
                            </div>

                            {/* Windows Sub-tree */}
                            {isSelected && (
                              <div style={{ marginTop: 6, paddingLeft: 22, fontSize: '0.72rem', color: 'var(--muted-foreground)' }}>
                                <span style={{ fontWeight: 600 }}>Active Windows to Capture:</span>
                                {(app.windows || []).map(w => (
                                  <div key={w.window_id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                                    <Check size={11} color="var(--accent, #BA9731)" />
                                    <span style={{ color: 'var(--foreground)' }}>{w.title}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* STEP 3: CAPTURE PROFILES & CAPABILITIES */}
                {wizardStep === 3 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 700 }}>Select Capture Profile:</span>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                      {[
                        {
                          id: 'BALANCED',
                          name: 'Balanced Interactive',
                          fps: '1.0 Hz',
                          res: '1080p',
                          desc: 'Recommended for standard SOP capture and enterprise documentation.'
                        },
                        {
                          id: 'PRECISION',
                          name: 'High-Precision Audit',
                          fps: '5.0 Hz',
                          res: '1440p',
                          desc: 'Micro-interaction granularity for regulatory compliance.'
                        },
                        {
                          id: 'LEAN',
                          name: 'Low-Bandwidth Lean',
                          fps: '0.5 Hz',
                          res: '720p',
                          desc: 'Optimized for high-latency or bandwidth-constrained branches.'
                        }
                      ].map(prof => (
                        <div
                          key={prof.id}
                          onClick={() => setCaptureProfile(prof.id as any)}
                          className="glass-card"
                          style={{
                            padding: 10,
                            borderRadius: 6,
                            border: captureProfile === prof.id ? '1px solid var(--accent, #BA9731)' : '1px solid var(--border)',
                            background: captureProfile === prof.id ? 'color-mix(in srgb, var(--accent, #BA9731) 12%, transparent)' : 'var(--card)',
                            cursor: 'pointer'
                          }}
                        >
                          <strong style={{ display: 'block', fontSize: '0.76rem', color: 'var(--foreground)' }}>
                            {prof.name}
                          </strong>
                          <div style={{ fontSize: '0.68rem', color: 'var(--accent, #BA9731)', margin: '2px 0 4px', fontWeight: 700 }}>
                            {prof.fps} · {prof.res}
                          </div>
                          <p style={{ margin: 0, fontSize: '0.66rem', color: 'var(--muted-foreground)' }}>
                            {prof.desc}
                          </p>
                        </div>
                      ))}
                    </div>

                    <div style={{ marginTop: 10, padding: 10, background: 'var(--background)', borderRadius: 6, border: '1px solid var(--border)' }}>
                      <span style={{ fontSize: '0.74rem', fontWeight: 700, display: 'block', marginBottom: 6 }}>
                        Inspection Capabilities:
                      </span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.74rem' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                          <input type="checkbox" checked={captureUiAutomation} onChange={e => setCaptureUiAutomation(e.target.checked)} />
                          <span>Windows UI Automation / Native Accessibility Tree Inspection</span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                          <input type="checkbox" checked={captureDom} onChange={e => setCaptureDom(e.target.checked)} />
                          <span>Browser DOM Hierarchy &amp; CSS Selector Extraction</span>
                        </label>
                      </div>
                    </div>
                  </div>
                )}

                {/* STEP 4: PRIVACY & CENTRALIZED GOVERNANCE */}
                {wizardStep === 4 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ padding: 10, background: 'color-mix(in srgb, var(--accent, #BA9731) 10%, transparent)', border: '1px solid var(--accent, #BA9731)', borderRadius: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <Lock size={13} color="var(--accent, #BA9731)" />
                        <strong style={{ fontSize: '0.78rem', color: 'var(--foreground)' }}>
                          Mandatory Platform Privacy Controls (Non-Bypassable)
                        </strong>
                      </div>
                      <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--muted-foreground)' }}>
                        Platform governance mandates endpoint redaction for credentials, payment cards, and government identifiers. Subordinate operators and tenants cannot disable these protections.
                      </p>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.75rem', padding: '6px 8px', background: 'var(--card)', borderRadius: 6, border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#10b981' }}>
                        <Check size={13} />
                        <span>UI Password Suppression (is_password = true)</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#10b981' }}>
                        <Check size={13} />
                        <span>PCI-DSS PAN Payment Card Detection (Luhn Validated)</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#10b981' }}>
                        <Check size={13} />
                        <span>US SSN &amp; Canadian SIN Identification Redaction</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#10b981' }}>
                        <Check size={13} />
                        <span>Bearer / API Authorization Token Blanking</span>
                      </div>
                    </div>

                    <div>
                      <span style={{ fontSize: '0.72rem', color: 'var(--muted-foreground)' }}>
                        Platform Prohibited Executables (Automatic Focus Blanking):
                      </span>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                        {['1password.exe', 'bitwarden.exe', 'keepass.exe', 'credentialmanager.exe'].map(p => (
                          <span
                            key={p}
                            style={{
                              fontSize: '0.66rem',
                              padding: '2px 6px',
                              borderRadius: 4,
                              background: 'rgba(239, 68, 68, 0.15)',
                              color: '#ef4444',
                              border: '1px solid rgba(239, 68, 68, 0.3)'
                            }}
                          >
                            🚫 {p}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, marginBottom: 3 }}>
                        Custom Tenant Regex Masking (Optional):
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. ^ACCT-[0-9]{8}$"
                        value={customRegexRule}
                        onChange={e => setCustomRegexRule(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '6px 8px',
                          background: 'var(--background)',
                          border: '1px solid var(--border)',
                          borderRadius: 4,
                          color: 'var(--foreground)',
                          fontSize: '0.76rem'
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* STEP 5: REVIEW & VERIFIABLE OPERATOR CONSENT */}
                {wizardStep === 5 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ padding: 10, background: 'var(--card)', borderRadius: 6, border: '1px solid var(--border)' }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 800, display: 'block', marginBottom: 6 }}>
                        Capture Configuration Summary:
                      </span>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: '0.72rem' }}>
                        <div><strong>Session:</strong> {newSessionName || 'Untitled'}</div>
                        <div><strong>Environment:</strong> {newEnvironment}</div>
                        <div><strong>Selected Apps:</strong> {Object.keys(selectedApps).length} application(s)</div>
                        <div><strong>Profile:</strong> {captureProfile}</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Mandatory Verifiable Operator Consent (Always Visible) */}
              <div
                style={{
                  marginBottom: 12,
                  padding: '8px 10px',
                  background: 'color-mix(in srgb, var(--accent, #BA9731) 12%, transparent)',
                  border: '1px solid var(--accent, #BA9731)',
                  borderRadius: 6
                }}
              >
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: '0.76rem', color: 'var(--foreground)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    required
                    checked={consentConfirmed}
                    onChange={e => setConsentConfirmed(e.target.checked)}
                    style={{ marginTop: 2 }}
                  />
                  <span>
                    <strong>Operator Recording Consent:</strong> I confirm explicit operator consent is obtained and a persistent, sticky desktop recording banner will be displayed to the user during capture.
                  </span>
                </label>
              </div>

              {/* Wizard Footer Navigation */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  {wizardStep > 1 && (
                    <button
                      type="button"
                      onClick={() => setWizardStep(s => s - 1)}
                      className="secondary-button"
                      style={{ padding: '6px 12px', fontSize: '0.76rem' }}
                    >
                      Back
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  {wizardStep < 5 && (
                    <button
                      type="button"
                      onClick={() => setWizardStep(s => s + 1)}
                      className="secondary-button"
                      style={{ padding: '6px 14px', fontSize: '0.76rem' }}
                    >
                      Next Step
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="secondary-button"
                    style={{ padding: '6px 14px', fontSize: '0.76rem' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!consentConfirmed}
                    className="primary-button"
                    style={{
                      padding: '6px 16px',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      opacity: consentConfirmed ? 1 : 0.5,
                      cursor: consentConfirmed ? 'pointer' : 'not-allowed'
                    }}
                  >
                    Create Session
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: EVIDENCE SOLID-BLACK REDACTION EDITOR                        */}
      {/* ==================================================================== */}
      {showRedactionModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
        >
          <div
            className="glass-card"
            style={{
              width: 500,
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: 18,
              boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
              color: 'var(--foreground)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Shield size={16} color="#ef4444" />
                <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800 }}>
                  Solid-Black Evidence Redaction Editor
                </h3>
              </div>
              <button onClick={() => setShowRedactionModal(false)} style={{ background: 'transparent', border: 'none', color: 'var(--muted-foreground)', cursor: 'pointer' }}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveRedaction}>
              <div style={{ marginBottom: 10 }}>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, marginBottom: 3 }}>
                  Sensitivity Category
                </label>
                <select
                  value={redactionCategory}
                  onChange={e => setRedactionCategory(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    background: 'var(--background)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    color: 'var(--foreground)',
                    fontSize: '0.78rem'
                  }}
                >
                  <option value="PCI_PAN">PCI Payment Card PAN</option>
                  <option value="US_SSN">Social Security Number (SSN / SIN)</option>
                  <option value="UI_PASSWORD">Password / Credential Secret</option>
                  <option value="CONFIDENTIAL_FINANCIAL">Confidential Financial Figure</option>
                  <option value="PII_NAME">Personal Customer Name / PII</option>
                </select>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, marginBottom: 3 }}>
                  Bounding Box Coordinates (X, Y, Width, Height)
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                  {(['x', 'y', 'width', 'height'] as const).map(coord => (
                    <div key={coord}>
                      <span style={{ fontSize: '0.64rem', color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
                        {coord}
                      </span>
                      <input
                        type="number"
                        value={newRedactionBox[coord]}
                        onChange={e =>
                          setNewRedactionBox({
                            ...newRedactionBox,
                            [coord]: parseInt(e.target.value, 10) || 0
                          })
                        }
                        style={{
                          width: '100%',
                          padding: '5px 6px',
                          background: 'var(--background)',
                          border: '1px solid var(--border)',
                          borderRadius: 4,
                          color: 'var(--foreground)',
                          fontSize: '0.75rem'
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ padding: 8, background: 'var(--background)', borderRadius: 6, border: '1px solid var(--border)', marginBottom: 14 }}>
                <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--muted-foreground)' }}>
                  Redacted pixels will be permanently drawn as opaque solid black (<code>#000000</code>) during export and never exposed in synthesized Flow Studio documentation.
                </p>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setShowRedactionModal(false)}
                  className="secondary-button"
                  style={{ padding: '5px 12px', fontSize: '0.76rem' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  style={{ padding: '5px 16px', fontSize: '0.76rem', fontWeight: 700, background: '#ef4444', color: '#fff', border: 'none' }}
                >
                  Apply Permanent Redaction
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: CENTRALIZED POLICY & GOVERNANCE INSPECTOR                    */}
      {/* ==================================================================== */}
      {showPolicyAdmin && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
        >
          <div
            className="glass-card"
            style={{
              width: 540,
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: 20,
              boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
              color: 'var(--foreground)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Shield size={17} color="var(--accent, #BA9731)" />
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>
                  Effective Capture Policy &amp; Governance
                </h3>
              </div>
              <button onClick={() => setShowPolicyAdmin(false)} style={{ background: 'transparent', border: 'none', color: 'var(--muted-foreground)', cursor: 'pointer' }}>
                <X size={16} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.75rem' }}>
              <div style={{ padding: 10, background: 'var(--background)', borderRadius: 6, border: '1px solid var(--border)' }}>
                <strong>Platform Baseline Hierarchy:</strong>
                <p style={{ margin: '4px 0 0', color: 'var(--muted-foreground)', fontSize: '0.7rem' }}>
                  Effective Policy = Platform ∩ Tenant ∩ Process Capture. Child configurations can only further restrict, never relax, platform security rules.
                </p>
              </div>

              {effectivePolicy && (
                <div>
                  <span style={{ fontWeight: 700, display: 'block', marginBottom: 4 }}>
                    Mandatory PII Masking Rules ({effectivePolicy.mandatory_pii_rules.length}):
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {effectivePolicy.mandatory_pii_rules.map(r => (
                      <div key={r.rule_id} style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#10b981' }}>
                        <Check size={12} />
                        <span>{r.rule_name} ({r.pattern_type})</span>
                      </div>
                    ))}
                  </div>

                  <span style={{ fontWeight: 700, display: 'block', marginTop: 10, marginBottom: 4 }}>
                    Prohibited Applications:
                  </span>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {effectivePolicy.prohibited_executables.map(p => (
                      <span key={p} style={{ padding: '2px 6px', borderRadius: 4, background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', fontSize: '0.68rem' }}>
                        {p}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                <button
                  onClick={() => setShowPolicyAdmin(false)}
                  className="primary-button"
                  style={{ padding: '5px 14px', fontSize: '0.76rem' }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Device Activation Code */}
      {showDevicePairModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="glass-card" style={{ width: 440, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 18, color: 'var(--foreground)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Shield size={16} color="var(--accent, #BA9731)" />
                <h3 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 800 }}>Pair Process Capture Agent</h3>
              </div>
              <button onClick={() => setShowDevicePairModal(false)} style={{ background: 'transparent', border: 'none', color: 'var(--muted-foreground)', cursor: 'pointer' }}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handlePairDevice}>
              <p style={{ margin: '0 0 10px', fontSize: '0.72rem', color: 'var(--muted-foreground)' }}>
                Enter the 8-character activation code displayed on the endpoint agent (e.g. <code>ABCD-EFGH</code>):
              </p>

              <input
                type="text"
                required
                placeholder="ABCD-EFGH"
                value={devicePairCode}
                onChange={e => setDevicePairCode(e.target.value.toUpperCase())}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  background: 'var(--background)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  color: 'var(--foreground)',
                  fontSize: '1rem',
                  textAlign: 'center',
                  fontFamily: 'monospace',
                  letterSpacing: '0.15em',
                  fontWeight: 800,
                  marginBottom: 14
                }}
              />

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" onClick={() => setShowDevicePairModal(false)} className="secondary-button" style={{ padding: '5px 12px', fontSize: '0.76rem' }}>
                  Cancel
                </button>
                <button type="submit" className="primary-button" style={{ padding: '5px 16px', fontSize: '0.76rem' }}>
                  Authorize Device
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal / Drawer: Step Annotation */}
      {editingEvent && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
        >
          <div
            className="glass-card"
            style={{
              width: 460,
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: 18,
              boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
              color: 'var(--foreground)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <FileEdit size={16} color="var(--accent, #BA9731)" />
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>
                  Annotate Step #{editingEvent.sequence_number}
                </h3>
              </div>
              <button onClick={() => setEditingEvent(null)} style={{ background: 'transparent', border: 'none', color: 'var(--muted-foreground)', cursor: 'pointer' }}>
                <X size={17} />
              </button>
            </div>

            <form onSubmit={handleSaveAnnotation}>
              <div style={{ marginBottom: 10 }}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--foreground)', marginBottom: 4 }}>
                  Step Title / Action Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Enter General Ledger Account Code"
                  value={editingEvent.annotation_title || ''}
                  onChange={e => setEditingEvent({ ...editingEvent, annotation_title: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '7px 10px',
                    background: 'var(--background)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    color: 'var(--foreground)',
                    fontSize: '0.82rem'
                  }}
                />
              </div>

              <div style={{ marginBottom: 10 }}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--foreground)', marginBottom: 4 }}>
                  Description / Operator Guidance
                </label>
                <textarea
                  rows={2}
                  placeholder="Describe the business intent for this recorded step..."
                  value={editingEvent.annotation_description || ''}
                  onChange={e => setEditingEvent({ ...editingEvent, annotation_description: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '7px 10px',
                    background: 'var(--background)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    color: 'var(--foreground)',
                    fontSize: '0.82rem',
                    resize: 'vertical'
                  }}
                />
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--foreground)', marginBottom: 4 }}>
                  Associated Business Rule
                </label>
                <input
                  type="text"
                  placeholder="e.g. Account must match active cost center in Treasury database"
                  value={editingEvent.business_rule || ''}
                  onChange={e => setEditingEvent({ ...editingEvent, business_rule: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '7px 10px',
                    background: 'var(--background)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    color: 'var(--foreground)',
                    fontSize: '0.82rem'
                  }}
                />
              </div>

              <div style={{ marginBottom: 14, display: 'flex', gap: 16 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: 'var(--foreground)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={editingEvent.is_redacted}
                    onChange={e => setEditingEvent({ ...editingEvent, is_redacted: e.target.checked })}
                  />
                  <span>Mark as Redacted</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: 'var(--foreground)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={editingEvent.is_approved}
                    onChange={e => setEditingEvent({ ...editingEvent, is_approved: e.target.checked })}
                  />
                  <span>Approve Step</span>
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setEditingEvent(null)}
                  className="secondary-button"
                  style={{ padding: '6px 14px', fontSize: '0.8rem' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  style={{ padding: '6px 16px', fontSize: '0.8rem' }}
                >
                  Save Annotation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default ProcessCaptureStudio
