import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ProcessCaptureStudio from './ProcessCaptureStudio'

const mockAgents = [
  {
    id: 'agent-1',
    agent_hostname: 'DESKTOP-TREASURY-01',
    os_version: 'Windows 11 Enterprise',
    agent_version: '1.0.0',
    status: 'ONLINE',
    last_heartbeat_at: new Date().toISOString(),
  },
]

const mockSessions = [
  {
    id: 'sess-rec',
    tenant_id: 'tenant-123',
    name: 'Live Treasury Recording',
    target_application: 'Treasury Desk',
    environment_name: 'DEV',
    status: 'RECORDING',
    total_steps: 2,
    duration_ms: 12000,
    consent_obtained: true,
    consent_operator_name: 'Operator Ratheesh',
    created_at: new Date().toISOString(),
  },
  {
    id: 'sess-done',
    tenant_id: 'tenant-123',
    name: 'Completed Invoice Extraction',
    target_application: 'SAP GUI',
    environment_name: 'PROD',
    status: 'COMPLETED',
    total_steps: 3,
    duration_ms: 45000,
    consent_obtained: true,
    consent_operator_name: 'Operator Ratheesh',
    created_at: new Date().toISOString(),
  },
]

const mockEvents = [
  {
    id: 'ev-1',
    session_id: 'sess-rec',
    monotonic_offset_ms: 1500,
    sequence_number: 1,
    event_type: 'UI_CLICK',
    process_name: 'saplogon.exe',
    window_title: 'SAP Easy Access',
    ui_element_metadata: {
      automation_id: 'btn_post',
      control_type: 'Button',
      name: 'Post Document',
    },
    interaction_coordinates: { x: 450, y: 320 },
    evidence_id: 'evid-1',
    is_redacted: false,
    is_approved: false,
    created_at: new Date().toISOString(),
  },
  {
    id: 'ev-2',
    session_id: 'sess-rec',
    monotonic_offset_ms: 3200,
    sequence_number: 2,
    event_type: 'UI_INPUT',
    process_name: 'saplogon.exe',
    window_title: 'Enter G/L Account',
    ui_element_metadata: {
      automation_id: 'txt_pwd',
      control_type: 'Edit',
      name: 'Password',
      is_password: true,
      sanitized_input_value: '[REDACTED_PASSWORD_FIELD]',
    },
    interaction_coordinates: { x: 500, y: 400 },
    is_redacted: true,
    redaction_reason: 'Password element detected',
    is_approved: false,
    created_at: new Date().toISOString(),
  },
]

const mockEvidence = {
  evidence_id: 'evid-1',
  evidence_type: 'KEYFRAME',
  mime_type: 'image/png',
  base64_data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  byte_size: 100,
  metadata: { screen_width: 1920, screen_height: 1080 },
}

