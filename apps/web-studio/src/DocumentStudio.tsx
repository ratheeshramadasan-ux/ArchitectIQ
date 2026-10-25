import { useState, useEffect, useCallback } from 'react'
import {
  FileText,
  UploadCloud,
  CheckCircle2,
  Play,
  RefreshCw,
  Edit3,
  Check,
} from 'lucide-react'

export interface DocumentSchemaItem {
  id: string
  tenant_id: string
  project_id: string
  name: string
  slug: string
  description?: string
  fields_schema: { name: string; type: string; required?: boolean }[]
  confidence_threshold: number
  status: string
  created_at: string
  updated_at: string
}

export interface DocumentItem {
  id: string
  tenant_id: string
  project_id: string
  schema_id?: string
  file_name: string
  mime_type: string
  file_size_bytes: number
  storage_path: string
  status: string
  classification?: string
  page_count: number
  raw_text?: string
  extracted_entities: Record<string, { value: unknown; confidence: number; type: string }>
  overall_confidence: number
  created_at: string
  updated_at: string
}

export interface AnnotationItem {
  id: string
  tenant_id: string
  document_id: string
  field_name: string
  extracted_value?: string
  corrected_value?: string
  is_corrected: boolean
  status: string
  annotated_by?: string
  annotated_at?: string
  created_at: string
}

