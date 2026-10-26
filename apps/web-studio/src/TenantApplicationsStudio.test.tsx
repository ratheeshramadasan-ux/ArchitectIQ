import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import TenantApplicationsStudio from './TenantApplicationsStudio'

describe('TenantApplicationsStudio — Applications & General Settings', () => {
  it('renders Applications catalog with environment deployment badges', () => {
    render(<TenantApplicationsStudio initialTab="apps" tenantName="Citibank" currentEnv="DEV" />)

    expect(screen.getByText('Tenant / Workspace Management')).toBeDefined()
    expect(screen.getByRole('heading', { level: 1, name: 'Applications & General Configuration' })).toBeDefined()
    expect(screen.getAllByText(/Applications/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('General Settings')).toBeDefined()

    expect(screen.getByText('Core Ledger Daily Reconciliation')).toBeDefined()
    expect(screen.getByText('KYC Document Intake & AML Analyzer')).toBeDefined()
    expect(screen.getByText('PostgreSQL & SAP Database MCP Server')).toBeDefined()
  })

  it('renders General Settings tab with CI/CD gates and SMTP notifications', () => {
    render(<TenantApplicationsStudio initialTab="general" tenantName="Citibank" currentEnv="DEV" />)

    expect(screen.getByText(/CI\/CD & Environment Promotion Controls/i)).toBeDefined()
    expect(screen.getByText(/DEFAULT REPOSITORY MAIN BRANCH/i)).toBeDefined()
    expect(screen.getByText(/Enterprise Notification & SMTP Gateway/i)).toBeDefined()
    expect(screen.getByText(/SMTP RELAY SERVER/i)).toBeDefined()
  })
})
