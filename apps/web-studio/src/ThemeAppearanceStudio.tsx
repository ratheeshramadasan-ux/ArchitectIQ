import React, { useState } from 'react'
import {
  Palette,
  Check,
  Sun,
  Moon,
  Zap,
  MousePointer2,
  Layers,
  Ghost,
  Fingerprint,
  Box,
  Compass,
  Monitor,
  Sparkles,
  Type,
  Pipette,
  Layout,
  RotateCcw,
  Eye,
  Gem,
  Cpu,
  Terminal,
} from 'lucide-react'

export type ThemeName =
  | 'Sand Serenity'
  | 'Ink Wash'
  | 'Jade Pebble'
  | 'Opaline'
  | 'Arctic Reflection'
  | 'Mocha Espresso'
  | 'Minimalist Slate'
  | 'Pure Alabaster'
  | 'Woodland'
  | 'Midnight Aurora'
  | 'Wraith'
  | 'Next Gen Ultra'
  | 'Deep Space'
  | 'Cyberpunk Neon'
  | 'Emerald Empire'
  | 'Crimson Velvet'
  | 'Oceanic Depth'
  | 'Jet Black'
  | 'Aurora Glass'
  | 'Frosted Glass'
  | 'Obsidian Glass'
  | 'Silk Glass'
  | 'Horizon Glass'
  | 'Lavender Mist'
  | 'Champagne Glass'

export type IconSetName =
  | 'Standard'
  | 'Glow Aura'
  | 'Minimal Thin'
  | 'Vibrant Duotone'
  | 'Sharp Tech'
  | 'Futuristic Cyber'
  | 'Glassmorphic Hologram'
  | 'Retro 8-Bit'
  | 'Neomorphic Tactile'

export type FontName =
  | 'Inter'
  | 'Roboto'
  | 'Open Sans'
  | 'Lato'
  | 'Montserrat'
  | 'Helvetica'
  | 'Avenir'
  | 'Playfair Display'
  | 'Cambria'
  | 'JetBrains Mono'
  | 'Plus Jakarta Sans'

export type TextSize = 'Tiny' | 'Small' | 'Regular' | 'Large' | 'Extra Large' | 'Gigantic'

export interface ThemeConfig {
  activeTheme: ThemeName
  activeIconSet: IconSetName
  activeFont: FontName
  activeTextSize: TextSize
  panelOpacity: number
  activeBackground: string | null
  primaryColor?: string
  primaryFg?: string
  accentColor?: string
  accentFg?: string
  backgroundColor?: string
  foregroundColor?: string
  cardColor?: string
  cardFg?: string
  borderColor?: string
}

