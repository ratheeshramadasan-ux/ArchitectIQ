import { useState } from 'react'
import {
  BookOpen,
  X,
  Workflow,
  Bot,
  Building2,
  Rocket,
  ShieldCheck,
  Activity,
  Terminal,
  FolderTree,
  Command,
  ExternalLink,
  CheckCircle2,
} from 'lucide-react'

interface GuideModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function GuideModal({ isOpen, onClose }: GuideModalProps) {
  const [activeTab, setActiveTab] = useState<'lifecycle' | 'hierarchy' | 'shortcuts' | 'api'>('lifecycle')

  if (!isOpen) return null

  return (
    <div
      className="search-overlay"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="dialog"
      aria-modal="true"
      aria-label="ArchitectIQ Platform Guide"
    >
      <div
        className="search-dialog glass"
        style={{
          maxWidth: 820,
          width: '92vw',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          overflow: 'hidden',
          borderRadius: 12,
          border: '1px solid var(--border)',
          background: 'var(--card)',
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.45)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
            background: 'rgba(255, 255, 255, 0.02)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: 'rgba(186, 151, 49, 0.15)',
                color: 'var(--accent, #BA9731)',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <BookOpen size={18} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>
                ArchitectIQ Documentation &amp; Architecture Guide
              </h2>
              <span style={{ fontSize: '0.74rem', color: 'var(--muted-foreground)' }}>
                Lifecycle-Driven Enterprise AI &amp; Automation Studio (v2.0 Architecture Baseline)
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="escape-key"
            style={{ padding: '4px 8px', fontSize: '0.75rem', cursor: 'pointer' }}
            title="Close Guide (Esc)"
          >
            <X size={14} /> ESC
          </button>
        </div>

        {/* Navigation Tabs */}
        <div
          style={{
            display: 'flex',
            gap: 6,
            padding: '8px 16px',
            borderBottom: '1px solid var(--border)',
            background: 'rgba(0, 0, 0, 0.04)',
          }}
        >
          {[
            { id: 'lifecycle', label: '1. Automation Lifecycle', icon: Workflow },
            { id: 'hierarchy', label: '2. Administrative Hierarchy', icon: Building2 },
            { id: 'shortcuts', label: '3. Slash Commands & Shortcuts', icon: Command },
            { id: 'api', label: '4. SDK & MCP Endpoints', icon: Terminal },
          ].map(t => {
            const Icon = t.icon
            const isActive = activeTab === t.id
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id as any)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 12px',
                  borderRadius: 6,
                  fontSize: '0.78rem',
                  fontWeight: isActive ? 800 : 600,
                  background: isActive ? 'var(--accent, #BA9731)' : 'transparent',
                  color: isActive ? '#000' : 'var(--muted-foreground)',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <Icon size={13} />
                {t.label}
              </button>
            )
          })}
        </div>

