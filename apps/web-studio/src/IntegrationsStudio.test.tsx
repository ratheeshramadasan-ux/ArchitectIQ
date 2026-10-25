import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import IntegrationsStudio from './IntegrationsStudio'

const sampleConnectors = [
  {
    id: 'conn-101',
    tenant_id: 'tenant-1',
    project_id: 'proj-1',
    credential_id: 'cred-101',
    name: 'Salesforce Core ERP',
    slug: 'salesforce-core-erp',
    connector_type: 'REST_API',
    base_url: 'https://api.salesforce.com/v58',
    auth_type: 'BEARER_TOKEN',
    headers_template: { 'X-Client-Id': 'ARCH-01' },
    timeout_seconds: 30,
    status: 'ACTIVE',
    created_at: '2026-10-25T12:00:00Z',
    updated_at: '2026-10-25T12:00:00Z',
  },
]

const sampleTools = [
  {
    id: 'tool-201',
    tenant_id: 'tenant-1',
    project_id: 'proj-1',
    connector_id: 'conn-101',
    name: 'Get Customer Account',
    slug: 'get-customer-account',
    description: 'Fetches account metadata by customer UUID',
    method: 'GET',
    endpoint_path: '/accounts/{accountId}',
    parameters_schema: { type: 'object', properties: { accountId: { type: 'string' } }, required: ['accountId'] },
    response_schema: { type: 'object', properties: { balance: { type: 'number' } } },
    rate_limit_per_minute: 120,
    is_governed: true,
    created_at: '2026-10-25T12:00:00Z',
    updated_at: '2026-10-25T12:00:00Z',
  },
]

const sampleCredentials = [
  {
    id: 'cred-101',
    tenant_id: 'tenant-1',
    name: 'CyberArk Prod Vault Ref',
    vault_provider: 'CYBERARK',
    vault_path: 'Safe-Finance/Accounts/CoreERP',
    secret_key: 'erp_api_key',
    environment: 'PROD',
    masked_preview: 'CYB****4812',
    status: 'ACTIVE',
    created_at: '2026-10-25T12:00:00Z',
    updated_at: '2026-10-25T12:00:00Z',
  },
]

const sampleTemplates = [
  {
    id: 'tmpl-301',
    tenant_id: 'tenant-1',
    name: 'Enterprise Financial Close Template',
    slug: 'enterprise-financial-close',
    description: 'Preconfigured reconciliation, approval gates, and ledger connectors',
    version: '1.2.0',
    category: 'Finance',
    package_bundle: { export_version: '1.0', project: { name: 'Financial Close' } },
    created_at: '2026-10-25T12:00:00Z',
  },
]

const sampleProjects = [
  { id: 'proj-1', name: 'Reconciliation Hub' },
]

describe('IntegrationsStudio Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks()

    if (typeof window !== 'undefined') {
      window.URL.createObjectURL = vi.fn(() => 'blob:mock-url')
      window.URL.revokeObjectURL = vi.fn()
    }

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      const urlStr = String(url)

      if (urlStr.includes('/tree')) {
        return Promise.resolve({
          ok: true,
          json: async () => sampleProjects,
        })
      }

      if (urlStr.includes('/connectors/') && urlStr.includes('/test')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            connector_id: 'conn-101',
            connector_name: 'Salesforce Core ERP',
            base_url: 'https://api.salesforce.com/v58',
            status: 'HEALTHY',
            handshake_latency_ms: 25,
            timestamp: '2026-10-25T12:00:00Z',
          }),
        })
      }

      if (urlStr.includes('/connectors')) {
        return Promise.resolve({
          ok: true,
          json: async () => sampleConnectors,
        })
      }

      if (urlStr.includes('/tools/') && urlStr.includes('/invoke')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: 'tool-201',
            http_status: 200,
            latency_ms: 45,
            response_data: { accountId: 'ACC-881', balance: 95400.5 },
          }),
        })
      }

      if (urlStr.includes('/tools')) {
        return Promise.resolve({
          ok: true,
          json: async () => sampleTools,
        })
      }

      if (urlStr.includes('/credentials')) {
        return Promise.resolve({
          ok: true,
          json: async () => sampleCredentials,
        })
      }

      if (urlStr.includes('/project-templates')) {
        return Promise.resolve({
          ok: true,
          json: async () => sampleTemplates,
        })
      }

      if (urlStr.includes('/export')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            manifest_version: '1.0.0',
            exported_at: '2026-10-25T12:30:00Z',
            project: { id: 'proj-1', name: 'Reconciliation Hub' },
            flows: [],
            agents: [],
            connectors: sampleConnectors,
            tools: sampleTools,
          }),
        })
      }

      if (urlStr.includes('/clone')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            cloned_project: { id: 'proj-cloned-uuid', name: 'Reconciliation Hub (Cloned)' },
            resources_replicated: { flows: 0, agents: 0, connectors: 1, tools: 1 },
          }),
        })
      }

      return Promise.resolve({
        ok: true,
        json: async () => [],
      } as unknown as Response)
    })
  })

  it('renders Connectors tab and performs connection handshake verification', async () => {
    render(<IntegrationsStudio token="fake-token" tenant="tenant-1" projectId="proj-1" />)

    await waitFor(() => {
      expect(screen.getAllByText('Salesforce Core ERP').length).toBeGreaterThanOrEqual(1)
    })

    expect(screen.getAllByText('REST_API').length).toBeGreaterThanOrEqual(1)

    // Click on Test Handshake
    const testBtn = screen.getByRole('button', { name: /Test Handshake/i })
    fireEvent.click(testBtn)

    await waitFor(() => {
      expect(screen.getByText(/Connector test passed! Status: HEALTHY/i)).toBeDefined()
    })
  })

  it('navigates to Tool Registry and executes governed tool invocation', async () => {
    render(<IntegrationsStudio token="fake-token" tenant="tenant-1" projectId="proj-1" />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Tool Registry/i })).toBeDefined()
    })

    // Switch to Tools tab
    fireEvent.click(screen.getByRole('button', { name: /Tool Registry/i }))

    await waitFor(() => {
      expect(screen.getAllByText('Get Customer Account').length).toBeGreaterThanOrEqual(1)
    })

    // Select tool from list
    fireEvent.click(screen.getAllByText('Get Customer Account')[0])

    // Click Execute Tool
    const runBtn = screen.getByRole('button', { name: /Execute Tool/i })
    fireEvent.click(runBtn)

    await waitFor(() => {
      expect(screen.getByText(/Tool execution succeeded!/i)).toBeDefined()
    })
  })

  it('switches to Project Packaging and supports bundle export and template marketplace', async () => {
    render(<IntegrationsStudio token="fake-token" tenant="tenant-1" projectId="proj-1" />)

    // Switch to Templates / Packaging tab
    fireEvent.click(screen.getByRole('button', { name: /Packaging & Templates/i }))

    await waitFor(() => {
      expect(screen.getAllByText('Enterprise Financial Close Template').length).toBeGreaterThanOrEqual(1)
    })

    // Export Project Manifest
    const exportBtn = screen.getByRole('button', { name: /Export Manifest/i })
    fireEvent.click(exportBtn)

    await waitFor(() => {
      expect(screen.getByText(/Project manifest exported successfully!/i)).toBeDefined()
    })
  })
})
