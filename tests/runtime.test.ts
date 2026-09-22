import { describe, expect, it } from 'vitest'
import { runCsvAgent } from '../src/server/runtime'
import { SafeMcpToolProvider } from '../src/server/providers/mcp'
import { E2BProvider } from '../src/server/providers/e2b'
import { MockE2BProvider } from '../src/server/providers/mock-e2b'
import { SAMPLE_CSV } from '../src/server/sample'

const env = { EXECUTION_PROVIDER: 'mock', MAX_TOOL_CALLS: '3', MAX_ITERATIONS: '4', EXECUTION_TIMEOUT_MS: '15000', MAX_ARTIFACT_BYTES: '65536' }
const principal = { tenant: 'tenant-a', project: 'project-a' }

describe('Vestren vertical slice', () => {
  it('completes intent to verified artifact and audit', async () => {
    const result = await runCsvAgent(env, { sessionId: crypto.randomUUID(), goal: 'Analyze this CSV and return a report artifact', principal })
    expect(result.status).toBe('verified')
    expect(result.patterns).toHaveLength(3)
    expect(result.plan.every((step) => step.status === 'complete')).toBe(true)
    expect(result.artifacts[0].name).toBe('vestren-csv-report.md')
    expect(result.audit.map((event) => event.action)).toEqual(expect.arrayContaining(['tool.completed', 'execution.started', 'verification.passed', 'artifact.persisted']))
    expect(result.usage.toolCalls).toBeLessThanOrEqual(result.guardrails.maxToolCalls)
  })

  it('fails closed for unauthorized and malformed tool calls', async () => {
    const tools = new SafeMcpToolProvider()
    await expect(tools.call('read_csv_fixture', { sessionId: crypto.randomUUID() }, false)).rejects.toThrow('AUTHORIZATION_REQUIRED')
    await expect(tools.call('read_csv_fixture', { sessionId: 'not-a-uuid' }, true)).rejects.toThrow('INVALID_TOOL_ARGUMENTS')
    await expect(tools.call('unknown_tool', { sessionId: crypto.randomUUID() }, true)).rejects.toThrow('TOOL_NOT_ALLOWED')
  })

  it('enforces execution timeout and artifact boundaries', async () => {
    const provider = new MockE2BProvider(); const sandbox = await provider.createSandbox()
    await expect(provider.execute(sandbox, { csv: SAMPLE_CSV, timeoutMs: 100, maxArtifactBytes: 65536 })).rejects.toThrow('GUARDRAIL_TIMEOUT')
    await expect(provider.execute(sandbox, { csv: SAMPLE_CSV, timeoutMs: 15000, maxArtifactBytes: 16 })).rejects.toThrow('GUARDRAIL_ARTIFACT_SIZE')
  })

  it('fails closed when real E2B is selected without credentials', () => {
    expect(() => new E2BProvider('')).toThrow('E2B_NOT_CONFIGURED')
  })

  it('fails closed when the tenant daily quota is exhausted', async () => {
    let writes = 0
    const db = {
      prepare(query: string) {
        return { bind: () => ({ run: async () => { writes += 1; return {} }, first: async () => query.includes('COUNT(*)') ? { count: 25 } : null }) }
      },
    } as unknown as D1Database
    await expect(runCsvAgent({ ...env, DB: db }, { sessionId: crypto.randomUUID(), goal: 'Analyze this CSV and return a report artifact', principal })).rejects.toThrow('GUARDRAIL_DAILY_RUN_LIMIT')
    expect(writes).toBe(0)
  })

  it('rejects a session ID already owned by another tenant without writing failure records', async () => {
    const writes: string[] = []
    const db = {
      prepare(query: string) {
        return { bind: () => ({ run: async () => { writes.push(query); return {} }, first: async () => query.includes('COUNT(*)') ? { count: 0 } : { tenant_id: 'other-tenant', project_id: 'project-a' } }) }
      },
    } as unknown as D1Database
    await expect(runCsvAgent({ ...env, DB: db }, { sessionId: crypto.randomUUID(), goal: 'Analyze this CSV and return a report artifact', principal })).rejects.toThrow('AUTHORIZATION_SCOPE_MISMATCH')
    expect(writes).toHaveLength(1)
    expect(writes[0]).toContain('INSERT OR IGNORE INTO sessions')
  })
})
