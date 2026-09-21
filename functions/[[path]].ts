import { Hono } from 'hono'
import { z } from 'zod'
import { authorize, issueDemoToken } from '../src/server/auth'
import type { Env } from '../src/server/config'
import { runCsvAgent } from '../src/server/runtime'

const app = new Hono<{ Bindings: Env }>()
const runSchema = z.object({ sessionId: z.string().uuid(), goal: z.string().min(10).max(500) })

app.get('/api/health', (c) => c.json({ ok: true, service: 'vestren-workbench', executionProvider: c.env.EXECUTION_PROVIDER ?? 'mock' }))
app.post('/api/auth/demo', async (c) => c.json({ token: await issueDemoToken(c.env) }))
app.post('/api/runs', async (c) => {
  const principal = await authorize(c.req.raw, c.env); if (!principal) return c.json({ error: 'Unauthorized' }, 401)
  const parsed = runSchema.safeParse(await c.req.json().catch(() => null)); if (!parsed.success) return c.json({ error: 'Invalid request', details: parsed.error.issues }, 400)
  try { return c.json(await runCsvAgent(c.env, { ...parsed.data, authorized: principal.tenant === 'demo-tenant' })) }
  catch (error) { const message = error instanceof Error ? error.message : 'UNKNOWN_ERROR'; return c.json({ error: message }, message.startsWith('GUARDRAIL_') ? 429 : 500) }
})
app.get('/api/sessions/:id', async (c) => {
  if (!await authorize(c.req.raw, c.env)) return c.json({ error: 'Unauthorized' }, 401)
  if (!c.env.DB) return c.json({ session: null, audit: [] })
  const session = await c.env.DB.prepare('SELECT * FROM sessions WHERE id = ? AND tenant_id = ?').bind(c.req.param('id'), 'demo-tenant').first()
  const audit = await c.env.DB.prepare('SELECT payload FROM audit_events WHERE session_id = ? ORDER BY created_at').bind(c.req.param('id')).all<{ payload: string }>()
  return c.json({ session, audit: audit.results.map((row) => JSON.parse(row.payload)) })
})
app.get('/api/artifacts/:key{.+}', async (c) => {
  if (!await authorize(c.req.raw, c.env)) return c.json({ error: 'Unauthorized' }, 401)
  const key = decodeURIComponent(c.req.param('key')); const object = c.env.ARTIFACTS ? await c.env.ARTIFACTS.get(key) : null
  if (object) return new Response(object.body, { headers: { 'content-type': object.httpMetadata?.contentType ?? 'application/octet-stream', 'content-disposition': 'attachment; filename="vestren-report.md"' } })
  if (!c.env.DB) return c.notFound(); const row = await c.env.DB.prepare('SELECT content, content_type FROM artifacts WHERE id = ?').bind(key).first<{ content: string; content_type: string }>()
  return row ? new Response(row.content, { headers: { 'content-type': row.content_type, 'content-disposition': 'attachment; filename="vestren-report.md"' } }) : c.notFound()
})

export const onRequest = (context: { request: Request; env: Env; waitUntil: (promise: Promise<unknown>) => void }) => app.fetch(context.request, context.env, { waitUntil: context.waitUntil, passThroughOnException() {} } as ExecutionContext)
