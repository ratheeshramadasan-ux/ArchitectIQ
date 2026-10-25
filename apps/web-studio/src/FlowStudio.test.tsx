import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import FlowStudio from './FlowStudio'

// Polyfill ResizeObserver for React Flow in JSDOM
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverMock

const sampleWorkflows = [
  {
    id: 'wf-1',
    name: 'Invoice Processing Pipeline',
    current_version: 1,
    status: 'DRAFT',
  },
]

const sampleWorkflowDetail = {
  id: 'wf-1',
  name: 'Invoice Processing Pipeline',
  current_version: 1,
  status: 'DRAFT',
  definition: {
    nodes: [
      {
        id: 'node-trigger-1',
        type: 'TRIGGER',
        label: 'HTTP Webhook Received',
        config: { path: '/webhooks/invoice' },
        position: { x: 50, y: 150 },
      },
      {
        id: 'node-action-1',
        type: 'AI_AGENT',
        label: 'Extract Invoice Fields',
        config: { model: 'gemini-1.5-pro' },
        position: { x: 300, y: 150 },
      },
    ],
    edges: [
      {
        id: 'e-1',
        source: 'node-trigger-1',
        target: 'node-action-1',
      },
    ],
    variables: [
      {
        name: 'invoice_id',
        type: 'string',
        default_value: '',
        is_secret: false,
      },
    ],
  },
}

describe('FlowStudio — M5 Workflow Designer & Canonical Schema Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    globalThis.fetch = vi.fn().mockImplementation((url: string | URL | Request, init?: RequestInit) => {
      const urlStr = String(url)
      const method = init?.method || 'GET'

      if (urlStr.includes('/workflows/wf-1/validate') && method === 'POST') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              is_valid: true,
              errors: [],
              warnings: [],
              node_count: 2,
              edge_count: 1,
            }),
        })
      }

      if (urlStr.includes('/workflows/wf-1/draft') && method === 'PUT') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              id: 'wf-1',
              current_version: 2,
              status: 'DRAFT',
            }),
        })
      }

      if (urlStr.includes('/workflows/wf-1/publish') && method === 'POST') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              id: 'wf-1',
              version: 2,
              status: 'PUBLISHED',
            }),
        })
      }

      if (urlStr.includes('/workflows/wf-1/versions')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve([
              { id: 'v-1', version: 1, status: 'PUBLISHED', change_summary: 'Initial release' },
              { id: 'v-2', version: 2, status: 'PUBLISHED', change_summary: 'Production deploy' },
            ]),
        })
      }

      if (urlStr.includes('/workflows/wf-1')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(sampleWorkflowDetail),
        })
      }

      if (urlStr.includes('/projects/proj-1/workflows')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(sampleWorkflows),
        })
      }

      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve([]),
      })
    })
  })

  it('renders workflow canvas, topbar controls, and palette', async () => {
    render(
      <FlowStudio
        token="test-token"
        tenant="tenant-uuid-1"
        projectId="proj-1"
        workflowId="wf-1"
      />
    )

    // Palette heading and chips
    expect(screen.getByText('Node Palette')).toBeDefined()
    expect(screen.getByText('Trigger')).toBeDefined()
    expect(screen.getByText('Action')).toBeDefined()
    expect(screen.getByText('AI Agent')).toBeDefined()
    expect(screen.getByText('Decision')).toBeDefined()

    // Inspector tabs
    expect(screen.getByText('Properties')).toBeDefined()
    expect(screen.getByText('Variables')).toBeDefined()
    expect(screen.getByText('Validation')).toBeDefined()
    expect(screen.getAllByText('Versions').length).toBeGreaterThanOrEqual(1)

    // Loaded workflow title in top bar
    await waitFor(() => {
      expect(screen.getByText('Invoice Processing Pipeline')).toBeDefined()
    })
  })

  it('adds a new node to the canvas from the component palette', async () => {
    render(
      <FlowStudio
        token="test-token"
        tenant="tenant-uuid-1"
        projectId="proj-1"
        workflowId="wf-1"
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Invoice Processing Pipeline')).toBeDefined()
    })

    // Click "Decision" chip in palette
    const addDecisionBtn = screen.getByText('Decision')
    fireEvent.click(addDecisionBtn)

    // Verify Decision node added to state (palette + node on canvas)
    await waitFor(() => {
      expect(screen.getAllByText('Decision').length).toBeGreaterThanOrEqual(2)
    })
  })

  it('validates workflow graph and reports validity in inspector', async () => {
    render(
      <FlowStudio
        token="test-token"
        tenant="tenant-uuid-1"
        projectId="proj-1"
        workflowId="wf-1"
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Invoice Processing Pipeline')).toBeDefined()
    })

    // Wait until nodes are loaded before clicking validate
    await waitFor(() => {
      expect(screen.getByText('HTTP Webhook Received')).toBeDefined()
    })

    const validateBtn = screen.getByText('Validate')
    fireEvent.click(validateBtn)

    await waitFor(() => {
      expect(screen.getByText('Workflow graph is valid')).toBeDefined()
      expect(screen.getByText('Graph is Valid for Publishing')).toBeDefined()
    })
  })

  it('saves draft with serialized workflow definition', async () => {
    render(
      <FlowStudio
        token="test-token"
        tenant="tenant-uuid-1"
        projectId="proj-1"
        workflowId="wf-1"
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Invoice Processing Pipeline')).toBeDefined()
    })

    const saveDraftBtn = screen.getByText('Save Draft')
    fireEvent.click(saveDraftBtn)

    await waitFor(() => {
      expect(screen.getByText(/Saved draft v2/i)).toBeDefined()
    })
  })

  it('publishes workflow version via modal dialog', async () => {
    render(
      <FlowStudio
        token="test-token"
        tenant="tenant-uuid-1"
        projectId="proj-1"
        workflowId="wf-1"
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Invoice Processing Pipeline')).toBeDefined()
    })

    const openPublishBtn = screen.getByText('Publish')
    fireEvent.click(openPublishBtn)

    expect(screen.getByText('Publish Workflow Version')).toBeDefined()

    const summaryInput = screen.getByLabelText('Change summary')
    fireEvent.change(summaryInput, { target: { value: 'Production ready v2' } })

    const confirmPublishBtn = screen.getByText('Confirm Publish')
    fireEvent.click(confirmPublishBtn)

    await waitFor(() => {
      expect(screen.getByText(/Successfully published v2!/i)).toBeDefined()
    })
  })
})
