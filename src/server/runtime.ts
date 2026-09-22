import { AuditTrail } from './audit'
import type { AuthPrincipal } from './auth'
import { getGuardrails, type Env } from './config'
import { E2BProvider } from './providers/e2b'
import { MockE2BProvider } from './providers/mock-e2b'
import { SafeMcpToolProvider } from './providers/mcp'
import { ArtifactStorageProvider } from './providers/storage'
import type { ExecutionProvider } from './providers/contracts'
import type { PlanStep, RunResult } from '../shared/types'

type RunInput = { sessionId: string; goal: string; principal: Pick<AuthPrincipal, 'tenant' | 'project'> }

const errorClass = (error: unknown) => error instanceof Error ? error.message.split(':', 1)[0] : 'UNKNOWN_ERROR'

async function claimSession(env: Env, input: RunInput) {
  if (!env.DB) return
  const now = new Date().toISOString()
  await env.DB.prepare('INSERT OR IGNORE INTO sessions (id, tenant_id, project_id, goal, status, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(input.sessionId, input.principal.tenant, input.principal.project, input.goal, 'running', now).run()
  const owner = await env.DB.prepare('SELECT tenant_id, project_id FROM sessions WHERE id = ?').bind(input.sessionId).first<{ tenant_id: string; project_id: string }>()
  if (!owner || owner.tenant_id !== input.principal.tenant || owner.project_id !== input.principal.project) throw new Error('AUTHORIZATION_SCOPE_MISMATCH')
  await env.DB.prepare('UPDATE sessions SET goal = ?, status = ?, updated_at = ? WHERE id = ? AND tenant_id = ? AND project_id = ?')
    .bind(input.goal, 'running', now, input.sessionId, input.principal.tenant, input.principal.project).run()
}

async function enforceDailyQuota(env: Env, input: RunInput, dailyRuns: number) {
  if (!env.DB) return
  const start = new Date(); start.setUTCHours(0, 0, 0, 0)
  const result = await env.DB.prepare(`SELECT COUNT(*) AS count FROM executions e JOIN sessions s ON s.id = e.session_id
    WHERE s.tenant_id = ? AND s.project_id = ? AND e.created_at >= ?`)
    .bind(input.principal.tenant, input.principal.project, start.toISOString()).first<{ count: number }>()
  if ((result?.count ?? 0) >= dailyRuns) throw new Error('GUARDRAIL_DAILY_RUN_LIMIT')
}

async function persistAudit(env: Env, sessionId: string, audit: AuditTrail) {
  if (!env.DB) return
  for (const event of audit.events) {
    await env.DB.prepare('INSERT OR IGNORE INTO audit_events (id, session_id, action, payload, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(event.event_id, sessionId, event.action, JSON.stringify(event), event.timestamp).run()
  }
}

export async function runCsvAgent(env: Env, input: RunInput): Promise<RunResult> {
  const started = Date.now()
  const executionId = crypto.randomUUID()
  const guardrails = getGuardrails(env)
  const audit = new AuditTrail({ tenantId: input.principal.tenant, projectId: input.principal.project, agentId: 'csv-analyst', sessionId: input.sessionId })
  const plan: PlanStep[] = ['Load the scoped CSV through the MCP tool boundary', 'Analyze rows in an isolated execution provider', 'Verify and persist the generated report']
    .map((label, index) => ({ id: `step-${index + 1}`, label, status: 'pending' }))
  let toolCalls = 0
  const iterations = 1
  let provider: ExecutionProvider | undefined
  let sandboxId: string | undefined
  let sessionClaimed = !env.DB

  try {
    await enforceDailyQuota(env, input, guardrails.dailyRuns)
    await claimSession(env, input)
    sessionClaimed = true
    audit.emit({ action: 'request.received', reason: 'User submitted CSV analysis intent', status: 'success' })
    audit.emit({ action: 'context.built', reason: 'Loaded tenant-scoped session and fixture metadata', status: 'success' })
    audit.emit({ action: 'plan.created', reason: 'Deterministic planner selected the canonical safe workflow', provider: 'deterministic-fallback', model_or_tool: 'bounded-planner-v1', status: 'success', usage: { tool_calls: 0, iterations, estimated_cost_usd: 0 } })

    const tools = new SafeMcpToolProvider()
    if (++toolCalls > guardrails.maxToolCalls) throw new Error('GUARDRAIL_TOOL_LIMIT')
    const csv = (await tools.call('read_csv_fixture', { sessionId: input.sessionId }, true)).content
    plan[0].status = 'complete'
    audit.emit({ action: 'tool.completed', reason: 'Read-only scoped fixture requested by plan', provider: 'mcp-adapter', model_or_tool: 'read_csv_fixture', status: 'success', usage: { tool_calls: toolCalls, iterations, estimated_cost_usd: 0 } })

    provider = (env.EXECUTION_PROVIDER ?? 'mock') === 'e2b' ? new E2BProvider(env.E2B_API_KEY ?? '') : new MockE2BProvider()
    sandboxId = await provider.createSandbox()
    audit.emit({ action: 'execution.started', reason: 'Plan requires isolated data analysis', provider: provider.name, status: 'started', execution_id: executionId })
    const output = await provider.execute(sandboxId, { csv, timeoutMs: guardrails.executionTimeoutMs, maxArtifactBytes: guardrails.maxArtifactBytes })
    plan[1].status = 'complete'

    const checks = [output.patterns.length === 3 && 'Exactly three patterns produced', output.report.startsWith('# Vestren CSV Analysis') && 'Report has expected heading', output.report.includes('Method') && 'Method is documented'].filter(Boolean) as string[]
    if (checks.length !== 3) throw new Error('VERIFICATION_FAILED')
    const artifactKey = `sessions/${input.sessionId}/${executionId}/report.md`
    const stored = await new ArtifactStorageProvider(env, input.sessionId).put(artifactKey, output.report, 'text/markdown')
    plan[2].status = 'complete'
    audit.emit({ action: 'verification.passed', reason: 'Schema, count, heading, and method checks passed', provider: 'vestren-verifier', status: 'success', execution_id: executionId })
    audit.emit({ action: 'artifact.persisted', reason: 'Verified report stored behind StorageProvider', provider: env.ARTIFACTS ? 'cloudflare-r2+d1' : 'd1-or-response-fallback', status: 'success', execution_id: executionId })

    if (env.DB) {
      await env.DB.prepare('UPDATE sessions SET status = ?, updated_at = ? WHERE id = ? AND tenant_id = ? AND project_id = ?')
        .bind('verified', new Date().toISOString(), input.sessionId, input.principal.tenant, input.principal.project).run()
      await env.DB.prepare('INSERT INTO executions (id, session_id, provider, status, tool_calls, iterations, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(executionId, input.sessionId, provider.name, 'verified', toolCalls, iterations, Date.now() - started, new Date().toISOString()).run()
      await persistAudit(env, input.sessionId, audit)
    }

    return { sessionId: input.sessionId, executionId, status: 'verified', executionProvider: provider.name, summary: 'Analysis complete. Three defensible patterns were identified and the report passed verification.', patterns: output.patterns, plan, artifacts: [{ id: artifactKey, name: 'vestren-csv-report.md', contentType: 'text/markdown', size: stored.size, url: stored.url }], verification: { passed: true, checks }, audit: audit.events, guardrails, usage: { toolCalls, iterations, elapsedMs: Date.now() - started, estimatedCostUsd: 0 } }
  } catch (error) {
    const failure = errorClass(error)
    audit.emit({ action: 'execution.failed', reason: 'The bounded run stopped before producing a verified result', provider: provider?.name ?? 'vestren-runtime', status: 'failed', error_class: failure, execution_id: executionId, usage: { tool_calls: toolCalls, iterations, estimated_cost_usd: 0 } })
    if (env.DB && sessionClaimed) {
      await env.DB.prepare('UPDATE sessions SET status = ?, updated_at = ? WHERE id = ? AND tenant_id = ? AND project_id = ?')
        .bind('failed', new Date().toISOString(), input.sessionId, input.principal.tenant, input.principal.project).run()
      await env.DB.prepare('INSERT OR IGNORE INTO executions (id, session_id, provider, status, tool_calls, iterations, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(executionId, input.sessionId, provider?.name ?? 'unavailable', 'failed', toolCalls, iterations, Date.now() - started, new Date().toISOString()).run()
      await persistAudit(env, input.sessionId, audit)
    }
    throw error
  } finally {
    if (provider && sandboxId) await provider.terminate(sandboxId)
  }
}
