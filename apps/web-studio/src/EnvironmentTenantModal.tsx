import {
  Globe,
  Building2,
  Lock,
  Check,
  X,
  ChevronRight
} from 'lucide-react'

export type EnvironmentCode = 'DEV' | 'TEST' | 'UAT' | 'PROD'

export interface EnvironmentInfo {
  code: EnvironmentCode
  label: string
  subtitle: string
  statusColor: string
  minRoleRequired: string
  allowedRoles: string[]
  isLockedForUser: boolean
  lockReason?: string
}

interface EnvironmentTenantModalProps {
  isOpen: boolean
  onClose: () => void
  currentEnv: EnvironmentCode
  onSelectEnv: (env: EnvironmentCode) => void
  currentTenantId: string
  tenants: { id: string; name: string; slug?: string; region?: string }[]
  onSelectTenant: (tenantId: string) => void
  userRole?: string
}

export default function EnvironmentTenantModal({
  isOpen,
  onClose,
  currentEnv,
  onSelectEnv,
  currentTenantId,
  tenants,
  onSelectTenant,
  userRole = 'Platform Administrator'
}: EnvironmentTenantModalProps) {
  if (!isOpen) return null

  // Role permissions evaluation
  const isPlatformOrTenantAdmin =
    userRole.includes('Platform Administrator') ||
    userRole.includes('Tenant Administrator') ||
    userRole.includes('Enterprise Administrator')

  const environments: EnvironmentInfo[] = [
    {
      code: 'DEV',
      label: 'Development',
      subtitle: 'Isolated developer sandbox for authoring flows, prompt engineering & MCP testing.',
      statusColor: '#10B981',
      minRoleRequired: 'Automation Developer',
      allowedRoles: ['Platform Administrator', 'Tenant Administrator', 'Automation Developer', 'AI Agent & Flow Architect'],
      isLockedForUser: false
    },
    {
      code: 'TEST',
      label: 'Testing / QA',
      subtitle: 'Automated regression verification, synthetic payload runs & benchmark evaluations.',
      statusColor: '#0284C7',
      minRoleRequired: 'Automation Developer',
      allowedRoles: ['Platform Administrator', 'Tenant Administrator', 'Automation Developer', 'AI Agent & Flow Architect', 'Production Operations & Bot Lead'],
      isLockedForUser: false
    },
    {
      code: 'UAT',
      label: 'UAT / Staging',
      subtitle: 'Pre-production staging mirror with sanitized corporate data & end-user sign-offs.',
      statusColor: '#F59E0B',
      minRoleRequired: 'UAT Reviewer / Approver',
      allowedRoles: ['Platform Administrator', 'Tenant Administrator', 'Production Operations & Bot Lead'],
      isLockedForUser: !isPlatformOrTenantAdmin && !userRole.includes('Lead'),
      lockReason: 'Requires UAT Approver or Administrator role'
    },
    {
      code: 'PROD',
      label: 'Production',
      subtitle: 'Mission-critical enterprise runtime. Enforces immutable governance and audit trails.',
      statusColor: '#8B5CF6',
      minRoleRequired: 'Production Operator',
      allowedRoles: ['Platform Administrator', 'Tenant Administrator', 'Production Operations & Bot Lead'],
      isLockedForUser: !isPlatformOrTenantAdmin && !userRole.includes('Production'),
      lockReason: 'Requires Production Operations or Platform Admin role'
    }
  ]

  return (
    <div className="modal-overlay-nextgen" onClick={onClose} style={{ zIndex: 10020 }}>
      <div
        className="modal-content-card"
        style={{ maxWidth: 660, padding: 22 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="access-icon-box">
                <Globe size={18} />
              </div>
              <div>
                <h2 style={{ fontSize: '1.05rem', margin: 0 }}>Tenant &amp; Environment Switcher</h2>
                <p style={{ margin: '2px 0 0', fontSize: '0.68rem', color: 'var(--muted-foreground)' }}>
                  Active Identity: <strong>{userRole}</strong> • Access bounded by Enterprise RBAC policies
                </p>
              </div>
            </div>
            <button className="tree-icon-btn" onClick={onClose}>
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Section 1: Customer Tenant Selector */}
        <div style={{ marginBottom: 18 }}>
          <span className="pane-section-label" style={{ display: 'block', marginBottom: 6 }}>
            1. Select Customer Tenant
          </span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
            {(tenants.length > 0 ? tenants : [
              { id: 'citi-na', name: 'Citibank NA [Retail Banking]' },
              { id: 'citi-emea', name: 'Citibank EMEA [Investment]' },
              { id: 'citi-wealth', name: 'Citibank Wealth Management' }
            ]).map((t) => {
              const isSelected = t.id === currentTenantId
              return (
                <button
                  key={t.id}
                  className={`scope-pill-btn ${isSelected ? 'active' : ''}`}
                  style={{ justifyContent: 'space-between', padding: '8px 12px' }}
                  onClick={() => onSelectTenant(t.id)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Building2 size={13} style={{ color: isSelected ? 'var(--background)' : 'var(--accent, #BA9731)' }} />
                    <span style={{ fontSize: '0.72rem', fontWeight: 800 }}>{t.name}</span>
                  </div>
                  {isSelected && <Check size={12} />}
                </button>
              )
            })}
          </div>
        </div>

        {/* Section 2: Environment Selector based on User Roles & Permissions */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span className="pane-section-label">
              2. Switch Runtime Environment
            </span>
            <span style={{ fontSize: '0.62rem', color: 'var(--muted-foreground)' }}>
              Permissions evaluated against: {userRole}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {environments.map((env) => {
              const isCurrent = currentEnv === env.code
              const isLocked = env.isLockedForUser
              return (
                <div
                  key={env.code}
                  className={`settings-toggle-row ${isCurrent ? 'active' : ''}`}
                  style={{
                    padding: '12px 14px',
                    borderColor: isCurrent ? 'var(--primary)' : 'var(--border)',
                    background: isCurrent ? 'rgba(186, 151, 49, 0.08)' : 'rgba(255, 255, 255, 0.25)',
                    opacity: isLocked ? 0.6 : 1,
                    cursor: isLocked ? 'not-allowed' : 'pointer'
                  }}
                  onClick={() => {
                    if (isLocked) return
                    onSelectEnv(env.code)
                    onClose()
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <span
                      style={{
                        width: 9,
                        height: 9,
                        borderRadius: '50%',
                        background: env.statusColor,
                        marginTop: 4,
                        boxShadow: `0 0 8px ${env.statusColor}88`
                      }}
                    />
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 900 }}>{env.label}</span>
                        <span className="iam-perm-code-tag">{env.code}</span>
                        {isCurrent && (
                          <span className="ops-status-badge success" style={{ fontSize: '0.58rem' }}>
                            Current Context
                          </span>
                        )}
                        {isLocked && (
                          <span className="sod-sev-badge critical" style={{ fontSize: '0.58rem', display: 'flex', alignItems: 'center', gap: 3 }}>
                            <Lock size={9} /> Restricted
                          </span>
                        )}
                      </div>
                      <p style={{ fontSize: '0.68rem', color: 'var(--muted-foreground)', margin: '2px 0 0' }}>
                        {env.subtitle}
                      </p>
                      {isLocked && env.lockReason && (
                        <div style={{ fontSize: '0.62rem', color: '#EF4444', marginTop: 3 }}>
                          ⚠️ {env.lockReason}
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    {isCurrent ? (
                      <span className="matrix-check-allowed">✓</span>
                    ) : isLocked ? (
                      <Lock size={14} style={{ color: 'var(--muted-foreground)' }} />
                    ) : (
                      <ChevronRight size={15} style={{ opacity: 0.5 }} />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="modal-actions" style={{ marginTop: 18 }}>
          <button className="folders-btn-secondary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
