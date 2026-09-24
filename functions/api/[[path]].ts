import { Hono, type Context } from 'hono'
import { z } from 'zod'
import { authenticate, isTestIdentityEnabled, issueTestToken, type AuthenticatedIdentity, type AuthenticationErrorCode } from '../../src/server/auth'
import { AuthorizationError, authorizeProject, listAccessibleProjects, requestedScope, syncIdentity, type Permission } from '../../src/server/authorization'
import type { Env } from '../../src/server/config'
import { runCsvAgent } from '../../src/server/runtime'
import { parseCsvInput } from '../../src/server/sample'

export const app = new Hono<{ Bindings: Env }>()
type AppContext = Context<{ Bindings: Env }>
const runSchema = z.object({ sessionId: z.string().uuid(), goal: z.string().min(10).max(500), csv: z.string().optional() })
const artifactKeySchema = z.string().regex(/^sessions\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/report\.md$/i)

const authStatus = (code: AuthenticationErrorCode) => code === 'IDENTITY_PROVIDER_UNAVAILABLE' ? 503 : 401
const authFailure = (c: AppContext, code: AuthenticationErrorCode) => c.json({ error: code }, authStatus(code))
const authorizationFailure = (c: AppContext, error: unknown) => {
  const code = error instanceof AuthorizationError ? error.code : 'AUTHORIZATION_DENIED'
  return c.json({ error: code }, code === 'IDENTITY_PROVIDER_UNAVAILABLE' ? 503 : 403)
}

async function identityFor(c: AppContext): Promise<AuthenticatedIdentity | Response> {
  const result = await authenticate(c.req.raw, c.env)
  return result.ok ? result.identity : authFailure(c, result.code)
}

async function contextFor(c: AppContext, permission: Permission) {
  const identity = await identityFor(c)
  if (identity instanceof Response) return identity
  const scope = requestedScope(c.req.raw)
  try { return await authorizeProject(c.env, identity, scope.tenantId, scope.projectId, permission) }
  catch (error) { return authorizationFailure(c, error) }
}

async function provisionLocalTestWorkspace(env: Env) {
  if (!env.DB) return
  const identity: AuthenticatedIdentity = {
    subject: 'test-user-a', issuer: 'https://identity.test.vestren.invalid/', provider: 'test', expiresAt: Math.floor(Date.now() / 1_000) + 3_600,
  }
  const userId = await syncIdentity(env, identity)
  const now = new Date().toISOString()
  await env.DB.prepare('INSERT OR IGNORE INTO tenants (id, name, created_at) VALUES (?, ?, ?)').bind('tenant-test-a', 'Local test tenant', now).run()
  await env.DB.prepare('INSERT OR IGNORE INTO projects (id, tenant_id, name, created_at) VALUES (?, ?, ?, ?)').bind('project-test-a', 'tenant-test-a', 'Local Workbench', now).run()
  await env.DB.prepare('INSERT OR IGNORE INTO tenant_memberships (tenant_id, user_id, role, status, created_at) VALUES (?, ?, ?, ?, ?)').bind('tenant-test-a', userId, 'owner', 'active', now).run()
  await env.DB.prepare('INSERT OR IGNORE INTO project_memberships (project_id, user_id, role, created_at) VALUES (?, ?, ?, ?)').bind('project-test-a', userId, 'owner', now).run()
}

app.get('/api/health', (c) => c.json({ ok: true, service: 'vestren-workbench', executionProvider: c.env.EXECUTION_PROVIDER ?? 'mock', identityProvider: c.env.AUTH0_ISSUER && c.env.AUTH0_AUDIENCE ? 'auth0' : isTestIdentityEnabled(c.env) ? 'test' : 'unconfigured' }))

app.post('/api/auth/test', async (c) => {
  if (!isTestIdentityEnabled(c.env)) return c.notFound()
  await provisionLocalTestWorkspace(c.env)
  return c.json({ token: await issueTestToken(c.env), tenantId: 'tenant-test-a', projectId: 'project-test-a' })
})

app.get('/api/me', async (c) => {
  const identity = await identityFor(c)
  if (identity instanceof Response) return identity
  try {
    return c.json({
      identity: { subject: identity.subject, provider: identity.provider, email: identity.email, displayName: identity.displayName, expiresAt: identity.expiresAt },
      projects: await listAccessibleProjects(c.env, identity),
    })
  } catch (error) { return authorizationFailure(c, error) }
})

