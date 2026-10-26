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
      expect(screen.getByTitle('Collapse STUDIOS & ORCHESTRATION')).toBeDefined()
    })

    const navScroll = container.querySelector('.sidebar-nav-scroll')
    expect(navScroll).toBeDefined()

    expect(screen.getByTitle('Collapse OPERATIONS')).toBeDefined()
    expect(screen.getByTitle('Collapse TENANT CONFIGURATION')).toBeDefined()
  })

  it('collapses and expands STUDIOS & ORCHESTRATION, OPERATIONS, and TENANT CONFIGURATION', async () => {
    render(<App />)

    await waitFor(() => {
      expect(screen.getByTitle('Collapse STUDIOS & ORCHESTRATION')).toBeDefined()
    })

    expect(screen.getByRole('button', { name: /^Flow Studio$/i })).toBeDefined()

    const studioHeaderBtn = screen.getByTitle('Collapse STUDIOS & ORCHESTRATION')
    fireEvent.click(studioHeaderBtn)

    expect(screen.queryByRole('button', { name: /^Flow Studio$/i })).toBeNull()

    const expandStudioBtn = screen.getByTitle('Expand STUDIOS & ORCHESTRATION')
    fireEvent.click(expandStudioBtn)
    expect(screen.getByRole('button', { name: /^Flow Studio$/i })).toBeDefined()

    expect(screen.getByRole('button', { name: /^Jobs & Executions$/i })).toBeDefined()
    const opsHeaderBtn = screen.getByTitle('Collapse OPERATIONS')
    fireEvent.click(opsHeaderBtn)
    expect(screen.queryByRole('button', { name: /^Jobs & Executions$/i })).toBeNull()

    expect(screen.getByRole('button', { name: /1\. Tenant Environments/i })).toBeDefined()
    const tenantCfgHeaderBtn = screen.getByTitle('Collapse TENANT CONFIGURATION')
    fireEvent.click(tenantCfgHeaderBtn)
    expect(screen.queryByRole('button', { name: /1\. Tenant Environments/i })).toBeNull()
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
})
