import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ManageFoldersStudio from './ManageFoldersStudio'

describe('ManageFoldersStudio — Next Gen Workspace Folders Integration', () => {
  const sampleTree = [
    {
      id: 'org-1',
      name: 'Citibank Global',
      kind: 'org',
      organization_id: 'org-1',
      children: [
        {
          id: 'folder-1',
          name: 'Finance Division',
          kind: 'folder',
          organization_id: 'org-1',
          parent_folder_id: null,
          children: [
            {
              id: 'folder-2',
              name: 'Core Ledger',
              kind: 'folder',
              organization_id: 'org-1',
              parent_folder_id: 'folder-1',
              children: []
            }
          ]
        }
      ]
    }
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    globalThis.fetch = vi.fn().mockImplementation((url: string | URL | Request) => {
      const urlStr = String(url)
      if (urlStr.includes('/workspace/tree')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(sampleTree)
        })
      }
      if (urlStr.includes('/workspace/events')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve([
            {
              id: 'event-1',
              operation: 'AGENT_WORKFLOW_DISPATCHED',
              resource_kind: 'Folder',
              resource_id: 'folder-1-uuid',
              happened_at: new Date().toISOString(),
              actor_id: 'admin-user'
            }
          ])
        })
      }
      if (urlStr.includes('/workspace/folders')) {
        return Promise.resolve({
          ok: true,
          status: 201,
          json: () => Promise.resolve({ id: 'new-folder-uuid', name: 'HR Department' })
        })
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({})
      })
    })
  })

  it('renders breadcrumb header, context badges, and action buttons', async () => {
    render(
      <ManageFoldersStudio
        token="test-token"
        tenant="tenant-citi"
        tenantName="Citibank"
        currentEnv="DEV"
      />
    )

    expect(screen.getByText(/Workspace \/ Manage Folders/i)).toBeDefined()
    expect(screen.getByRole('heading', { level: 1, name: 'Folders' })).toBeDefined()
    expect(screen.getAllByText('Citibank').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/Default Workspace/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByRole('button', { name: 'Admin Config' })).toBeDefined()
    expect(screen.getByText('View Audit')).toBeDefined()
    expect(screen.getByText('New Folder')).toBeDefined()
  })

  it('displays active environment context badge', async () => {
    render(
      <ManageFoldersStudio
        token="test-token"
        tenant="tenant-citi"
        tenantName="Citibank"
        currentEnv="UAT"
      />
    )

    expect(screen.getAllByText(/Default Workspace \[UAT\]/i).length).toBeGreaterThanOrEqual(1)
  })

  it('loads hierarchical folder tree from API and renders nodes', async () => {
    render(
      <ManageFoldersStudio
        token="test-token"
        tenant="tenant-citi"
        tenantName="Citibank"
        currentEnv="DEV"
      />
    )

    await waitFor(() => {
      expect(screen.getAllByText('Citibank Global').length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText('Finance Division')).toBeDefined()
      expect(screen.getByText('Core Ledger')).toBeDefined()
    })
  })

  it('displays empty state when no folder is selected', async () => {
    render(
      <ManageFoldersStudio
        token="test-token"
        tenant="tenant-citi"
        tenantName="Citibank"
        currentEnv="DEV"
      />
    )

    expect(screen.getByText('No Folder Selected')).toBeDefined()
    expect(screen.getByText(/Select a node from the tree on the left to manage its structure, settings, permissions, compute pods/i)).toBeDefined()
  })

  it('selects a folder and displays detail pane with all tabs including Settings, Compute, and Vector Storage', async () => {
    render(
      <ManageFoldersStudio
        token="test-token"
        tenant="tenant-citi"
        tenantName="Citibank"
        currentEnv="DEV"
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Finance Division')).toBeDefined()
    })

    fireEvent.click(screen.getByText('Finance Division'))

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'Finance Division' })).toBeDefined()
      expect(screen.getByText('ACTIVE SYSTEM')).toBeDefined()
    })

    // Verify 7 Primary Tabs and Canonical Views are available
    expect(screen.getByRole('button', { name: /^Overview$/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /^Assets & Projects$/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /^Execution$/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /^Resources$/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /^Access & Security$/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /^Logs & Audit$/i })).toBeDefined()
    expect(screen.getAllByRole('button', { name: /^Dependencies$/i }).length).toBeGreaterThanOrEqual(1)

    // Verify canonical views in secondary strip
    expect(screen.getByRole('button', { name: /^Projects$/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /^Settings$/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /^Permissions$/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /^Licenses$/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /^Compute$/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /^Vector Storage$/i })).toBeDefined()
    expect(screen.getAllByRole('button', { name: /Audit/i }).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByRole('button', { name: /^Logs$/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /^Jobs$/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /^Trigger$/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /^Schedule$/i })).toBeDefined()

    // Test Folder Settings tab
    fireEvent.click(screen.getByRole('button', { name: /^Settings$/i }))
    await waitFor(() => {
      expect(screen.getByText('Folder Inheritance Controls')).toBeDefined()
      expect(screen.getByText('Inherit Permissions from Parent Folder')).toBeDefined()
      expect(screen.getByText('Inherit Compute & Pod Pools')).toBeDefined()
      expect(screen.getByText('Inherit Vector Knowledge Base')).toBeDefined()
      expect(screen.getByText('Execution Sandbox & Security Isolation')).toBeDefined()
      expect(screen.getByText('Save Folder Settings')).toBeDefined()
    })

    // Test Compute tab (Pods, Containers, VMs)
    fireEvent.click(screen.getByRole('button', { name: /^Compute$/i }))
    await waitFor(() => {
      expect(screen.getByText(/Kubernetes Pods & Agent Workers/i)).toBeDefined()
      expect(screen.getByText(/Docker Containers/i)).toBeDefined()
      expect(screen.getByText(/Virtual Machine \(VM\) Pools/i)).toBeDefined()
      expect(screen.getByText(/Active Worker Pods in this Folder/i)).toBeDefined()
      expect(screen.getByText('pod/citi-agent-worker-01')).toBeDefined()
      expect(screen.getByText('Assigned AI Agents for Execution')).toBeDefined()
    })

    // Test Vector Storage tab (Dedicated vs Shared)
    fireEvent.click(screen.getByRole('button', { name: /^Vector Storage$/i }))
    await waitFor(() => {
      expect(screen.getByText('Specific to Folder (Dedicated)')).toBeDefined()
      expect(screen.getByText('Shared with Tenant / Parent')).toBeDefined()
      expect(screen.getByText('Vector Collection & Embeddings')).toBeDefined()
      expect(screen.getByText('Storage Quota Utilization')).toBeDefined()
      expect(screen.getByText('Test Vector Search Similarity Query')).toBeDefined()
    })

    // Test Audit tab (formerly Operations - Enriched Telemetry)
    const auditTabBtn = screen.getByRole('button', { name: /^Audit$/i })
    fireEvent.click(auditTabBtn)
    await waitFor(() => {
      expect(screen.getByText(/Operational Telemetry & Execution Audit Log/i)).toBeDefined()
      expect(screen.getByPlaceholderText(/Search operations, actors, targets/i)).toBeDefined()
      expect(screen.getByText('All Statuses')).toBeDefined()
      expect(screen.getByText('All Categories')).toBeDefined()
    })
  })

  it('opens Admin Config modal and displays Customer Organization and Multi-Tenant options', async () => {
    const handleTenantSelect = vi.fn()
    render(
      <ManageFoldersStudio
        token="test-token"
        tenant="citi-na"
        tenantName="Citibank NA"
        tenants={[
          { id: 'citi-na', name: 'Citibank NA [Retail Banking]', slug: 'citi-na', region: 'us-east-1' },
          { id: 'citi-emea', name: 'Citibank EMEA [Investment Banking]', slug: 'citi-emea', region: 'eu-west-1' }
        ]}
        onSelectTenant={handleTenantSelect}
        currentEnv="DEV"
      />
    )

    const adminBtn = screen.getByRole('button', { name: 'Admin Config' })
    fireEvent.click(adminBtn)

    await waitFor(() => {
      expect(screen.getByText(/Admin Configuration: Organization & Multi-Tenant/i)).toBeDefined()
      expect(screen.getByText(/One Customer Organization can contain multiple isolated Tenants/i)).toBeDefined()
      expect(screen.getAllByText('Citibank EMEA [Investment Banking]').length).toBeGreaterThanOrEqual(1)
    })

    const switchBtn = screen.getByRole('button', { name: 'Switch to Tenant' })
    fireEvent.click(switchBtn)
    expect(handleTenantSelect).toHaveBeenCalledWith('citi-emea')
  })
})