export const themes: { name: ThemeName; colors: string[]; desc: string; category: 'light' | 'dark' | 'glass' }[] = [
  // Light
  { name: 'Sand Serenity', colors: ['#714329', '#E5D8C9', '#B08463'], desc: 'Warm beige and terracotta', category: 'light' },
  { name: 'Ink Wash', colors: ['#252525', '#F8F9FA', '#7D7D7D'], desc: 'Minimalist grayscale', category: 'light' },
  { name: 'Jade Pebble', colors: ['#7B9669', '#E6E6E6', '#6C8480'], desc: 'Earthy sage greens', category: 'light' },
  { name: 'Opaline', colors: ['#FF634A', '#F4F4F6', '#D2D2D4'], desc: 'Bright coral accent', category: 'light' },
  { name: 'Arctic Reflection', colors: ['#5289AD', '#F4FCFB', '#243C4C'], desc: 'Cool arctic blues', category: 'light' },
  { name: 'Mocha Espresso', colors: ['#4E342E', '#FDFBF7', '#D7CCC8'], desc: 'Rich coffee tones', category: 'light' },
  { name: 'Minimalist Slate', colors: ['#334155', '#F8FAFC', '#94A3B8'], desc: 'Clean architectural gray', category: 'light' },
  { name: 'Pure Alabaster', colors: ['#000000', '#FFFFFF', '#F0F0F0'], desc: 'High-contrast pristine white', category: 'light' },
  // Dark
  { name: 'Woodland', colors: ['#AAD31E', '#525034', '#9F7560'], desc: 'Deep forest organic', category: 'dark' },
  { name: 'Midnight Aurora', colors: ['#14B8A6', '#020617', '#F43F5E'], desc: 'Cosmic emerald glow', category: 'dark' },
  { name: 'Wraith', colors: ['#047C58', '#1E1702', '#8C886B'], desc: 'Spectral dark emerald', category: 'dark' },
  { name: 'Next Gen Ultra', colors: ['#00D1FF', '#050505', '#A855F7'], desc: 'Electric cyan flagship', category: 'dark' },
  { name: 'Deep Space', colors: ['#6366F1', '#020205', '#F43F5E'], desc: 'Extreme dark cosmic depth', category: 'dark' },
  { name: 'Cyberpunk Neon', colors: ['#FF00FF', '#050505', '#00FFFF'], desc: 'Magenta and cyan tech', category: 'dark' },
  { name: 'Emerald Empire', colors: ['#10B981', '#020C0A', '#FBBF24'], desc: 'Regal forest and gold', category: 'dark' },
  { name: 'Crimson Velvet', colors: ['#DC2626', '#0A0202', '#FCD34D'], desc: 'Rich velvet and amber', category: 'dark' },
  { name: 'Oceanic Depth', colors: ['#1F6FEB', '#010409', '#238636'], desc: 'Deep sea engineering', category: 'dark' },
  { name: 'Jet Black', colors: ['#FFFFFF', '#000000', '#1A1A1A'], desc: 'Absolute OLED black', category: 'dark' },
  // Glass
  { name: 'Aurora Glass', colors: ['#FBBF24', '#FAD961', '#F76B1C'], desc: 'Warm ambient amber glow (Image 1)', category: 'glass' },
  { name: 'Frosted Glass', colors: ['#6366F1', '#FFDEE9', '#B5FFFC'], desc: 'Soft pastel smart home (Image 2)', category: 'glass' },
  { name: 'Obsidian Glass', colors: ['#1DB954', '#05050A', '#38BDF8'], desc: 'Deep dark Spotify-style (Image 3)', category: 'glass' },
  { name: 'Silk Glass', colors: ['#E2725B', '#FAF9F6', '#A8816B'], desc: 'Minimalist light silk (Image 4)', category: 'glass' },
  { name: 'Horizon Glass', colors: ['#3B82F6', '#8BC6EC', '#9599E2'], desc: 'Clean data dashboard (Image 5)', category: 'glass' },
  { name: 'Lavender Mist', colors: ['#8B5CF6', '#F5F3FF', '#DDD6FE'], desc: 'Soft floral tech aesthetic', category: 'glass' },
  { name: 'Champagne Glass', colors: ['#0D0D0D', '#FEFEFE', '#BA9731'], desc: 'Black, cream & gold elegance', category: 'glass' },
]

export const iconSets: { name: IconSetName; icon: React.ElementType }[] = [
  { name: 'Standard', icon: Box },
  { name: 'Glow Aura', icon: Sparkles },
  { name: 'Minimal Thin', icon: MousePointer2 },
  { name: 'Vibrant Duotone', icon: Layers },
  { name: 'Sharp Tech', icon: Compass },
  { name: 'Futuristic Cyber', icon: Cpu },
  { name: 'Glassmorphic Hologram', icon: Gem },
  { name: 'Retro 8-Bit', icon: Terminal },
  { name: 'Neomorphic Tactile', icon: Fingerprint },
]

