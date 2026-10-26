import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import App from './App'

describe('App Sidebar Menu — Collapse/Expand Groups & Icon Rail', () => {
  beforeEach(() => {
    sessionStorage.setItem('architectiq.native.session.v1', JSON.stringify({ token: 'mock-token', tenant: 'Citibank' }))
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/api/v1/me/tenants')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve([
            { id: 'Citibank', name: 'Citibank' }
          ])
        })
      }
      if (typeof url === 'string' && url.includes('/workspace/tree')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve([
            { id: 'f-1', name: 'Finance Core', kind: 'folder', children: [] }
          ])
        })
      }
      if (typeof url === 'string' && url.includes('/dependencies')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ dependencies: [] })
        })
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({})
      })
    }) as any
  })

  it('renders sidebar navigation with collapsible groups and horizontal scroll container', async () => {
    const { container } = render(<App />)

    await waitFor(() => {
      expect(screen.getByTitle('Collapse HOME & WORKSPACE')).toBeDefined()
    })

    const navScroll = container.querySelector('.sidebar-nav-scroll')
    expect(navScroll).toBeDefined()

    expect(screen.getByTitle('Collapse DESIGN STUDIOS')).toBeDefined()
    expect(screen.getByTitle('Collapse DEPLOYMENT & RELEASES')).toBeDefined()
    expect(screen.getByTitle('Collapse OPERATIONS & ORCHESTRATION')).toBeDefined()
    expect(screen.getByTitle('Collapse MONITORING & SUPPORT')).toBeDefined()
    expect(screen.getByTitle('Collapse ADMINISTRATION')).toBeDefined()
    expect(screen.getByTitle('Collapse SECURITY & GOVERNANCE')).toBeDefined()
    expect(screen.getByTitle('Collapse PLATFORM MANAGEMENT')).toBeDefined()
  })

  it('collapses and expands DESIGN STUDIOS, DEPLOYMENT & RELEASES, and OPERATIONS & ORCHESTRATION', async () => {
    render(<App />)

    await waitFor(() => {
      expect(screen.getByTitle('Collapse DESIGN STUDIOS')).toBeDefined()
    })

    expect(screen.getByRole('button', { name: /^Flow Studio$/i })).toBeDefined()

    const studioHeaderBtn = screen.getByTitle('Collapse DESIGN STUDIOS')
    fireEvent.click(studioHeaderBtn)

    expect(screen.queryByRole('button', { name: /^Flow Studio$/i })).toBeNull()

    const expandStudioBtn = screen.getByTitle('Expand DESIGN STUDIOS')
    fireEvent.click(expandStudioBtn)
    expect(screen.getByRole('button', { name: /^Flow Studio$/i })).toBeDefined()

    expect(screen.getByRole('button', { name: /^Release Manager$/i })).toBeDefined()
    const deployHeaderBtn = screen.getByTitle('Collapse DEPLOYMENT & RELEASES')
    fireEvent.click(deployHeaderBtn)
    expect(screen.queryByRole('button', { name: /^Release Manager$/i })).toBeNull()

    expect(screen.getByRole('button', { name: /^Execution Center$/i })).toBeDefined()
    const opsHeaderBtn = screen.getByTitle('Collapse OPERATIONS & ORCHESTRATION')
    fireEvent.click(opsHeaderBtn)
    expect(screen.queryByRole('button', { name: /^Execution Center$/i })).toBeNull()
  })

  it('collapses Menu Bar into icon rail and expands back', async () => {
    const { container } = render(<App />)

    await waitFor(() => {
      expect(screen.getAllByTitle('Collapse Menu Bar into Icons').length).toBeGreaterThanOrEqual(1)
    })

    const aside = container.querySelector('aside.nextgen-sidebar')
    expect(aside?.classList.contains('collapsed')).toBe(false)

    const toggleBtns = screen.getAllByTitle('Collapse Menu Bar into Icons')
    fireEvent.click(toggleBtns[0])

    expect(aside?.classList.contains('collapsed')).toBe(true)

    const expandBtns = screen.getAllByTitle('Expand Menu Bar')
    fireEvent.click(expandBtns[0])
    expect(aside?.classList.contains('collapsed')).toBe(false)
  })

  it('does not render hamburger menu on top bar, and renders nextgen footer with Ratheesh Technology Ltd and modal links', async () => {
    const { container } = render(<App />)

    await waitFor(() => {
      expect(screen.getByText(/Citibank Global/i)).toBeDefined()
    })

    // Verify top bar hamburger icon is removed
    expect(container.querySelector('.topbar-icon-action.mobile-menu')).toBeNull()
    expect(screen.queryByLabelText('Open navigation')).toBeNull()

    // Verify footer elements
    const footer = container.querySelector('footer.nextgen-footer')
    expect(footer).toBeDefined()
    expect(screen.getByText(/© 2026 Ratheesh Technology Ltd. All rights reserved./i)).toBeDefined()

    const aboutBtn = screen.getByRole('button', { name: 'About' })
    const roadmapBtn = screen.getByRole('button', { name: 'Roadmap' })
    const contactBtn = screen.getByRole('button', { name: 'Contact' })
    expect(aboutBtn).toBeDefined()
    expect(roadmapBtn).toBeDefined()
    expect(contactBtn).toBeDefined()

    // Test clicking About opens the FooterInfoModal
    fireEvent.click(aboutBtn)
    expect(screen.getByText('About ArchitectIQ')).toBeDefined()
    expect(screen.getByText('Multi-Tenant Governance')).toBeDefined()

    // Close modal
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByText('About ArchitectIQ')).toBeNull()
  })
})
