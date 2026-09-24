import { beforeEach, describe, expect, it, vi } from 'vitest'
import { app } from '../functions/api/[[path]]'
import { WorkersAIProvider } from '../src/server/providers/workers-ai'
import { MockE2BProvider } from '../src/server/providers/mock-e2b'
import { SafeMcpToolProvider } from '../src/server/providers/mcp'
import { validateAgentPlan } from '../src/server/plan'
import { issueTestToken } from '../src/server/auth'
import { createTestDatabase, seedAccess } from './d1'
import type { Env } from '../src/server/config'

const goal = 'Analyze the scoped CSV and produce a verified report'
const sessionId = () => crypto.randomUUID()
const plan = (id: string, source = 'fixture') => ({ sessionId: id, tenantId: 'tenant-a', projectId: 'project-a', steps: [{ tool: 'analyze_csv', args: { sessionId: id, source }, expectedResult: 'csv-report' }] })
const ai = (reply: unknown) => ({ run: vi.fn(async () => ({ response: JSON.stringify(reply) })) })

async function setup() {
  const { binding, database } = await createTestDatabase()
  seedAccess(database, { subject: 'user-a', tenantId: 'tenant-a', projectId: 'project-a' })
  seedAccess(database, { subject: 'user-a', tenantId: 'tenant-read', projectId: 'project-read', projectRole: 'viewer' })
  seedAccess(database, { subject: 'user-b', tenantId: 'tenant-b', projectId: 'project-b' })
  seedAccess(database, { subject: 'user-b', tenantId: 'tenant-a', projectId: 'project-private' })
  const env: Env = { DB: binding, APP_ENV: 'test', AUTH_TEST_MODE: 'true', AUTH_TEST_SIGNING_SECRET: 'test-only-key', EXECUTION_PROVIDER: 'mock' }
  const token = await issueTestToken(env, { subject: 'user-a' })
  const headers = (tenant = 'tenant-a', project = 'project-a') => ({ authorization: `Bearer ${token}`, 'x-vestren-tenant': tenant, 'x-vestren-project': project, 'content-type': 'application/json' })
  const request = (id: string, tenant?: string, project?: string, csv?: string) => app.request('/api/agent/runs', { method: 'POST', headers: headers(tenant, project), body: JSON.stringify({ sessionId: id, goal, ...(csv ? { csv } : {}) }) }, env)
  return { env, database, request, headers }
}

describe('S3 structured LLM boundary', () => {
  it('invokes Workers AI with only goal, scope and allowlisted schema, never raw CSV or credentials', async () => {
    const id = sessionId(); const binding = ai(plan(id)); const provider = new WorkersAIProvider(binding)
    await expect(provider.plan({ goal, sessionId: id, tenantId: 'tenant-a', projectId: 'project-a', tools: new SafeMcpToolProvider().list().filter((tool) => tool.name === 'analyze_csv') })).resolves.toEqual(plan(id))
    expect(binding.run).toHaveBeenCalledOnce()
    expect(JSON.stringify(binding.run.mock.calls)).not.toContain('E2B_API_KEY')
  })

  it('rejects malformed plan, unknown tool, wrong arguments, scope, scripts and step overflow', () => {
    const id = sessionId(); const tools = new SafeMcpToolProvider({ sessionId: id })
    const scope = { sessionId: id, tenantId: 'tenant-a', projectId: 'project-a', source: 'fixture' as const }
    expect(validateAgentPlan(plan(id), scope, tools, 3).steps[0].tool).toBe('analyze_csv')
    const invalid = [null, { ...plan(id), script: 'print(1)' }, { ...plan(id), steps: [{ ...plan(id).steps[0], code: 'print(1)' }] }]
    for (const raw of invalid) expect(() => validateAgentPlan(raw, scope, tools, 3)).toThrow('INVALID_AGENT_PLAN')
    expect(() => validateAgentPlan({ ...plan(id), steps: [{ ...plan(id).steps[0], tool: 'shell' }] }, scope, tools, 3)).toThrow('TOOL_NOT_ALLOWED')
    expect(() => validateAgentPlan(plan(id, 'submitted'), scope, tools, 3)).toThrow('INVALID_TOOL_ARGUMENTS')
    expect(() => validateAgentPlan({ ...plan(id), tenantId: 'tenant-b' }, scope, tools, 3)).toThrow('AUTHORIZATION_SCOPE_MISMATCH')
    expect(() => validateAgentPlan({ ...plan(id), projectId: 'project-private' }, scope, tools, 3)).toThrow('AUTHORIZATION_SCOPE_MISMATCH')
    expect(() => validateAgentPlan({ ...plan(id), steps: [plan(id).steps[0], plan(id).steps[0]] }, scope, tools, 1)).toThrow('GUARDRAIL_STEP_LIMIT')
  })
})