export const fonts: { name: FontName; family: string; desc: string; category: string }[] = [
  { name: 'Inter', family: "'Inter', sans-serif", desc: 'Top modern UI choice. Extremely readable at small sizes.', category: 'Dashboards, SaaS, Admin' },
  { name: 'Roboto', family: "'Roboto', sans-serif", desc: 'Google standard workhorse. Clean geometric structure.', category: 'Corporate, Web Apps' },
  { name: 'Open Sans', family: "'Open Sans', sans-serif", desc: 'Corporate default classic. Neutral and highly legible.', category: 'Government, Business' },
  { name: 'Lato', family: "'Lato', sans-serif", desc: 'Humanist + professional balance. Warm but serious.', category: 'Modern Brands, approachable' },
  { name: 'Montserrat', family: "'Montserrat', sans-serif", desc: 'Modern branding favorite. Strong geometric structure.', category: 'Startups, Tech, Marketing' },
  { name: 'Helvetica', family: "'Helvetica', 'Arial', sans-serif", desc: 'Enterprise legacy standard. Extremely neutral.', category: 'Internal Tools, Strict Corporate' },
  { name: 'Avenir', family: "'Avenir Next', 'Segoe UI', sans-serif", desc: 'Premium feel. Clean but slightly human geometry.', category: 'Consulting, Luxury Brands' },
  { name: 'Playfair Display', family: "'Playfair Display', serif", desc: 'Editorial elegance. Serifs for sophisticated headlines.', category: 'Editorial, Luxury Branding' },
  { name: 'Cambria', family: "'Cambria', 'Georgia', serif", desc: 'Traditional serif. Excellent for document clarity.', category: 'Academic, Legal, Formal' },
  { name: 'JetBrains Mono', family: "'JetBrains Mono', monospace", desc: 'Developer focused. Fixed-width for technical data.', category: 'Technical, Code, Logs' },
  { name: 'Plus Jakarta Sans', family: "'Plus Jakarta Sans', sans-serif", desc: 'Modern and airy. Great for clean dashboards.', category: 'Modern UI, Fintech' },
]

export const backgroundWallpapers = [
  { id: 'cyber-city', name: 'Cyber City' },
  { id: 'nebula-dreams', name: 'Nebula Dreams' },
  { id: 'emerald-forest', name: 'Emerald Forest' },
  { id: 'minimalist-slate', name: 'Minimalist Slate' },
  { id: 'aurora-peaks', name: 'Aurora Peaks' },
  { id: 'silicon-valley', name: 'Silicon Valley' },
  { id: 'ocean-depth', name: 'Ocean Depth' },
  { id: 'sahara-sands', name: 'Sahara Sands' },
  { id: 'arctic-aurora', name: 'Arctic Aurora' },
  { id: 'frosted-glass', name: 'Frosted Glass' },
]

function ColorInput({
  label,
  value,
  isActive,
  onFocus,
  onChange,
}: {
  label: string
  value: string
  isActive?: boolean
  onFocus?: () => void
  onChange: (v: string) => void
}) {
  return (
    <div
      onClick={onFocus}
      className={`color-input-tile ${isActive ? 'active' : ''}`}
    >
      <div className="color-swatch-box" style={{ backgroundColor: value || 'transparent' }}>
        <input
          type="color"
          value={value || '#BA9731'}
          onChange={(e) => onChange(e.target.value)}
          className="color-picker-native"
        />
      </div>
      <div className="color-text-box">
        <span className="color-label">{label}</span>
        <span className="color-val">{value || 'Default'}</span>
      </div>
    </div>
  )
}