export default function DocumentStudio({
  token,
  tenant,
  projectId: propProjectId,
}: {
  token: string
  tenant: string
  projectId?: string
}) {
  const [activeTab, setActiveTab] = useState<'Documents' | 'Extraction' | 'Annotations' | 'Schemas'>('Documents')
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(propProjectId || null)
  const effectiveProjectId = propProjectId || selectedProjectId

  // Data State
  const [documents, setDocuments] = useState<DocumentItem[]>([])
  const [selectedDoc, setSelectedDoc] = useState<DocumentItem | null>(null)
  const [schemas, setSchemas] = useState<DocumentSchemaItem[]>([])
  const [annotations, setAnnotations] = useState<AnnotationItem[]>([])

  // Modals
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [newFileName, setNewFileName] = useState('')
  const [newDocText, setNewDocText] = useState('')
  const [selectedSchemaId, setSelectedSchemaId] = useState('')

  // Correction Modal
  const [selectedAnnotation, setSelectedAnnotation] = useState<AnnotationItem | null>(null)
  const [correctionValue, setCorrectionValue] = useState('')

  // Status & Feedback
  const [busy, setBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const base = `/api/v1/tenants/${tenant}/workspace`

  const callApi = useCallback(
    async (path: string, init?: RequestInit) => {
      const res = await fetch(`${base}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...init?.headers,
        },
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(`API Error (${res.status}): ${text.slice(0, 200)}`)
      }
      return res.json()
    },
    [base, token]
  )

  // Discover projects
  useEffect(() => {
    let cancelled = false
    if (propProjectId || !token) return

    type TreeItemRaw = { id: string; name: string; kind: string; children?: TreeItemRaw[] }
    callApi('/tree')
      .then((tree: TreeItemRaw[]) => {
        if (cancelled) return
        const found: { id: string; name: string }[] = []
        const walk = (items: TreeItemRaw[]) => {
          for (const item of items) {
            if (item.kind === 'project') found.push({ id: item.id, name: item.name })
            if (item.children) walk(item.children)
          }
        }
        if (Array.isArray(tree)) walk(tree)
        setProjects(found)
        if (found.length > 0 && !selectedProjectId) {
          setSelectedProjectId(found[0].id)
        }
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [callApi, propProjectId, token, selectedProjectId])

  // Load documents and schemas
  useEffect(() => {
    let cancelled = false
    if (!token || !effectiveProjectId) return

    callApi(`/projects/${effectiveProjectId}/documents`)
      .then((data: DocumentItem[]) => {
        if (!cancelled) {
          setDocuments(data)
          if (data.length > 0 && !selectedDoc) setSelectedDoc(data[0])
        }
      })
      .catch(() => {})

    callApi(`/projects/${effectiveProjectId}/document-schemas`)
      .then((data: DocumentSchemaItem[]) => {
        if (!cancelled) setSchemas(data)
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [callApi, token, effectiveProjectId, selectedDoc])

  // Load annotations when document selected
  useEffect(() => {
    let cancelled = false
    if (!token || !selectedDoc) return

    callApi(`/documents/${selectedDoc.id}/annotations`)
      .then((data: AnnotationItem[]) => {
        if (!cancelled) setAnnotations(data)
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [callApi, token, selectedDoc])

  const refreshData = () => {
    if (!effectiveProjectId) return
    setBusy(true)
    Promise.all([
      callApi(`/projects/${effectiveProjectId}/documents`).then((data: DocumentItem[]) => {
        setDocuments(data)
        if (data.length > 0) {
          const matched = data.find((d) => d.id === selectedDoc?.id)
          setSelectedDoc(matched || data[0])
        }
      }),
      callApi(`/projects/${effectiveProjectId}/document-schemas`).then((data: DocumentSchemaItem[]) => {
        setSchemas(data)
      }),
    ]).finally(() => setBusy(false))
  }

  const handleUploadDocument = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!effectiveProjectId) return
    setBusy(true)
    setErrorMessage('')
    setSuccessMessage('')

    try {
      const payload = {
        file_name: newFileName,
        mime_type: 'application/pdf',
        file_size_bytes: 524288,
        storage_path: `s3://architectiq-docs/${newFileName}`,
        schema_id: selectedSchemaId ? selectedSchemaId : undefined,
        raw_text: newDocText,
        page_count: 1,
      }
      const created = await callApi(`/projects/${effectiveProjectId}/documents`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setDocuments([created, ...documents])
      setSelectedDoc(created)
      setUploadModalOpen(false)
      setSuccessMessage(`Document '${created.file_name}' uploaded successfully!`)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  const handleExtractDocument = async () => {
    if (!selectedDoc) return
    setBusy(true)
    setErrorMessage('')
    setSuccessMessage('')

    try {
      const extracted = await callApi(`/documents/${selectedDoc.id}/extract`, {
        method: 'POST',
        body: JSON.stringify({ ocr_engine: 'TESSERACT_OCR' }),
      })
      setSelectedDoc(extracted)
      setDocuments(documents.map((d) => (d.id === extracted.id ? extracted : d)))
      setSuccessMessage(`Extraction finished! Status: ${extracted.status} (${(extracted.overall_confidence * 100).toFixed(0)}% confidence)`)
      // Refresh annotations
      callApi(`/documents/${selectedDoc.id}/annotations`).then((anns: AnnotationItem[]) => setAnnotations(anns))
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Extraction pipeline failed')
    } finally {
      setBusy(false)
    }
  }

  const handleResolveAnnotation = async (decision: 'ACCEPTED' | 'CORRECTED') => {
    if (!selectedDoc || !selectedAnnotation) return
    setBusy(true)
    setErrorMessage('')
    setSuccessMessage('')

    try {
      const resolved = await callApi(`/documents/${selectedDoc.id}/annotations/${selectedAnnotation.id}/resolve`, {
        method: 'POST',
        body: JSON.stringify({
          decision,
          corrected_value: decision === 'CORRECTED' ? correctionValue : selectedAnnotation.extracted_value,
        }),
      })

      setAnnotations(annotations.map((a) => (a.id === resolved.id ? resolved : a)))
      setSelectedAnnotation(null)
      setCorrectionValue('')
      setSuccessMessage(`Field '${resolved.field_name}' verified and updated!`)

      // Refresh document details
      callApi(`/documents/${selectedDoc.id}`).then((doc: DocumentItem) => {
        setSelectedDoc(doc)
        setDocuments(documents.map((d) => (d.id === doc.id ? doc : d)))
      })
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Annotation resolution failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="document-studio-container" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)', minHeight: 600 }}>
      {/* Top Header */}
      <header className="glass" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderRadius: 14, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ display: 'grid', placeItems: 'center', width: 36, height: 36, borderRadius: 10, background: 'rgba(236, 72, 153, 0.2)', color: '#f472b6' }}>
            <FileText size={20} />
          </span>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ fontSize: 17, margin: 0, fontWeight: 700 }}>Document Intelligence Studio</h2>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'rgba(236, 72, 153, 0.2)', color: '#fbcfe8', border: '1px solid rgba(236, 72, 153, 0.4)' }}>
                INTELLIGENT DOCUMENT PROCESSING (IDP)
              </span>
            </div>
            {/* Tabs */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
              <div style={{ display: 'flex', gap: 4 }}>
                {(['Documents', 'Extraction', 'Annotations', 'Schemas'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    style={{
                      border: 'none',
                      background: activeTab === tab ? 'rgba(255,255,255,0.1)' : 'transparent',
                      color: activeTab === tab ? '#f8fafc' : '#94a3b8',
                      padding: '3px 9px',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {tab === 'Documents' && `Queue (${documents.length})`}
                    {tab === 'Extraction' && 'OCR & Entity Extraction'}
                    {tab === 'Annotations' && `Human Validation (${annotations.filter((a) => a.status === 'PENDING').length})`}
                    {tab === 'Schemas' && `Schemas (${schemas.length})`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {!propProjectId && projects.length > 0 && (
            <select
              aria-label="Target Project"
              value={selectedProjectId || ''}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc', padding: '6px 12px', borderRadius: 8, fontSize: 12 }}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id} style={{ background: '#0f172a' }}>
                  {p.name}
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            className="secondary-button"
            onClick={refreshData}
            disabled={busy}
            style={{ fontSize: 12, padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <RefreshCw size={14} className={busy ? 'spin' : ''} /> Refresh
          </button>

          <button
            type="button"
            className="primary-button"
            onClick={() => setUploadModalOpen(true)}
            style={{ fontSize: 12, padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <UploadCloud size={14} /> Ingest Document
          </button>
        </div>
      </header>

      {/* Notifications */}
      {errorMessage && (
        <div style={{ padding: '8px 14px', borderRadius: 8, background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#fca5a5', fontSize: 12, marginBottom: 12 }}>
          {errorMessage}
        </div>
      )}
      {successMessage && (
        <div style={{ padding: '8px 14px', borderRadius: 8, background: 'rgba(34, 197, 94, 0.15)', border: '1px solid rgba(34, 197, 94, 0.3)', color: '#86efac', fontSize: 12, marginBottom: 12 }}>
          {successMessage}
        </div>
      )}

      {/* Main Split Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 14, flex: 1, minHeight: 0 }}>
        {/* Document Ingestion Queue Sidebar */}
        <aside className="glass" style={{ padding: 14, borderRadius: 14, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h3 style={{ fontSize: 12, margin: 0, textTransform: 'uppercase', letterSpacing: 0.8, color: '#94a3b8' }}>
            Document Ingestion Queue ({documents.length})
          </h3>

          {documents.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px 10px', color: '#64748b', fontSize: 12 }}>
              No documents ingested. Click <strong>Ingest Document</strong> to start.
            </div>
          ) : (
            documents.map((doc) => {
              const isSelected = selectedDoc?.id === doc.id
              const isDone = doc.status === 'COMPLETED'
              const needsReview = doc.status === 'REVIEW_REQUIRED'

              return (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => setSelectedDoc(doc)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    padding: 12,
                    borderRadius: 10,
                    border: isSelected ? '1px solid #ec4899' : '1px solid rgba(255,255,255,0.06)',
                    background: isSelected ? 'rgba(236, 72, 153, 0.12)' : 'rgba(255,255,255,0.02)',
                    textAlign: 'left',
                    cursor: 'pointer',
                    color: '#f8fafc',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <strong style={{ fontSize: 13, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                      {doc.file_name}
                    </strong>
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        padding: '2px 6px',
                        borderRadius: 4,
                        background: isDone
                          ? 'rgba(34, 197, 94, 0.2)'
                          : needsReview
                          ? 'rgba(234, 179, 8, 0.2)'
                          : 'rgba(59, 130, 246, 0.2)',
                        color: isDone ? '#86efac' : needsReview ? '#fde047' : '#93c5fd',
                      }}
                    >
                      {doc.status}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>{doc.classification || 'Unclassified'}</span>
                    <span>·</span>
                    <span>{(doc.overall_confidence * 100).toFixed(0)}% conf</span>
                  </div>
                </button>
              )
            })
          )}
        </aside>

        {/* Detail Workspace */}
        <main className="glass" style={{ padding: 18, borderRadius: 14, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {selectedDoc ? (
            <>
              {/* Doc Header Card */}
              <div style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 14, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                  <h3 style={{ fontSize: 18, margin: 0, fontWeight: 700 }}>{selectedDoc.file_name}</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4, fontSize: 12, color: '#94a3b8' }}>
                    <span>Classification: <strong>{selectedDoc.classification || 'Pending Extraction'}</strong></span>
                    <span>·</span>
                    <span>Pages: {selectedDoc.page_count}</span>
                    <span>·</span>
                    <span>Size: {(selectedDoc.file_size_bytes / 1024).toFixed(1)} KB</span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button
                    type="button"
                    className="primary-button"
                    onClick={handleExtractDocument}
                    disabled={busy}
                    style={{ fontSize: 12, padding: '6px 14px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <Play size={13} /> Run Extraction
                  </button>
                </div>
              </div>

              {/* Tab: Overview & Documents */}
              {activeTab === 'Documents' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <div>
                      <h4 style={{ fontSize: 12, textTransform: 'uppercase', color: '#94a3b8', margin: '0 0 6px 0' }}>Raw OCR Text Stream</h4>
                      <pre style={{ margin: 0, padding: 14, borderRadius: 8, background: 'rgba(0,0,0,0.3)', fontSize: 12, color: '#cbd5e1', whiteSpace: 'pre-wrap', maxHeight: 300, overflowY: 'auto' }}>
                        {selectedDoc.raw_text || 'No text content available'}
                      </pre>
                    </div>

                    <div>
                      <h4 style={{ fontSize: 12, textTransform: 'uppercase', color: '#94a3b8', margin: '0 0 6px 0' }}>Extracted Entities</h4>
                      {Object.keys(selectedDoc.extracted_entities).length === 0 ? (
                        <div style={{ padding: 20, textAlign: 'center', color: '#64748b', fontSize: 12 }}>
                          No entities extracted yet. Click <strong>Run Extraction</strong> above.
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {Object.entries(selectedDoc.extracted_entities).map(([key, item]) => (
                            <div key={key} style={{ padding: 10, borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <div>
                                <small style={{ color: '#94a3b8', fontSize: 11 }}>{key}</small>
                                <div style={{ fontSize: 14, fontWeight: 600, color: '#f8fafc' }}>
                                  {String(item.value)}
                                </div>
                              </div>
                              <span style={{ fontSize: 11, fontWeight: 700, color: item.confidence >= 0.85 ? '#4ade80' : '#facc15' }}>
                                {(item.confidence * 100).toFixed(0)}% conf
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Tab: Extraction */}
              {activeTab === 'Extraction' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ padding: 14, borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <h4 style={{ margin: '0 0 10px 0', fontSize: 13 }}>OCR Extraction Engine Settings</h4>
                    <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#cbd5e1' }}>
                      <span>Engine: <strong>Tesseract OCR 5.4 + LayoutLMv3</strong></span>
                      <span>Segmentation: <strong>Hierarchical Text Blocks</strong></span>
                      <span>Confidence Threshold: <strong>85%</strong></span>
                    </div>
                  </div>

                  <h4 style={{ fontSize: 12, textTransform: 'uppercase', color: '#94a3b8', margin: '0 0 6px 0' }}>Structured Extraction JSON</h4>
                  <pre style={{ margin: 0, padding: 14, borderRadius: 8, background: 'rgba(0,0,0,0.3)', fontSize: 12, color: '#4ade80', maxHeight: 300, overflowY: 'auto' }}>
                    {JSON.stringify(selectedDoc.extracted_entities, null, 2)}
                  </pre>
                </div>
              )}

              {/* Tab: Human Validation & Annotations (DOC-02) */}
              {activeTab === 'Annotations' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontSize: 13, color: '#94a3b8' }}>
                      Human-in-the-Loop review queue for low-confidence extracted entities. Correct values to mark document COMPLETED.
                    </div>
                  </div>

                  {annotations.length === 0 ? (
                    <div style={{ padding: 30, textAlign: 'center', color: '#4ade80', fontSize: 13 }}>
                      <CheckCircle2 size={24} style={{ margin: '0 auto 8px auto', display: 'block' }} />
                      No pending human validation tasks for this document. All extracted fields passed confidence thresholds!
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {annotations.map((ann) => (
                        <div
                          key={ann.id}
                          style={{
                            padding: 14,
                            borderRadius: 10,
                            background: 'rgba(255,255,255,0.02)',
                            border: '1px solid rgba(255,255,255,0.06)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                          }}
                        >
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <strong style={{ fontSize: 13 }}>{ann.field_name}</strong>
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  padding: '2px 6px',
                                  borderRadius: 4,
                                  background: ann.status === 'PENDING' ? 'rgba(234, 179, 8, 0.2)' : 'rgba(34, 197, 94, 0.2)',
                                  color: ann.status === 'PENDING' ? '#fde047' : '#86efac',
                                }}
                              >
                                {ann.status}
                              </span>
                            </div>
                            <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                              Extracted Value: <code>{ann.extracted_value || '(null)'}</code>
                              {ann.is_corrected && (
                                <span style={{ color: '#4ade80', marginLeft: 10 }}>
                                  → Corrected: <code>{ann.corrected_value}</code>
                                </span>
                              )}
                            </div>
                          </div>

                          {ann.status === 'PENDING' && (
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button
                                type="button"
                                className="secondary-button"
                                onClick={() => {
                                  setSelectedAnnotation(ann)
                                  setCorrectionValue(ann.extracted_value || '')
                                }}
                                style={{ fontSize: 11, padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                              >
                                <Edit3 size={12} /> Correct Value
                              </button>
                              <button
                                type="button"
                                className="primary-button"
                                onClick={async () => {
                                  setSelectedAnnotation(ann)
                                  await handleResolveAnnotation('ACCEPTED')
                                }}
                                style={{ fontSize: 11, padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                              >
                                <Check size={12} /> Accept
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Tab: Schemas */}
              {activeTab === 'Schemas' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <h4 style={{ fontSize: 12, textTransform: 'uppercase', color: '#94a3b8', margin: '0 0 6px 0' }}>
                    Configured Extraction Schemas ({schemas.length})
                  </h4>
                  {schemas.map((s) => (
                    <div key={s.id} style={{ padding: 14, borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <strong style={{ fontSize: 14 }}>{s.name}</strong>
                          <div style={{ fontSize: 11, color: '#94a3b8' }}>Confidence Threshold: {(s.confidence_threshold * 100).toFixed(0)}%</div>
                        </div>
                        <span style={{ fontSize: 11, color: '#60a5fa' }}>{s.fields_schema.length} Fields Defined</span>
                      </div>
                      <pre style={{ margin: '8px 0 0 0', padding: 10, borderRadius: 6, background: 'rgba(0,0,0,0.3)', fontSize: 11, color: '#cbd5e1' }}>
                        {JSON.stringify(s.fields_schema, null, 2)}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
              Select a document from the queue or upload one to start.
            </div>
          )}
        </main>
      </div>

      {/* Upload Document Modal */}
      {uploadModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'grid', placeItems: 'center', zIndex: 100 }}>
          <div className="glass" style={{ width: 480, padding: 22, borderRadius: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Ingest Document for Processing</h3>

            <form onSubmit={handleUploadDocument} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label htmlFor="doc-filename-input" style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8' }}>File Name</label>
                <input
                  id="doc-filename-input"
                  required
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  placeholder="e.g. Invoice_Acme_2026.pdf"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 6, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc', fontSize: 12 }}
                />
              </div>

              <div>
                <label htmlFor="doc-schema-select" style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8' }}>Target Extraction Schema</label>
                <select
                  id="doc-schema-select"
                  value={selectedSchemaId}
                  onChange={(e) => setSelectedSchemaId(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc', fontSize: 12 }}
                >
                  <option value="">Auto-Detect / Default Extraction</option>
                  {schemas.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="doc-rawtext-input" style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8' }}>Document Text / OCR Payload</label>
                <textarea
                  id="doc-rawtext-input"
                  rows={4}
                  value={newDocText}
                  onChange={(e) => setNewDocText(e.target.value)}
                  placeholder="Paste OCR text or document stream content..."
                  style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 6, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc', fontSize: 12 }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setUploadModalOpen(false)}
                  style={{ fontSize: 12, padding: '6px 14px' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={busy}
                  style={{ fontSize: 12, padding: '6px 14px' }}
                >
                  Upload & Queue
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Human Annotation Correction Modal */}
      {selectedAnnotation && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'grid', placeItems: 'center', zIndex: 100 }}>
          <div className="glass" style={{ width: 440, padding: 20, borderRadius: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Human Field Validation</h3>
            <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>
              Field: <strong>{selectedAnnotation.field_name}</strong>
            </p>

            <div>
              <label htmlFor="correct-field-input" style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8' }}>Verified Value</label>
              <input
                id="correct-field-input"
                value={correctionValue}
                onChange={(e) => setCorrectionValue(e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 6, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc', fontSize: 13 }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setSelectedAnnotation(null)}
                style={{ fontSize: 12, padding: '6px 14px' }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => handleResolveAnnotation('CORRECTED')}
                disabled={busy}
                style={{ fontSize: 12, padding: '6px 14px' }}
              >
                Save Correction
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
