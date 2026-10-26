import { useState } from 'react'
import {
  Database,
  Search,
  Upload,
  Plus,
  Layers,
  Sparkles,
  ExternalLink,
  Sliders,
} from 'lucide-react'

interface KnowledgeStudioProps {
  token: string
  tenant: string
  currentEnv?: string
}

interface VectorCollection {
  id: string
  name: string
  description: string
  dimension: number
  metric: 'cosine' | 'dotproduct' | 'euclidean'
  documentsCount: number
  vectorsCount: number
  chunkStrategy: string
  embeddingModel: string
  lastSync: string
  status: 'READY' | 'INDEXING' | 'STALE'
}

export default function KnowledgeStudio({
  token: _token,
  tenant = 'Citibank',
  currentEnv = 'DEV',
}: KnowledgeStudioProps) {
  const [activeTab, setActiveTab] = useState<'collections' | 'ingestion' | 'simulator' | 'models'>('collections')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCollection, setSelectedCollection] = useState<string>('c-1')

  const [collections] = useState<VectorCollection[]>([
    {
      id: 'c-1',
      name: 'Corporate Lending & Risk Policies',
      description: 'Underwriting guidelines, Basel III risk calculation tables, and credit memos.',
      dimension: 1536,
      metric: 'cosine',
      documentsCount: 428,
      vectorsCount: 18450,
      chunkStrategy: 'Semantic Recursive (512 tokens / 64 overlap)',
      embeddingModel: 'text-embedding-3-large',
      lastSync: '10 mins ago',
      status: 'READY',
    },
    {
      id: 'c-2',
      name: 'KYC Document Classification Knowledge Base',
      description: 'Official identity document templates, proof-of-address rules, and sanction lists.',
      dimension: 768,
      metric: 'cosine',
      documentsCount: 1120,
      vectorsCount: 45200,
      chunkStrategy: 'Table-Aware Markdown Chunking',
      embeddingModel: 'gemini-embedding-exp-0827',
      lastSync: '1 hour ago',
      status: 'READY',
    },
    {
      id: 'c-3',
      name: 'Trade Finance & Letter of Credit Rules (UCP 600)',
      description: 'International Chamber of Commerce guidelines, customs inspection handbooks.',
      dimension: 1536,
      metric: 'cosine',
      documentsCount: 215,
      vectorsCount: 8900,
      chunkStrategy: 'Fixed Window (256 tokens)',
      embeddingModel: 'text-embedding-3-small',
      lastSync: 'Yesterday',
      status: 'READY',
    },
    {
      id: 'c-4',
      name: 'PostgreSQL Core Ledger Schema & Data Dictionaries',
      description: 'Database schema, foreign keys, table indexes, and stored procedure docs for MCP tool binding.',
      dimension: 1536,
      metric: 'cosine',
      documentsCount: 94,
      vectorsCount: 3820,
      chunkStrategy: 'Code-Block Semantic AST',
      embeddingModel: 'text-embedding-3-large',
      lastSync: '3 days ago',
      status: 'READY',
    },
  ])

  // Simulation test state
  const [testQuery, setTestQuery] = useState('What are the maximum loan-to-value limits for commercial real estate in Tier 1 cities?')
  const [testTopK, setTestTopK] = useState(3)
  const [simResults, setSimResults] = useState<Array<{ title: string; score: number; text: string; source: string }>>([
    {
      title: 'CRE Underwriting Policy 2026 §4.2',
      score: 0.942,
      text: 'For Tier 1 metropolitan areas (Class A properties), the maximum Loan-to-Value (LTV) ratio shall not exceed 65% for non-recourse facilities and 75% for full-recourse facilities with corporate parent guarantee.',
      source: 'cre_risk_policy_v4.pdf #p14',
    },
    {
      title: 'Commercial Real Estate Collateral Guidelines',
      score: 0.887,
      text: 'Debt Service Coverage Ratio (DSCR) must maintain a minimum threshold of 1.35x across all tranches prior to LTV expansion approval by Senior Credit Committee.',
      source: 'collateral_valuation_matrix.pdf #p3',
    },
    {
      title: 'Regional Credit Risk Variance Addendum',
      score: 0.815,
      text: 'Metropolitan economic hub properties with long-term investment-grade anchor tenants qualify for an LTV haircut exemption of up to 500 basis points upon Chief Risk Officer attestation.',
      source: 'risk_variance_addendum_2026.pdf #p8',
    },
  ])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minHeight: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="live-dot" />
            <span style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.08em', color: 'var(--accent, #BA9731)', textTransform: 'uppercase' }}>
              Design Studio • RAG &amp; Vector Management
            </span>
            <span style={{ fontSize: '0.65rem', fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: 'rgba(16, 185, 129, 0.15)', color: '#10B981' }}>
              {currentEnv}
            </span>
          </div>
          <h1 style={{ margin: '4px 0 2px', fontSize: '1.4rem', fontWeight: 800 }}>Knowledge Studio</h1>
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--muted-foreground)' }}>
            Vector indexes, embedding chunking pipelines, semantic search retrieval, and tool-augmented RAG for tenant: <strong>{tenant}</strong>
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="folders-btn-secondary" onClick={() => {}}>
            <Upload size={13} /> Ingest Document
          </button>
          <button className="folders-btn-primary" onClick={() => {}}>
            <Plus size={13} /> New Vector Collection
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="folder-tabs-strip">
        {[
          { id: 'collections', label: 'Vector Collections', icon: Database },
          { id: 'ingestion', label: 'Ingestion & Chunking', icon: Layers },
          { id: 'simulator', label: 'Retrieval Simulator', icon: Search },
          { id: 'models', label: 'Embedding Models', icon: Sparkles },
        ].map(t => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              className={`folder-tab-btn ${activeTab === t.id ? 'active' : ''}`}
              onClick={() => setActiveTab(t.id as any)}
            >
              <Icon size={13} style={{ marginRight: 6 }} />
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Tab: Collections */}
      {activeTab === 'collections' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ position: 'relative', width: 320 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)' }} />
              <input
                type="text"
                placeholder="Filter vector collections..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '7px 10px 7px 30px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: 'var(--card)',
                  color: 'var(--foreground)',
                  fontSize: '0.8rem',
                }}
              />
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>
              Total Vectors: <strong>76,370</strong> across 4 collections
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16 }}>
            {collections.map(c => (
              <div
                key={c.id}
                className={`glass-card ${selectedCollection === c.id ? 'selected' : ''}`}
                style={{
                  padding: 16,
                  borderRadius: 8,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  border: selectedCollection === c.id ? '2px solid var(--accent, #BA9731)' : '1px solid var(--border)',
                  cursor: 'pointer',
                }}
                onClick={() => setSelectedCollection(c.id)}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 30, height: 30, borderRadius: 6, background: 'rgba(186, 151, 49, 0.15)', display: 'grid', placeItems: 'center', color: 'var(--accent, #BA9731)' }}>
                      <Database size={16} />
                    </div>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 800 }}>{c.name}</h4>
                      <span style={{ fontSize: '0.68rem', color: 'var(--muted-foreground)' }}>{c.dimension} dims • {c.metric}</span>
                    </div>
                  </div>
                  <span style={{ fontSize: '0.65rem', fontWeight: 800, padding: '2px 8px', borderRadius: 4, background: 'rgba(16, 185, 129, 0.15)', color: '#10B981' }}>
                    {c.status}
                  </span>
                </div>

                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--muted-foreground)', lineHeight: 1.4 }}>
                  {c.description}
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, background: 'var(--card)', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)' }}>
                  <div>
                    <span style={{ fontSize: '0.62rem', color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>Documents</span>
                    <strong style={{ display: 'block', fontSize: '0.85rem' }}>{c.documentsCount}</strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.62rem', color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>Vectors</span>
                    <strong style={{ display: 'block', fontSize: '0.85rem' }}>{c.vectorsCount.toLocaleString()}</strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.62rem', color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>Sync</span>
                    <strong style={{ display: 'block', fontSize: '0.82rem' }}>{c.lastSync}</strong>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--muted-foreground)' }}>
                  <span>Model: <strong>{c.embeddingModel}</strong></span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--accent, #BA9731)' }}>
                    Test Retrieval <ExternalLink size={12} />
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab: Simulator */}
      {activeTab === 'simulator' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="glass-card" style={{ padding: 18, borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800 }}>RAG Semantic Retrieval Simulator</h3>
            <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--muted-foreground)' }}>
              Test vector similarity queries, hybrid keyword-vector fusion, and re-ranking across your knowledge collections in real-time.
            </p>

            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 280 }}>
                <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: 4 }}>
                  Natural Language Query
                </label>
                <input
                  type="text"
                  value={testQuery}
                  onChange={e => setTestQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: 'var(--card)',
                    color: 'var(--foreground)',
                    fontSize: '0.82rem',
                  }}
                />
              </div>

              <div style={{ width: 120 }}>
                <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: 4 }}>
                  Top-K Chunks
                </label>
                <select
                  value={testTopK}
                  onChange={e => setTestTopK(Number(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: 'var(--card)',
                    color: 'var(--foreground)',
                    fontSize: '0.82rem',
                  }}
                >
                  <option value={3}>Top 3</option>
                  <option value={5}>Top 5</option>
                  <option value={10}>Top 10</option>
                </select>
              </div>

              <button className="folders-btn-primary" onClick={() => setSimResults(prev => [...prev])}>
                <Search size={14} /> Execute Query
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted-foreground)' }}>
              Simulated Top-{testTopK} Retrieved Context Chunks
            </span>
            {simResults.slice(0, testTopK).map((res, idx) => (
              <div key={idx} className="glass-card" style={{ padding: 16, borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--accent, #BA9731)', color: '#000', fontWeight: 800, fontSize: '0.7rem', display: 'grid', placeItems: 'center' }}>
                      #{idx + 1}
                    </span>
                    <strong>{res.title}</strong>
                    <span style={{ fontSize: '0.7rem', color: 'var(--muted-foreground)' }}>{res.source}</span>
                  </div>
                  <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#10B981', background: 'rgba(16, 185, 129, 0.12)', padding: '2px 8px', borderRadius: 4 }}>
                    Score: {(res.score * 100).toFixed(1)}%
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--foreground)', lineHeight: 1.5, background: 'rgba(0,0,0,0.08)', padding: 10, borderRadius: 6 }}>
                  "{res.text}"
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab: Ingestion */}
      {activeTab === 'ingestion' && (
        <div className="glass-card" style={{ padding: 24, borderRadius: 8, textAlign: 'center' }}>
          <Layers size={40} style={{ color: 'var(--accent, #BA9731)', margin: '0 auto 12px' }} />
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>Document Ingestion &amp; Chunking Pipelines</h3>
          <p style={{ margin: '6px auto 16px', maxWidth: 520, fontSize: '0.82rem', color: 'var(--muted-foreground)' }}>
            Configure automatic PDF, DOCX, Markdown, and JSON document extractors, sliding window overlap, and table structure preservation.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
            <button className="folders-btn-primary"><Upload size={14} /> Upload Training Corpos</button>
            <button className="folders-btn-secondary"><Sliders size={14} /> Configure AST Parsers</button>
          </div>
        </div>
      )}

      {/* Tab: Models */}
      {activeTab === 'models' && (
        <div className="glass-card" style={{ padding: 24, borderRadius: 8, textAlign: 'center' }}>
          <Sparkles size={40} style={{ color: 'var(--accent, #BA9731)', margin: '0 auto 12px' }} />
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>Enterprise Embedding Model Providers</h3>
          <p style={{ margin: '6px auto 16px', maxWidth: 520, fontSize: '0.82rem', color: 'var(--muted-foreground)' }}>
            Manage secure on-premise and cloud embedding models: OpenAI text-embedding-3, Google Vertex Gemini, Cohere Embed v3, and local HuggingFace BGE.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
            <button className="folders-btn-primary"><Plus size={14} /> Connect Embedding Provider</button>
          </div>
        </div>
      )}
    </div>
  )
}
