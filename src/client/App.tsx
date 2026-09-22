import { useEffect, useMemo, useState } from 'react'
import { Activity, ArrowRight, Check, ChevronDown, CircleDot, Clock3, Database, Download, FileSpreadsheet, KeyRound, LogIn, LogOut, Play, ShieldCheck, Sparkles, TerminalSquare, Wrench } from 'lucide-react'
import type { RunResult } from '../shared/types'

const defaultGoal = 'Analyze the uploaded CSV, identify the top three patterns, generate a concise report, and return the report as an artifact.'

export interface IdentityClient {
  configured: boolean
  isAuthenticated: boolean
  isLoading: boolean
  label: string
  getToken(): Promise<string>
  signIn(): void | Promise<void>
  signOut(): void | Promise<void>
}

interface AccessibleProject {
  tenantId: string
  tenantName: string
  projectId: string
  projectName: string
  tenantRole: string
  projectRole: 'owner' | 'editor' | 'viewer'
  permissions: string[]
}

interface MeResponse {
  identity: { subject: string; provider: string; email?: string; displayName?: string; expiresAt: number }
  projects: AccessibleProject[]
}

function Badge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'green' | 'amber' | 'blue' }) { return <span className={`badge badge-${tone}`}>{children}</span> }

export function App({ identity }: { identity: IdentityClient }) {
  const [goal, setGoal] = useState(defaultGoal)
  const [result, setResult] = useState<RunResult | null>(null)
  const [me, setMe] = useState<MeResponse | null>(null)
  const [selectedScope, setSelectedScope] = useState('')
  const [loading, setLoading] = useState(false)
  const [identityError, setIdentityError] = useState('')
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<'activity' | 'audit'>('activity')

  useEffect(() => {
    if (!identity.isAuthenticated) { setMe(null); setSelectedScope(''); return }
    let cancelled = false
    setIdentityError('')
    identity.getToken().then((token) => fetch('/api/me', { headers: { authorization: `Bearer ${token}` } }))
      .then(async (response) => {
        const body = await response.json() as MeResponse & { error?: string }
        if (!response.ok) throw new Error(body.error ?? 'Unable to load identity context')
        if (!cancelled) {
          setMe(body)
          const first = body.projects[0]
          setSelectedScope(first ? `${first.tenantId}:${first.projectId}` : '')
        }
      }).catch((reason) => { if (!cancelled) setIdentityError(reason instanceof Error ? reason.message : 'Identity unavailable') })
    return () => { cancelled = true }
  }, [identity.isAuthenticated])

  const selectedProject = useMemo(() => me?.projects.find((project) => `${project.tenantId}:${project.projectId}` === selectedScope) ?? null, [me, selectedScope])
  const scopedHeaders = async () => {
    if (!selectedProject) throw new Error('Select an authorized project before continuing.')
    return {
      authorization: `Bearer ${await identity.getToken()}`,
      'x-vestren-tenant': selectedProject.tenantId,
      'x-vestren-project': selectedProject.projectId,
    }
  }

  const run = async () => {
    setLoading(true); setError(''); setResult(null)
    try {
      const headers = await scopedHeaders()
      const response = await fetch('/api/runs', { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: crypto.randomUUID(), goal }) })
      const body = await response.json() as RunResult & { error?: string }
      if (!response.ok) throw new Error(body.error ?? 'Run failed')
      setResult(body)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unknown error') } finally { setLoading(false) }
  }

  const download = async (url: string, name: string) => {
    try {
      const response = await fetch(url, { headers: await scopedHeaders() })
      if (!response.ok) throw new Error('Artifact access denied.')
      const blob = await response.blob(); const href = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = href; anchor.download = name; anchor.click(); URL.revokeObjectURL(href)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Download failed') }
  }

  const canExecute = Boolean(selectedProject?.permissions.includes('execution:start'))

  return <div className="app-shell">
    <aside className="sidebar">
      <header className="brand"><span className="brand-mark">V</span><span>VESTREN</span></header>
      <nav aria-label="Workspace navigation"><a className="nav-item active" href="#workbench"><Sparkles size={17}/>Workbench</a><a className="nav-item" href="#sessions"><CircleDot size={17}/>Sessions <span className="count">1</span></a><a className="nav-item" href="#tools"><Wrench size={17}/>Tool registry</a><a className="nav-item" href="#artifacts"><Database size={17}/>Artifacts</a></nav>
      <section className="side-group"><p>Infrastructure</p><a className="nav-item" href="#providers"><KeyRound size={17}/>Providers</a><a className="nav-item" href="#audit"><Activity size={17}/>Observability</a></section>
      <section className="environment-card"><div><span className="status-dot"/>Identity boundary active</div><small>Cloudflare edge · Auth0 OIDC</small></section>
    </aside>
    <main id="workbench" className="workspace">
      <header className="topbar"><div><p className="eyebrow">AGENT EXECUTION WORKBENCH</p><h1>CSV intelligence session</h1></div><div className="top-actions"><Badge tone="green"><ShieldCheck size={13}/> Server-authorized scope</Badge>{identity.isAuthenticated ? <><span className="identity-label">{identity.label}</span><button className="icon-action" onClick={() => identity.signOut()} aria-label="Sign out"><LogOut size={16}/></button></> : <button className="primary" onClick={() => identity.signIn()} disabled={!identity.configured || identity.isLoading}><LogIn size={15}/>Sign in</button>}</div></header>

      {!identity.isAuthenticated ? <section className="identity-gate card"><ShieldCheck size={30}/><h2>Production identity required</h2><p>Sign in through Auth0 before Vestren resolves tenant membership, project scope, and permissions.</p>{!identity.configured && <p className="error" role="alert">Auth0 public configuration is not set for this build. Local test auth is available only in the Vite development environment.</p>}<button className="primary" onClick={() => identity.signIn()} disabled={!identity.configured || identity.isLoading}><LogIn size={15}/>{identity.isLoading ? 'Connecting…' : 'Sign in securely'}</button></section> : <>
        <section className="scope-bar card"><div><strong>Authorized workspace</strong><small>Identity → tenant membership → project membership</small></div><select value={selectedScope} onChange={(event) => { setSelectedScope(event.target.value); setResult(null) }} aria-label="Authorized project">{me?.projects.map((project) => <option key={`${project.tenantId}:${project.projectId}`} value={`${project.tenantId}:${project.projectId}`}>{project.tenantName} / {project.projectName} · {project.projectRole}</option>)}</select></section>
        {(identityError || (me && me.projects.length === 0)) && <p className="error identity-error" role="alert">{identityError || 'This identity has no active Vestren project membership.'}</p>}
        <section className="hero-grid">
          <article className="composer card"><div className="card-title"><span><Sparkles size={17}/>Task intent</span><Badge tone="blue">CSV Analyst</Badge></div><textarea id="task-input" value={goal} onChange={(event) => setGoal(event.target.value)} maxLength={500} aria-label="Task goal"/><div className="file-row"><div className="file-icon"><FileSpreadsheet size={22}/></div><div><strong>revenue_sample.csv</strong><small>9 rows · deterministic fixture · 324 B</small></div><Badge tone="green"><Check size={12}/> Scoped</Badge></div><footer className="composer-footer"><span>{goal.length}/500</span><button id="run-task" className="primary" onClick={run} disabled={loading || goal.length < 10 || !canExecute}>{loading ? <><span className="spinner"/>Executing</> : <><Play size={15} fill="currentColor"/>Run agent</>}</button></footer>{error && <p className="error" role="alert">{error}</p>}{selectedProject?.projectRole === 'viewer' && <p className="notice">Read-only membership: execution is disabled by server policy.</p>}</article>
          <aside className="guardrail-card card"><div className="card-title"><span><ShieldCheck size={17}/>Run controls</span><ChevronDown size={15}/></div><dl><div><dt>Execution</dt><dd>{result?.executionProvider === 'e2b' ? 'E2B' : 'Mock E2B adapter'}</dd></div><div><dt>Tool calls</dt><dd>{result?.usage.toolCalls ?? 0} / {result?.guardrails.maxToolCalls ?? 3}</dd></div><div><dt>Iterations</dt><dd>{result?.usage.iterations ?? 0} / {result?.guardrails.maxIterations ?? 4}</dd></div><div><dt>Timeout</dt><dd>{(result?.guardrails.executionTimeoutMs ?? 15000) / 1000}s</dd></div><div><dt>Cost this run</dt><dd>${(result?.usage.estimatedCostUsd ?? 0).toFixed(4)}</dd></div></dl><div className="meter"><span style={{ width: `${((result?.usage.toolCalls ?? 0) / (result?.guardrails.maxToolCalls ?? 3)) * 100}%` }}/></div><small>Daily run allowance: {result?.guardrails.dailyRuns ?? 25}</small></aside>
        </section>
        <section className="execution-grid">
          <article className="card plan-card"><div className="card-title"><span><ArrowRight size={17}/>Execution plan</span>{result && <Badge tone="green">Verified</Badge>}</div><ol className="plan-list">{(result?.plan ?? [{ id: '1', label: 'Load the scoped CSV through the MCP tool boundary', status: 'pending' }, { id: '2', label: 'Analyze rows in an isolated execution provider', status: 'pending' }, { id: '3', label: 'Verify and persist the generated report', status: 'pending' }]).map((step, index) => <li key={step.id} className={step.status}><span>{step.status === 'complete' ? <Check size={14}/> : index + 1}</span><div><strong>{step.label}</strong><small>{step.status === 'complete' ? 'Completed' : 'Waiting'}</small></div></li>)}</ol></article>
          <article className="card activity-card"><div className="tabs"><button className={activeTab === 'activity' ? 'active' : ''} onClick={() => setActiveTab('activity')}>Live activity</button><button className={activeTab === 'audit' ? 'active' : ''} onClick={() => setActiveTab('audit')}>Audit trail</button></div><div className="timeline">{!result && !loading && <div className="empty"><TerminalSquare size={28}/><strong>Ready to execute</strong><span>Run the canonical demo to inspect each boundary.</span></div>}{loading && <div className="empty"><span className="spinner large"/><strong>Agent is working</strong><span>Context → plan → tool → execution → verification</span></div>}{result && (activeTab === 'activity' ? result.audit.slice(-5) : result.audit).map((event) => <div className="event" key={event.event_id}><span className={`event-dot ${event.status}`}/><div><strong>{event.action.replaceAll('.', ' ')}</strong><p>{event.reason}</p><small>{event.provider ?? 'vestren-runtime'} · {event.latency_ms}ms</small></div><time>{new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time></div>)}</div></article>
        </section>
        {result && <section className="results-grid"><article className="card findings"><div className="card-title"><span><Sparkles size={17}/>Verified findings</span><Badge tone="green"><Check size={12}/> {result.verification.checks.length} checks passed</Badge></div><p>{result.summary}</p>{result.patterns.map((pattern, index) => <div className="finding" key={pattern.title}><span>0{index + 1}</span><div><strong>{pattern.title}</strong><p>{pattern.evidence}</p></div></div>)}</article><article id="artifacts" className="card artifacts"><div className="card-title"><span><Database size={17}/>Artifacts</span><span className="muted">{result.artifacts.length} file</span></div>{result.artifacts.map((artifact) => <div className="artifact" key={artifact.id}><div className="file-icon dark"><FileSpreadsheet size={20}/></div><div><strong>{artifact.name}</strong><small>{artifact.contentType} · {artifact.size} B</small></div><button onClick={() => download(artifact.url, artifact.name)} aria-label={`Download ${artifact.name}`}><Download size={16}/></button></div>)}<div className="verification"><ShieldCheck size={18}/><div><strong>Verification passed</strong><small>{result.verification.checks.join(' · ')}</small></div></div></article></section>}
      </>}
      <footer className="product-footer"><span>Identity</span><i/><span>Tenant</span><i/><span>Project</span><i/><span>Authorize</span><i/><span>Execute</span><i/><span>Verify</span><i/><span>Artifact</span><i/><span>Audit</span><span className="runtime"><Clock3 size={13}/> Vestren Runtime 0.2</span></footer>
    </main>
  </div>
}
