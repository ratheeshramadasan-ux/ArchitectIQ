import { Fragment, useState } from 'react'
import {
  Rocket,
  GitBranch,
  PackageCheck,
  RotateCcw,
  ChevronRight,
  Plus,
  Check,
} from 'lucide-react'

interface DeploymentReleasesStudioProps {
  token: string
  tenant: string
  currentEnv?: string
}

interface ReleaseItem {
  version: string
  name: string
  environment: 'DEV' | 'TEST' | 'UAT' | 'CANARY' | 'PROD'
  promotedBy: string
  promotedAt: string
  artifactsCount: number
  status: 'PROMOTED' | 'PENDING_APPROVAL' | 'ROLLED_BACK'
  changeSummary: string
  approvedBy?: string
}

export default function DeploymentReleasesStudio({
  token: _token,
  tenant = 'Citibank',
  currentEnv = 'DEV',
}: DeploymentReleasesStudioProps) {
  const [activeTab, setActiveTab] = useState<'manager' | 'pipelines' | 'packages'>('manager')

  const [releases] = useState<ReleaseItem[]>([
    {
      version: 'v2.4.0',
      name: 'Corporate Lending & Risk Agent Swarm Release',
      environment: 'PROD',
      promotedBy: 'sarah.admin@architectiq.io',
      promotedAt: '2 days ago',
      artifactsCount: 14,
      status: 'PROMOTED',
      approvedBy: 'Chief Risk Officer (Approval Gate #491)',
      changeSummary: 'Basel III Risk calculation agent updated; PostgreSQL MCP connection timeout elevated.',
    },
    {
      version: 'v2.4.1-rc1',
      name: 'Trade Finance UCP 600 Automated Discrepancy Checks',
      environment: 'CANARY',
      promotedBy: 'devops.lead@architectiq.io',
      promotedAt: '3 hours ago',
      artifactsCount: 8,
      status: 'PROMOTED',
      changeSummary: 'Canary testing on 10% traffic tranche. Zero errors reported across 450 executions.',
    },
    {
      version: 'v2.5.0-alpha',
      name: 'Next-Gen Passport OCR & Biometric Extraction Pipeline',
      environment: 'UAT',
      promotedBy: 'alex.mlops@architectiq.io',
      promotedAt: '30 mins ago',
      artifactsCount: 22,
      status: 'PENDING_APPROVAL',
      changeSummary: 'New multi-modal Gemini 2.0 Flash pipeline ready for business user validation.',
    },
  ])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minHeight: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="live-dot" />
            <span style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.08em', color: 'var(--accent, #BA9731)', textTransform: 'uppercase' }}>
              Deployment &amp; Releases • Environment Lifecycle
            </span>
            <span style={{ fontSize: '0.65rem', fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: 'rgba(16, 185, 129, 0.15)', color: '#10B981' }}>
              {currentEnv}
            </span>
          </div>
          <h1 style={{ margin: '4px 0 2px', fontSize: '1.4rem', fontWeight: 800 }}>Deployment &amp; Releases</h1>
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--muted-foreground)' }}>
            Immutable artifact packaging, multi-environment promotion gates, CI/CD pipelines, and one-click rollback for tenant: <strong>{tenant}</strong>
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="folders-btn-secondary" onClick={() => {}}>
            <RotateCcw size={13} /> Rollback to Previous Version
          </button>
          <button className="folders-btn-primary" onClick={() => {}}>
            <Plus size={13} /> Build Release Package
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="folder-tabs-strip">
        {[
          { id: 'manager', label: 'Release Manager', icon: Rocket },
          { id: 'pipelines', label: 'Deployment Pipelines', icon: GitBranch },
          { id: 'packages', label: 'Packages & Versions', icon: PackageCheck },
        ].map(t => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              className={`folder-tab-btn ${activeTab === t.id ? 'active' : ''}`}
              onClick={() => setActiveTab(t.id as any)}
            >
              <Icon size={13} style={{ marginRight: 6 }} />
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Promotion Gates Visual Pipeline */}
      <div className="glass-card" style={{ padding: 18, borderRadius: 8 }}>
        <span style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted-foreground)', display: 'block', marginBottom: 12 }}>
          Lifecycle Promotion Pipeline (DEV → TEST → UAT → CANARY → PROD)
        </span>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          {[
            { env: 'DEV', tag: 'v2.5.0-dev', status: 'Active Development', active: currentEnv === 'DEV', color: '#10B981' },
            { env: 'TEST', tag: 'v2.5.0-test', status: 'Automated Evals Passed', active: currentEnv === 'TEST', color: '#3B82F6' },
            { env: 'UAT', tag: 'v2.5.0-alpha', status: 'Pending Approval', active: currentEnv === 'UAT', color: '#F59E0B' },
            { env: 'CANARY', tag: 'v2.4.1-rc1', status: '10% Traffic Tranche', active: currentEnv === 'CANARY', color: '#A855F7' },
            { env: 'PROD', tag: 'v2.4.0', status: 'Live Baseline', active: currentEnv === 'PROD', color: '#EF4444' },
          ].map((step, idx) => (
            <Fragment key={step.env}>
              <div
                style={{
                  flex: 1,
                  minWidth: 140,
                  padding: 12,
                  borderRadius: 6,
                  background: step.active ? 'rgba(186, 151, 49, 0.15)' : 'var(--card)',
                  border: step.active ? '2px solid var(--accent, #BA9731)' : '1px solid var(--border)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <strong style={{ fontSize: '0.85rem' }}>{step.env}</strong>
                  <span style={{ fontSize: '0.68rem', fontWeight: 800, color: step.color }}>{step.tag}</span>
                </div>
                <span style={{ fontSize: '0.72rem', color: 'var(--muted-foreground)' }}>{step.status}</span>
              </div>
              {idx < 4 && <ChevronRight size={16} style={{ color: 'var(--muted-foreground)', opacity: 0.5 }} />}
            </Fragment>
          ))}
        </div>
      </div>

      {/* Release Items Table */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h3 style={{ margin: '4px 0 2px', fontSize: '0.98rem', fontWeight: 800 }}>Tenant Release History &amp; Immutable Versions</h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {releases.map(rel => (
            <div
              key={rel.version}
              className="glass-card"
              style={{ padding: 16, borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 10 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 900, background: 'var(--accent, #BA9731)', color: '#000', padding: '2px 8px', borderRadius: 4 }}>
                    {rel.version}
                  </span>
                  <strong style={{ fontSize: '0.92rem' }}>{rel.name}</strong>
                  <span style={{ fontSize: '0.68rem', fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.08)' }}>
                    Env: {rel.environment}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    style={{
                      fontSize: '0.68rem',
                      fontWeight: 800,
                      padding: '2px 8px',
                      borderRadius: 4,
                      background: rel.status === 'PROMOTED' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                      color: rel.status === 'PROMOTED' ? '#10B981' : '#F59E0B',
                    }}
                  >
                    {rel.status}
                  </span>
                  {rel.status === 'PENDING_APPROVAL' ? (
                    <button className="folders-btn-primary" style={{ padding: '4px 10px', fontSize: '0.74rem' }}>
                      <Check size={12} /> Approve Promotion
                    </button>
                  ) : (
                    <button className="folders-btn-secondary" style={{ padding: '4px 10px', fontSize: '0.74rem' }}>
                      <RotateCcw size={12} /> Rollback
                    </button>
                  )}
                </div>
              </div>

              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--muted-foreground)' }}>
                {rel.changeSummary}
              </p>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--muted-foreground)', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                <span>Promoted by: <strong>{rel.promotedBy}</strong> ({rel.promotedAt})</span>
                <span>Artifacts: <strong>{rel.artifactsCount} versioned assets</strong></span>
                {rel.approvedBy && <span>Gate: <strong>{rel.approvedBy}</strong></span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
