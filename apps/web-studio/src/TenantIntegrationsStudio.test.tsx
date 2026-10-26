import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import TenantIntegrationsStudio from './TenantIntegrationsStudio'

describe('TenantIntegrationsStudio — Bots, Connected Systems, MCP, and Repositories', () => {
  it('renders Bot Agents & Pods tab by default', () => {
    render(<TenantIntegrationsStudio initialTab="bots" tenantName="Citibank" currentEnv="DEV" />)

    expect(screen.getByText(/Tenant \/ External Integrations & Infrastructure/i)).toBeDefined()
    expect(screen.getByRole('heading', { level: 1, name: 'Integrations, Bots & Connected Systems' })).toBeDefined()
    expect(screen.getByText(/Bot Agents & Pods/i)).toBeDefined()
    expect(screen.getByText('Connected Systems & MCP')).toBeDefined()
    expect(screen.getByText('Code Repositories')).toBeDefined()
    expect(screen.getByText('API & Webhooks')).toBeDefined()

    expect(screen.getByText('nyc-unattended-runner-01')).toBeDefined()
  })

  it('renders Connected Systems and MCP Servers', () => {
    render(<TenantIntegrationsStudio initialTab="systems" tenantName="Citibank" currentEnv="DEV" />)

    expect(screen.getByText(/Core SAP ERP & General Ledger Connector/i)).toBeDefined()
    expect(screen.getByText(/Qdrant & Postgres MCP Model Context Protocol/i)).toBeDefined()
    expect(screen.getByText(/Salesforce Enterprise CRM Gateway/i)).toBeDefined()
  })

  it('renders Code Repositories and Webhooks tabs', () => {
    render(<TenantIntegrationsStudio initialTab="repos" tenantName="Citibank" currentEnv="DEV" />)
    expect(screen.getByText(/Connected Git Repositories/i)).toBeDefined()

    render(<TenantIntegrationsStudio initialTab="webhooks" tenantName="Citibank" currentEnv="DEV" />)
    expect(screen.getAllByText(/API & Webhooks/i).length).toBeGreaterThanOrEqual(1)
  })
})
