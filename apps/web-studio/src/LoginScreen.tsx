import { useState } from 'react'
import { Palette } from 'lucide-react'
import './LoginScreen.css'

type Tenant = { id: string; name: string; slug: string }

export default function LoginScreen({
  onLogin,
  brandLogo = '/brand/logo-dark.png',
  activeTheme = 'Champagne Glass',
}: {
  onLogin: (token: string, tenant: string, tenants: Tenant[]) => void
  brandLogo?: string
  activeTheme?: string
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // First Tenant Creation Onboarding state
  const [needsTenant, setNeedsTenant] = useState(false)
  const [pendingToken, setPendingToken] = useState('')
  const [tenantName, setTenantName] = useState('')

  async function submitLogin(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    let accessToken = ''
    try {
      const r = await fetch('/api/v1/auth/native/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (!r.ok) {
        setError(r.status === 401 ? 'Invalid email or password' : `Login failed (HTTP ${r.status})`)
        return
      }
      const data = await r.json()
      accessToken = data.access_token
      if (!accessToken) throw new Error('No access token received')

      const response = await fetch('/api/v1/me/tenants', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!response.ok) throw new Error(`Tenant discovery failed (HTTP ${response.status})`)
      const tenants: Tenant[] = await response.json()

      if (!tenants.length) {
        // No tenant exists yet — prompt user to create their first tenant
        setPendingToken(accessToken)
        setNeedsTenant(true)
        return
      }

      setPassword('')
      onLogin(accessToken, tenants[0].id, tenants)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error')
      if (accessToken) {
        void fetch('/api/v1/auth/native/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
        })
      }
    } finally {
      setBusy(false)
    }
  }

  async function submitCreateFirstTenant(e: React.FormEvent) {
    e.preventDefault()
    if (!tenantName.trim()) {
      setError('Please enter a tenant organization name')
      return
    }
    setBusy(true)
    setError('')
    try {
      const r = await fetch('/api/v1/tenants', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${pendingToken}`,
        },
        body: JSON.stringify({ name: tenantName.trim() }),
      })
      if (!r.ok) {
        throw new Error(`Failed to create tenant (HTTP ${r.status})`)
      }
      const newTenant: Tenant = await r.json()
      setPassword('')
      onLogin(pendingToken, newTenant.id, [newTenant])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create tenant')
    } finally {
      setBusy(false)
    }
  }

  if (needsTenant) {
    return (
      <main className="iq-login">
        <form className="iq-login-card" onSubmit={submitCreateFirstTenant}>
          <div style={{ textAlign: 'center', marginBottom: 8, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <img src={brandLogo} alt="ArchitectIQ" style={{ height: 46, maxWidth: 220, objectFit: 'contain' }} />
            {activeTheme && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 8, padding: '2px 8px', borderRadius: 12, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', fontSize: '0.68rem', color: 'var(--muted-foreground)' }}>
                <Palette size={11} style={{ opacity: 0.7 }} /> {activeTheme}
              </span>
            )}
          </div>
          <h2>Create Your First Tenant</h2>
          <p style={{ fontSize: '0.88rem', color: 'var(--text-muted, #94a3b8)', marginBottom: 16 }}>
            Signed in as <strong>{email}</strong>. No existing tenant organization was found.
            Name your primary organization to initialize your clean enterprise workspace.
          </p>
          <label>
            Organization / Tenant Name
            <input
              type="text"
              autoFocus
              required
              placeholder="e.g. Acme Corporation"
              value={tenantName}
              onChange={e => setTenantName(e.target.value)}
            />
          </label>
          {error && (
            <p role="alert" className="iq-error">
              {error}
            </p>
          )}
          <button disabled={busy} type="submit">
            {busy ? 'Initializing Tenant…' : 'Create Organization & Launch'}
          </button>
        </form>
      </main>
    )
  }

  return (
    <main className="iq-login">
      <form className="iq-login-card" onSubmit={submitLogin}>
        <div style={{ textAlign: 'center', marginBottom: 8, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <img src={brandLogo} alt="ArchitectIQ" style={{ height: 46, maxWidth: 220, objectFit: 'contain' }} />
          {activeTheme && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 8, padding: '2px 8px', borderRadius: 12, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', fontSize: '0.68rem', color: 'var(--muted-foreground)' }}>
              <Palette size={11} style={{ opacity: 0.7 }} /> {activeTheme}
            </span>
          )}
        </div>
        <h2>Sign in</h2>
        <label>
          Email
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className="iq-error">
            {error}
          </p>
        )}
        <button disabled={busy} type="submit">
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <small>
          Session stays available when refreshing this tab until the access token expires (15
          minutes).
        </small>
      </form>
    </main>
  )
}