async function startRun(c: AppContext, planner?: 'llm') {
  const context = await contextFor(c, 'execution:start')
  if (context instanceof Response) return context
  const parsed = runSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'INVALID_REQUEST' }, 400)
  if (parsed.data.csv !== undefined) {
    try { parseCsvInput(parsed.data.csv) } catch { return c.json({ error: 'INVALID_REQUEST' }, 400) }
  }
  try { return c.json(await runCsvAgent(c.env, { ...parsed.data, planner, principal: { tenant: context.tenantId, project: context.projectId, subject: context.identity.subject } })) }
  catch (error) {
    const code = error instanceof Error ? error.message.split(':', 1)[0] : 'UNKNOWN_ERROR'
    if (code === 'AUTHORIZATION_SCOPE_MISMATCH') return c.json({ error: 'AUTHORIZATION_DENIED' }, 403)
    if (code.startsWith('GUARDRAIL_')) return c.json({ error: code }, 429)
    if (code === 'E2B_NOT_CONFIGURED' || code === 'LLM_NOT_CONFIGURED') return c.json({ error: code }, 503)
    if (['INVALID_AGENT_PLAN', 'INVALID_TOOL_ARGUMENTS', 'TOOL_NOT_ALLOWED'].includes(code)) return c.json({ error: code }, 400)
    return c.json({ error: 'RUN_FAILED' }, 500)
  }
}

app.post('/api/runs', (c) => startRun(c))
app.post('/api/agent/runs', (c) => startRun(c, 'llm'))

app.get('/api/sessions/:id', async (c) => {
  const context = await contextFor(c, 'session:read')
  if (context instanceof Response) return context
  if (!c.env.DB) return c.json({ error: 'PERSISTENCE_UNAVAILABLE' }, 503)
  const session = await c.env.DB.prepare('SELECT * FROM sessions WHERE id = ? AND tenant_id = ? AND project_id = ?')
    .bind(c.req.param('id'), context.tenantId, context.projectId).first()
  if (!session) return c.notFound()
  const audit = await c.env.DB.prepare(`SELECT ae.payload FROM audit_events ae JOIN sessions s ON s.id = ae.session_id
    WHERE ae.session_id = ? AND s.tenant_id = ? AND s.project_id = ? ORDER BY ae.created_at`)
    .bind(c.req.param('id'), context.tenantId, context.projectId).all<{ payload: string }>()
  return c.json({ session, audit: audit.results.map((row) => JSON.parse(row.payload)) })
})

app.get('/api/executions/:id', async (c) => {
  const context = await contextFor(c, 'session:read')
  if (context instanceof Response) return context
  if (!c.env.DB) return c.json({ error: 'PERSISTENCE_UNAVAILABLE' }, 503)
  const execution = await c.env.DB.prepare(`SELECT e.* FROM executions e JOIN sessions s ON s.id = e.session_id
    WHERE e.id = ? AND s.tenant_id = ? AND s.project_id = ?`)
    .bind(c.req.param('id'), context.tenantId, context.projectId).first()
  return execution ? c.json({ execution }) : c.notFound()
})

app.get('/api/artifacts/:key{.+}', async (c) => {
  const context = await contextFor(c, 'artifact:read')
  if (context instanceof Response) return context
  if (!c.env.DB) return c.json({ error: 'PERSISTENCE_UNAVAILABLE' }, 503)
  let key: string
  try { key = decodeURIComponent(c.req.param('key')) } catch { return c.json({ error: 'INVALID_ARTIFACT_KEY' }, 400) }
  const parsed = artifactKeySchema.safeParse(key)
  if (!parsed.success) return c.json({ error: 'INVALID_ARTIFACT_KEY' }, 400)
  const sessionId = parsed.data.split('/')[1]
  const metadata = await c.env.DB.prepare(`SELECT a.content, a.content_type FROM artifacts a JOIN sessions s ON s.id = a.session_id
    WHERE a.id = ? AND a.session_id = ? AND s.tenant_id = ? AND s.project_id = ?`)
    .bind(parsed.data, sessionId, context.tenantId, context.projectId).first<{ content: string; content_type: string }>()
  if (!metadata) return c.notFound()
  const object = c.env.ARTIFACTS ? await c.env.ARTIFACTS.get(parsed.data) : null
  if (object) return new Response(object.body, { headers: { 'content-type': object.httpMetadata?.contentType ?? metadata.content_type, 'content-disposition': 'attachment; filename="vestren-report.md"' } })
  return new Response(metadata.content, { headers: { 'content-type': metadata.content_type, 'content-disposition': 'attachment; filename="vestren-report.md"' } })
})

export const onRequest = (context: { request: Request; env: Env; waitUntil: (promise: Promise<unknown>) => void }) => app.fetch(context.request, context.env, { waitUntil: context.waitUntil, passThroughOnException() {} } as ExecutionContext)
