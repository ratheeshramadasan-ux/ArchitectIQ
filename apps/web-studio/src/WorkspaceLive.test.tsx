import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import WorkspaceLive from './WorkspaceLive'

const sampleTree = [
  {
    id: 'org-1',
    name: 'Acme Global',
    kind: 'org' as const,
    children: [
      {
        id: 'folder-1',
        name: 'Finance Division',
        kind: 'folder' as const,
        children: [
          {
            id: 'project-1',
            name: 'Ledger Automation',
            kind: 'project' as const,
            lifecycle_status: 'ACTIVE' as const,
            criticality: 'HIGH' as const,
            data_classification: 'CONFIDENTIAL' as const,
            children: [],
          },
          {
            id: 'project-2',
            name: 'Payroll Engine',
            kind: 'project' as const,
            lifecycle_status: 'ARCHIVED' as const,
            criticality: 'MEDIUM' as const,
            data_classification: 'INTERNAL' as const,
            children: [],
          },
        ],
      },
      {
        id: 'folder-empty',
        name: 'Empty Folder',
        kind: 'folder' as const,
        children: [],
      },
    ],
  },
]

const sampleSummary = {
  organizations: 1,
  folders: 2,
  projects: 2,
  active_projects: 1,
  archived_projects: 1,
  environments: 4,
}

