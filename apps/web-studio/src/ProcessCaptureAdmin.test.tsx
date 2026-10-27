import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ProcessCaptureAdmin from './ProcessCaptureAdmin'

const mockOverview = {
  tenant_id: 'tenant-123',
  fleet_health: {
    total_agents: 3,
    online_agents: 2,
    offline_agents: 1,
  },
  capture_metrics: {
    total_sessions: 8,
    active_sessions: 1,
    total_steps_captured: 142,
  },
  governance_metrics: {
    active_policy_rules: 5,
    mandatory_platform_rules: 4,
  },
  timestamp: new Date().toISOString(),
}

const mockApps = [
  {
    id: 'app-1',
    name: 'Microsoft Excel',
    executable_name: 'excel.exe',
    publisher_signature: 'Microsoft Corporation',
    classification: 'STANDARD',
    policy_action: 'ALLOW',
    created_at: new Date().toISOString(),
  },
  {
    id: 'app-2',
    name: 'Bitwarden Vault',
    executable_name: 'bitwarden.exe',
    publisher_signature: 'Bitwarden Inc.',
    classification: 'PROHIBITED',
    policy_action: 'DENY',
    created_at: new Date().toISOString(),
  },
]

const mockAgents = [
  {
    id: 'agent-1',
    agent_hostname: 'FIN-WORKSTATION-01',
    os_version: 'Windows 11 Enterprise',
    agent_version: '1.0.0',
    status: 'ONLINE',
    last_heartbeat_at: new Date().toISOString(),
  },
]

describe('ProcessCaptureAdmin', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    globalThis.fetch = vi.fn().mockImplementation((url: string, init?: any) => {
      if (url.includes('/admin/overview')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockOverview),
        })
      }
      if (url.includes('/admin/applications')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockApps),
        })
      }
      if (url.includes('/agents')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockAgents),
        })
      }
      if (url.includes('/enroll/authorize') && init?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              status: 'AUTHORIZED',
              user_code: 'ABCD-EFGH',
              agent_hostname: 'NEW-WORKSTATION-88',
              tenant_id: 'tenant-123',
            }),
        })
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      })
    })
  })

  it('renders Process Capture Administration with overview metrics and tabs', async () => {
    render(
      <ProcessCaptureAdmin
        token="test-token"
        tenant={{ id: 'tenant-123', name: 'Finance Corp' }}
      />
    )

    expect(screen.getByText('Process Capture Administration')).toBeDefined()
    expect(screen.getByText('PCA-01 CONTROL PLANE')).toBeDefined()

    await waitFor(() => {
      expect(screen.getByText('ONLINE AGENTS')).toBeDefined()
      expect(screen.getByText('ACTIVE RECORDINGS')).toBeDefined()
      expect(screen.getByText('142')).toBeDefined() // Total steps captured
    })
  })

  it('navigates between administrative tabs (Catalog, Policies, Agents)', async () => {
    render(
      <ProcessCaptureAdmin
        token="test-token"
        tenant={{ id: 'tenant-123', name: 'Finance Corp' }}
      />
    )

    // Switch to Application Catalog
    fireEvent.click(screen.getByText('Application Catalog'))
    await waitFor(() => {
      expect(screen.getByText('Approved & Prohibited Applications')).toBeDefined()
      expect(screen.getByText('excel.exe')).toBeDefined()
      expect(screen.getByText('bitwarden.exe')).toBeDefined()
    })

    // Switch to Capture Policies
    fireEvent.click(screen.getByText('Capture Policies'))
    expect(screen.getByText(/PCI-DSS PAN Payment Card Redaction/i)).toBeDefined()
    expect(screen.getByText(/UI Password Suppression/i)).toBeDefined()

    // Switch to Agent Management
    fireEvent.click(screen.getByText('Agent Management'))
    await waitFor(() => {
      expect(screen.getByText('Enrolled Capture Agent Fleet')).toBeDefined()
      expect(screen.getByText('FIN-WORKSTATION-01')).toBeDefined()
    })
  })

  it('authorizes a new device activation code', async () => {
    render(
      <ProcessCaptureAdmin
        token="test-token"
        tenant={{ id: 'tenant-123', name: 'Finance Corp' }}
      />
    )

    // Open Authorize Device Code modal
    const authBtn = screen.getByRole('button', { name: /Authorize Device Code/i })
    fireEvent.click(authBtn)

    expect(screen.getByText('Authorize Capture Device')).toBeDefined()
    const input = screen.getByPlaceholderText(/ABCD-EFGH/i)
    fireEvent.change(input, { target: { value: 'ABCD-EFGH' } })

    const submitBtn = screen.getByRole('button', { name: /Authorize Device$/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(screen.getByText(/authorized for tenant successfully/i)).toBeDefined()
    })
  })
})
