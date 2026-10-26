import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import EnvironmentTenantModal from './EnvironmentTenantModal'

describe('EnvironmentTenantModal — RBAC Multi-Tenant & Environment Switcher', () => {
  const tenants = [
    { id: 't-1', name: 'Citibank Global' },
    { id: 't-2', name: 'Citibank North America' }
  ]

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <EnvironmentTenantModal
        isOpen={false}
        onClose={vi.fn()}
        currentEnv="DEV"
        onSelectEnv={vi.fn()}
        currentTenantId="t-1"
        tenants={tenants}
        onSelectTenant={vi.fn()}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders environments and tenants when open as Platform Administrator', () => {
    const handleSelectEnv = vi.fn()
    const handleSelectTenant = vi.fn()

    render(
      <EnvironmentTenantModal
        isOpen={true}
        onClose={vi.fn()}
        currentEnv="DEV"
        onSelectEnv={handleSelectEnv}
        currentTenantId="t-1"
        tenants={tenants}
        onSelectTenant={handleSelectTenant}
        userRole="Platform Administrator"
      />
    )

    expect(screen.getByText(/Tenant & Environment Switcher/i)).toBeDefined()
    expect(screen.getByText('Citibank Global')).toBeDefined()
    expect(screen.getByText('Citibank North America')).toBeDefined()

    // Environments
    expect(screen.getByText('DEV')).toBeDefined()
    expect(screen.getByText('TEST')).toBeDefined()
    expect(screen.getByText('UAT')).toBeDefined()
    expect(screen.getByText('PROD')).toBeDefined()

    // As Platform Admin, can click PROD
    fireEvent.click(screen.getByText('PROD'))
    expect(handleSelectEnv).toHaveBeenCalledWith('PROD')
  })

  it('enforces RBAC locks on PROD when user has restricted role', () => {
    const handleSelectEnv = vi.fn()

    render(
      <EnvironmentTenantModal
        isOpen={true}
        onClose={vi.fn()}
        currentEnv="DEV"
        onSelectEnv={handleSelectEnv}
        currentTenantId="t-1"
        tenants={tenants}
        onSelectTenant={vi.fn()}
        userRole="Automation Developer"
      />
    )

    // PROD is locked for developer
    expect(screen.getByText(/Requires Production Operations or Platform Admin role/i)).toBeDefined()
  })
})