        {/* Scrollable Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {activeTab === 'lifecycle' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <p style={{ margin: 0, fontSize: '0.84rem', lineHeight: 1.6, color: 'var(--muted-foreground)' }}>
                ArchitectIQ organizes enterprise automation around the 8 core lifecycle disciplines, eliminating fragmentation across design, execution, governance, and infrastructure:
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                {[
                  {
                    num: '01',
                    title: 'Home & Workspace',
                    desc: 'Hierarchical folders, project workspaces, versioned artifacts registry, and assigned review approvals.',
                    icon: FolderTree,
                  },
                  {
                    num: '02',
                    title: 'Design Studios',
                    desc: 'Flow Studio (Maestro / LangGraph canvas), Agent Studio, App Studio, Document OCR, Knowledge RAG, and Test Studio.',
                    icon: Bot,
                  },
                  {
                    num: '03',
                    title: 'Deployment & Releases',
                    desc: 'Release Manager with automated promotion gates across DEV -> TEST -> UAT -> CANARY -> PROD with instant rollback.',
                    icon: Rocket,
                  },
                  {
                    num: '04',
                    title: 'Operations & Orchestration',
                    desc: 'Execution Center, transactional work queues, time-based cron triggers, human sign-offs, and runner worker pools.',
                    icon: Workflow,
                  },
                  {
                    num: '05',
                    title: 'Monitoring & Support',
                    desc: 'Unified observability telemetry, SLA breach tracking, automated incident alerts, playbooks, and ROI metrics.',
                    icon: Activity,
                  },
                  {
                    num: '06',
                    title: 'Administration',
                    desc: 'Customer organization profiles, multi-tenant boundaries, environments, RBAC/PBAC role matrix, SSO IdP, and MCP catalog.',
                    icon: Building2,
                  },
                  {
                    num: '07',
                    title: 'Security & Governance',
                    desc: 'Governance Console, segregation of duties, prompt guardrails, PII masking, tamper-evident audit logs, and SOC 2 exports.',
                    icon: ShieldCheck,
                  },
                  {
                    num: '08',
                    title: 'Platform Management',
                    desc: 'Global control-plane health, infrastructure clusters, scheduled maintenance jobs, and system feature flags.',
                    icon: Terminal,
                  },
                ].map(card => {
                  const Icon = card.icon
                  return (
                    <div
                      key={card.num}
                      style={{
                        padding: 14,
                        borderRadius: 8,
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid var(--border)',
                        display: 'flex',
                        gap: 12,
                      }}
                    >
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 6,
                          background: 'rgba(186, 151, 49, 0.12)',
                          color: 'var(--accent, #BA9731)',
                          display: 'grid',
                          placeItems: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <Icon size={16} />
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <span style={{ fontSize: '0.65rem', fontWeight: 900, color: 'var(--accent, #BA9731)' }}>
                            {card.num}
                          </span>
                          <strong style={{ fontSize: '0.84rem' }}>{card.title}</strong>
                        </div>
                        <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--muted-foreground)', lineHeight: 1.45 }}>
                          {card.desc}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {activeTab === 'hierarchy' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <p style={{ margin: 0, fontSize: '0.84rem', lineHeight: 1.6, color: 'var(--muted-foreground)' }}>
                Access and data isolation are strictly evaluated against the 7-level resource hierarchy:
              </p>

              <div
                style={{
                  padding: 16,
                  borderRadius: 8,
                  background: 'rgba(0, 0, 0, 0.2)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  fontFamily: 'monospace',
                  fontSize: '0.78rem',
                }}
              >
                <div style={{ color: 'var(--accent, #BA9731)', fontWeight: 800 }}>
                  PLATFORM CONTROL PLANE (Global SaaS Operator)
                </div>
                <div style={{ paddingLeft: 18, color: '#38BDF8' }}>
                  └─ CUSTOMER MANAGEMENT PLANE: Citibank Global Enterprise (Org Admin)
                </div>
                <div style={{ paddingLeft: 36, color: '#A855F7' }}>
                  └─ TENANT SCOPE: Retail Banking / Investment Banking (Tenant Admin)
                </div>
                <div style={{ paddingLeft: 54, color: '#10B981' }}>
                  └─ ENVIRONMENT SCOPE: DEV / TEST / UAT / CANARY / PROD (Environment Admin)
                </div>
                <div style={{ paddingLeft: 72, color: '#F59E0B' }}>
                  └─ WORKSPACE &amp; FOLDER SCOPE: Claims Automation / Dental Claims
                </div>
                <div style={{ paddingLeft: 90, color: 'var(--foreground)' }}>
                  └─ PROJECTS &amp; ARTIFACTS: Workflows, Agents, Vector Indices, MCP Tools
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                <div style={{ padding: 12, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--card)' }}>
                  <strong style={{ fontSize: '0.80rem', display: 'block', marginBottom: 4 }}>Org Admin</strong>
                  <span style={{ fontSize: '0.74rem', color: 'var(--muted-foreground)' }}>
                    Can provision and manage all tenants across the organization.
                  </span>
                </div>
                <div style={{ padding: 12, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--card)' }}>
                  <strong style={{ fontSize: '0.80rem', display: 'block', marginBottom: 4 }}>Tenant Admin</strong>
                  <span style={{ fontSize: '0.74rem', color: 'var(--muted-foreground)' }}>
                    Manages folders, roles, workers, and environments within their tenant.
                  </span>
                </div>
                <div style={{ padding: 12, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--card)' }}>
                  <strong style={{ fontSize: '0.80rem', display: 'block', marginBottom: 4 }}>Env Admin</strong>
                  <span style={{ fontSize: '0.74rem', color: 'var(--muted-foreground)' }}>
                    Configures environment variables, promotion gates, and release tags.
                  </span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'shortcuts' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <h4 style={{ margin: 0, fontSize: '0.84rem', fontWeight: 800 }}>Keyboard Shortcuts</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'rgba(255, 255, 255, 0.02)' }}>
                    <span style={{ fontSize: '0.80rem' }}>Global Command Search</span>
                    <kbd style={{ padding: '2px 6px', borderRadius: 4, background: 'var(--card)', border: '1px solid var(--border)', fontSize: '0.72rem', fontWeight: 800 }}>Ctrl + K</kbd>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'rgba(255, 255, 255, 0.02)' }}>
                    <span style={{ fontSize: '0.80rem' }}>Close Active Modal / Overlay</span>
                    <kbd style={{ padding: '2px 6px', borderRadius: 4, background: 'var(--card)', border: '1px solid var(--border)', fontSize: '0.72rem', fontWeight: 800 }}>ESC</kbd>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <h4 style={{ margin: 0, fontSize: '0.84rem', fontWeight: 800 }}>Recommended Assistant Slash Commands</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                  {[
                    { cmd: '/goal', desc: 'Execute autonomous long-running multi-turn tasks until completion.' },
                    { cmd: '/plan', desc: 'Create step-by-step strategic execution plan before starting work.' },
                    { cmd: '/schedule', desc: 'Configure scheduled background automations and cron jobs.' },
                    { cmd: '/browser', desc: 'Perform live automated browser navigation and research.' },
                    { cmd: '/grill-me', desc: 'Interactive architectural interview to clarify requirements.' },
                    { cmd: '/boost', desc: 'Deep multi-perspective reasoning and rigorous verification.' },
                  ].map(sc => (
                    <div key={sc.cmd} style={{ padding: 10, borderRadius: 6, border: '1px solid var(--border)', background: 'rgba(255, 255, 255, 0.02)' }}>
                      <strong style={{ fontSize: '0.80rem', color: 'var(--accent, #BA9731)', display: 'block', marginBottom: 2 }}>{sc.cmd}</strong>
                      <span style={{ fontSize: '0.74rem', color: 'var(--muted-foreground)' }}>{sc.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'api' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ padding: 14, borderRadius: 8, background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)' }}>
                <strong style={{ fontSize: '0.82rem', display: 'block', marginBottom: 6 }}>REST API &amp; Model Context Protocol</strong>
                <p style={{ margin: '0 0 10px', fontSize: '0.76rem', color: 'var(--muted-foreground)', lineHeight: 1.5 }}>
                  Every studio, folder, job, and agent is exposed via the unified FastAPI control plane at <code>/api/v1/tenants/&#123;tenant_id&#125;/...</code>
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <a
                    href="/docs"
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 12px',
                      borderRadius: 6,
                      background: 'var(--accent, #BA9731)',
                      color: '#000',
                      fontSize: '0.76rem',
                      fontWeight: 800,
                      textDecoration: 'none',
                    }}
                  >
                    Interactive Swagger OpenAPI <ExternalLink size={12} />
                  </a>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
                  Platform Capabilities Status
                </span>
                {[
                  'Durable Workflow Orchestrator (Stateful checkpoints, retries, interrupts)',
                  'Agent Studio (Multi-agent coordination, tool-augmented memory, MCP bindings)',
                  'Vector Storage & Semantic Search (Dedicated pgvector collections with chunking)',
                  'Release Manager (Immutable release packaging across DEV -> PROD promotion gates)',
                  'Activity Audit Engine (Tamper-evident, structured tenant audit trail)',
                ].map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.78rem' }}>
                    <CheckCircle2 size={14} style={{ color: '#10B981', flexShrink: 0 }} />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 20px',
            borderTop: '1px solid var(--border)',
            background: 'rgba(0, 0, 0, 0.04)',
            fontSize: '0.75rem',
            color: 'var(--muted-foreground)',
          }}
        >
          <span>ArchitectIQ Enterprise AI &amp; Automation Platform</span>
          <button
            onClick={onClose}
            className="folders-btn-primary"
            style={{ padding: '4px 14px', fontSize: '0.75rem' }}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
