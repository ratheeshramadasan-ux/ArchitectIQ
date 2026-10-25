import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import GovernanceConsole from './GovernanceConsole'

const samplePolicies = [
  {
    id: 'pol-1',
    tenant_id: 'tenant-1',
    name: 'Audit Log Retention 365D',
    policy_type: 'DATA_RETENTION',
    retention_days: 365,
    rules: { immutable: true },
    is_active: true,
    created_at: '2026-10-25T12:00:00Z',
  },
]

const sampleReports = [
  {
    id: 'rep-1',
    tenant_id: 'tenant-1',
    report_type: 'RESPONSIBLE_AI_SAFETY',
    generated_by: 'auditor-1',
    verdict: 'COMPLIANT',
    findings: [],
    score_pct: 95.0,
    created_at: '2026-10-25T13:00:00Z',
  },
]

const sampleDrHealth = {
  status: 'OPERATIONAL',
  database_replication: 'SYNCHRONOUS_STANDBY_ACTIVE',
  backup_readiness: 'READY',
  last_verified_backup: '2026-10-25T13:30:00Z',
  active_recovery_point_objective_sec: 60,
  active_recovery_time_objective_sec: 300,
  system_resilience_verdict: 'PASSED_ENTERPRISE_DR_SLA',
  verified_at: '2026-10-25T13:30:00Z',
}

describe('GovernanceConsole Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/governance/policies')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(samplePolicies),
        })
      }
      if (url.includes('/governance/reports')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(sampleReports),
        })
      }
      if (url.includes('/disaster-recovery/health')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(sampleDrHealth),
        })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    })
  })

  it('renders governance console header and policies table', async () => {
    render(<GovernanceConsole token="valid-token" tenant="tenant-1" />)
    expect(screen.getByTestId('governance-console')).toBeDefined()
    expect(screen.getByText('Enterprise Governance & Compliance')).toBeDefined()

    await waitFor(() => {
      expect(screen.getByText('Audit Log Retention 365D')).toBeDefined()
    })
  })

  it('navigates to compliance audits tab and displays reports', async () => {
    render(<GovernanceConsole token="valid-token" tenant="tenant-1" />)

    await waitFor(() => {
      expect(screen.getByText(/Compliance Audits/i)).toBeDefined()
    })

    fireEvent.click(screen.getByText(/Compliance Audits/i))

    await waitFor(() => {
      expect(screen.getByText('RESPONSIBLE AI SAFETY')).toBeDefined()
      expect(screen.getByText('95%')).toBeDefined()
      expect(screen.getByText('COMPLIANT')).toBeDefined()
    })
  })

  it('navigates to resilience tab and displays DR metrics', async () => {
    render(<GovernanceConsole token="valid-token" tenant="tenant-1" />)

    await waitFor(() => {
      expect(screen.getByText(/Disaster Recovery & HA/i)).toBeDefined()
    })

    fireEvent.click(screen.getByText(/Disaster Recovery & HA/i))

    await waitFor(() => {
      expect(screen.getByTestId('dr-resilience-panel')).toBeDefined()
      expect(screen.getByText('PASSED_ENTERPRISE_DR_SLA')).toBeDefined()
      expect(screen.getByText('60s')).toBeDefined()
      expect(screen.getByText('300s')).toBeDefined()
    })
  })
})
