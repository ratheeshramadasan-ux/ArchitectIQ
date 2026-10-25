import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import JobsMonitor from './JobsMonitor'

const sampleRuns = [
  {
    id: 'run-101-uuid',
    tenant_id: 'tenant-1',
    project_id: 'proj-1',
    workflow_id: 'wf-1',
    workflow_version: 1,
    status: 'COMPLETED' as const,
    trigger_type: 'MANUAL',
    trigger_payload: { order_id: '123' },
    started_at: '2026-10-25T12:00:00Z',
    completed_at: '2026-10-25T12:00:02Z',
    duration_ms: 240,
    retry_count: 0,
    created_at: '2026-10-25T12:00:00Z',
  },
  {
    id: 'run-102-uuid',
    tenant_id: 'tenant-1',
    project_id: 'proj-1',
    workflow_id: 'wf-1',
    workflow_version: 1,
    status: 'SUSPENDED' as const,
    trigger_type: 'MANUAL',
    trigger_payload: { amount: 50000 },
    started_at: '2026-10-25T12:05:00Z',
    retry_count: 0,
    created_at: '2026-10-25T12:05:00Z',
  },
  {
    id: 'run-103-uuid',
    tenant_id: 'tenant-1',
    project_id: 'proj-1',
    workflow_id: 'wf-1',
    workflow_version: 1,
    status: 'FAILED' as const,
    trigger_type: 'MANUAL',
    trigger_payload: {},
    error_message: 'Gateway connection timed out',
    retry_count: 1,
    created_at: '2026-10-25T12:10:00Z',
  },
]

const sampleRunDetail = {
  ...sampleRuns[0],
  execution_context: {
    workflow_id: 'wf-1',
    version: 1,
    node_trigger_1: { trigger_received: true },
    node_action_1: { action: 'Process Payment', status: 'ok' },
  },
  steps: [
    {
      id: 'step-1',
      node_id: 'node-trigger-1',
      node_type: 'TRIGGER',
      status: 'COMPLETED' as const,
      input_payload: {},
      output_payload: { trigger_received: true },
      retry_count: 0,
      duration_ms: 12,
      created_at: '2026-10-25T12:00:00Z',
    },
    {
      id: 'step-2',
      node_id: 'node-action-1',
      node_type: 'ACTION',
      status: 'COMPLETED' as const,
      input_payload: { order: '123' },
      output_payload: { action: 'Process Payment', status: 'ok' },
      retry_count: 0,
      duration_ms: 180,
      created_at: '2026-10-25T12:00:01Z',
    },
  ],
}

const sampleQueues = [
  {
    id: 'q-1',
    run_id: 'run-101-uuid',
    queue_name: 'default',
    priority: 0,
    status: 'COMPLETED',
    attempts: 1,
    max_attempts: 3,
    created_at: '2026-10-25T12:00:00Z',
  },
]

describe('JobsMonitor — M6 Durable Execution & Orchestration Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    globalThis.fetch = vi.fn().mockImplementation((url: string | URL | Request, init?: RequestInit) => {
      const urlStr = String(url)
      const method = init?.method || 'GET'

      if (urlStr.includes('/runs/run-101-uuid/cancel') && method === 'POST') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ ...sampleRuns[0], status: 'CANCELLED' }),
        })
      }

      if (urlStr.includes('/runs/run-102-uuid/resume') && method === 'POST') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ ...sampleRuns[1], status: 'COMPLETED' }),
        })
      }

      if (urlStr.includes('/runs/run-103-uuid/retry') && method === 'POST') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ ...sampleRuns[2], status: 'RUNNING', retry_count: 2 }),
        })
      }

      if (urlStr.includes('/runs/run-102-uuid')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              ...sampleRuns[1],
              steps: [
                {
                  id: 's-approval',
                  node_id: 'approval-gate',
                  node_type: 'APPROVAL',
                  status: 'PENDING',
                  input_payload: {},
                  output_payload: {},
                  retry_count: 0,
                  created_at: '2026-10-25T12:05:00Z',
                },
              ],
            }),
        })
      }

      if (urlStr.includes('/runs/run-101-uuid')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(sampleRunDetail),
        })
      }

      if (urlStr.includes('/projects/proj-1/runs')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(sampleRuns),
        })
      }

      if (urlStr.includes('/queues')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(sampleQueues),
        })
      }

      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve([]),
      })
    })
  })

  it('renders execution engine header, queue depth, and runs list', async () => {
    render(
      <JobsMonitor
        token="test-token"
        tenant="tenant-uuid-1"
        projectId="proj-1"
      />
    )

    expect(screen.getByText('Jobs & Orchestration Engine')).toBeDefined()
    expect(screen.getByText(/DURABLE RUNTIME/i)).toBeDefined()

    await waitFor(() => {
      expect(screen.getByText('Execution History (3)')).toBeDefined()
      expect(screen.getByText(/Queue Depth:/i)).toBeDefined()
      expect(screen.getByText('1')).toBeDefined()
    })
  })

  it('selects a run and inspects step timeline and execution context', async () => {
    render(
      <JobsMonitor
        token="test-token"
        tenant="tenant-uuid-1"
        projectId="proj-1"
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Execution Step Timeline')).toBeDefined()
      expect(screen.getByText('node-trigger-1')).toBeDefined()
      expect(screen.getByText('node-action-1')).toBeDefined()
      expect(screen.getByText(/Runtime Context & Variables/i)).toBeDefined()
    })
  })

  it('resolves approval gate on a suspended run and resumes execution', async () => {
    render(
      <JobsMonitor
        token="test-token"
        tenant="tenant-uuid-1"
        projectId="proj-1"
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Execution History (3)')).toBeDefined()
    })

    // Click on the second run (SUSPENDED)
    const suspendedButtons = screen.getAllByText('Run v1')
    fireEvent.click(suspendedButtons[1])

    await waitFor(() => {
      expect(screen.getByText('Resolve Approval')).toBeDefined()
    })

    // Click Resolve Approval
    fireEvent.click(screen.getByText('Resolve Approval'))

    expect(screen.getByText('Resolve Approval Gate')).toBeDefined()

    const notesArea = screen.getByLabelText('Resolution notes')
    fireEvent.change(notesArea, { target: { value: 'Approved by CFO' } })

    const confirmBtn = screen.getByText('Approve & Resume Execution')
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(screen.getByText(/Suspended run resumed and completed!/i)).toBeDefined()
    })
  })

  it('cancels an active run from the control bar', async () => {
    render(
      <JobsMonitor
        token="test-token"
        tenant="tenant-uuid-1"
        projectId="proj-1"
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Execution History (3)')).toBeDefined()
    })

    // Select the suspended/active run
    const runButtons = screen.getAllByText('Run v1')
    fireEvent.click(runButtons[1])

    await waitFor(() => {
      expect(screen.getByText('Cancel Run')).toBeDefined()
    })

    fireEvent.click(screen.getByText('Cancel Run'))

    await waitFor(() => {
      expect(screen.getByText(/Run cancelled successfully/i)).toBeDefined()
    })
  })
})
