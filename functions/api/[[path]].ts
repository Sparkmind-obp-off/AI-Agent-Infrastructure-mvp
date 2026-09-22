import { Hono } from 'hono'
import { z } from 'zod'
import { authorize, issueDemoToken } from '../../src/server/auth'
import type { Env } from '../../src/server/config'
import { runCsvAgent } from '../../src/server/runtime'

export const app = new Hono<{ Bindings: Env }>()
const runSchema = z.object({ sessionId: z.string().uuid(), goal: z.string().min(10).max(500) })
const artifactKeySchema = z.string().regex(/^sessions\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/report\.md$/i)

app.get('/api/health', (c) => c.json({ ok: true, service: 'vestren-workbench', executionProvider: c.env.EXECUTION_PROVIDER ?? 'mock' }))
app.post('/api/auth/demo', async (c) => c.json({ token: await issueDemoToken(c.env) }))
app.post('/api/runs', async (c) => {
  const principal = await authorize(c.req.raw, c.env); if (!principal) return c.json({ error: 'Unauthorized' }, 401)
  const parsed = runSchema.safeParse(await c.req.json().catch(() => null)); if (!parsed.success) return c.json({ error: 'Invalid request', details: parsed.error.issues }, 400)
  try { return c.json(await runCsvAgent(c.env, { ...parsed.data, principal })) }
  catch (error) {
    const code = error instanceof Error ? error.message.split(':', 1)[0] : 'UNKNOWN_ERROR'
    if (code === 'AUTHORIZATION_SCOPE_MISMATCH') return c.json({ error: code }, 403)
    if (code.startsWith('GUARDRAIL_')) return c.json({ error: code }, 429)
    if (code === 'E2B_NOT_CONFIGURED') return c.json({ error: code }, 503)
    return c.json({ error: 'RUN_FAILED' }, 500)
  }
})
app.get('/api/sessions/:id', async (c) => {
  const principal = await authorize(c.req.raw, c.env); if (!principal) return c.json({ error: 'Unauthorized' }, 401)
  if (!c.env.DB) return c.json({ error: 'Persistence unavailable' }, 503)
  const session = await c.env.DB.prepare('SELECT * FROM sessions WHERE id = ? AND tenant_id = ? AND project_id = ?')
    .bind(c.req.param('id'), principal.tenant, principal.project).first()
  if (!session) return c.notFound()
  const audit = await c.env.DB.prepare(`SELECT ae.payload FROM audit_events ae JOIN sessions s ON s.id = ae.session_id
    WHERE ae.session_id = ? AND s.tenant_id = ? AND s.project_id = ? ORDER BY ae.created_at`)
    .bind(c.req.param('id'), principal.tenant, principal.project).all<{ payload: string }>()
  return c.json({ session, audit: audit.results.map((row) => JSON.parse(row.payload)) })
})
app.get('/api/artifacts/:key{.+}', async (c) => {
  const principal = await authorize(c.req.raw, c.env); if (!principal) return c.json({ error: 'Unauthorized' }, 401)
  if (!c.env.DB) return c.json({ error: 'Persistence unavailable' }, 503)
  let key: string
  try { key = decodeURIComponent(c.req.param('key')) } catch { return c.json({ error: 'Invalid artifact key' }, 400) }
  const parsed = artifactKeySchema.safeParse(key)
  if (!parsed.success) return c.json({ error: 'Invalid artifact key' }, 400)
  const sessionId = parsed.data.split('/')[1]
  const metadata = await c.env.DB.prepare(`SELECT a.content, a.content_type FROM artifacts a JOIN sessions s ON s.id = a.session_id
    WHERE a.id = ? AND a.session_id = ? AND s.tenant_id = ? AND s.project_id = ?`)
    .bind(parsed.data, sessionId, principal.tenant, principal.project).first<{ content: string; content_type: string }>()
  if (!metadata) return c.notFound()
  const object = c.env.ARTIFACTS ? await c.env.ARTIFACTS.get(parsed.data) : null
  if (object) return new Response(object.body, { headers: { 'content-type': object.httpMetadata?.contentType ?? metadata.content_type, 'content-disposition': 'attachment; filename="vestren-report.md"' } })
  return new Response(metadata.content, { headers: { 'content-type': metadata.content_type, 'content-disposition': 'attachment; filename="vestren-report.md"' } })
})

export const onRequest = (context: { request: Request; env: Env; waitUntil: (promise: Promise<unknown>) => void }) => app.fetch(context.request, context.env, { waitUntil: context.waitUntil, passThroughOnException() {} } as ExecutionContext)
