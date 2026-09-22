import { describe, expect, it } from 'vitest'
import { app } from '../functions/api/[[path]]'
import { authorize, issueDemoToken } from '../src/server/auth'
import { runCsvAgent } from '../src/server/runtime'
import { SafeMcpToolProvider } from '../src/server/providers/mcp'
import { E2BProvider } from '../src/server/providers/e2b'
import { MockE2BProvider } from '../src/server/providers/mock-e2b'
import { SAMPLE_CSV } from '../src/server/sample'

const env = { EXECUTION_PROVIDER: 'mock', MAX_TOOL_CALLS: '3', MAX_ITERATIONS: '4', EXECUTION_TIMEOUT_MS: '15000', MAX_ARTIFACT_BYTES: '65536' }
const principal = { tenant: 'demo-tenant', project: 'workbench' }

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

  it('rejects malformed and tampered authentication tokens', async () => {
    const authEnv = { AUTH_SIGNING_SECRET: 'unit-test-secret' }
    const token = await issueDemoToken(authEnv)
    expect(await authorize(new Request('https://example.test', { headers: { authorization: `Bearer ${token}` } }), authEnv)).toMatchObject(principal)
    expect(await authorize(new Request('https://example.test', { headers: { authorization: 'Bearer not-base64.***' } }), authEnv)).toBeNull()
    expect(await authorize(new Request('https://example.test', { headers: { authorization: `Bearer ${token}tampered` } }), authEnv)).toBeNull()
  })

  it('fails closed when the tenant daily quota is exhausted', async () => {
    let writes = 0
    const db = {
      prepare(query: string) {
        return {
          bind() {
            return {
              run: async () => { writes += 1; return {} },
              first: async () => query.includes('COUNT(*)') ? { count: 25 } : null,
            }
          },
        }
      },
    } as unknown as D1Database
    await expect(runCsvAgent({ ...env, DB: db }, { sessionId: crypto.randomUUID(), goal: 'Analyze this CSV and return a report artifact', principal }))
      .rejects.toThrow('GUARDRAIL_DAILY_RUN_LIMIT')
    expect(writes).toBe(0)
  })

  it('rejects a session ID already owned by another tenant without writing failure records', async () => {
    const writes: string[] = []
    const db = {
      prepare(query: string) {
        return {
          bind() {
            return {
              run: async () => { writes.push(query); return {} },
              first: async () => query.includes('COUNT(*)') ? { count: 0 } : { tenant_id: 'other-tenant', project_id: 'workbench' },
            }
          },
        }
      },
    } as unknown as D1Database
    await expect(runCsvAgent({ ...env, DB: db }, { sessionId: crypto.randomUUID(), goal: 'Analyze this CSV and return a report artifact', principal }))
      .rejects.toThrow('AUTHORIZATION_SCOPE_MISMATCH')
    expect(writes).toHaveLength(1)
    expect(writes[0]).toContain('INSERT OR IGNORE INTO sessions')
  })

  it('validates artifact keys and checks scoped metadata before reading R2', async () => {
    const authEnv = { AUTH_SIGNING_SECRET: 'unit-test-secret' }
    const token = await issueDemoToken(authEnv)
    let r2Read = false
    const db = {
      prepare() {
        return { bind: () => ({ first: async () => null }) }
      },
    } as unknown as D1Database
    const artifacts = { get: async () => { r2Read = true; return null } } as unknown as R2Bucket
    const headers = { authorization: `Bearer ${token}` }
    const invalid = await app.request('/api/artifacts/..%2Fsecret', { headers }, { ...authEnv, DB: db, ARTIFACTS: artifacts })
    expect(invalid.status).toBe(400)
    const key = `sessions/${crypto.randomUUID()}/${crypto.randomUUID()}/report.md`
    const denied = await app.request(`/api/artifacts/${encodeURIComponent(key)}`, { headers }, { ...authEnv, DB: db, ARTIFACTS: artifacts })
    expect(denied.status).toBe(404)
    expect(r2Read).toBe(false)
  })
})
