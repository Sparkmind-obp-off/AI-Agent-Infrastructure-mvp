import { beforeEach, describe, expect, it } from 'vitest'
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose'
import { app } from '../functions/api/[[path]]'
import { Auth0IdentityProvider, TestIdentityProvider, issueTestToken, type AuthenticationResult } from '../src/server/auth'
import { createTestDatabase, seedAccess } from './d1'
import type { Env } from '../src/server/config'

const testEnv = (DB?: D1Database): Env => ({
  DB,
  APP_ENV: 'test',
  AUTH_TEST_MODE: 'true',
  AUTH_TEST_SIGNING_SECRET: 'integration-test-secret-that-is-not-production',
  EXECUTION_PROVIDER: 'mock',
})

const scopeHeaders = (token: string, tenantId: string, projectId: string) => ({
  authorization: `Bearer ${token}`,
  'x-vestren-tenant': tenantId,
  'x-vestren-project': projectId,
})

async function expectAuthCode(result: Promise<AuthenticationResult>, code: string) {
  await expect(result).resolves.toMatchObject({ ok: false, code })
}

describe('identity provider boundary', () => {
  it('normalizes missing, malformed, expired, and tampered test credentials', async () => {
    const env = testEnv()
    const provider = new TestIdentityProvider(env.AUTH_TEST_SIGNING_SECRET!)
    await expectAuthCode(provider.verifyRequest(new Request('https://example.test')), 'AUTHENTICATION_REQUIRED')
    await expectAuthCode(provider.verifyRequest(new Request('https://example.test', { headers: { authorization: 'Basic no' } })), 'AUTHENTICATION_INVALID')
    const expired = await issueTestToken(env, { expiresInSeconds: -10 })
    await expectAuthCode(provider.verifyRequest(new Request('https://example.test', { headers: { authorization: `Bearer ${expired}` } })), 'AUTHENTICATION_EXPIRED')
    const valid = await issueTestToken(env, { subject: 'user-a' })
    await expect(provider.verifyRequest(new Request('https://example.test', { headers: { authorization: `Bearer ${valid}` } }))).resolves.toMatchObject({ ok: true, identity: { subject: 'user-a', provider: 'test' } })
    await expectAuthCode(provider.verifyRequest(new Request('https://example.test', { headers: { authorization: `Bearer ${valid}tampered` } })), 'AUTHENTICATION_INVALID')
  })

  it('verifies Auth0-shaped RS256 tokens and rejects wrong issuer, audience, claims, and algorithm', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256')
    const jwk = await exportJWK(publicKey); jwk.kid = 'test-key'; jwk.use = 'sig'; jwk.alg = 'RS256'
    const issuer = 'https://tenant.auth0.test/'
    const audience = 'https://api.vestren.test'
    const provider = new Auth0IdentityProvider(issuer, audience, createLocalJWKSet({ keys: [jwk] }))
    const sign = (overrides: { issuer?: string; audience?: string; subject?: string; expiresIn?: string; omitExpiration?: boolean } = {}) => {
      let jwt = new SignJWT({})
        .setProtectedHeader({ alg: 'RS256', kid: 'test-key', typ: 'JWT' })
        .setIssuer(overrides.issuer ?? issuer)
        .setAudience(overrides.audience ?? audience)
        .setSubject(overrides.subject ?? 'auth0|user-a')
        .setIssuedAt()
      if (!overrides.omitExpiration) jwt = jwt.setExpirationTime(overrides.expiresIn ?? '5m')
      return jwt.sign(privateKey)
    }
    const request = async (token: string) => provider.verifyRequest(new Request('https://example.test', { headers: { authorization: `Bearer ${token}` } }))
    await expect(request(await sign())).resolves.toMatchObject({ ok: true, identity: { subject: 'auth0|user-a', provider: 'auth0' } })
    await expectAuthCode(request(await sign({ issuer: 'https://wrong.example/' })), 'AUTHENTICATION_INVALID')
    await expectAuthCode(request(await sign({ audience: 'wrong-audience' })), 'AUTHENTICATION_INVALID')
    await expectAuthCode(request(await sign({ subject: '' })), 'AUTHENTICATION_INVALID')
    await expectAuthCode(request(await sign({ omitExpiration: true })), 'AUTHENTICATION_INVALID')
    await expectAuthCode(request(await sign({ expiresIn: '-10s' })), 'AUTHENTICATION_EXPIRED')
    await expectAuthCode(request('not.a.jwt'), 'AUTHENTICATION_INVALID')
    await expectAuthCode(request(`${await sign()}tampered`), 'AUTHENTICATION_INVALID')
    const { privateKey: otherKey } = await generateKeyPair('RS256')
    const forged = await new SignJWT({}).setProtectedHeader({ alg: 'RS256', kid: 'test-key' }).setIssuer(issuer).setAudience(audience).setSubject('auth0|user-a').setExpirationTime('5m').sign(otherKey)
    await expectAuthCode(request(forged), 'AUTHENTICATION_INVALID')
    const hsToken = await new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setIssuer(issuer).setAudience(audience).setSubject('user-a').setExpirationTime('5m').sign(new TextEncoder().encode('wrong-algorithm-secret'))
    await expectAuthCode(request(hsToken), 'AUTHENTICATION_INVALID')
  })

  it('fails closed when production identity configuration is absent and test auth is disabled', async () => {
    const production: Env = { APP_ENV: 'production', AUTH_TEST_MODE: 'true', AUTH_TEST_SIGNING_SECRET: 'should-not-activate' }
    const testIssuer = await app.request('/api/auth/test', { method: 'POST' }, production)
    expect(testIssuer.status).toBe(404)
    const protectedResponse = await app.request('/api/me', {}, production)
    expect(protectedResponse.status).toBe(503)
    await expect(protectedResponse.json()).resolves.toMatchObject({ error: 'IDENTITY_PROVIDER_UNAVAILABLE' })
    for (const appEnv of [undefined, 'preview', 'production'] as const) {
      const env: Env = { APP_ENV: appEnv, AUTH_TEST_MODE: 'true', AUTH_TEST_SIGNING_SECRET: 'local-only-signing-key' }
      expect((await app.request('/api/auth/test', { method: 'POST' }, env)).status).toBe(404)
      await expect(issueTestToken(env)).rejects.toThrow('TEST_AUTH_DISABLED')
    }
    const testToken = await issueTestToken(testEnv())
    const configuredProduction: Env = { ...production, AUTH0_ISSUER: 'https://tenant.auth0.test/', AUTH0_AUDIENCE: 'https://api.vestren.test' }
    expect((await app.request('/api/me', { headers: { authorization: `Bearer ${testToken}` } }, configuredProduction)).status).toBe(401)
  })
})

