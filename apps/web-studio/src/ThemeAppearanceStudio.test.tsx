import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Mock } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ThemeAppearanceStudio, { themes, fonts, iconSets } from './ThemeAppearanceStudio'
import type { ThemeConfig } from './ThemeAppearanceStudio'

describe('ThemeAppearanceStudio — Full Functionality Verification', () => {
  let mockOnChange: Mock<(updated: Partial<ThemeConfig>) => void>

  const initialConfig: ThemeConfig = {
    activeTheme: 'Champagne Glass',
    activeFont: 'Plus Jakarta Sans',
    activeIconSet: 'Glassmorphic Hologram',
    activeTextSize: 'Small',
    panelOpacity: 0.85,
    activeBackground: null,
  }

  beforeEach(() => {
    mockOnChange = vi.fn()
  })

  it('renders all theme sections (Light, Dark, Glass) and all 25 theme choices', () => {
    render(
      <ThemeAppearanceStudio
        config={initialConfig}
        onChange={mockOnChange}
        brandLogo="/brand/logo-light.png"
        isDarkBackdrop={false}
      />
    )

    expect(screen.getByText('Light')).toBeDefined()
    expect(screen.getByText('Dark')).toBeDefined()
    expect(screen.getByText('Glass')).toBeDefined()

    // Verify all 25 themes render
    themes.forEach((t) => {
      const elements = screen.getAllByText(t.name)
      expect(elements.length).toBeGreaterThan(0)
    })
  })

  it('switches themes and cleanly resets overrides via handleSelectTheme', () => {
    render(
      <ThemeAppearanceStudio
        config={initialConfig}
        onChange={mockOnChange}
      />
    )

    const sandSerenityBtn = screen.getByText('Sand Serenity').closest('button')
    expect(sandSerenityBtn).toBeDefined()
    fireEvent.click(sandSerenityBtn!)

    expect(mockOnChange).toHaveBeenCalledWith(
      expect.objectContaining({
        activeTheme: 'Sand Serenity',
        primaryColor: undefined,
        primaryFg: undefined,
        accentColor: undefined,
      })
    )
  })

  it('adjusts panel transparency slider dynamically', () => {
    render(
      <ThemeAppearanceStudio
        config={initialConfig}
        onChange={mockOnChange}
      />
    )

    const slider = screen.getByRole('slider')
    expect(slider).toBeDefined()
    expect(screen.getByText('85%')).toBeDefined()

    fireEvent.change(slider, { target: { value: '0.45' } })
    expect(mockOnChange).toHaveBeenCalledWith({ panelOpacity: 0.45 })
  })

  it('activates and applies Design Lab Preset 1 and Preset 2', () => {
    render(
      <ThemeAppearanceStudio
        config={initialConfig}
        onChange={mockOnChange}
      />
    )

    const preset1 = screen.getByText('PRESET 1')
    fireEvent.click(preset1)
    expect(mockOnChange).toHaveBeenCalledWith(
      expect.objectContaining({
        primaryColor: '#6366F1',
        primaryFg: '#FFFFFF',
        accentColor: '#F43F5E',
      })
    )

    const preset2 = screen.getByText('PRESET 2')
    fireEvent.click(preset2)
    expect(mockOnChange).toHaveBeenCalledWith(
      expect.objectContaining({
        primaryColor: '#FF634A',
        primaryFg: '#FFFFFF',
        accentColor: '#D2D2D4',
      })
    )
  })

  it('maps intelligent palette clicks to active field and resets overrides', () => {
    render(
      <ThemeAppearanceStudio
        config={initialConfig}
        onChange={mockOnChange}
      />
    )

    // Click a palette bubble (e.g. #BA9731 from Champagne Glass palette)
    const bubble = screen.getByTitle('Apply #BA9731 to primary')
    expect(bubble).toBeDefined()
    fireEvent.click(bubble)
    expect(mockOnChange).toHaveBeenCalledWith({ primaryColor: '#BA9731' })

    // Reset button should now be visible
    const resetBtn = screen.getByText('Reset Lab').closest('button')
    expect(resetBtn).toBeDefined()
    fireEvent.click(resetBtn!)

    expect(mockOnChange).toHaveBeenCalledWith(
      expect.objectContaining({
        primaryColor: undefined,
        primaryFg: undefined,
        accentColor: undefined,
        cardColor: undefined,
      })
    )
  })

  it('selects typography font from all 11 font choices', () => {
    render(
      <ThemeAppearanceStudio
        config={initialConfig}
        onChange={mockOnChange}
      />
    )

    fonts.forEach((f) => {
      expect(screen.getByText(f.name.toUpperCase())).toBeDefined()
    })

    const jetbrainsBtn = screen.getByText('JETBRAINS MONO').closest('button')
    fireEvent.click(jetbrainsBtn!)
    expect(mockOnChange).toHaveBeenCalledWith({ activeFont: 'JetBrains Mono' })
  })

  it('selects icon style from all 9 icon sets', () => {
    render(
      <ThemeAppearanceStudio
        config={initialConfig}
        onChange={mockOnChange}
      />
    )

    iconSets.forEach((s) => {
      expect(screen.getByText(s.name.toUpperCase())).toBeDefined()
    })

    const futuristicBtn = screen.getByText('FUTURISTIC CYBER').closest('button')
    fireEvent.click(futuristicBtn!)
    expect(mockOnChange).toHaveBeenCalledWith({ activeIconSet: 'Futuristic Cyber' })
  })

  it('selects global text size across all 6 scale tiers', () => {
    render(
      <ThemeAppearanceStudio
        config={initialConfig}
        onChange={mockOnChange}
      />
    )

    const largeBtn = screen.getByText('LARGE').closest('button')
    fireEvent.click(largeBtn!)
    expect(mockOnChange).toHaveBeenCalledWith({ activeTextSize: 'Large' })

    const tinyBtn = screen.getByText('TINY').closest('button')
    fireEvent.click(tinyBtn!)
    expect(mockOnChange).toHaveBeenCalledWith({ activeTextSize: 'Tiny' })
  })

  it('selects dashboard wallpaper and resets to theme default', () => {
    render(
      <ThemeAppearanceStudio
        config={initialConfig}
        onChange={mockOnChange}
      />
    )

    const nebula = screen.getByText('Nebula Dreams').closest('button')
    fireEvent.click(nebula!)
    expect(mockOnChange).toHaveBeenCalledWith({
      activeBackground: '/backgrounds/dashboard/nebula-dreams.png',
    })

    const defaultBtn = screen.getByText('DEFAULT').closest('button')
    fireEvent.click(defaultBtn!)
    expect(mockOnChange).toHaveBeenCalledWith({ activeBackground: null })
  })

  it('renders and selects new high-resolution platform backgrounds', () => {
    render(
      <ThemeAppearanceStudio
        config={initialConfig}
        onChange={mockOnChange}
      />
    )

    expect(screen.getByText('Alpine Moraine Lake')).toBeDefined()
    expect(screen.getByText('Bengal Tiger Sanctuary')).toBeDefined()
    expect(screen.getByText('Rainforest Tree Frog')).toBeDefined()
    expect(screen.getByText('Mountain Ridge Summit')).toBeDefined()

    const tiger = screen.getByText('Bengal Tiger Sanctuary').closest('button')
    fireEvent.click(tiger!)
    expect(mockOnChange).toHaveBeenCalledWith({
      activeBackground: '/backgrounds/dashboard/bengal-tiger.png',
    })
  })
})