export default function ThemeAppearanceStudio({
  config,
  onChange,
}: {
  config: ThemeConfig
  onChange: (updated: Partial<ThemeConfig>) => void
}) {
  const [labPrimary, setLabPrimary] = useState(config.primaryColor || '')
  const [labPrimaryFg, setLabPrimaryFg] = useState('')
  const [labAccent, setLabAccent] = useState(config.accentColor || '')
  const [labAccentFg, setLabAccentFg] = useState('')
  const [labBg, setLabBg] = useState('')
  const [labFg, setLabFg] = useState('')
  const [labCard, setLabCard] = useState('')
  const [labCardFg, setLabCardFg] = useState('')
  const [labBorder, setLabBorder] = useState('')
  const [labActive, setLabActive] = useState(false)
  const [activeLabField, setActiveLabField] = useState<string>('primary')

  const lightThemes = themes.filter((t) => t.category === 'light')
  const darkThemes = themes.filter((t) => t.category === 'dark')
  const glassThemes = themes.filter((t) => t.category === 'glass')

  const getThemePalette = (theme: ThemeName) => {
    const base = themes.find((t) => t.name === theme)?.colors || ['#3B82F6', '#6366F1', '#8B5CF6']
    switch (theme) {
      case 'Sand Serenity':
        return ['#714329', '#E5D8C9', '#B08463', '#5A3521', '#F5F5F5', '#2A1F12']
      case 'Ink Wash':
        return ['#252525', '#F8F9FA', '#7D7D7D', '#E0E0E0', '#000000', '#FFFFFF']
      case 'Midnight Aurora':
        return ['#14B8A6', '#020617', '#F43F5E', '#10B981', '#1E1B4B', '#0D9488']
      case 'Arctic Reflection':
        return ['#5289AD', '#F4FCFB', '#243C4C', '#BEE3F8', '#2C5282', '#EBF8FF']
      case 'Next Gen Ultra':
        return ['#00D1FF', '#050505', '#A855F7', '#38BDF8', '#7C3AED', '#1E1E1E']
      case 'Champagne Glass':
        return ['#0D0D0D', '#F2F2F2', '#FEFEFE', '#BA9731', '#DACE84']
      default:
        return Array.from(new Set([...base, '#0F172A', '#1E293B', '#334155', '#F1F5F9', '#FFFFFF']))
    }
  }

  const currentPalette = getThemePalette(config.activeTheme)

  const handlePaletteClick = (color: string) => {
    setLabActive(true)
    switch (activeLabField) {
      case 'primary':
        setLabPrimary(color)
        onChange({ primaryColor: color })
        break
      case 'primaryFg':
        setLabPrimaryFg(color)
        onChange({ primaryFg: color })
        break
      case 'accent':
        setLabAccent(color)
        onChange({ accentColor: color })
        break
      case 'accentFg':
        setLabAccentFg(color)
        onChange({ accentFg: color })
        break
      case 'bg':
        setLabBg(color)
        onChange({ backgroundColor: color })
        break
      case 'fg':
        setLabFg(color)
        onChange({ foregroundColor: color })
        break
      case 'card':
        setLabCard(color)
        onChange({ cardColor: color })
        break
      case 'cardFg':
        setLabCardFg(color)
        onChange({ cardFg: color })
        break
      case 'border':
        setLabBorder(color)
        onChange({ borderColor: color })
        break
    }
  }

  const handleLabReset = () => {
    setLabActive(false)
    setLabPrimary('')
    setLabPrimaryFg('')
    setLabAccent('')
    setLabAccentFg('')
    setLabBg('')
    setLabFg('')
    setLabCard('')
    setLabCardFg('')
    setLabBorder('')
    setActiveLabField('primary')
    onChange({
      primaryColor: undefined,
      primaryFg: undefined,
      accentColor: undefined,
      accentFg: undefined,
      backgroundColor: undefined,
      foregroundColor: undefined,
      cardColor: undefined,
      cardFg: undefined,
      borderColor: undefined,
    })
  }


  return (
    <div className="nextgen-appearance-page">
      {/* ─── Header ─── */}
      <div className="appearance-top-header">
        <div className="header-branding">
          <div className="appearance-icon-badge">
            <Palette className="w-5 h-5" />
          </div>
          <div>
            <h1 className="appearance-page-title">Appearance</h1>
            <p className="appearance-page-desc">Customize how ArchitectIQ looks across every module.</p>
          </div>
        </div>
        <div className="appearance-active-pill">
          <Eye size={12} />
          <span>{config.activeTheme.toUpperCase()}</span>
        </div>
      </div>

      {/* ─── 3-Column Grid ─── */}
      <div className="appearance-main-grid">
        {/* Column 1: Theme Palette & Design Lab */}
        <div className="appearance-col col-palette-lab">
          {/* Theme Palette */}
          <section className="glass-card panel-padded">
            <div className="card-section-head">
              <Palette size={13} className="text-muted-foreground" />
              <h2>Theme Palette</h2>
            </div>

            {/* Light Subgroup */}
            <div className="theme-group">
              <div className="group-heading">
                <Sun size={13} className="text-amber-500" />
                <h3>Light</h3>
              </div>
              <div className="swatches-grid">
                {lightThemes.map((t) => {
                  const isActive = config.activeTheme === t.name
                  return (
                    <button
                      key={t.name}
                      onClick={() => onChange({ activeTheme: t.name })}
                      className={`theme-card-nextgen ${isActive ? 'active' : ''}`}
                    >
                      {isActive && (
                        <div className="active-check-badge">
                          <Check size={9} strokeWidth={3} />
                        </div>
                      )}
                      <div className="color-dots-row">
                        {t.colors.map((c, idx) => (
                          <span key={idx} className="color-dot" style={{ backgroundColor: c }} />
                        ))}
                      </div>
                      <span className="theme-card-name">{t.name}</span>
                      <span className="theme-card-desc">{t.desc}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Dark Subgroup */}
            <div className="theme-group">
              <div className="group-heading">
                <Moon size={13} className="text-indigo-400" />
                <h3>Dark</h3>
              </div>
              <div className="swatches-grid">
                {darkThemes.map((t) => {
                  const isActive = config.activeTheme === t.name
                  return (
                    <button
                      key={t.name}
                      onClick={() => onChange({ activeTheme: t.name })}
                      className={`theme-card-nextgen ${isActive ? 'active' : ''}`}
                    >
                      {isActive && (
                        <div className="active-check-badge">
                          <Check size={9} strokeWidth={3} />
                        </div>
                      )}
                      <div className="color-dots-row">
                        {t.colors.map((c, idx) => (
                          <span key={idx} className="color-dot" style={{ backgroundColor: c }} />
                        ))}
                      </div>
                      <span className="theme-card-name">{t.name}</span>
                      <span className="theme-card-desc">{t.desc}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Glass Subgroup */}
            <div className="theme-group">
              <div className="group-heading">
                <Gem size={13} className="text-fuchsia-400" />
                <h3>Glass</h3>
              </div>
              <div className="swatches-grid">
                {glassThemes.map((t) => {
                  const isActive = config.activeTheme === t.name
                  return (
                    <button
                      key={t.name}
                      onClick={() => onChange({ activeTheme: t.name })}
                      className={`theme-card-nextgen is-glass ${isActive ? 'active' : ''}`}
                    >
                      {isActive && (
                        <div className="active-check-badge">
                          <Check size={9} strokeWidth={3} />
                        </div>
                      )}
                      <div className="color-dots-row">
                        {t.colors.map((c, idx) => (
                          <span key={idx} className="color-dot" style={{ backgroundColor: c }} />
                        ))}
                      </div>
                      <span className="theme-card-name">{t.name}</span>
                      <span className="theme-card-desc">{t.desc}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Panel Transparency Slider */}
            <div className="transparency-slider-row">
              <div className="slider-label-row">
                <h3>Panel Transparency</h3>
                <span className="transparency-val-pill">{Math.round(config.panelOpacity * 100)}%</span>
              </div>
              <div className="slider-track-wrap">
                <Ghost size={13} className="text-muted-foreground" />
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={config.panelOpacity}
                  onChange={(e) => onChange({ panelOpacity: parseFloat(e.target.value) })}
                  className="nextgen-slider"
                />
                <Monitor size={13} className="text-muted-foreground" />
              </div>
            </div>
          </section>

          {/* Design Lab Card */}
          <section className="glass-card panel-padded">
            <div className="design-lab-header">
              <div className="lab-title-group">
                <div className="lab-icon-box">
                  <Pipette size={18} />
                </div>
                <div>
                  <h2>Design Lab</h2>
                  <p>ADVANCED THEME ORCHESTRATION</p>
                </div>
              </div>
              <div className="lab-actions-group">
                {labActive && (
                  <button onClick={handleLabReset} className="lab-btn-reset">
                    <RotateCcw size={12} /> Reset Lab
                  </button>
                )}
                <button
                  onClick={() => {
                    setLabActive(true)
                    setLabPrimary('#6366F1')
                    setLabPrimaryFg('#FFFFFF')
                    setLabAccent('#F43F5E')
                    setLabAccentFg('#FFFFFF')
                    setLabBg('#05050A')
                    setLabFg('#E8E8F0')
                    setLabCard('#12121A')
                    setLabCardFg('#A0A0B0')
                    setLabBorder('#222233')
                    onChange({
                      primaryColor: '#6366F1',
                      primaryFg: '#FFFFFF',
                      accentColor: '#F43F5E',
                      accentFg: '#FFFFFF',
                      backgroundColor: '#05050A',
                      foregroundColor: '#E8E8F0',
                      cardColor: '#12121A',
                      cardFg: '#A0A0B0',
                      borderColor: '#222233',
                    })
                  }}
                  className="lab-preset-btn preset-indigo"
                >
                  PRESET 1
                </button>
                <button
                  onClick={() => {
                    setLabActive(true)
                    setLabPrimary('#FF634A')
                    setLabPrimaryFg('#FFFFFF')
                    setLabAccent('#D2D2D4')
                    setLabAccentFg('#1A1A1A')
                    setLabBg('#FAF9F6')
                    setLabFg('#1A1A1A')
                    setLabCard('#FFFFFF')
                    setLabCardFg('#404040')
                    setLabBorder('#E7E7E7')
                    onChange({
                      primaryColor: '#FF634A',
                      primaryFg: '#FFFFFF',
                      accentColor: '#D2D2D4',
                      accentFg: '#1A1A1A',
                      backgroundColor: '#FAF9F6',
                      foregroundColor: '#1A1A1A',
                      cardColor: '#FFFFFF',
                      cardFg: '#404040',
                      borderColor: '#E7E7E7',
                    })
                  }}
                  className="lab-preset-btn preset-rose"
                >
                  PRESET 2
                </button>
              </div>
            </div>

            <div className="design-lab-body-grid">
              <div className="lab-inputs-stack">
                <div className="lab-layers-grid">
                  {/* Action Layers */}
                  <div className="layer-block">
                    <div className="layer-header">
                      <Zap size={12} />
                      <span>ACTION LAYERS</span>
                    </div>
                    <div className="layer-pair">
                      <ColorInput
                        label="Primary Bg"
                        value={labPrimary}
                        isActive={activeLabField === 'primary'}
                        onFocus={() => setActiveLabField('primary')}
                        onChange={(v) => {
                          setLabActive(true)
                          setLabPrimary(v)
                          onChange({ primaryColor: v })
                        }}
                      />
                      <ColorInput
                        label="Primary Font"
                        value={labPrimaryFg}
                        isActive={activeLabField === 'primaryFg'}
                        onFocus={() => setActiveLabField('primaryFg')}
                        onChange={(v) => {
                          setLabActive(true)
                          setLabPrimaryFg(v)
                          onChange({ primaryFg: v })
                        }}
                      />
                    </div>
                  </div>

                  {/* Accent Layers */}
                  <div className="layer-block">
                    <div className="layer-header">
                      <Sparkles size={12} />
                      <span>ACCENT LAYERS</span>
                    </div>
                    <div className="layer-pair">
                      <ColorInput
                        label="Highlight Bg"
                        value={labAccent}
                        isActive={activeLabField === 'accent'}
                        onFocus={() => setActiveLabField('accent')}
                        onChange={(v) => {
                          setLabActive(true)
                          setLabAccent(v)
                          onChange({ accentColor: v })
                        }}
                      />
                      <ColorInput
                        label="Highlight Font"
                        value={labAccentFg}
                        isActive={activeLabField === 'accentFg'}
                        onFocus={() => setActiveLabField('accentFg')}
                        onChange={(v) => {
                          setLabActive(true)
                          setLabAccentFg(v)
                          onChange({ accentFg: v })
                        }}
                      />
                    </div>
                  </div>

                  {/* Global Canvas */}
                  <div className="layer-block">
                    <div className="layer-header">
                      <Layout size={12} />
                      <span>GLOBAL CANVAS</span>
                    </div>
                    <div className="layer-pair">
                      <ColorInput
                        label="App Bg"
                        value={labBg}
                        isActive={activeLabField === 'bg'}
                        onFocus={() => setActiveLabField('bg')}
                        onChange={(v) => {
                          setLabActive(true)
                          setLabBg(v)
                          onChange({ backgroundColor: v })
                        }}
                      />
                      <ColorInput
                        label="Global Font"
                        value={labFg}
                        isActive={activeLabField === 'fg'}
                        onFocus={() => setActiveLabField('fg')}
                        onChange={(v) => {
                          setLabActive(true)
                          setLabFg(v)
                          onChange({ foregroundColor: v })
                        }}
                      />
                    </div>
                  </div>

                  {/* UI Containers */}
                  <div className="layer-block">
                    <div className="layer-header">
                      <Layers size={12} />
                      <span>UI CONTAINERS</span>
                    </div>
                    <div className="layer-pair">
                      <ColorInput
                        label="Card Bg"
                        value={labCard}
                        isActive={activeLabField === 'card'}
                        onFocus={() => setActiveLabField('card')}
                        onChange={(v) => {
                          setLabActive(true)
                          setLabCard(v)
                          onChange({ cardColor: v })
                        }}
                      />
                      <ColorInput
                        label="Card Font"
                        value={labCardFg}
                        isActive={activeLabField === 'cardFg'}
                        onFocus={() => setActiveLabField('cardFg')}
                        onChange={(v) => {
                          setLabActive(true)
                          setLabCardFg(v)
                          onChange({ cardFg: v })
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Intelligent Palette */}
                <div className="intelligent-palette-row">
                  <div className="palette-strip-left">
                    <div className="palette-labels">
                      <span className="p-title">INTELLIGENT PALETTE</span>
                      <span className="p-map">mapping to: {activeLabField || 'none'}</span>
                    </div>
                    <div className="palette-bubbles">
                      {currentPalette.map((c, idx) => (
                        <button
                          key={`${c}-${idx}`}
                          onClick={() => handlePaletteClick(c)}
                          className="swatch-bubble-btn"
                          style={{ backgroundColor: c }}
                          title={`Apply ${c} to ${activeLabField}`}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="border-color-input-wrap">
                    <ColorInput
                      label="Structural Borders"
                      value={labBorder}
                      isActive={activeLabField === 'border'}
                      onFocus={() => setActiveLabField('border')}
                      onChange={(v) => {
                        setLabActive(true)
                        setLabBorder(v)
                        onChange({ borderColor: v })
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Micro Preview Box */}
              <div className="lab-micro-preview-card">
                <span className="preview-label">MICRO PREVIEW</span>
                <div className="preview-icons-row">
                  <Zap size={20} style={{ color: config.primaryColor || 'var(--primary)' }} />
                  <Monitor size={20} style={{ color: config.primaryColor || 'var(--primary)' }} />
                  <Fingerprint size={20} style={{ color: config.primaryColor || 'var(--primary)' }} />
                </div>
                <div className="preview-btns-col">
                  <div
                    className="preview-pill-primary"
                    style={{
                      backgroundColor: config.primaryColor || 'var(--primary)',
                      color: labPrimaryFg || 'var(--primary-foreground, #FFFFFF)',
                    }}
                  >
                    PRIMARY
                  </div>
                  <div
                    className="preview-pill-accent"
                    style={{
                      borderColor: config.accentColor || 'var(--accent)',
                      color: config.accentColor || 'var(--accent)',
                    }}
                  >
                    ACCENT
                  </div>
                </div>
                <div className="preview-status-meter">
                  <div className="meter-track">
                    <div
                      className="meter-bar"
                      style={{ backgroundColor: config.primaryColor || 'var(--primary)' }}
                    />
                  </div>
                  <div className="meter-footer">
                    <span>STATUS</span>
                    <span style={{ color: config.primaryColor || 'var(--primary)' }}>LIVE</span>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Column 2: Typography */}
        <section className="glass-card panel-padded col-typography">
          <div className="card-section-head">
            <Type size={13} className="text-muted-foreground" />
            <h2>Typography</h2>
          </div>
          <div className="typography-cards-grid">
            {fonts.map((f) => {
              const isActive = config.activeFont === f.name
              return (
                <button
                  key={f.name}
                  onClick={() => onChange({ activeFont: f.name })}
                  className={`typography-card-nextgen ${isActive ? 'active' : ''}`}
                >
                  <div className="typo-top-row">
                    <div className="typo-names">
                      <span className="typo-name">{f.name.toUpperCase()}</span>
                      <span className="typo-cat">{f.category.split(',')[0].toUpperCase()}</span>
                    </div>
                    <span className="typo-sample-ag" style={{ fontFamily: f.family }}>
                      Ag
                    </span>
                  </div>
                  <p className="typo-desc">{f.desc}</p>
                  <div className="typo-strategic">
                    <span className="s-label">STRATEGIC USE:</span>
                    <span className="s-val">{f.category.toUpperCase()}</span>
                  </div>
                  {isActive && <div className="typo-pulse-dot" />}
                </button>
              )
            })}
          </div>
        </section>

        {/* Column 3: Icon Style & Global Text Size */}
        <div className="appearance-col col-icons-sizes">
          {/* Icon Style */}
          <section className="glass-card panel-padded">
            <div className="card-section-head">
              <Sparkles size={13} className="text-muted-foreground" />
              <h2>Icon Style</h2>
            </div>
            <div className="icons-style-grid">
              {iconSets.map((s) => {
                const IconComp = s.icon
                const isActive = config.activeIconSet === s.name
                return (
                  <button
                    key={s.name}
                    onClick={() => onChange({ activeIconSet: s.name })}
                    className={`icon-style-btn-nextgen ${isActive ? 'active' : ''}`}
                  >
                    <IconComp size={18} className={isActive ? 'text-primary' : 'text-muted-foreground'} />
                    <span className="icon-style-name">{s.name.toUpperCase()}</span>
                  </button>
                )
              })}
            </div>
          </section>

          {/* Global Text Size */}
          <section className="glass-card panel-padded">
            <div className="card-section-head">
              <Type size={13} className="text-muted-foreground" />
              <h2>Global Text Size</h2>
            </div>
            <div className="text-sizes-grid">
              {[
                { id: 'Tiny', label: 'TINY', desc: 'Ultra Compact', glyphScale: '1rem' },
                { id: 'Small', label: 'SMALL', desc: 'Max Info Density', glyphScale: '1.25rem' },
                { id: 'Regular', label: 'REGULAR', desc: 'Standard View', glyphScale: '1.45rem' },
                { id: 'Large', label: 'LARGE', desc: 'High Visibility', glyphScale: '1.7rem' },
                { id: 'Extra Large', label: 'EXTRA LARGE', desc: 'Accessibility+', glyphScale: '2rem' },
                { id: 'Gigantic', label: 'GIGANTIC', desc: 'Kiosk Mode', glyphScale: '2.3rem' },
              ].map((s) => {
                const isActive = config.activeTextSize === s.id
                return (
                  <button
                    key={s.id}
                    onClick={() => onChange({ activeTextSize: s.id as TextSize })}
                    className={`text-size-btn-nextgen ${isActive ? 'active' : ''}`}
                  >
                    <span className="size-sample-glyph" style={{ fontSize: s.glyphScale }}>
                      Aa
                    </span>
                    <span className="size-label">{s.label}</span>
                    <span className="size-sub">{s.desc}</span>
                  </button>
                )
              })}
            </div>
          </section>
        </div>
      </div>

      {/* ─── Row 4: Dashboard Background ─── */}
      <section className="glass-card panel-padded background-gallery-card">
        <div className="background-gallery-head">
          <div className="head-title">
            <Layers size={13} className="text-muted-foreground" />
            <h2>Dashboard Background</h2>
          </div>
          {config.activeBackground && (
            <button
              onClick={() => onChange({ activeBackground: null })}
              className="reset-bg-action"
            >
              Reset to Theme Default
            </button>
          )}
        </div>
        <div className="wallpaper-thumbnails-grid">
          <button
            onClick={() => onChange({ activeBackground: null })}
            className={`wallpaper-thumb default-thumb ${!config.activeBackground ? 'active' : ''}`}
          >
            <div className="default-icon-wrap">
              <RotateCcw size={16} />
              <span>DEFAULT</span>
            </div>
          </button>
          {backgroundWallpapers.map((bg) => {
            const url = `/backgrounds/dashboard/${bg.id}.png`
            const isActive = config.activeBackground === url
            return (
              <button
                key={bg.id}
                onClick={() => onChange({ activeBackground: url })}
                className={`wallpaper-thumb ${isActive ? 'active' : ''}`}
              >
                <img src={url} alt={bg.name} className="wallpaper-img" />
                <div className="wallpaper-overlay" />
                <span className="wallpaper-name">{bg.name}</span>
                {isActive && (
                  <div className="wallpaper-check">
                    <Check size={10} strokeWidth={3} />
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}
