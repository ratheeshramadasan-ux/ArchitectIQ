import { useState } from 'react'
import {
  Info,
  Calendar,
  X,
  Mail,
  ShieldCheck,
  Building2,
  Cpu,
  Layers,
  Sparkles,
  Globe,
} from 'lucide-react'

export type FooterModalTab = 'about' | 'roadmap' | 'contact'

interface FooterInfoModalProps {
  isOpen: boolean
  initialTab?: FooterModalTab
  onClose: () => void
  brandShield: string
}

export default function FooterInfoModal({
  isOpen,
  initialTab = 'about',
  onClose,
  brandShield,
}: FooterInfoModalProps) {
  const [activeTab, setActiveTab] = useState<FooterModalTab>(initialTab)

  if (!isOpen) return null

  return (
    <div
      className="search-overlay"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="dialog"
      aria-modal="true"
      aria-label="ArchitectIQ Information"
    >
      <div
        className="search-dialog glass"
        style={{
          maxWidth: 720,
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
            padding: '14px 20px',
            borderBottom: '1px solid var(--border)',
            background: 'rgba(128, 128, 128, 0.05)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src={brandShield} alt="ArchitectIQ" style={{ width: 22, height: 26, objectFit: 'contain' }} />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <strong style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--foreground)' }}>ArchitectIQ</strong>
                <span
                  style={{
                    fontSize: '0.65rem',
                    fontWeight: 800,
                    padding: '1px 6px',
                    borderRadius: 4,
                    background: 'rgba(186, 151, 49, 0.15)',
                    color: 'var(--accent, #BA9731)',
                    letterSpacing: '0.06em',
                  }}
                >
                  v2.4.0 ENTERPRISE
                </span>
              </div>
              <small style={{ fontSize: '0.72rem', color: 'var(--muted-foreground)' }}>
                Ratheesh Technology Ltd. • Enterprise AI &amp; Automation Studio
              </small>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 0,
              cursor: 'pointer',
              color: 'var(--muted-foreground)',
              padding: 4,
              borderRadius: 6,
              display: 'grid',
              placeItems: 'center',
            }}
            title="Close dialog"
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--border)',
            padding: '0 16px',
            gap: 16,
            background: 'rgba(128, 128, 128, 0.03)',
          }}
        >
          {[
            { id: 'about' as const, label: 'About', icon: Info },
            { id: 'roadmap' as const, label: 'Roadmap', icon: Calendar },
            { id: 'contact' as const, label: 'Contact', icon: Mail },
          ].map(t => {
            const Icon = t.icon
            const isSel = activeTab === t.id
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '10px 4px',
                  background: 'none',
                  border: 0,
                  borderBottom: isSel ? '2px solid var(--accent, #BA9731)' : '2px solid transparent',
                  color: isSel ? 'var(--foreground)' : 'var(--muted-foreground)',
                  fontWeight: isSel ? 800 : 600,
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <Icon size={14} style={{ color: isSel ? 'var(--accent, #BA9731)' : 'inherit' }} />
                <span>{t.label}</span>
              </button>
            )
          })}
        </div>

        {/* Tab Content Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {activeTab === 'about' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div
                style={{
                  padding: 16,
                  borderRadius: 10,
                  background: 'rgba(186, 151, 49, 0.08)',
                  border: '1px solid rgba(186, 151, 49, 0.25)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <Sparkles size={16} style={{ color: 'var(--accent, #BA9731)' }} />
                  <strong style={{ fontSize: '0.9rem', color: 'var(--foreground)' }}>About ArchitectIQ</strong>
                </div>
                <p style={{ margin: 0, fontSize: '0.82rem', lineHeight: 1.6, color: 'var(--muted-foreground)' }}>
                  ArchitectIQ is an enterprise AI &amp; Automation Studio engineered by{' '}
                  <strong style={{ color: 'var(--foreground)' }}>Ratheesh Technology Ltd.</strong> It converges drag-and-drop
                  workflow orchestration, governed AI agents, MCP tool integrations, and intelligent document processing inside a
                  unified, multi-tenant lifecycle framework.
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
                {[
                  {
                    title: 'Multi-Tenant Governance',
                    desc: 'Organization and tenant isolation with DEV, UAT, Canary, and PROD lifecycle environments.',
                    icon: Building2,
                  },
                  {
                    title: 'Durable Orchestration',
                    desc: 'Fault-tolerant workflows with state persistence, automatic retries, and human approvals.',
                    icon: Cpu,
                  },
                  {
                    title: 'Autonomous AI Agents',
                    desc: 'Multi-agent collaboration with Model Context Protocol (MCP) servers and vector memory.',
                    icon: Layers,
                  },
                  {
                    title: 'Enterprise Compliance',
                    desc: 'Comprehensive audit trails, Segregation of Duties (SoD), and Role-Based Access Control.',
                    icon: ShieldCheck,
                  },
                ].map(card => {
                  const Icon = card.icon
                  return (
                    <div
                      key={card.title}
                      style={{
                        padding: '12px 14px',
                        borderRadius: 8,
                        background: 'rgba(128, 128, 128, 0.05)',
                        border: '1px solid var(--border)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Icon size={14} style={{ color: 'var(--accent, #BA9731)' }} />
                        <strong style={{ fontSize: '0.78rem', color: 'var(--foreground)' }}>{card.title}</strong>
                      </div>
                      <small style={{ fontSize: '0.72rem', color: 'var(--muted-foreground)', lineHeight: 1.4 }}>
                        {card.desc}
                      </small>
                    </div>
                  )
                })}
              </div>

              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  background: 'rgba(128, 128, 128, 0.04)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '0.74rem',
                  color: 'var(--muted-foreground)',
                }}
              >
                <span>Proprietary Software: Ratheesh Technology Ltd.</span>
                <span>All rights reserved © 2026</span>
              </div>
            </div>
          )}

          {activeTab === 'roadmap' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <strong style={{ fontSize: '0.88rem', color: 'var(--foreground)' }}>Product Roadmap — 2026</strong>
                <span
                  style={{
                    fontSize: '0.65rem',
                    fontWeight: 800,
                    color: '#10B981',
                    background: 'rgba(16, 185, 129, 0.1)',
                    padding: '2px 8px',
                    borderRadius: 100,
                  }}
                >
                  LIVE TRACKING
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  {
                    quarter: 'Q1 2026 (Delivered)',
                    status: 'Delivered',
                    items: [
                      'Lifecycle Navigation Architecture v2.0 with 8 enterprise phases',
                      'Multi-tenant DEV, UAT, Canary, and PROD environment matrix',
                      'Spatial Glass Theme Engine with 25 curated themes and font scaling',
                      'Unified customer organization and tenant switching bar',
                    ],
                  },
                  {
                    quarter: 'Q2 2026 (In Active Development)',
                    status: 'In Progress',
                    items: [
                      'Agent Studio Swarm coordination protocol and dynamic tool synthesis',
                      'Model Context Protocol (MCP) Server Hub with hot-reload connectors',
                      'Hybrid vector indexing across Milvus, Pinecone, and embedded Qdrant',
                    ],
                  },
                  {
                    quarter: 'Q3 2026 (Upcoming)',
                    status: 'Scheduled',
                    items: [
                      'Autonomous human-in-the-loop task escalation with mobile approvals',
                      'Distributed container worker auto-scaler for Kubernetes execution pools',
                      'Distributed OpenTelemetry trace streaming and SLA failure predictors',
                    ],
                  },
                  {
                    quarter: 'Q4 2026 (Enterprise Horizon)',
                    status: 'Planned',
                    items: [
                      'Full SOC2 Type II, ISO 27001, and FedRAMP certification bundles',
                      'Zero-knowledge encryption for multi-tenant state storage',
                      'On-prem air-gapped deployment packages for banking infrastructure',
                    ],
                  },
                ].map(phase => (
                  <div
                    key={phase.quarter}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 8,
                      background: 'rgba(128, 128, 128, 0.05)',
                      border: '1px solid var(--border)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <strong style={{ fontSize: '0.8rem', color: 'var(--foreground)' }}>{phase.quarter}</strong>
                      <span
                        style={{
                          fontSize: '0.62rem',
                          fontWeight: 800,
                          padding: '1px 6px',
                          borderRadius: 4,
                          background:
                            phase.status === 'Delivered'
                              ? 'rgba(16, 185, 129, 0.15)'
                              : phase.status === 'In Progress'
                              ? 'rgba(186, 151, 49, 0.15)'
                              : 'rgba(128, 128, 128, 0.1)',
                          color:
                            phase.status === 'Delivered'
                              ? '#10B981'
                              : phase.status === 'In Progress'
                              ? 'var(--accent, #BA9731)'
                              : 'var(--muted-foreground)',
                        }}
                      >
                        {phase.status}
                      </span>
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>
                      {phase.items.map(item => (
                        <li key={item} style={{ marginBottom: 3 }}>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'contact' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div
                style={{
                  padding: 16,
                  borderRadius: 10,
                  background: 'rgba(128, 128, 128, 0.05)',
                  border: '1px solid var(--border)',
                }}
              >
                <strong style={{ fontSize: '0.9rem', color: 'var(--foreground)', display: 'block', marginBottom: 4 }}>
                  Ratheesh Technology Ltd.
                </strong>
                <span style={{ fontSize: '0.78rem', color: 'var(--muted-foreground)' }}>
                  Enterprise Solutions &amp; Platform Engineering Division
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {[
                  {
                    channel: 'Enterprise Support',
                    detail: 'support@architectiq.io',
                    desc: '24/7 dedicated support for mission-critical production tenants.',
                    icon: Mail,
                  },
                  {
                    channel: 'Commercial & Sales',
                    detail: 'sales@ratheeshtechnology.com',
                    desc: 'Enterprise volume licensing, custom deployment, and SLAs.',
                    icon: Building2,
                  },
                  {
                    channel: 'Architecture Advisory',
                    detail: 'solutions@ratheeshtechnology.com',
                    desc: 'Consulting on workflow migration, LLM fine-tuning, and security.',
                    icon: Cpu,
                  },
                  {
                    channel: 'Global Locations',
                    detail: 'London • New York • Bengaluru',
                    desc: 'Worldwide enterprise operations and infrastructure support.',
                    icon: Globe,
                  },
                ].map(c => {
                  const Icon = c.icon
                  return (
                    <div
                      key={c.channel}
                      style={{
                        padding: '12px 14px',
                        borderRadius: 8,
                        background: 'rgba(128, 128, 128, 0.04)',
                        border: '1px solid var(--border)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Icon size={14} style={{ color: 'var(--accent, #BA9731)' }} />
                        <strong style={{ fontSize: '0.78rem', color: 'var(--foreground)' }}>{c.channel}</strong>
                      </div>
                      <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--foreground)' }}>
                        {c.detail}
                      </span>
                      <small style={{ fontSize: '0.68rem', color: 'var(--muted-foreground)', lineHeight: 1.35 }}>
                        {c.desc}
                      </small>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--border)',
            background: 'rgba(128, 128, 128, 0.04)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ fontSize: '0.72rem', color: 'var(--muted-foreground)' }}>
            © 2026 Ratheesh Technology Ltd. All rights reserved.
          </span>
          <button
            onClick={onClose}
            className="secondary-button"
            style={{ padding: '6px 14px', fontSize: '0.75rem' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
