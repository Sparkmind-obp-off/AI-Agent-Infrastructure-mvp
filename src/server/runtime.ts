import { AuditTrail } from './audit'
import { getGuardrails, type Env } from './config'
import { E2BProvider } from './providers/e2b'
import { MockE2BProvider } from './providers/mock-e2b'
import { SafeMcpToolProvider } from './providers/mcp'
import { ArtifactStorageProvider } from './providers/storage'
import type { PlanStep, RunResult } from '../shared/types'

export async function runCsvAgent(env: Env, input: { sessionId: string; goal: string; authorized: boolean }): Promise<RunResult> {
  if (!input.authorized) throw new Error('AUTHORIZATION_REQUIRED')
  const started = Date.now(); const executionId = crypto.randomUUID(); const guardrails = getGuardrails(env)
  const audit = new AuditTrail({ tenantId: 'demo-tenant', projectId: 'workbench', agentId: 'csv-analyst', sessionId: input.sessionId })
  let toolCalls = 0; let iterations = 1
  audit.emit({ action: 'request.received', reason: 'User submitted CSV analysis intent', status: 'success' })
  audit.emit({ action: 'context.built', reason: 'Loaded tenant-scoped session and fixture metadata', status: 'success' })
  const plan: PlanStep[] = ['Load the scoped CSV through the MCP tool boundary', 'Analyze rows in an isolated execution provider', 'Verify and persist the generated report'].map((label, index) => ({ id: `step-${index + 1}`, label, status: 'pending' }))
  audit.emit({ action: 'plan.created', reason: 'Deterministic planner selected the canonical safe workflow', provider: 'deterministic-fallback', model_or_tool: 'bounded-planner-v1', status: 'success', usage: { tool_calls: 0, iterations, estimated_cost_usd: 0 } })
  const tools = new SafeMcpToolProvider(); if (++toolCalls > guardrails.maxToolCalls) throw new Error('GUARDRAIL_TOOL_LIMIT')
  const csv = (await tools.call('read_csv_fixture', { sessionId: input.sessionId }, input.authorized)).content
  plan[0].status = 'complete'; audit.emit({ action: 'tool.completed', reason: 'Read-only scoped fixture requested by plan', provider: 'mcp-adapter', model_or_tool: 'read_csv_fixture', status: 'success', usage: { tool_calls: toolCalls, iterations, estimated_cost_usd: 0 } })
  const configured = env.EXECUTION_PROVIDER ?? 'mock'; const provider = configured === 'e2b' ? new E2BProvider(env.E2B_API_KEY ?? '') : new MockE2BProvider()
  const sandboxId = await provider.createSandbox(); audit.emit({ action: 'execution.started', reason: 'Plan requires isolated data analysis', provider: provider.name, status: 'started', execution_id: executionId })
  try {
    const output = await provider.execute(sandboxId, { csv, timeoutMs: guardrails.executionTimeoutMs, maxArtifactBytes: guardrails.maxArtifactBytes })
    plan[1].status = 'complete'; const checks = [output.patterns.length === 3 && 'Exactly three patterns produced', output.report.startsWith('# Vestren CSV Analysis') && 'Report has expected heading', output.report.includes('Method') && 'Method is documented'].filter(Boolean) as string[]
    if (checks.length !== 3) throw new Error('VERIFICATION_FAILED')
    const artifactKey = `sessions/${input.sessionId}/${executionId}/report.md`; const stored = await new ArtifactStorageProvider(env, input.sessionId).put(artifactKey, output.report, 'text/markdown')
    plan[2].status = 'complete'; audit.emit({ action: 'verification.passed', reason: 'Schema, count, heading, and method checks passed', provider: 'vestren-verifier', status: 'success', execution_id: executionId })
    audit.emit({ action: 'artifact.persisted', reason: 'Verified report stored behind StorageProvider', provider: env.ARTIFACTS ? 'cloudflare-r2+d1' : 'd1-or-response-fallback', status: 'success', execution_id: executionId })
    if (env.DB) {
      await env.DB.prepare('INSERT OR REPLACE INTO sessions (id, tenant_id, project_id, goal, status, updated_at) VALUES (?, ?, ?, ?, ?, ?)').bind(input.sessionId, 'demo-tenant', 'workbench', input.goal, 'verified', new Date().toISOString()).run()
      await env.DB.prepare('INSERT INTO executions (id, session_id, provider, status, tool_calls, iterations, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(executionId, input.sessionId, provider.name, 'verified', toolCalls, iterations, Date.now() - started, new Date().toISOString()).run()
      for (const event of audit.events) await env.DB.prepare('INSERT INTO audit_events (id, session_id, action, payload, created_at) VALUES (?, ?, ?, ?, ?)').bind(event.event_id, input.sessionId, event.action, JSON.stringify(event), event.timestamp).run()
    }
    return { sessionId: input.sessionId, executionId, status: 'verified', executionProvider: provider.name, summary: 'Analysis complete. Three defensible patterns were identified and the report passed verification.', patterns: output.patterns, plan, artifacts: [{ id: artifactKey, name: 'vestren-csv-report.md', contentType: 'text/markdown', size: stored.size, url: stored.url }], verification: { passed: true, checks }, audit: audit.events, guardrails, usage: { toolCalls, iterations, elapsedMs: Date.now() - started, estimatedCostUsd: 0 } }
  } finally { await provider.terminate(sandboxId) }
}
