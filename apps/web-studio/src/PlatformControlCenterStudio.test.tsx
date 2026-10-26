import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import PlatformControlCenterStudio from './PlatformControlCenterStudio'

describe('Module 01: Platform Control Center Studio', () => {
  const mockFetch = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.fetch = mockFetch

    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/v1/platform/dashboard')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            status: 'HEALTHY',
            counts: {
              organizations_total: 8,
              organizations_active: 8,
              tenants_total: 24,
              environments_total: 120,
              active_pods: 82,
              active_break_glass_leases: 0,
            },
            compute: {
              total_cpu_cores: 256,
              allocated_cpu_cores: 100,
              cpu_utilization_pct: 39.1,
              total_memory_gb: 1024,
              allocated_memory_gb: 400,
              memory_utilization_pct: 39.1,
            },
            consumption: {
              monthly_token_budget: 500000000,
              tokens_consumed: 48200000,
              token_utilization_pct: 9.64,
              storage_quota_gb: 10000,
              storage_used_gb: 2450.5,
            },
            recent_audit: [
              {
                id: 'aud-1',
                actor_email: 'admin@architectiq.io',
                actor_role: 'PLATFORM_OWNER',
                action: 'ORGANIZATION_CREATED',
                target_type: 'ORGANIZATION',
                target_id: 'org-12345678',
                outcome: 'SUCCESS',
                details: { name: 'Acme Bank' },
                created_at: new Date().toISOString(),
              },
            ],
          }),
        })
      }

      if (url.includes('/api/v1/platform/organizations')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            {
              id: 'org-1',
              name: 'Citibank Global',
              slug: 'citibank-global',
              tier: 'ENTERPRISE_ULTRA',
              region: 'us-east-1',
              status: 'ENABLED',
              contact_email: 'admin@citibank.example.com',
              created_at: new Date().toISOString(),
              subscription: {
                tier: 'ENTERPRISE_ULTRA',
                max_tenants: 50,
                max_workers: 200,
                monthly_tokens: 500000000,
                tokens_consumed: 48200000,
                status: 'ACTIVE',
              },
            },
          ]),
        })
      }

      if (url.includes('/api/v1/platform/fleet/tenants')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            {
              id: 'ten-1',
              name: 'Global Wealth Management',
              slug: 'global-wealth',
              organization_id: 'org-1',
              organization_name: 'Citibank Global',
              created_at: new Date().toISOString(),
              environments: [
                { id: 'env-1', name: 'DEV', display_name: 'Development', is_enabled: true, is_default: true },
                { id: 'env-2', name: 'TEST', display_name: 'Automated Testing', is_enabled: true, is_default: false },
                { id: 'env-3', name: 'UAT', display_name: 'User Acceptance', is_enabled: true, is_default: false },
                { id: 'env-4', name: 'CANARY', display_name: 'Canary Rollout', is_enabled: true, is_default: false },
                { id: 'env-5', name: 'PROD', display_name: 'Production', is_enabled: true, is_default: false },
              ],
            },
          ]),
        })
      }

      if (url.includes('/api/v1/platform/infrastructure')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            pools: [
              {
                id: 'pool-1',
                name: 'US-East Dedicated Mesh 01',
                region: 'us-east-1',
                cluster_type: 'DEDICATED',
                total_cpu_cores: 128,
                allocated_cpu_cores: 48,
                total_memory_gb: 512,
                allocated_memory_gb: 192,
                active_pods: 42,
                status: 'HEALTHY',
              },
            ],
          }),
        })
      }

      if (url.includes('/api/v1/platform/governance/break-glass')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            {
              id: 'bg-1',
              organization_id: 'org-1',
              organization_name: 'Citibank Global',
              requester_email: 'sre@architectiq.io',
              reason: 'Sev-1 Database Latency Spike INC-9901',
              status: 'PENDING',
              approver_email: null,
              lease_hours: 4,
              lease_expires_at: null,
              created_at: new Date().toISOString(),
            },
          ]),
        })
      }

      if (url.includes('/api/v1/platform/diagnostics/feature-flags')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ key: 'CANARY_DEPLOYMENTS', is_enabled: false }),
        })
      }

      if (url.includes('/api/v1/platform/diagnostics/verify-backup')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            status: 'VERIFIED',
            snapshot_id: 'snap-2026-10-26-001',
            rpo_minutes: 8,
            rto_minutes: 19,
            verified_at: new Date().toISOString(),
          }),
        })
      }

      if (url.includes('/api/v1/platform/diagnostics')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            status: 'HEALTHY',
            database: { pool_status: 'ONLINE' },
            feature_flags: [
              {
                id: 'flag-1',
                key: 'MULTI_AGENT_DELEGATION',
                name: 'Multi-Agent Delegation & Swarms',
                description: 'Enable multi-agent coordination protocols',
                is_enabled: true,
                target_tier: 'ENTERPRISE_ULTRA',
              },
            ],
          }),
        })
      }

      if (url.includes('/api/v1/platform/audit-trail')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([]),
        })
      }

      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      })
    })
  })

  it('renders Platform Control Center header and executive KPI ribbon', async () => {
    render(<PlatformControlCenterStudio token="test-token" initialTab="dashboard" />)

    expect(screen.getByRole('heading', { level: 1, name: 'Platform Control Center' })).toBeDefined()
    expect(screen.getByText(/MODULE 01 · ENTERPRISE MASTER BLUEPRINT V3\.0/i)).toBeDefined()
    expect(screen.getByText(/ACTIVE CONTROL PLANE/i)).toBeDefined()

    await waitFor(() => {
      expect(screen.getAllByText(/Organizations/i).length).toBeGreaterThan(0)
      expect(screen.getAllByText(/Tenant Fleet/i).length).toBeGreaterThan(0)
      expect(screen.getByText(/5 Canonical Envs/i)).toBeDefined()
    })
  })

  it('renders and switches between the 7 master functional tabs', async () => {
    render(<PlatformControlCenterStudio token="test-token" initialTab="dashboard" />)

    await waitFor(() => {
      expect(screen.getByText(/Fleet Health & SLA Status/i)).toBeDefined()
    })

    // Switch to Organizations Tab
    fireEvent.click(screen.getByText(/^Organizations \(/i))
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Search organizations or slug/i)).toBeDefined()
    })

    // Switch to Tenant Fleet Tab
    fireEvent.click(screen.getByText(/^Tenant Fleet \(/i))
    await waitFor(() => {
      expect(screen.getByText(/Cross-Organization Tenant Fleet/i)).toBeDefined()
      expect(screen.getByText('DEV')).toBeDefined()
      expect(screen.getByText('PROD')).toBeDefined()
    })

    // Switch to Infrastructure Tab
    fireEvent.click(screen.getByText(/^Infrastructure \(/i))
    await waitFor(() => {
      expect(screen.getByText(/Infrastructure & Compute Fleet/i)).toBeDefined()
    })

    // Switch to Subscriptions Tab
    fireEvent.click(screen.getByText(/Subscriptions & Quotas/i))
    await waitFor(() => {
      expect(screen.getByText(/Organization Entitlements & Token Quotas/i)).toBeDefined()
    })

    // Switch to Governance Tab
    fireEvent.click(screen.getByText(/^Governance & Break-Glass \(/i))
    await waitFor(() => {
      expect(screen.getByText(/Dual-Custody Break-Glass Emergency Leases/i)).toBeDefined()
      expect(screen.getByText(/Platform Audit Trail/i)).toBeDefined()
    })

    // Switch to Settings & Diagnostics Tab
    fireEvent.click(screen.getByText(/Settings & Diagnostics/i))
    await waitFor(() => {
      expect(screen.getByText(/Global Feature Flags/i)).toBeDefined()
      expect(screen.getByText(/Continuous Backup Verification/i)).toBeDefined()
    })
  })

  it('opens and closes the + New Organization modal with logo URL option', async () => {
    render(<PlatformControlCenterStudio token="test-token" initialTab="organizations" />)

    const newOrgBtn = screen.getByRole('button', { name: /\+ New Organization/i })
    fireEvent.click(newOrgBtn)

    expect(screen.getByText(/Provision New Organization/i)).toBeDefined()
    expect(screen.getByPlaceholderText(/e\.g\. Goldman Sachs Global/i)).toBeDefined()
    expect(screen.getByPlaceholderText(/https:\/\/example\.com\/logo\.svg/i)).toBeDefined()

    // Click Cancel
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }))
    expect(screen.queryByText(/Provision New Organization/i)).toBeNull()
  })

  it('opens Edit Organization modal, supports logo URL, and saves updates', async () => {
    render(<PlatformControlCenterStudio token="test-token" initialTab="organizations" />)

    await waitFor(() => {
      expect(screen.getByText('Citibank Global')).toBeDefined()
      expect(screen.getByRole('button', { name: /Edit/i })).toBeDefined()
    })

    fireEvent.click(screen.getByRole('button', { name: /Edit/i }))

    expect(screen.getByRole('heading', { level: 3, name: 'Edit Organization' })).toBeDefined()
    const logoInput = screen.getByPlaceholderText(/https:\/\/example\.com\/logo\.svg/i)
    expect(logoInput).toBeDefined()

    fireEvent.change(logoInput, { target: { value: 'https://example.com/citi-new-logo.svg' } })
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/platform/organizations/org-1'),
        expect.objectContaining({
          method: 'PATCH',
          body: expect.stringContaining('https://example.com/citi-new-logo.svg'),
        })
      )
    })
  })

  it('opens and closes the Break-Glass Access modal', async () => {
    render(<PlatformControlCenterStudio token="test-token" initialTab="governance" />)

    const bgBtn = screen.getByRole('button', { name: /Break-Glass Access/i })
    fireEvent.click(bgBtn)

    expect(screen.getByText(/Request Emergency Break-Glass Lease/i)).toBeDefined()
    expect(screen.getByPlaceholderText(/Sev-1 Incident/i)).toBeDefined()

    // Click Cancel
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }))
    expect(screen.queryByText(/Request Emergency Break-Glass Lease/i)).toBeNull()
  })

  it('triggers backup verification test and displays passed results', async () => {
    render(<PlatformControlCenterStudio token="test-token" initialTab="diagnostics" />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Verify Now/i })).toBeDefined()
    })

    fireEvent.click(screen.getByRole('button', { name: /Verify Now/i }))

    await waitFor(() => {
      expect(screen.getByText(/Live Backup Verified!/i)).toBeDefined()
    })
  })
})
