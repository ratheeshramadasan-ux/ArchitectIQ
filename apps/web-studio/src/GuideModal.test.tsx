import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import GuideModal from './GuideModal'

describe('GuideModal Component', () => {
  it('does not render when isOpen is false', () => {
    const handleClose = vi.fn()
    render(<GuideModal isOpen={false} onClose={handleClose} />)
    expect(screen.queryByText(/ArchitectIQ Documentation & Architecture Guide/i)).toBeNull()
  })

  it('renders all tabs and contents when isOpen is true', () => {
    const handleClose = vi.fn()
    render(<GuideModal isOpen={true} onClose={handleClose} />)

    expect(screen.getByText(/ArchitectIQ Documentation & Architecture Guide/i)).toBeDefined()
    expect(screen.getByText('1. Automation Lifecycle')).toBeDefined()
    expect(screen.getByText('2. Administrative Hierarchy')).toBeDefined()
    expect(screen.getByText('3. Slash Commands & Shortcuts')).toBeDefined()
    expect(screen.getByText('4. SDK & MCP Endpoints')).toBeDefined()

    // Test tab navigation
    fireEvent.click(screen.getByText('2. Administrative Hierarchy'))
    expect(screen.getByText(/PLATFORM CONTROL PLANE/i)).toBeDefined()
    expect(screen.getByText(/Citibank Global Enterprise/i)).toBeDefined()

    fireEvent.click(screen.getByText('3. Slash Commands & Shortcuts'))
    expect(screen.getByText('/goal')).toBeDefined()
    expect(screen.getByText('/plan')).toBeDefined()
    expect(screen.getByText('Ctrl + K')).toBeDefined()

    fireEvent.click(screen.getByText('4. SDK & MCP Endpoints'))
    expect(screen.getByText(/REST API & Model Context Protocol/i)).toBeDefined()

    // Test close button
    fireEvent.click(screen.getByText('Got it'))
    expect(handleClose).toHaveBeenCalled()
  })
})