describe('S3 scoped agent endpoint', () => {
  beforeEach(() => vi.restoreAllMocks())
  it('denies unauthenticated, viewer, cross-tenant and cross-project requests before calling LLM', async () => {
    const { env, request } = await setup(); const id = sessionId(); const binding = ai(plan(id)); env.AI = binding
    expect((await app.request('/api/agent/runs', { method: 'POST', body: JSON.stringify({ sessionId: id, goal }) }, env)).status).toBe(401)
    for (const [tenant, project] of [['tenant-read', 'project-read'], ['tenant-b', 'project-b'], ['tenant-a', 'project-private']]) expect((await request(id, tenant, project)).status).toBe(403)
    expect(binding.run).not.toHaveBeenCalled()
  })

  it('performs intent → plan → validate → tool → execution provider → verification and persists audit', async () => {
    const { env, database, request } = await setup(); const id = sessionId(); const binding = ai(plan(id)); env.AI = binding
    const execute = vi.spyOn(MockE2BProvider.prototype, 'execute')
    const response = await request(id)
    expect(response.status).toBe(200)
    const body = await response.json() as { status: string; audit: Array<{ action: string }>; executionId: string }
    expect(body.status).toBe('verified')
    expect(execute).toHaveBeenCalledOnce()
    expect(body.audit.map((event) => event.action)).toEqual(expect.arrayContaining(['request.received', 'plan.created', 'plan.validated', 'tool.selected', 'execution.started', 'verification.passed', 'artifact.persisted']))
    expect(database.exec(`SELECT status FROM executions WHERE id = '${body.executionId}'`)[0].values[0][0]).toBe('verified')
    expect(database.exec("SELECT COUNT(*) FROM audit_events WHERE action = 'plan.validated'")[0].values[0][0]).toBe(1)
    expect(JSON.stringify(binding.run.mock.calls)).not.toContain('region,product,revenue')
  })

  it('rejects LLM plan that switches scope or uses shell without reaching execution', async () => {
    const { env, database, request } = await setup(); const execute = vi.spyOn(MockE2BProvider.prototype, 'execute')
    for (const mutate of [(p: ReturnType<typeof plan>) => ({ ...p, tenantId: 'tenant-b' }), (p: ReturnType<typeof plan>) => ({ ...p, projectId: 'project-private' }), (p: ReturnType<typeof plan>) => ({ ...p, steps: [{ ...p.steps[0], tool: 'shell' }] })]) {
      const id = sessionId(); env.AI = ai(mutate(plan(id)))
      expect((await request(id)).status).toBe(mutate(plan(id)).steps[0].tool === 'shell' ? 400 : 403)
    }
    expect(execute).not.toHaveBeenCalled()
    expect(database.exec("SELECT COUNT(*) FROM audit_events WHERE action = 'plan.rejected'")[0].values[0][0]).toBe(3)
  })

  it('fails closed on provider failure, invalid plan, step limit, deadline and execution failure', async () => {
    const { env, database, request } = await setup(); const execute = vi.spyOn(MockE2BProvider.prototype, 'execute')
    const cases: Array<[unknown, number, string]> = [
      [null, 500, 'LLM_PROVIDER_FAILED'],
      [{ response: 'not-json' }, 500, 'LLM_PROVIDER_FAILED'],
      [{ response: JSON.stringify({ bad: true }) }, 400, 'INVALID_AGENT_PLAN'],
    ]
    for (const [answer, status, failure] of cases) {
      const id = sessionId(); env.AI = { run: vi.fn(async () => { if (answer === null) throw new Error('secret=never-log'); return answer }) }
      expect((await request(id)).status).toBe(status)
      expect(database.exec(`SELECT error_class FROM executions WHERE session_id = '${id}'`)[0].values[0][0]).toBe(failure)
    }
    expect(execute).not.toHaveBeenCalled()
    const id = sessionId(); env.AI = ai({ ...plan(id), steps: [plan(id).steps[0], plan(id).steps[0]] }); env.MAX_ITERATIONS = '1'
    expect((await request(id)).status).toBe(429)
    const slow = sessionId(); env.AI = { run: vi.fn(() => new Promise<never>(() => {})) }; env.EXECUTION_TIMEOUT_MS = '1'
    expect((await request(slow)).status).toBe(429)
    env.EXECUTION_TIMEOUT_MS = '15000'; const failing = sessionId(); env.AI = ai(plan(failing))
    execute.mockRejectedValueOnce(new Error('secret=never-log'))
    expect((await request(failing)).status).toBe(500)
    expect(database.exec(`SELECT error_class FROM executions WHERE session_id = '${failing}'`)[0].values[0][0]).toBe('RUN_FAILED')
    expect(JSON.stringify(database.exec('SELECT payload FROM audit_events'))).not.toContain('secret=never-log')
  })

  it('rejects unconfigured LLM while leaving deterministic S2 route operational', async () => {
    const { env, request, headers } = await setup(); const id = sessionId()
    expect((await request(id)).status).toBe(503)
    expect((await app.request('/api/runs', { method: 'POST', headers: headers(), body: JSON.stringify({ sessionId: sessionId(), goal }) }, env)).status).toBe(200)
  })
})
