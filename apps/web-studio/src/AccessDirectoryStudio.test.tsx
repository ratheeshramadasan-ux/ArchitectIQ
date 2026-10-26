import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import AccessDirectoryStudio from './AccessDirectoryStudio'

describe('AccessDirectoryStudio — Groups, Teams, SSO, and User Directory', () => {
  it('renders Access Groups directory by default', () => {
    render(<AccessDirectoryStudio initialTab="groups" tenantName="Citibank" currentEnv="DEV" />)

    expect(screen.getByText(/Tenant \/ Identity & Access/i)).toBeDefined()
    expect(screen.getByRole('heading', { level: 1, name: 'Enterprise Directory & Federation' })).toBeDefined()
    expect(screen.getByText(/3\. Groups & Teams/i)).toBeDefined()
    expect(screen.getByText(/4\. SSO & Group Mapping/i)).toBeDefined()
    expect(screen.getByText(/5\. Users/i)).toBeDefined()
    expect(screen.getByText(/Pending Approvals/i)).toBeDefined()

    expect(screen.getByText('FinTech Automation Engineers')).toBeDefined()
    expect(screen.getByText('SRE & Runner Operations Fleet')).toBeDefined()
  })

  it('renders Identity Providers and Map IdP Groups tabs', () => {
    render(<AccessDirectoryStudio initialTab="security" tenantName="Citibank" currentEnv="DEV" />)

    expect(screen.getByText(/Enterprise Federated Identity Providers/i)).toBeDefined()
    expect(screen.getByText(/Microsoft Entra ID \(Azure AD\)/i)).toBeDefined()
    expect(screen.getByText(/Okta Universal Directory/i)).toBeDefined()
  })

  it('renders User Directory with human and AI agent service identities', () => {
    render(<AccessDirectoryStudio initialTab="users" tenantName="Citibank" currentEnv="DEV" />)

    expect(screen.getByText('USER / PRINCIPAL')).toBeDefined()
    expect(screen.getByText('+ Invite User')).toBeDefined()
    expect(screen.getByText('Ratheesh Ramadasan')).toBeDefined()
    expect(screen.getByText('svc-reconciliation-agent-worker')).toBeDefined()
  })

  it('handles Pending Approvals and approval actions', () => {
    render(<AccessDirectoryStudio initialTab="approvals" tenantName="Citibank" currentEnv="DEV" />)

    expect(screen.getByText(/Pending Access & Elevation Sign-Offs/i)).toBeDefined()
    expect(screen.getAllByText('Approve Request').length).toBeGreaterThanOrEqual(1)

    fireEvent.click(screen.getAllByText('Approve Request')[0])
    expect(screen.getByText(/Approved role elevation for David Miller/i)).toBeDefined()
  })
})