describe('HTTP identity to tenant and project authorization integration', () => {
  let env: Env
  let database: Awaited<ReturnType<typeof createTestDatabase>>['database']
  let tokenA: string
  let tokenB: string

  beforeEach(async () => {
    const testDatabase = await createTestDatabase(); database = testDatabase.database; env = testEnv(testDatabase.binding)
    seedAccess(database, { subject: 'user-a', tenantId: 'tenant-a', projectId: 'project-a', projectRole: 'editor' })
    seedAccess(database, { subject: 'user-a', tenantId: 'tenant-read', projectId: 'project-read', projectRole: 'viewer' })
    seedAccess(database, { subject: 'user-b', tenantId: 'tenant-b', projectId: 'project-b', projectRole: 'owner', tenantRole: 'owner' })
    seedAccess(database, { subject: 'user-b', tenantId: 'tenant-a', projectId: 'project-private', projectRole: 'owner' })
    tokenA = await issueTestToken(env, { subject: 'user-a' })
    tokenB = await issueTestToken(env, { subject: 'user-b' })
  })

  it('resolves only authoritative memberships and completes the canonical scoped flow', async () => {
    const missing = await app.request('/api/me', {}, env)
    expect(missing.status).toBe(401)
    const me = await app.request('/api/me', { headers: { authorization: `Bearer ${tokenA}` } }, env)
    expect(me.status).toBe(200)
    const meBody = await me.json() as { projects: Array<{ tenantId: string; projectId: string }> }
    expect(meBody.projects).toEqual(expect.arrayContaining([
      expect.objectContaining({ tenantId: 'tenant-a', projectId: 'project-a' }),
      expect.objectContaining({ tenantId: 'tenant-read', projectId: 'project-read' }),
    ]))
    expect(meBody.projects).not.toEqual(expect.arrayContaining([expect.objectContaining({ tenantId: 'tenant-b' })]))

    const sessionId = crypto.randomUUID()
    const run = await app.request('/api/runs', {
      method: 'POST', headers: { ...scopeHeaders(tokenA, 'tenant-a', 'project-a'), 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId, goal: 'Analyze this CSV and return a report artifact' }),
    }, env)
    expect(run.status).toBe(200)
    const runBody = await run.json() as { executionId: string; artifacts: Array<{ url: string }> }
    const session = await app.request(`/api/sessions/${sessionId}`, { headers: scopeHeaders(tokenA, 'tenant-a', 'project-a') }, env)
    expect(session.status).toBe(200)
    const execution = await app.request(`/api/executions/${runBody.executionId}`, { headers: scopeHeaders(tokenA, 'tenant-a', 'project-a') }, env)
    expect(execution.status).toBe(200)
    const artifact = await app.request(runBody.artifacts[0].url, { headers: scopeHeaders(tokenA, 'tenant-a', 'project-a') }, env)
    expect(artifact.status).toBe(200)
    expect(await artifact.text()).toContain('# Vestren CSV Analysis')
  })

  it('denies viewer execution and arbitrary tenant or project switching', async () => {
    const body = JSON.stringify({ sessionId: crypto.randomUUID(), goal: 'Analyze this CSV and return a report artifact' })
    const viewer = await app.request('/api/runs', { method: 'POST', headers: { ...scopeHeaders(tokenA, 'tenant-read', 'project-read'), 'content-type': 'application/json' }, body }, env)
    expect(viewer.status).toBe(403)
    await expect(viewer.json()).resolves.toMatchObject({ error: 'AUTHORIZATION_DENIED' })
    const foreign = await app.request('/api/runs', { method: 'POST', headers: { ...scopeHeaders(tokenA, 'tenant-b', 'project-b'), 'content-type': 'application/json' }, body }, env)
    expect(foreign.status).toBe(403)
    const mismatched = await app.request('/api/runs', { method: 'POST', headers: { ...scopeHeaders(tokenA, 'tenant-a', 'project-b'), 'content-type': 'application/json' }, body }, env)
    expect(mismatched.status).toBe(403)
  })

  it('enforces owner/editor/viewer roles and active D1 membership rather than client selectors', async () => {
    const body = JSON.stringify({ sessionId: crypto.randomUUID(), goal: 'Analyze this CSV and return a report artifact' })
    const viewerHeaders = scopeHeaders(tokenA, 'tenant-read', 'project-read')
    const viewerRead = await app.request(`/api/sessions/${crypto.randomUUID()}`, { headers: viewerHeaders }, env)
    expect(viewerRead.status).toBe(404) // Authorized read; resource does not exist.
    expect((await app.request('/api/runs', { method: 'POST', headers: { ...viewerHeaders, 'content-type': 'application/json' }, body }, env)).status).toBe(403)
    const owner = await app.request('/api/runs', { method: 'POST', headers: { ...scopeHeaders(tokenB, 'tenant-b', 'project-b'), 'content-type': 'application/json' }, body }, env)
    expect(owner.status).toBe(200)
    database.run("UPDATE tenant_memberships SET status = 'suspended' WHERE tenant_id = ? AND user_id = ?", ['tenant-a', 'test:user-a'])
    expect((await app.request('/api/runs', { method: 'POST', headers: { ...scopeHeaders(tokenA, 'tenant-a', 'project-a'), 'content-type': 'application/json' }, body }, env)).status).toBe(403)
    expect((await app.request('/api/me', { headers: { authorization: `Bearer ${tokenA}` } }, env)).status).toBe(200)
    database.run("UPDATE tenant_memberships SET status = 'active' WHERE tenant_id = ? AND user_id = ?", ['tenant-a', 'test:user-a'])
    database.run('DELETE FROM project_memberships WHERE project_id = ? AND user_id = ?', ['project-a', 'test:user-a'])
    expect((await app.request('/api/runs', { method: 'POST', headers: { ...scopeHeaders(tokenA, 'tenant-a', 'project-a'), 'content-type': 'application/json' }, body }, env)).status).toBe(403)
  })

  it('denies another project in the same tenant even when headers, query, or body name it', async () => {
    const sessionId = crypto.randomUUID(); const executionId = crypto.randomUUID(); const artifactKey = `sessions/${sessionId}/${executionId}/report.md`; const now = new Date().toISOString()
    database.run('INSERT INTO sessions (id, tenant_id, project_id, goal, status, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [sessionId, 'tenant-a', 'project-private', 'Private project', 'verified', now])
    database.run('INSERT INTO executions (id, session_id, provider, status, tool_calls, iterations, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [executionId, sessionId, 'mock-e2b', 'verified', 1, 1, 10, now])
    database.run('INSERT INTO artifacts (id, session_id, name, content, content_type, size_bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [artifactKey, sessionId, 'report.md', 'private', 'text/markdown', 7, now])
    database.run('INSERT INTO audit_events (id, session_id, action, payload, created_at) VALUES (?, ?, ?, ?, ?)', [crypto.randomUUID(), sessionId, 'private.event', JSON.stringify({ secret: 'must-not-leak' }), now])
    const ownHeaders = scopeHeaders(tokenA, 'tenant-a', 'project-a')
    const forgedHeaders = scopeHeaders(tokenA, 'tenant-a', 'project-private')
    for (const headers of [ownHeaders, forgedHeaders]) {
      expect((await app.request(`/api/sessions/${sessionId}?projectId=project-private`, { headers }, env)).status).toBe(headers === ownHeaders ? 404 : 403)
      expect((await app.request(`/api/executions/${executionId}`, { headers }, env)).status).toBe(headers === ownHeaders ? 404 : 403)
      expect((await app.request(`/api/artifacts/${encodeURIComponent(artifactKey)}`, { headers }, env)).status).toBe(headers === ownHeaders ? 404 : 403)
    }
    const body = JSON.stringify({ sessionId: crypto.randomUUID(), goal: 'Analyze this CSV and return a report artifact', projectId: 'project-private', tenantId: 'tenant-a' })
    expect((await app.request('/api/runs', { method: 'POST', headers: { ...forgedHeaders, 'content-type': 'application/json' }, body }, env)).status).toBe(403)
    const run = await app.request('/api/runs?projectId=project-private', { method: 'POST', headers: { ...ownHeaders, 'content-type': 'application/json' }, body }, env)
    expect(run.status).toBe(200)
    const result = await run.json() as { sessionId: string }
    expect((await env.DB!.prepare('SELECT project_id FROM sessions WHERE id = ?').bind(result.sessionId).first<{ project_id: string }>())?.project_id).toBe('project-a')
  })

  it('prevents session, execution, artifact, and audit takeover across tenants before R2 access', async () => {
    const sessionId = crypto.randomUUID(); const executionId = crypto.randomUUID(); const artifactKey = `sessions/${sessionId}/${executionId}/report.md`; const now = new Date().toISOString()
    database.run('INSERT INTO sessions (id, tenant_id, project_id, goal, status, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [sessionId, 'tenant-b', 'project-b', 'Private task', 'verified', now])
    database.run('INSERT INTO executions (id, session_id, provider, status, tool_calls, iterations, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [executionId, sessionId, 'mock-e2b', 'verified', 1, 1, 10, now])
    database.run('INSERT INTO artifacts (id, session_id, name, content, content_type, size_bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [artifactKey, sessionId, 'report.md', 'private', 'text/markdown', 7, now])
    database.run('INSERT INTO audit_events (id, session_id, action, payload, created_at) VALUES (?, ?, ?, ?, ?)', [crypto.randomUUID(), sessionId, 'private.event', JSON.stringify({ secret: 'must-not-leak' }), now])
    let r2Read = false
    env.ARTIFACTS = { get: async () => { r2Read = true; return null } } as unknown as R2Bucket

    const headersA = scopeHeaders(tokenA, 'tenant-a', 'project-a')
    expect((await app.request(`/api/sessions/${sessionId}`, { headers: headersA }, env)).status).toBe(404)
    expect((await app.request(`/api/executions/${executionId}`, { headers: headersA }, env)).status).toBe(404)
    expect((await app.request(`/api/artifacts/${encodeURIComponent(artifactKey)}`, { headers: headersA }, env)).status).toBe(404)
    const switchedHeaders = scopeHeaders(tokenA, 'tenant-b', 'project-b')
    expect((await app.request(`/api/sessions/${sessionId}`, { headers: switchedHeaders }, env)).status).toBe(403)
    expect((await app.request(`/api/executions/${executionId}`, { headers: switchedHeaders }, env)).status).toBe(403)
    expect((await app.request(`/api/artifacts/${encodeURIComponent(artifactKey)}`, { headers: switchedHeaders }, env)).status).toBe(403)
    expect(r2Read).toBe(false)

    const headersB = scopeHeaders(tokenB, 'tenant-b', 'project-b')
    const ownerSession = await app.request(`/api/sessions/${sessionId}`, { headers: headersB }, env)
    expect(ownerSession.status).toBe(200)
    expect(JSON.stringify(await ownerSession.json())).toContain('must-not-leak')
  })

  it('rejects malformed artifact keys before storage access', async () => {
    let r2Read = false
    env.ARTIFACTS = { get: async () => { r2Read = true; return null } } as unknown as R2Bucket
    const response = await app.request('/api/artifacts/..%2Fsecret', { headers: scopeHeaders(tokenA, 'tenant-a', 'project-a') }, env)
    expect(response.status).toBe(400)
    expect(r2Read).toBe(false)
  })
})
