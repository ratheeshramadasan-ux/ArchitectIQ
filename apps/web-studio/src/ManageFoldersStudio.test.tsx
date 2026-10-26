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
              operation: 'SCOPE_CREATED',
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

  it('renders breadcrumb header, environment badges, and action buttons', async () => {
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
    expect(screen.getByText('Citibank')).toBeDefined()
    expect(screen.getByText('View Audit')).toBeDefined()
    expect(screen.getByText('New Folder')).toBeDefined()
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
    expect(screen.getByText(/Select a node from the tree on the left to manage its permissions/i)).toBeDefined()
  })

  it('selects a folder and displays detail pane with Structure, Permissions, Licenses tabs', async () => {
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

    // Verify tabs are available
    expect(screen.getByRole('button', { name: 'Structure' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Permissions' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Licenses' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Operations' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Machines' })).toBeDefined()

    // Test Governance Lock Toggle
    const lockToggle = screen.getByLabelText('Toggle Governance Lock')
    fireEvent.click(lockToggle)

    await waitFor(() => {
      expect(screen.getByText('GOVERNANCE LOCKED')).toBeDefined()
    })

    // Switch to Permissions tab
    fireEvent.click(screen.getByRole('button', { name: 'Permissions' }))
    await waitFor(() => {
      expect(screen.getByText('Platform Admin')).toBeDefined()
      expect(screen.getByText('Full Access')).toBeDefined()
    })

    // Switch to Licenses tab
    fireEvent.click(screen.getByRole('button', { name: 'Licenses' }))
    await waitFor(() => {
      expect(screen.getByText('Unattended Automation')).toBeDefined()
      expect(screen.getByText('Available Quota')).toBeDefined()
    })
  })

  it('opens and closes New Folder modal and processes creation', async () => {
    render(
      <ManageFoldersStudio
        token="test-token"
        tenant="tenant-citi"
        tenantName="Citibank"
        currentEnv="DEV"
      />
    )

    const newFolderBtn = screen.getByText('New Folder')
    fireEvent.click(newFolderBtn)

    expect(screen.getByText('Create New Folders')).toBeDefined()
    expect(screen.getByPlaceholderText(/Finance.*HR.*Operations/)).toBeDefined()

    const textarea = screen.getByPlaceholderText(/Finance.*HR.*Operations/)
    fireEvent.change(textarea, { target: { value: 'HR Department' } })

    const submitBtn = screen.getByRole('button', { name: 'Create Folders' })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(screen.queryByText('Create New Folders')).toBeNull()
    })
  })

  it('opens View Audit modal and renders operational events', async () => {
    render(
      <ManageFoldersStudio
        token="test-token"
        tenant="tenant-citi"
        tenantName="Citibank"
        currentEnv="DEV"
      />
    )

    const auditBtn = screen.getByText('View Audit')
    fireEvent.click(auditBtn)

    await waitFor(() => {
      expect(screen.getByText('Global Audit Log')).toBeDefined()
      expect(screen.getByText('Enterprise Governance & Immutability Record')).toBeDefined()
    })

    const closeBtn = screen.getByRole('button', { name: 'Close' })
    fireEvent.click(closeBtn)

    await waitFor(() => {
      expect(screen.queryByText('Global Audit Log')).toBeNull()
    })
  })
})
