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

  it('renders all 9 top domain sub-navigation tabs and navigates when clicked', () => {
    const onNavigateMock = vi.fn()
    render(<OrganizationTenantStudio token="test-token" tenant="citibank" onNavigate={onNavigateMock} />)

    expect(screen.getByRole('button', { name: /Organization & Tenant/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /Environments/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /Users & Teams/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /Roles & Permissions/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /Identity & SSO/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /Integrations/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /Repositories & Artifacts/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /Compute & Capacity/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /Licensing & Usage/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /Audit & Logs/i })).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: /Environments/i }))
    expect(onNavigateMock).toHaveBeenCalledWith('Environments')
  })

  it('switches between domain tabs like Environments, Identity & SSO, Compute & Capacity', () => {
    render(<OrganizationTenantStudio token="test-token" tenant="citibank" />)

    // Click Environments
    fireEvent.click(screen.getByRole('button', { name: /Environments/i }))
    expect(screen.getByText(/Canonical Environments Fleet/i)).toBeDefined()
    expect(screen.getByText(/Safety Guard Active/i)).toBeDefined()

    // Click Identity & SSO
    fireEvent.click(screen.getByRole('button', { name: /Identity & SSO/i }))
    expect(screen.getByText(/Enterprise Identity & SSO Configuration/i)).toBeDefined()
    expect(screen.getByText(/Okta Enterprise/i)).toBeDefined()

    // Click Compute & Capacity
    fireEvent.click(screen.getByRole('button', { name: /Compute & Capacity/i }))
    expect(screen.getByText(/Dedicated & Shared Compute Pools/i)).toBeDefined()
    expect(screen.getByText(/Total CPU Allocation/i)).toBeDefined()

    // Click Licensing & Usage
    fireEvent.click(screen.getByRole('button', { name: /Licensing & Usage/i }))
    expect(screen.getByText(/Subscription Entitlements & Licensing/i)).toBeDefined()
    expect(screen.getByText(/Tenant Fleet Quota/i)).toBeDefined()

    // Click Audit & Logs
    fireEvent.click(screen.getByRole('button', { name: /Audit & Logs/i }))
    expect(screen.getByText(/Platform & Module Audit Logs/i)).toBeDefined()
    expect(screen.getByText(/Total Audit Events/i)).toBeDefined()
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
  })

  it('renders tenants table with real tenant Citibank and zero dummy data', async () => {
    render(<OrganizationTenantStudio token="test-token" tenant="citibank" />)

    const tenantsTab = screen.getByRole('button', { name: /^Tenants$/i })
    fireEvent.click(tenantsTab)

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

    const tenantsTab = screen.getByRole('button', { name: /^Tenants$/i })
    fireEvent.click(tenantsTab)

    const createBtn = screen.getByRole('button', { name: /Create Tenant/i })
    fireEvent.click(createBtn)

    expect(screen.getByRole('heading', { name: /Create New Tenant/i })).toBeDefined()
    expect(screen.getByPlaceholderText(/e\.g\., Wealth Management Solutions/i)).toBeDefined()

    const cancelBtn = screen.getByRole('button', { name: /Cancel/i })
    fireEvent.click(cancelBtn)

    expect(screen.queryByRole('heading', { name: /Create New Tenant/i })).toBeNull()
  })

  it('switches between lower sub-tabs: Organization, Tenants, Folder Strategy, Default Settings', () => {
    render(<OrganizationTenantStudio token="test-token" tenant="citibank" />)

    // Click Organization
    const orgTab = screen.getByRole('button', { name: /^Organization$/i })
    fireEvent.click(orgTab)
    expect(screen.getByRole('button', { name: /Create Organization/i })).toBeDefined()
    expect(screen.getByText(/Administrators/i)).toBeDefined()

    // Click Tenants
    const tenantsTab = screen.getByRole('button', { name: /^Tenants$/i })
    fireEvent.click(tenantsTab)
    expect(screen.getByRole('button', { name: /Create Tenant/i })).toBeDefined()

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

  it('verifies Organization form contains only organization-level fields with Data Residency removed and immutable slug', () => {
    render(<OrganizationTenantStudio token="test-token" tenant="citibank" />)

    const orgTab = screen.getByRole('button', { name: /^Organization$/i })
    fireEvent.click(orgTab)

    const createOrgBtn = screen.getByRole('button', { name: /Create Organization/i })
    fireEvent.click(createOrgBtn)

    expect(screen.getByRole('heading', { name: /Create New Organization/i })).toBeDefined()
    expect(screen.getByPlaceholderText(/e\.g\. Citibank Wealth/i)).toBeDefined()
    expect(screen.getByText(/Organization Slug \(Read Only\)/i)).toBeDefined()
    expect(screen.getByText(/Upload Logo/i)).toBeDefined()
    expect(screen.getByText(/Organization Administrators/i)).toBeDefined()

    // Data Residency Region MUST NOT be in the Organization Form
    expect(screen.queryByText(/Data Residency Region/i)).toBeNull()
  })

  it('walks through the 5-step guided tenant creation wizard', async () => {
    render(<OrganizationTenantStudio token="test-token" tenant="citibank" />)

    const tenantsTab = screen.getByRole('button', { name: /^Tenants$/i })
    fireEvent.click(tenantsTab)

    const createTenantBtn = screen.getByRole('button', { name: /Create Tenant/i })
    fireEvent.click(createTenantBtn)

    // Step 1: Identity
    expect(screen.getByText(/Step 1 of 5/i)).toBeDefined()
    const nameInput = screen.getByPlaceholderText(/e\.g\., Wealth Management Solutions/i)
    fireEvent.change(nameInput, { target: { value: 'Wealth Management Global' } })

    const nextStep2Btn = screen.getByRole('button', { name: /Next: Deployment Model/i })
    fireEvent.click(nextStep2Btn)

    // Step 2: Deployment Model
    expect(screen.getByText(/Step 2 of 5/i)).toBeDefined()
    expect(screen.getByText(/ArchitectIQ SaaS/i)).toBeDefined()
    expect(screen.getByText(/Client Cloud/i)).toBeDefined()
    expect(screen.getByText(/Client On-Premises/i)).toBeDefined()

    const nextStep3Btn = screen.getByRole('button', { name: /Next: Infrastructure & Residency/i })
    fireEvent.click(nextStep3Btn)

    // Step 3: Infrastructure & Residency (dynamic for SaaS)
    expect(screen.getByText(/Step 3 of 5/i)).toBeDefined()
    expect(screen.getByText(/SaaS Preferred Hosting Region/i)).toBeDefined()

    const nextStep4Btn = screen.getByRole('button', { name: /Next: Administrators & Access/i })
    fireEvent.click(nextStep4Btn)

    // Step 4: Administrators & Access
    expect(screen.getByText(/Step 4 of 5/i)).toBeDefined()
    expect(screen.getByText(/Canonical Environments Provisioning/i)).toBeDefined()

    const nextStep5Btn = screen.getByRole('button', { name: /Next: Review & Provision/i })
    fireEvent.click(nextStep5Btn)

    // Step 5: Review & Provision
    expect(screen.getByText(/Step 5 of 5/i)).toBeDefined()
    expect(screen.getByRole('button', { name: /Provision Tenant Fleet/i })).toBeDefined()
  })

})
