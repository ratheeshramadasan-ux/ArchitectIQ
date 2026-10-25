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
  activeFont: FontName
  activeIconSet: IconSetName
  activeTextSize: TextSize
  panelOpacity: number
  primaryColor?: string
  accentColor?: string
}

const themes: {
  name: ThemeName
  colors: string[]
  desc: string
  category: 'light' | 'dark' | 'glass'
}[] = [
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

const iconSets: { name: IconSetName; icon: React.ElementType }[] = [
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

const fonts: { name: FontName; family: string; desc: string; category: string }[] = [
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

export default function ThemeAppearanceStudio({
  config,
  onChange,
}: {
  config: ThemeConfig
  onChange: (updated: Partial<ThemeConfig>) => void
}) {
  const [labPrimary, setLabPrimary] = useState(config.primaryColor || '#0D0D0D')
  const [labAccent, setLabAccent] = useState(config.accentColor || '#BA9731')
  const [labActive, setLabActive] = useState(false)
  const [activeLabField, setActiveLabField] = useState<string | null>('primary')

  const lightThemes = themes.filter((t) => t.category === 'light')
  const darkThemes = themes.filter((t) => t.category === 'dark')
  const glassThemes = themes.filter((t) => t.category === 'glass')

  const currentTheme = themes.find((t) => t.name === config.activeTheme) || themes[themes.length - 1]

  const handlePaletteClick = (color: string) => {
    setLabActive(true)
    if (activeLabField === 'primary') {
      setLabPrimary(color)
      onChange({ primaryColor: color })
    } else if (activeLabField === 'accent') {
      setLabAccent(color)
      onChange({ accentColor: color })
    }
  }

  const handleLabReset = () => {
    setLabActive(false)
    setLabPrimary('#0D0D0D')
    setLabAccent('#BA9731')
    setActiveLabField('primary')
    onChange({ primaryColor: undefined, accentColor: undefined })
  }

  return (
    <div className="next-gen-appearance-studio">
      {/* Page Header */}
      <div className="next-gen-page-header">
        <div className="header-left">
          <div className="header-icon-box">
            <Palette size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="header-title">Appearance</h1>
            <p className="header-subtitle">Customize how Next Gen looks across every module.</p>
          </div>
        </div>
        <div className="header-badge">
          <span className="live-dot" />
          <span>{config.activeTheme.toUpperCase()}</span>
        </div>
      </div>

      {/* 3-Column Core Grid */}
      <div className="next-gen-theme-grid">
        {/* Column 1: Theme Palette */}
        <section className="next-gen-glass-card theme-palette-col">
          <div className="card-section-title">
            <Palette size={14} />
            <span>THEME PALETTE</span>
          </div>

          {/* Light Section */}
          <div className="theme-subgroup">
            <div className="subgroup-label">
              <Sun size={13} className="text-amber-500" />
              <span>LIGHT</span>
            </div>
            <div className="palette-grid">
              {lightThemes.map((t) => {
                const isSelected = config.activeTheme === t.name
                return (
                  <button
                    key={t.name}
                    className={`theme-swatch-card ${isSelected ? 'selected' : ''}`}
                    onClick={() => onChange({ activeTheme: t.name })}
                  >
                    {isSelected && (
                      <div className="selected-check">
                        <Check size={10} strokeWidth={3} />
                      </div>
                    )}
                    <div className="swatch-dots">
                      {t.colors.map((c, i) => (
                        <span key={i} style={{ backgroundColor: c }} />
                      ))}
                    </div>
                    <strong>{t.name}</strong>
                    <small>{t.desc}</small>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Dark Section */}
          <div className="theme-subgroup">
            <div className="subgroup-label">
              <Moon size={13} className="text-indigo-400" />
              <span>DARK</span>
            </div>
            <div className="palette-grid">
              {darkThemes.map((t) => {
                const isSelected = config.activeTheme === t.name
                return (
                  <button
                    key={t.name}
                    className={`theme-swatch-card ${isSelected ? 'selected' : ''}`}
                    onClick={() => onChange({ activeTheme: t.name })}
                  >
                    {isSelected && (
                      <div className="selected-check">
                        <Check size={10} strokeWidth={3} />
                      </div>
                    )}
                    <div className="swatch-dots">
                      {t.colors.map((c, i) => (
                        <span key={i} style={{ backgroundColor: c }} />
                      ))}
                    </div>
                    <strong>{t.name}</strong>
                    <small>{t.desc}</small>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Glass Section */}
          <div className="theme-subgroup">
            <div className="subgroup-label">
              <Gem size={13} className="text-fuchsia-400" />
              <span>GLASS</span>
            </div>
            <div className="palette-grid">
              {glassThemes.map((t) => {
                const isSelected = config.activeTheme === t.name
                return (
                  <button
                    key={t.name}
                    className={`theme-swatch-card is-glass ${isSelected ? 'selected' : ''}`}
                    onClick={() => onChange({ activeTheme: t.name })}
                  >
                    {isSelected && (
                      <div className="selected-check">
                        <Check size={10} strokeWidth={3} />
                      </div>
                    )}
                    <div className="swatch-dots">
                      {t.colors.map((c, i) => (
                        <span key={i} style={{ backgroundColor: c }} />
                      ))}
                    </div>
                    <strong>{t.name}</strong>
                    <small>{t.desc}</small>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Panel Transparency Slider */}
          <div className="transparency-control-box">
            <div className="transparency-header">
              <span>PANEL TRANSPARENCY</span>
              <span className="transparency-pill">{Math.round(config.panelOpacity * 100)}%</span>
            </div>
            <div className="slider-row">
              <Ghost size={14} />
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={config.panelOpacity}
                onChange={(e) => onChange({ panelOpacity: parseFloat(e.target.value) })}
                className="next-gen-range"
              />
              <Monitor size={14} />
            </div>
          </div>

          {/* Design Lab */}
          <div className="design-lab-box">
            <div className="design-lab-header">
              <div className="flex-row gap-3">
                <div className="lab-icon">
                  <Pipette size={16} />
                </div>
                <div>
                  <strong>Design Lab</strong>
                  <small>ADVANCED THEME ORCHESTRATION</small>
                </div>
              </div>
              <div className="lab-actions">
                {labActive && (
                  <button onClick={handleLabReset} className="lab-btn reset">
                    <RotateCcw size={11} /> Reset
                  </button>
                )}
                <button
                  onClick={() => {
                    setLabActive(true)
                    setLabPrimary('#6366F1')
                    setLabAccent('#F43F5E')
                    onChange({ primaryColor: '#6366F1', accentColor: '#F43F5E' })
                  }}
                  className="lab-btn preset"
                >
                  PRESET 1
                </button>
                <button
                  onClick={() => {
                    setLabActive(true)
                    setLabPrimary('#FF634A')
                    setLabAccent('#D2D2D4')
                    onChange({ primaryColor: '#FF634A', accentColor: '#D2D2D4' })
                  }}
                  className="lab-btn preset"
                >
                  PRESET 2
                </button>
              </div>
            </div>

            <div className="lab-layers-row">
              <div className="layer-group">
                <span className="layer-title">
                  <Zap size={12} /> ACTION LAYERS
                </span>
                <div className="color-input-pair">
                  <button
                    className={`color-chip-btn ${activeLabField === 'primary' ? 'active' : ''}`}
                    onClick={() => setActiveLabField('primary')}
                  >
                    <span className="color-preview" style={{ backgroundColor: labPrimary }} />
                    <span className="chip-label">Primary</span>
                  </button>
                  <button
                    className={`color-chip-btn ${activeLabField === 'accent' ? 'active' : ''}`}
                    onClick={() => setActiveLabField('accent')}
                  >
                    <span className="color-preview" style={{ backgroundColor: labAccent }} />
                    <span className="chip-label">Accent</span>
                  </button>
                </div>
              </div>

              <div className="layer-group">
                <span className="layer-title">
                  <Layout size={12} /> GLOBAL CANVAS
                </span>
                <div className="palette-strip">
                  {currentTheme.colors.map((c, idx) => (
                    <button
                      key={idx}
                      className="swatch-bubble"
                      style={{ backgroundColor: c }}
                      onClick={() => handlePaletteClick(c)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Column 2: Typography */}
        <section className="next-gen-glass-card typography-col">
          <div className="card-section-title">
            <Type size={14} />
            <span>TYPOGRAPHY</span>
          </div>
          <div className="typography-cards-list">
            {fonts.map((f) => {
              const isSelected = config.activeFont === f.name
              return (
                <button
                  key={f.name}
                  className={`font-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => onChange({ activeFont: f.name })}
                >
                  <div className="font-card-top">
                    <div>
                      <strong className="font-name">{f.name.toUpperCase()}</strong>
                      <span className="font-category">{f.category.split(',')[0].toUpperCase()}</span>
                    </div>
                    <span className="font-sample" style={{ fontFamily: f.family }}>
                      Ag
                    </span>
                  </div>
                  <p className="font-desc">{f.desc}</p>
                  <div className="font-strategic">
                    <span className="label">STRATEGIC USE:</span>
                    <span className="val">{f.category.toUpperCase()}</span>
                  </div>
                  {isSelected && <span className="font-active-dot" />}
                </button>
              )
            })}
          </div>
        </section>

        {/* Column 3: Icon Style & Global Text Size */}
        <div className="col-stack">
          {/* Icon Style */}
          <section className="next-gen-glass-card">
            <div className="card-section-title">
              <Sparkles size={14} />
              <span>ICON STYLE</span>
            </div>
            <div className="icon-style-grid">
              {iconSets.map((s) => {
                const IconComponent = s.icon
                const isSelected = config.activeIconSet === s.name
                return (
                  <button
                    key={s.name}
                    className={`icon-style-card ${isSelected ? 'selected' : ''}`}
                    onClick={() => onChange({ activeIconSet: s.name })}
                  >
                    <IconComponent size={18} className="icon-svg" />
                    <span>{s.name.toUpperCase()}</span>
                  </button>
                )
              })}
            </div>
          </section>

          {/* Global Text Size */}
          <section className="next-gen-glass-card">
            <div className="card-section-title">
              <Type size={14} />
              <span>GLOBAL TEXT SIZE</span>
            </div>
            <div className="text-size-grid">
              {[
                { id: 'Tiny', label: 'TINY', desc: 'Ultra Compact', glyphSize: '1rem' },
                { id: 'Small', label: 'SMALL', desc: 'Max Info Density', glyphSize: '1.25rem' },
                { id: 'Regular', label: 'REGULAR', desc: 'Standard View', glyphSize: '1.45rem' },
                { id: 'Large', label: 'LARGE', desc: 'High Visibility', glyphSize: '1.7rem' },
                { id: 'Extra Large', label: 'EXTRA LARGE', desc: 'Accessibility+', glyphSize: '2rem' },
                { id: 'Gigantic', label: 'GIGANTIC', desc: 'Kiosk Mode', glyphSize: '2.3rem' },
              ].map((sz) => {
                const isSelected = config.activeTextSize === sz.id
                return (
                  <button
                    key={sz.id}
                    className={`text-size-card ${isSelected ? 'selected' : ''}`}
                    onClick={() => onChange({ activeTextSize: sz.id as TextSize })}
                  >
                    <span className="size-sample" style={{ fontSize: sz.glyphSize }}>
                      Aa
                    </span>
                    <strong>{sz.label}</strong>
                    <small>{sz.desc}</small>
                  </button>
                )
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
