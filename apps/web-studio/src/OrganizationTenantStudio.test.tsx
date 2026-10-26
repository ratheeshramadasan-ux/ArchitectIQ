import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import OrganizationTenantStudio from './OrganizationTenantStudio'

describe('OrganizationTenantStudio — Enterprise Administration & Setup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/v1/platform/organizations')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve([
              {
                id: 'org-1',
                name: 'Citibank Global',
                slug: 'citibank-global',
                subscription_tier: 'Enterprise Platinum',
                data_residency_region: 'us-east-1',
                security_contact_email: 'compliance@citigroup.com',
                logo_url: 'https://example.com/citi.svg',
              },
            ]),
        })
      }
      if (url.includes('/api/v1/platform/fleet/tenants')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve([
              {
                id: 't-1',
                name: 'Citibank',
                slug: 'citibank',
                environments: [{ name: 'PROD', is_enabled: true }],
                created_at: '2026-01-15T00:00:00Z',
              },
            ]),
        })
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      })
    })
  })

  it('renders header, subtitle, and learn about setup link', () => {
    render(<OrganizationTenantStudio token="test-token" tenant="citibank" />)
    expect(screen.getByRole('heading', { level: 1, name: 'Enterprise Administration & Setup' })).toBeDefined()
    expect(
      screen.getByText(
        'Manage organization folder strategies, environment definitions, and solution template catalogs.'
      )
    ).toBeDefined()
    expect(screen.getByText('Learn about Organization Setup')).toBeDefined()
  })

  it('renders all 6 top domain sub-navigation tabs and navigates when clicked', () => {
    const onNavigateMock = vi.fn()
    render(<OrganizationTenantStudio token="test-token" tenant="citibank" onNavigate={onNavigateMock} />)

    expect(screen.getByRole('button', { name: /Organization & Tenant/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /Environments/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /Users & Teams/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /Roles & Permissions/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /Integrations/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /Licensing & Usage/i })).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: /Environments/i }))
    expect(onNavigateMock).toHaveBeenCalledWith('Environments')
  })

  it('renders Hero Banner with 4 KPI metrics and architectural tree illustration', async () => {
    render(<OrganizationTenantStudio token="test-token" tenant="citibank" />)

    expect(screen.getByRole('heading', { level: 2, name: 'Organization & Tenant Management' })).toBeDefined()
    expect(screen.getByText('Total Tenants')).toBeDefined()
    expect(screen.getByText('Total Users')).toBeDefined()
    expect(screen.getByText('Active Projects')).toBeDefined()
    expect(screen.getByText('Policy Compliant')).toBeDefined()
    expect(screen.getByText('100%')).toBeDefined()

    // Architecture illustration elements
    await waitFor(() => {
      expect(screen.getByText(/● Citibank Global/i)).toBeDefined()
    })
    expect(screen.getByText('Production (PROD)')).toBeDefined()
    expect(screen.getByText('Development (DEV)')).toBeDefined()
    expect(screen.getByText('Acceptance (UAT)')).toBeDefined()
  })

  it('renders tenants table with real tenant Citibank and zero dummy data', async () => {
    render(<OrganizationTenantStudio token="test-token" tenant="citibank" />)

    await waitFor(() => {
      expect(screen.getAllByText('Citibank').length).toBeGreaterThanOrEqual(1)
    })

    expect(screen.getByText('✦ Production')).toBeDefined()
    expect(screen.getByText(/Primary banking and automation environment for Citibank/i)).toBeDefined()

    // Verify zero dummy test data
    expect(screen.queryByText(/Break Glass Test Org/i)).toBeNull()
    expect(screen.queryByText(/Isolated sandbox for prototypes/i)).toBeNull()
  })

  it('opens and closes the Create Tenant modal', () => {
    render(<OrganizationTenantStudio token="test-token" tenant="citibank" />)

    const createBtn = screen.getByRole('button', { name: /Create Tenant/i })
    fireEvent.click(createBtn)

    expect(screen.getByRole('heading', { name: /Create New Tenant/i })).toBeDefined()
    expect(screen.getByPlaceholderText(/e\.g\., Wealth Management Solutions/i)).toBeDefined()

    const cancelBtn = screen.getByRole('button', { name: /Cancel/i })
    fireEvent.click(cancelBtn)

    expect(screen.queryByRole('heading', { name: /Create New Tenant/i })).toBeNull()
  })

  it('switches between lower sub-tabs: Organization Details, Folder Strategy, Default Settings', () => {
    render(<OrganizationTenantStudio token="test-token" tenant="citibank" />)

    // Click Organization Details
    const orgDetailsTab = screen.getByRole('button', { name: /Organization Details/i })
    fireEvent.click(orgDetailsTab)
    expect(screen.getByText(/Organization Name/i)).toBeDefined()
    expect(screen.getByRole('button', { name: /Save Organization Details/i })).toBeDefined()

    // Click Folder Strategy
    const folderStrategyTab = screen.getByRole('button', { name: /Folder Strategy/i })
    fireEvent.click(folderStrategyTab)
    expect(screen.getByText(/Strategy 1: Projects Contain Environments/i)).toBeDefined()
    expect(screen.getByText(/Strategy 2: Environments Contain Folders/i)).toBeDefined()

    // Click Default Settings
    const defaultSettingsTab = screen.getByRole('button', { name: /Default Settings/i })
    fireEvent.click(defaultSettingsTab)
    expect(screen.getByText(/Automatic 5 Canonical Environments/i)).toBeDefined()
  })
})
