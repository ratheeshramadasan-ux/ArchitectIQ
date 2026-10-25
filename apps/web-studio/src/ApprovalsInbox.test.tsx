import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ApprovalsInbox from './ApprovalsInbox'

const sampleTasks = [
  {
    id: 'task-101-uuid',
    tenant_id: 'tenant-1',
    project_id: 'proj-1',
    run_id: 'run-1',
    title: 'Enterprise Software Purchase',
    description: 'Procurement order #5439',
    priority: 'HIGH' as const,
    status: 'PENDING' as const,
    required_role: 'ADMIN',
    payload: { vendor: 'Datadog', amount: 48000 },
    decision_payload: {},
    created_at: '2026-10-25T12:00:00Z',
  },
  {
    id: 'task-102-uuid',
    tenant_id: 'tenant-1',
    project_id: 'proj-1',
    title: 'Employee Laptop Request',
    priority: 'LOW' as const,
    status: 'APPROVED' as const,
    required_role: 'EDITOR',
    payload: { item: 'MacBook Pro' },
    decision_payload: {},
    resolved_at: '2026-10-25T12:30:00Z',
    resolution_notes: 'Standard allocation',
    created_at: '2026-10-25T11:00:00Z',
  },
]

const sampleRules = [
  {
    id: 'rule-201-uuid',
    tenant_id: 'tenant-1',
    project_id: 'proj-1',
    name: 'Transaction Approval Matrix',
    slug: 'transaction-approval-matrix',
    version: 1,
    status: 'PUBLISHED',
    rule_type: 'DECISION_TABLE',
    conditions_schema: [
      {
        row_id: 'row-1',
        conditions: [{ field: 'amount', operator: '>=', value: 10000 }],
      },
    ],
    actions_schema: [
      {
        row_id: 'row-1',
        action: { approval_required: true, routing: 'VP_FINANCE' },
      },
    ],
    created_at: '2026-10-25T10:00:00Z',
  },
]

describe('ApprovalsInbox — M7 Human Approvals & Rules Engine Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    globalThis.fetch = vi.fn().mockImplementation((url: string | URL | Request, init?: RequestInit) => {
      const urlStr = String(url)
      const method = init?.method || 'GET'

      if (urlStr.includes('/approvals/task-101-uuid/resolve') && method === 'POST') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              ...sampleTasks[0],
              status: 'APPROVED',
              resolved_at: '2026-10-25T13:00:00Z',
              resolution_notes: 'Signoff authorized',
            }),
        })
      }

      if (urlStr.includes('/rules/rule-201-uuid/evaluate') && method === 'POST') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              rule_id: 'rule-201-uuid',
              rule_name: 'Transaction Approval Matrix',
              matched: true,
              matched_rows_count: 1,
              results: [{ approval_required: true, routing: 'VP_FINANCE' }],
              evaluated_at: '2026-10-25T13:00:00Z',
            }),
        })
      }

      if (urlStr.includes('/projects/proj-1/rules')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(sampleRules),
        })
      }

      if (urlStr.includes('/approvals')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(sampleTasks),
        })
      }

      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve([]),
      })
    })
  })

  it('renders approvals header, task list, and details', async () => {
    render(
      <ApprovalsInbox
        token="test-token"
        tenant="tenant-uuid-1"
        projectId="proj-1"
      />
    )

    expect(screen.getByText('Approvals & Business Rules')).toBeDefined()
    expect(screen.getByText(/GOVERNANCE CONTROL PLANE/i)).toBeDefined()

    await waitFor(() => {
      expect(screen.getAllByText('Enterprise Software Purchase').length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText('Procurement order #5439')).toBeDefined()
      expect(screen.getByText('Approve Request')).toBeDefined()
      expect(screen.getByText('Reject')).toBeDefined()
    })
  })

  it('approves a task request via resolution modal dialog', async () => {
    render(
      <ApprovalsInbox
        token="test-token"
        tenant="tenant-uuid-1"
        projectId="proj-1"
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Approve Request')).toBeDefined()
    })

    fireEvent.click(screen.getByText('Approve Request'))

    expect(screen.getByText('Approve Task Request')).toBeDefined()

    const notesInput = screen.getByLabelText('Resolution audit notes')
    fireEvent.change(notesInput, { target: { value: 'Approved by Enterprise Controller' } })

    const confirmBtn = screen.getByText('Confirm Approval')
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(screen.getByText(/Task successfully approved!/i)).toBeDefined()
    })
  })

  it('switches to Rules tab and evaluates decision table simulator', async () => {
    render(
      <ApprovalsInbox
        token="test-token"
        tenant="tenant-uuid-1"
        projectId="proj-1"
      />
    )

    // Click "Decision Tables & Rules" tab
    const rulesTabBtn = screen.getByText('Decision Tables & Rules')
    fireEvent.click(rulesTabBtn)

    await waitFor(() => {
      expect(screen.getAllByText('Transaction Approval Matrix').length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText('Interactive Rule Simulator')).toBeDefined()
    })

    // Click "Evaluate Rules" button
    const evalBtn = screen.getByText('Evaluate Rules')
    fireEvent.click(evalBtn)

    await waitFor(() => {
      expect(screen.getByText(/Evaluation Output Verdict:/i)).toBeDefined()
      expect(screen.getAllByText(/VP_FINANCE/i).length).toBeGreaterThanOrEqual(1)
    })
  })
})
