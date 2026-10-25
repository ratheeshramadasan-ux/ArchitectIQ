import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import DocumentStudio from './DocumentStudio'

const sampleDocuments = [
  {
    id: 'doc-101-uuid',
    tenant_id: 'tenant-1',
    project_id: 'proj-1',
    file_name: 'Acme_Invoice_Oct2026.pdf',
    mime_type: 'application/pdf',
    file_size_bytes: 1048576,
    storage_path: 's3://docs/invoice.pdf',
    status: 'REVIEW_REQUIRED',
    classification: 'Accounts Payable Invoice',
    page_count: 2,
    raw_text: 'INVOICE INV-984210 Total $14,500.00 Acme Systems',
    extracted_entities: {
      vendor_name: { value: 'Acme Systems', confidence: 0.95, type: 'string' },
      total_amount: { value: '$14,500.00', confidence: 0.92, type: 'currency' },
      tax_id: { value: 'XX-9941', confidence: 0.65, type: 'string' },
    },
    overall_confidence: 0.84,
    created_at: '2026-10-25T12:00:00Z',
    updated_at: '2026-10-25T12:00:00Z',
  },
]

const sampleAnnotations = [
  {
    id: 'ann-201-uuid',
    tenant_id: 'tenant-1',
    document_id: 'doc-101-uuid',
    field_name: 'tax_id',
    extracted_value: 'XX-9941',
    corrected_value: null,
    is_corrected: false,
    status: 'PENDING',
    created_at: '2026-10-25T12:05:00Z',
  },
]

const sampleSchemas = [
  {
    id: 'schema-1',
    tenant_id: 'tenant-1',
    project_id: 'proj-1',
    name: 'Accounts Payable Schema',
    slug: 'ap-schema',
    fields_schema: [
      { name: 'vendor_name', type: 'string' },
      { name: 'total_amount', type: 'currency' },
    ],
    confidence_threshold: 0.85,
    status: 'ACTIVE',
    created_at: '2026-10-25T10:00:00Z',
    updated_at: '2026-10-25T10:00:00Z',
  },
]

describe('DocumentStudio — M9 Document AI Lifecycle Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    globalThis.fetch = vi.fn().mockImplementation((url: string | URL | Request, init?: RequestInit) => {
      const urlStr = String(url)
      const method = init?.method || 'GET'

      if (urlStr.includes('/documents/doc-101-uuid/extract') && method === 'POST') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              ...sampleDocuments[0],
              status: 'COMPLETED',
              overall_confidence: 0.94,
            }),
        })
      }

      if (urlStr.includes('/annotations/ann-201-uuid/resolve') && method === 'POST') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              ...sampleAnnotations[0],
              status: 'CORRECTED',
              corrected_value: 'US-9941-VALIDATED',
              is_corrected: true,
            }),
        })
      }

      if (urlStr.includes('/documents/doc-101-uuid/annotations')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(sampleAnnotations),
        })
      }

      if (urlStr.includes('/projects/proj-1/document-schemas')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(sampleSchemas),
        })
      }

      if (urlStr.includes('/projects/proj-1/documents')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(sampleDocuments),
        })
      }

      if (urlStr.includes('/documents/doc-101-uuid')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(sampleDocuments[0]),
        })
      }

      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve([]),
      })
    })
  })

  it('renders document studio header, queue, and raw text stream', async () => {
    render(
      <DocumentStudio
        token="test-token"
        tenant="tenant-uuid-1"
        projectId="proj-1"
      />
    )

    expect(screen.getByText('Document Intelligence Studio')).toBeDefined()
    expect(screen.getByText(/INTELLIGENT DOCUMENT PROCESSING/i)).toBeDefined()

    await waitFor(() => {
      expect(screen.getAllByText('Acme_Invoice_Oct2026.pdf').length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText(/Raw OCR Text Stream/i)).toBeDefined()
      expect(screen.getByText('Run Extraction')).toBeDefined()
    })
  })

  it('runs extraction on selected document and displays success feedback', async () => {
    render(
      <DocumentStudio
        token="test-token"
        tenant="tenant-uuid-1"
        projectId="proj-1"
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Run Extraction')).toBeDefined()
    })

    fireEvent.click(screen.getByText('Run Extraction'))

    await waitFor(() => {
      expect(screen.getByText(/Extraction finished! Status: COMPLETED/i)).toBeDefined()
    })
  })

  it('switches to Human Validation tab and corrects low-confidence annotation', async () => {
    render(
      <DocumentStudio
        token="test-token"
        tenant="tenant-uuid-1"
        projectId="proj-1"
      />
    )

    // Switch to Human Validation tab
    const validationTab = screen.getByRole('button', { name: /Human Validation/i })
    fireEvent.click(validationTab)

    await waitFor(() => {
      expect(screen.getByText('tax_id')).toBeDefined()
      expect(screen.getByText('Correct Value')).toBeDefined()
    })

    // Click Correct Value to open modal
    fireEvent.click(screen.getByText('Correct Value'))

    expect(screen.getByText('Human Field Validation')).toBeDefined()

    const input = screen.getByLabelText('Verified Value')
    fireEvent.change(input, { target: { value: 'US-9941-VALIDATED' } })

    // Save correction
    fireEvent.click(screen.getByText('Save Correction'))

    await waitFor(() => {
      expect(screen.getByText(/Field 'tax_id' verified and updated!/i)).toBeDefined()
    })
  })
})
