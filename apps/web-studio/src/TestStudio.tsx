import { useState } from 'react'
import {
  FlaskConical,
  Play,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  BarChart2,
  Bot,
  ShieldCheck,
  FileCheck,
} from 'lucide-react'

interface TestStudioProps {
  token: string
  tenant: string
  currentEnv?: string
}

interface TestRun {
  id: string
  name: string
  targetKind: 'AGENT' | 'WORKFLOW' | 'IDP_PIPELINE'
  targetName: string
  dataset: string
  totalCases: number
  passed: number
  failed: number
  accuracyScore: number
  hallucinationRate: number
  duration: string
  lastExecuted: string
  status: 'PASSED' | 'FAILED' | 'RUNNING'
}

export default function TestStudio({
  token: _token,
  tenant = 'Citibank',
  currentEnv = 'DEV',
}: TestStudioProps) {
  const [activeTab, setActiveTab] = useState<'suites' | 'evals' | 'simulations' | 'hallucinations'>('suites')

  const [testRuns] = useState<TestRun[]>([
    {
      id: 'tr-1',
      name: 'Credit Risk Analysis Agent Validation',
      targetKind: 'AGENT',
      targetName: 'CreditRiskAssessmentAgent',
      dataset: 'Golden Underwriting Cases 2026 (n=120)',
      totalCases: 120,
      passed: 118,
      failed: 2,
      accuracyScore: 98.3,
      hallucinationRate: 0.8,
      duration: '42s',
      lastExecuted: '12 mins ago',
      status: 'PASSED',
    },
    {
      id: 'tr-2',
      name: 'KYC Document Classification & Passport OCR',
      targetKind: 'IDP_PIPELINE',
      targetName: 'PassportExtractionPipeline',
      dataset: 'Global Passports Benchmarks (n=250)',
      totalCases: 250,
      passed: 247,
      failed: 3,
      accuracyScore: 98.8,
      hallucinationRate: 0.0,
      duration: '1m 15s',
      lastExecuted: '2 hours ago',
      status: 'PASSED',
    },
    {
      id: 'tr-3',
      name: 'Trade Finance Multi-Agent Swarm Orchestration',
      targetKind: 'WORKFLOW',
      targetName: 'LetterOfCreditApprovalFlow',
      dataset: 'ICC Complex Scenarios (n=50)',
      totalCases: 50,
      passed: 46,
      failed: 4,
      accuracyScore: 92.0,
      hallucinationRate: 2.1,
      duration: '2m 04s',
      lastExecuted: 'Yesterday',
      status: 'FAILED',
    },
    {
      id: 'tr-4',
      name: 'PostgreSQL MCP Tool Function-Calling Reliability',
      targetKind: 'AGENT',
      targetName: 'SQLQueryAssistantBot',
      dataset: 'Schema Read/Write Synthetic Prompts (n=300)',
      totalCases: 300,
      passed: 299,
      failed: 1,
      accuracyScore: 99.7,
      hallucinationRate: 0.3,
      duration: '58s',
      lastExecuted: '2 days ago',
      status: 'PASSED',
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
              Design Studio • AI Evaluation &amp; Testing
            </span>
            <span style={{ fontSize: '0.65rem', fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: 'rgba(16, 185, 129, 0.15)', color: '#10B981' }}>
              {currentEnv}
            </span>
          </div>
          <h1 style={{ margin: '4px 0 2px', fontSize: '1.4rem', fontWeight: 800 }}>Test Studio</h1>
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--muted-foreground)' }}>
            Agent evaluations, hallucination guardrail checks, deterministic regression suites, and workflow simulations for tenant: <strong>{tenant}</strong>
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="folders-btn-secondary" onClick={() => {}}>
            <FileCheck size={13} /> Import Test Dataset
          </button>
          <button className="folders-btn-primary" onClick={() => {}}>
            <Play size={13} /> Run All Test Suites
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="folder-tabs-strip">
        {[
          { id: 'suites', label: 'Evaluation Suites', icon: FlaskConical },
          { id: 'evals', label: 'Model Benchmarking', icon: BarChart2 },
          { id: 'simulations', label: 'Interactive Simulation', icon: Bot },
          { id: 'hallucinations', label: 'Hallucination Guardrails', icon: ShieldCheck },
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

      {/* Metrics Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        {[
          { label: 'Overall Accuracy', value: '97.2%', sub: '+1.4% vs previous build', color: '#10B981' },
          { label: 'Hallucination Rate', value: '0.8%', sub: 'Target threshold < 2.0%', color: '#10B981' },
          { label: 'Regression Coverage', value: '94.6%', sub: '720 golden test fixtures', color: '#3B82F6' },
          { label: 'Avg Execution Latency', value: '1.24s', sub: '95th percentile: 2.8s', color: 'var(--foreground)' },
        ].map((m, i) => (
          <div key={i} className="glass-card" style={{ padding: '12px 14px', borderRadius: 8 }}>
            <span style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted-foreground)' }}>{m.label}</span>
            <strong style={{ display: 'block', fontSize: '1.3rem', fontWeight: 900, color: m.color, margin: '4px 0 2px' }}>{m.value}</strong>
            <small style={{ fontSize: '0.68rem', color: 'var(--muted-foreground)' }}>{m.sub}</small>
          </div>
        ))}
      </div>

      {/* Test Runs List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h3 style={{ margin: '6px 0 2px', fontSize: '0.98rem', fontWeight: 800 }}>Regression &amp; Evaluation Test Runs</h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {testRuns.map(run => (
            <div
              key={run.id}
              className="glass-card"
              style={{
                padding: 16,
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
                borderLeft: run.status === 'PASSED' ? '4px solid #10B981' : '4px solid #EF4444',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 8,
                    background: run.status === 'PASSED' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                    color: run.status === 'PASSED' ? '#10B981' : '#EF4444',
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  {run.status === 'PASSED' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                </div>

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <strong style={{ fontSize: '0.88rem' }}>{run.name}</strong>
                    <span style={{ fontSize: '0.65rem', fontWeight: 800, padding: '1px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.08)' }}>
                      {run.targetKind}: {run.targetName}
                    </span>
                  </div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--muted-foreground)' }}>
                    Dataset: {run.dataset} • Duration: {run.duration} • Executed {run.lastExecuted}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '0.62rem', color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>Accuracy Score</span>
                  <strong style={{ display: 'block', fontSize: '1rem', color: run.accuracyScore >= 95 ? '#10B981' : '#F59E0B' }}>
                    {run.accuracyScore}%
                  </strong>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '0.62rem', color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>Test Results</span>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: '0.78rem', fontWeight: 800 }}>
                    <span style={{ color: '#10B981' }}>{run.passed} passed</span>
                    <span style={{ color: 'var(--muted-foreground)' }}>/</span>
                    <span style={{ color: run.failed > 0 ? '#EF4444' : 'var(--muted-foreground)' }}>{run.failed} failed</span>
                  </div>
                </div>

                <button className="folders-btn-secondary" style={{ padding: '6px 12px' }}>
                  <RotateCcw size={13} /> Re-run
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