describe('WorkspaceLive — M4.4 Enterprise UX Verification', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()

    // Mock fetch for workspace APIs
    globalThis.fetch = vi.fn().mockImplementation((url: string | URL | Request) => {
      const urlStr = String(url)
      if (urlStr.includes('/workspace/tree')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(sampleTree),
        })
      }
      if (urlStr.includes('/workspace/summary')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(sampleSummary),
        })
      }
      if (urlStr.includes('/workspace/activity')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve([]),
        })
      }
      if (urlStr.includes('/projects/project-1/effective-permissions')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              role: 'OWNER',
              can_view: true,
              can_edit: true,
              can_manage_members: true,
              can_delete: true,
            }),
        })
      }
      if (urlStr.includes('/projects/project-1')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              id: 'project-1',
              name: 'Ledger Automation',
              folder_id: 'folder-1',
              lifecycle_status: 'ACTIVE',
              description: 'Primary ledger automation system',
              tags: ['finance', 'core'],
              criticality: 'HIGH',
              data_classification: 'CONFIDENTIAL',
              cost_center: 'CC-900',
              archived_at: null,
              archived_by: null,
              created_at: '2026-10-25T00:00:00Z',
            }),
        })
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      })
    })
  })

  it('renders tree hierarchy, metric cards, and filter controls', async () => {
    render(
      <WorkspaceLive
        token="test-token"
        tenant="tenant-123"
        tenantName="Acme Corp"
        onUnauthorized={() => {}}
        onChanged={() => {}}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Acme Global')).toBeDefined()
    })

    // Search filter input exists
    const searchInput = screen.getByLabelText('Filter resource hierarchy')
    expect(searchInput).toBeDefined()

    // Filter pills exist
    expect(screen.getByRole('tab', { name: 'All' })).toBeDefined()
    expect(screen.getByRole('tab', { name: /Favorites/ })).toBeDefined()
  })

  it('filters resource hierarchy when typing query in search input', async () => {
    render(
      <WorkspaceLive
        token="test-token"
        tenant="tenant-123"
        tenantName="Acme Corp"
        onUnauthorized={() => {}}
        onChanged={() => {}}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Acme Global')).toBeDefined()
    })

    const searchInput = screen.getByLabelText('Filter resource hierarchy')
    fireEvent.change(searchInput, { target: { value: 'Ledger' } })

    // Auto-expands ancestor path and shows matching node
    await waitFor(() => {
      expect(screen.getByText('Ledger Automation')).toBeDefined()
    })

    // Nodes that do not match are hidden
    expect(screen.queryByText('Empty Folder')).toBeNull()
  })

  it('supports favoriting nodes and filtering by favorites', async () => {
    render(
      <WorkspaceLive
        token="test-token"
        tenant="tenant-123"
        tenantName="Acme Corp"
        onUnauthorized={() => {}}
        onChanged={() => {}}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Acme Global')).toBeDefined()
    })

    // Toggle favorite on Acme Global
    const favoriteBtn = screen.getByLabelText('Favorite Acme Global')
    fireEvent.click(favoriteBtn)

    // Check Favorites tab count
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Favorites \(1\)/ })).toBeDefined()
    })

    // Switch to Favorites tab
    fireEvent.click(screen.getByRole('tab', { name: /Favorites \(1\)/ }))

    // Acme Global should be present
    expect(screen.getByText('Acme Global')).toBeDefined()
  })

  it('displays hierarchical breadcrumb path and allows parent navigation', async () => {
    render(
      <WorkspaceLive
        token="test-token"
        tenant="tenant-123"
        tenantName="Acme Corp"
        onUnauthorized={() => {}}
        onChanged={() => {}}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Acme Global')).toBeDefined()
    })

    // Search for project to auto-expand path
    const searchInput = screen.getByLabelText('Filter resource hierarchy')
    fireEvent.change(searchInput, { target: { value: 'Ledger' } })

    await waitFor(() => {
      expect(screen.getByText('Ledger Automation')).toBeDefined()
    })

    // Click project node
    fireEvent.click(screen.getByText('Ledger Automation'))

    // Verify breadcrumb path exists: Acme Global > Finance Division > Ledger Automation
    await waitFor(() => {
      const breadcrumbs = screen.getByLabelText('Hierarchy breadcrumb')
      expect(breadcrumbs).toBeDefined()
      expect(breadcrumbs.textContent).toContain('Acme Global')
      expect(breadcrumbs.textContent).toContain('Finance Division')
      expect(breadcrumbs.textContent).toContain('Ledger Automation')
    })

    // Click parent crumb "Finance Division" to navigate back to parent folder
    const folderCrumb = screen.getByRole('button', { name: 'Finance Division' })
    fireEvent.click(folderCrumb)

    await waitFor(() => {
      // Main pane heading updates to Finance Division
      expect(screen.getByRole('heading', { name: 'Finance Division' })).toBeDefined()
    })
  })

  it('opens context menu on right click with role-appropriate actions', async () => {
    render(
      <WorkspaceLive
        token="test-token"
        tenant="tenant-123"
        tenantName="Acme Corp"
        onUnauthorized={() => {}}
        onChanged={() => {}}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Acme Global')).toBeDefined()
    })

    // Right click on Org node
    const orgRow = screen.getByText('Acme Global')
    fireEvent.contextMenu(orgRow, { clientX: 150, clientY: 200 })

    // Org context menu shows New Folder in Org
    await waitFor(() => {
      const menu = screen.getByRole('menu', { name: 'Resource actions' })
      expect(menu).toBeDefined()
      expect(screen.getByRole('menuitem', { name: /New Folder in Org/ })).toBeDefined()
    })

    // Dismiss with Escape key
    fireEvent.keyDown(window, { key: 'Escape' })

    await waitFor(() => {
      expect(screen.queryByRole('menu', { name: 'Resource actions' })).toBeNull()
    })
  })

  it('supports keyboard navigation in tree with Arrow keys', async () => {
    render(
      <WorkspaceLive
        token="test-token"
        tenant="tenant-123"
        tenantName="Acme Corp"
        onUnauthorized={() => {}}
        onChanged={() => {}}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Acme Global')).toBeDefined()
    })

    const treeContainer = screen.getByRole('tree', { name: 'Resource hierarchy tree' })
    treeContainer.focus()

    // Press ArrowDown to select root node
    fireEvent.keyDown(treeContainer, { key: 'ArrowDown' })

    // Press ArrowRight to expand
    fireEvent.keyDown(treeContainer, { key: 'ArrowRight' })

    // Children should become visible
    await waitFor(() => {
      expect(screen.getByText('Finance Division')).toBeDefined()
    })
  })
})
