import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import FooterInfoModal from './FooterInfoModal'

describe('FooterInfoModal — About, Roadmap & Contact Dialog', () => {
  it('renders About tab by default with Ratheesh Technology Ltd. information', () => {
    const handleClose = vi.fn()
    render(
      <FooterInfoModal
        isOpen={true}
        initialTab="about"
        onClose={handleClose}
        brandShield="/brand/shield-hd.png"
      />
    )

    expect(screen.getByText('About ArchitectIQ')).toBeDefined()
    expect(screen.getAllByText(/Ratheesh Technology Ltd/i).length).toBeGreaterThan(0)
    expect(screen.getByText('Multi-Tenant Governance')).toBeDefined()
  })

  it('switches to Roadmap and Contact tabs seamlessly', () => {
    const handleClose = vi.fn()
    render(
      <FooterInfoModal
        isOpen={true}
        initialTab="about"
        onClose={handleClose}
        brandShield="/brand/shield-hd.png"
      />
    )

    // Switch to Roadmap
    fireEvent.click(screen.getByText('Roadmap'))
    expect(screen.getByText('Product Roadmap — 2026')).toBeDefined()
    expect(screen.getByText(/Q1 2026 \(Delivered\)/i)).toBeDefined()

    // Switch to Contact
    fireEvent.click(screen.getByText('Contact'))
    expect(screen.getByText('Enterprise Support')).toBeDefined()
    expect(screen.getByText('support@architectiq.io')).toBeDefined()
    expect(screen.getByText('Commercial & Sales')).toBeDefined()
    expect(screen.getByText('sales@ratheeshtechnology.com')).toBeDefined()

    // Test close
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }))
    expect(handleClose).toHaveBeenCalled()
  })
})