describe('ProcessCaptureStudio', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    globalThis.fetch = vi.fn().mockImplementation((url: string, init?: any) => {
      if (url.includes('/discovery')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              agent_id: 'agent-1',
              applications: [
                {
                  application_id: 'app-excel',
                  display_name: 'Microsoft Excel',
                  process_name: 'excel.exe',
                  publisher: 'Microsoft Corporation',
                  publisher_verified: true,
                  policy: 'ALLOW',
                  windows: [
                    { window_id: 'w1', title: 'Ledger_Reconciliation.xlsx', is_foreground: true, capture_allowed: true },
                  ],
                  capture_capabilities: ['SCREEN', 'UI_ELEMENTS'],
                },
              ],
            }),
        })
      }
      if (url.includes('/policies/effective')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              tenant_id: 'tenant-123',
              mandatory_pii_rules: [
                { rule_id: 'r1', rule_name: 'Password Masking', pattern_type: 'UI_PASSWORD', is_mandatory: true },
                { rule_id: 'r2', rule_name: 'PCI PAN', pattern_type: 'LUHN_CARD', is_mandatory: true },
              ],
              prohibited_executables: ['1password.exe', 'bitwarden.exe'],
              retention_days_ceiling: 90,
            }),
        })
      }
      if (url.includes('/redactions')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(init?.method === 'POST' ? { id: 'red-1', status: 'SAVED' } : []),
        })
      }
      if (url.includes('/api/v1/capture/agents')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockAgents),
        })
      }
      if (url.includes('/events') && (!init || !init.method || init.method === 'GET')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockEvents),
        })
      }
      if (url.includes('/evidence/')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockEvidence),
        })
      }
      if (url.includes('/synthesize-flow')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              workflow_id: 'wf-synthesized-1',
              workflow_name: 'Automated: Live Treasury Recording',
              synthesized_nodes_count: 3,
            }),
        })
      }
      if (url.includes('/api/v1/capture/sessions') && init?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              id: 'sess-new',
              name: 'Newly Created Session',
              status: 'DRAFT',
              total_steps: 0,
              created_at: new Date().toISOString(),
            }),
        })
      }
      if (url.includes('/api/v1/capture/sessions') && (!init || init.method === 'GET' || !init.method)) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockSessions),
        })
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      })
    })
  })

  it('renders Process Capture Studio with connected agent status', async () => {
    render(
      <ProcessCaptureStudio
        token="test-token"
        tenant={{ id: 'tenant-123', name: 'Banking Operations' }}
      />
    )

    expect(screen.getByText('Process Capture Studio')).toBeDefined()
    await waitFor(() => {
      expect(screen.getByText(/Agent: DESKTOP-TREASURY-01/i)).toBeDefined()
      expect(screen.getAllByText('Live Treasury Recording').length).toBeGreaterThanOrEqual(1)
    })
  })

  it('displays sticky recording banner when recording session is active', async () => {
    render(
      <ProcessCaptureStudio
        token="test-token"
        tenant={{ id: 'tenant-123', name: 'Banking Operations' }}
      />
    )

    await waitFor(() => {
      expect(screen.getByText(/ArchitectIQ Governed Recording Active/i)).toBeDefined()
      expect(screen.getByText(/Pause/i)).toBeDefined()
      expect(screen.getByText(/Stop & Finalize/i)).toBeDefined()
    })
  })

  it('renders step events, shows redacted password indicator, and scrub slider', async () => {
    render(
      <ProcessCaptureStudio
        token="test-token"
        tenant={{ id: 'tenant-123', name: 'Banking Operations' }}
      />
    )

    await waitFor(() => {
      expect(screen.getByText(/Post Document/i)).toBeDefined()
      expect(screen.getByText(/\[REDACTED_PASSWORD_FIELD\]/i)).toBeDefined()
    })

    // Advance slider or click step card
    const stepCards = screen.getAllByText(/saplogon\.exe/i)
    expect(stepCards.length).toBeGreaterThan(0)
    fireEvent.click(stepCards[1])

    await waitFor(() => {
      expect(screen.getByText(/Redacted Keyframe/i)).toBeDefined()
    })
  })

  it('enforces operator consent before allowing session creation', async () => {
    render(
      <ProcessCaptureStudio
        token="test-token"
        tenant={{ id: 'tenant-123', name: 'Banking Operations' }}
      />
    )

    // Open modal
    const newSessionBtn = screen.getByRole('button', { name: /\+ New Session|New Session/i })
    fireEvent.click(newSessionBtn)

    expect(screen.getByText('Create Process Capture Session')).toBeDefined()
    const submitBtn = screen.getByRole('button', { name: /Create Session/i })
    expect(submitBtn.hasAttribute('disabled')).toBe(true)

    // Confirm consent checkbox
    const consentCheck = screen.getByLabelText(/Operator Recording Consent/i)
    fireEvent.click(consentCheck)

    expect(submitBtn.hasAttribute('disabled')).toBe(false)
  })

  it('triggers Flow Studio synthesis on completed session', async () => {
    const onNavigate = vi.fn()
    render(
      <ProcessCaptureStudio
        token="test-token"
        tenant={{ id: 'tenant-123', name: 'Banking Operations' }}
        onNavigateFlowStudio={onNavigate}
      />
    )

    // Select the completed session
    await waitFor(() => {
      expect(screen.getByText('Completed Invoice Extraction')).toBeDefined()
    })
    fireEvent.click(screen.getByText('Completed Invoice Extraction'))

    await waitFor(() => {
      expect(screen.getByText(/Export to Flow Studio/i)).toBeDefined()
    })

    fireEvent.click(screen.getByText(/Export to Flow Studio/i))

    await waitFor(() => {
      expect(screen.getByText(/Workflow Successfully Synthesized!/i)).toBeDefined()
      expect(screen.getByText(/Open in Flow Studio/i)).toBeDefined()
    })

    fireEvent.click(screen.getByText(/Open in Flow Studio/i))
    expect(onNavigate).toHaveBeenCalledWith('wf-synthesized-1')
  })

  it('navigates through the 5-step guided wizard and renders policy guardrails', async () => {
    render(
      <ProcessCaptureStudio
        token="test-token"
        tenant={{ id: 'tenant-123', name: 'Banking Operations' }}
      />
    )

    // Open wizard
    const newSessionBtn = screen.getByRole('button', { name: /\+ New Session|New Session/i })
    fireEvent.click(newSessionBtn)

    // Step 1: Context
    expect(screen.getByText('1. Context')).toBeDefined()
    expect(screen.getByPlaceholderText(/Treasury G\/L Account Posting/i)).toBeDefined()

    // Step 2: Apps
    fireEvent.click(screen.getByText('2. Apps'))
    await waitFor(() => {
      expect(screen.getByText(/Discovered Applications on Selected Endpoint/i)).toBeDefined()
    })

    // Step 3: Profile
    fireEvent.click(screen.getByText('3. Profile'))
    expect(screen.getByText('Balanced Interactive')).toBeDefined()
    expect(screen.getByText('High-Precision Audit')).toBeDefined()

    // Step 4: Privacy
    fireEvent.click(screen.getByText('4. Privacy'))
    expect(screen.getByText(/Mandatory Platform Privacy Controls/i)).toBeDefined()
    expect(screen.getByText(/UI Password Suppression/i)).toBeDefined()

    // Step 5: Review
    fireEvent.click(screen.getByText('5. Review'))
    expect(screen.getByText(/Capture Configuration Summary/i)).toBeDefined()
  })

  it('opens and submits evidence solid-black redaction editor', async () => {
    render(
      <ProcessCaptureStudio
        token="test-token"
        tenant={{ id: 'tenant-123', name: 'Banking Operations' }}
      />
    )

    await waitFor(() => {
      expect(screen.getByText(/Solid-Black Redactor/i)).toBeDefined()
    })

    fireEvent.click(screen.getByText(/Solid-Black Redactor/i))
    expect(screen.getByText(/Solid-Black Evidence Redaction Editor/i)).toBeDefined()

    const applyBtn = screen.getByRole('button', { name: /Apply Permanent Redaction/i })
    fireEvent.click(applyBtn)

    await waitFor(() => {
      expect(screen.queryByText(/Solid-Black Evidence Redaction Editor/i)).toBeNull()
    })
  })

  it('inspects effective policy governance dialog', async () => {
    render(
      <ProcessCaptureStudio
        token="test-token"
        tenant={{ id: 'tenant-123', name: 'Banking Operations' }}
      />
    )

    const govBtn = screen.getByRole('button', { name: /Policy Governance/i })
    fireEvent.click(govBtn)

    expect(screen.getByText(/Effective Capture Policy & Governance/i)).toBeDefined()
    expect(screen.getByText(/Platform Baseline Hierarchy/i)).toBeDefined()
  })
})
