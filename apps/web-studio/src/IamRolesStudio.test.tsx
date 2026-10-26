import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import IamRolesStudio from './IamRolesStudio'

describe('IamRolesStudio — Enterprise Roles & Permissions', () => {
  it('renders Role Catalog by default with system & custom roles', () => {
    render(<IamRolesStudio initialTab="roles" tenantName="Citibank" currentEnv="DEV" />)

    expect(screen.getByText('Tenant / Roles & Permissions')).toBeDefined()
    expect(screen.getByRole('heading', { level: 1, name: 'Roles & Access Governance' })).toBeDefined()
    expect(screen.getByText('Role Catalog')).toBeDefined()
    expect(screen.getByText('Build Custom Role')).toBeDefined()
    expect(screen.getByText('Permission Matrix')).toBeDefined()
    expect(screen.getByText('Segregation of Duties')).toBeDefined()

    // Key roles present
    expect(screen.getByText('Platform Administrator')).toBeDefined()
    expect(screen.getByText('Tenant Administrator')).toBeDefined()
    expect(screen.getByText('AI Agent & Flow Architect')).toBeDefined()
    expect(screen.getByText('Production Operations & Bot Lead')).toBeDefined()
    expect(screen.getByText('Security & Compliance Auditor')).toBeDefined()
  })

  it('switches to Build Custom Role and allows granular permission configuration', () => {
    render(<IamRolesStudio initialTab="builder" tenantName="Citibank" currentEnv="DEV" />)

    expect(screen.getByText(/Role Metadata & Hierarchy/i)).toBeDefined()
    expect(screen.getByText(/ROLE DISPLAY NAME/i)).toBeDefined()
    expect(screen.getByText(/INHERIT FROM BASE ROLE/i)).toBeDefined()

    expect(screen.getByText(/Granular Permission Matrix Configuration/i)).toBeDefined()
    expect(screen.getByText('Create AI Agent')).toBeDefined()
    expect(screen.getByText('Visual Flow Canvas Design')).toBeDefined()
    expect(screen.getByText('Register MCP Server')).toBeDefined()
  })

  it('switches to Permission Matrix for cross-role comparison', () => {
    render(<IamRolesStudio initialTab="matrix" tenantName="Citibank" currentEnv="DEV" />)

    expect(screen.getByText('Cross-Role Capability Evaluation Matrix')).toBeDefined()
    expect(screen.getByText('RESOURCE & ACTION')).toBeDefined()
  })

  it('switches to Segregation of Duties and supports policy simulation', () => {
    render(<IamRolesStudio initialTab="sod" tenantName="Citibank" currentEnv="DEV" />)

    expect(screen.getByText(/Enforced Anti-Conflict Policies/i)).toBeDefined()
    expect(screen.getByText(/Evaluate Authorization Policy/i)).toBeDefined()

    fireEvent.click(screen.getByText(/Evaluate Authorization Policy/i))
    expect(screen.getByText(/DECISION:/i)).toBeDefined()
  })
})
