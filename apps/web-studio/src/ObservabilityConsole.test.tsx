import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ObservabilityConsole from './ObservabilityConsole'

const sampleOverview = {
  throughput_24h: 3840,
  error_rate_pct: 0.12,
  avg_queue_latency_ms: 24.6,
  active_workers_count: 6,
  sla_health_pct: 99.4,
  open_incidents: { 'SEV-1': 0, 'SEV-2': 1, 'SEV-3': 2, 'SEV-4': 0 },
  generated_at: '2026-10-25T14:00:00Z',
}

const sampleMetrics = [
  {
    id: 'met-1',
    tenant_id: 'tenant-1',
    metric_name: 'workflow.throughput',
    metric_value: 3840,
    dimensions: { cluster: 'us-east-1' },
    timestamp: '2026-10-25T14:00:00Z',
  },
]

const sampleIncidents = [
  {
    id: 'inc-101',
    tenant_id: 'tenant-1',
    title: 'Payment Webhook Latency Spike',
    severity: 'SEV-2',
    status: 'OPEN',
    summary: 'Stripe webhook listener reporting delayed ACKs exceeding 4500ms.',
    affected_resource_id: 'conn-stripe-core',
    assigned_to: 'sre-lead@architectiq.test',
    resolution_notes: '',
    created_at: '2026-10-25T13:45:00Z',
    updated_at: '2026-10-25T13:45:00Z',
  },
]

const sampleRunbooks = [
  {
    id: 'rb-201',
    tenant_id: 'tenant-1',
    name: 'Stalled Queue Drain & Worker Refresh',
    slug: 'stalled-queue-drain',
    category: 'WORKER_DRAIN',
    description: 'Flushes hung leasing locks and refreshes consumer workers.',
    steps: [
      { name: 'Prune Dead Workers', command: 'architectiq workers prune --stale 120' },
      { name: 'Restart Worker Pool', command: 'systemctl restart architectiq-worker-pool' },
    ],
    is_automated: true,
    last_executed_at: undefined,
    created_at: '2026-10-25T12:00:00Z',
    updated_at: '2026-10-25T12:00:00Z',
  },
]

const sampleSLABreaches = [
  {
    id: 'sla-301',
    tenant_id: 'tenant-1',
    target_type: 'APPROVAL_TASK',
    target_id: 'appr-exec-901',
    expected_sla_seconds: 3600,
    actual_duration_seconds: 5200,
    breach_severity: 'HIGH',
    status: 'ACTIVE',
    created_at: '2026-10-25T13:00:00Z',
  },
]

describe('ObservabilityConsole Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks()

    globalThis.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      const urlStr = String(url)
      const method = init?.method || 'GET'

      if (urlStr.includes('/observability/overview')) {
        return Promise.resolve({
          ok: true,
          json: async () => sampleOverview,
        } as unknown as Response)
      }

      if (urlStr.includes('/observability/metrics')) {
        return Promise.resolve({
          ok: true,
          json: async () => sampleMetrics,
        } as unknown as Response)
      }

      if (urlStr.includes('/observability/incidents/') && method === 'PATCH') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            ...sampleIncidents[0],
            status: 'INVESTIGATING',
            resolution_notes: 'Under active diagnosis.',
          }),
        } as unknown as Response)
      }

      if (urlStr.includes('/observability/incidents')) {
        return Promise.resolve({
          ok: true,
          json: async () => sampleIncidents,
        } as unknown as Response)
      }

      if (urlStr.includes('/observability/runbooks/') && urlStr.includes('/execute')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            runbook_id: 'rb-201',
            runbook_name: 'Stalled Queue Drain & Worker Refresh',
            status: 'COMPLETED',
            duration_ms: 48,
            logs: [
              '[INIT] Starting remediation...',
              'Step 1: Prune Dead Workers ... OK',
              'Step 2: Restart Worker Pool ... OK',
              'Remediation completed successfully.',
            ],
            executed_at: '2026-10-25T14:10:00Z',
          }),
        } as unknown as Response)
      }

      if (urlStr.includes('/observability/runbooks')) {
        return Promise.resolve({
          ok: true,
          json: async () => sampleRunbooks,
        } as unknown as Response)
      }

      if (urlStr.includes('/observability/sla-breaches')) {
        return Promise.resolve({
          ok: true,
          json: async () => sampleSLABreaches,
        } as unknown as Response)
      }

      return Promise.resolve({
        ok: true,
        json: async () => [],
      } as unknown as Response)
    })
  })

  it('renders Overview tab with KPI gauges and telemetry metrics stream', async () => {
    render(<ObservabilityConsole token="fake-token" tenant="tenant-1" />)

    await waitFor(() => {
      expect(screen.getAllByText('3,840').length).toBeGreaterThanOrEqual(1)
    })

    expect(screen.getByText('0.12%')).toBeDefined()
    expect(screen.getByText('24.6ms')).toBeDefined()
    expect(screen.getByText('99.4%')).toBeDefined()
    expect(screen.getAllByText('workflow.throughput').length).toBeGreaterThanOrEqual(1)
  })

  it('navigates to Incident Management and transitions incident state to INVESTIGATING', async () => {
    render(<ObservabilityConsole token="fake-token" tenant="tenant-1" />)

    // Switch to Incidents tab
    fireEvent.click(screen.getByRole('button', { name: /Incident Management/i }))

    await waitFor(() => {
      expect(screen.getAllByText('Payment Webhook Latency Spike').length).toBeGreaterThanOrEqual(1)
    })

    // Click Mark Investigating
    const markBtn = screen.getByRole('button', { name: /Mark Investigating/i })
    fireEvent.click(markBtn)

    await waitFor(() => {
      expect(screen.getByText(/Incident marked as INVESTIGATING!/i)).toBeDefined()
    })
  })

  it('navigates to Runbook Automation and executes automated remediation', async () => {
    render(<ObservabilityConsole token="fake-token" tenant="tenant-1" />)

    // Switch to Runbooks tab
    fireEvent.click(screen.getByRole('button', { name: /Runbook Automation/i }))

    await waitFor(() => {
      expect(screen.getAllByText('Stalled Queue Drain & Worker Refresh').length).toBeGreaterThanOrEqual(1)
    })

    // Click Execute Runbook Remediation
    const execBtn = screen.getByRole('button', { name: /Execute Runbook Remediation/i })
    fireEvent.click(execBtn)

    await waitFor(() => {
      expect(screen.getByText(/Runbook execution COMPLETED/i)).toBeDefined()
    })

    expect(screen.getByText(/Step 1: Prune Dead Workers ... OK/i)).toBeDefined()
  })
})
