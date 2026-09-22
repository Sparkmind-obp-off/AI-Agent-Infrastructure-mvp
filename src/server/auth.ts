import { createRemoteJWKSet, jwtVerify, SignJWT, type JWTVerifyGetKey } from 'jose'
import type { Env } from './config'

export interface AuthenticatedIdentity {
  subject: string
  issuer: string
  provider: 'auth0' | 'test'
  email?: string
  displayName?: string
  authenticatedAt?: number
  expiresAt: number
}

export type AuthenticationErrorCode =
  | 'AUTHENTICATION_REQUIRED'
  | 'AUTHENTICATION_INVALID'
  | 'AUTHENTICATION_EXPIRED'
  | 'IDENTITY_PROVIDER_UNAVAILABLE'

export type AuthenticationResult =
  | { ok: true; identity: AuthenticatedIdentity }
  | { ok: false; code: AuthenticationErrorCode }

export interface IdentityProvider {
  verifyRequest(request: Request): Promise<AuthenticationResult>
}

const bearerToken = (request: Request): AuthenticationResult | string => {
  const header = request.headers.get('authorization')
  if (!header) return { ok: false, code: 'AUTHENTICATION_REQUIRED' }
  if (!header.startsWith('Bearer ') || header.length <= 'Bearer '.length) return { ok: false, code: 'AUTHENTICATION_INVALID' }
  return header.slice('Bearer '.length)
}

const normalizedIssuer = (issuer: string) => issuer.endsWith('/') ? issuer : `${issuer}/`

function normalizeIdentity(payload: Record<string, unknown>, provider: AuthenticatedIdentity['provider']): AuthenticatedIdentity | null {
  if (typeof payload.sub !== 'string' || !payload.sub || typeof payload.iss !== 'string' || !payload.iss || typeof payload.exp !== 'number') return null
  return {
    subject: payload.sub,
    issuer: payload.iss,
    provider,
    email: typeof payload.email === 'string' ? payload.email : undefined,
    displayName: typeof payload.name === 'string' ? payload.name : undefined,
    authenticatedAt: typeof payload.auth_time === 'number' ? payload.auth_time : undefined,
    expiresAt: payload.exp,
  }
}

export class Auth0IdentityProvider implements IdentityProvider {
  private readonly issuer: string
  private readonly jwks: JWTVerifyGetKey

  constructor(issuer: string, private readonly audience: string, keySet?: JWTVerifyGetKey) {
    this.issuer = normalizedIssuer(issuer)
    const url = new URL(this.issuer)
    if (url.protocol !== 'https:') throw new Error('IDENTITY_CONFIGURATION_INVALID')
    this.jwks = keySet ?? createRemoteJWKSet(new URL('.well-known/jwks.json', this.issuer), { timeoutDuration: 5_000, cooldownDuration: 30_000 })
  }

  async verifyRequest(request: Request): Promise<AuthenticationResult> {
    const token = bearerToken(request)
    if (typeof token !== 'string') return token
    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        issuer: this.issuer,
        audience: this.audience,
        algorithms: ['RS256'],
        clockTolerance: 5,
      })
      const identity = normalizeIdentity(payload, 'auth0')
      return identity ? { ok: true, identity } : { ok: false, code: 'AUTHENTICATION_INVALID' }
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ERR_JWT_EXPIRED') return { ok: false, code: 'AUTHENTICATION_EXPIRED' }
      if (error instanceof TypeError) return { ok: false, code: 'IDENTITY_PROVIDER_UNAVAILABLE' }
      return { ok: false, code: 'AUTHENTICATION_INVALID' }
    }
  }
}

export class TestIdentityProvider implements IdentityProvider {
  constructor(private readonly secret: string) {}

  async verifyRequest(request: Request): Promise<AuthenticationResult> {
    const token = bearerToken(request)
    if (typeof token !== 'string') return token
    try {
      const { payload } = await jwtVerify(token, new TextEncoder().encode(this.secret), {
        issuer: 'https://identity.test.vestren.invalid/',
        audience: 'https://api.test.vestren.invalid',
        algorithms: ['HS256'],
      })
      const identity = normalizeIdentity(payload, 'test')
      return identity ? { ok: true, identity } : { ok: false, code: 'AUTHENTICATION_INVALID' }
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ERR_JWT_EXPIRED') return { ok: false, code: 'AUTHENTICATION_EXPIRED' }
      return { ok: false, code: 'AUTHENTICATION_INVALID' }
    }
  }
}

export function isTestIdentityEnabled(env: Env) {
  return env.APP_ENV !== 'production' && env.AUTH_TEST_MODE === 'true' && Boolean(env.AUTH_TEST_SIGNING_SECRET)
}

export function createIdentityProvider(env: Env): IdentityProvider | null {
  if (isTestIdentityEnabled(env)) return new TestIdentityProvider(env.AUTH_TEST_SIGNING_SECRET!)
  if (!env.AUTH0_ISSUER || !env.AUTH0_AUDIENCE) return null
  try { return new Auth0IdentityProvider(env.AUTH0_ISSUER, env.AUTH0_AUDIENCE) } catch { return null }
}

export async function authenticate(request: Request, env: Env): Promise<AuthenticationResult> {
  const provider = createIdentityProvider(env)
  if (!provider) return { ok: false, code: 'IDENTITY_PROVIDER_UNAVAILABLE' }
  return provider.verifyRequest(request)
}

export async function issueTestToken(env: Env, claims: { subject?: string; expiresInSeconds?: number } = {}) {
  if (!isTestIdentityEnabled(env)) throw new Error('TEST_AUTH_DISABLED')
  const now = Math.floor(Date.now() / 1_000)
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer('https://identity.test.vestren.invalid/')
    .setAudience('https://api.test.vestren.invalid')
    .setSubject(claims.subject ?? 'test-user-a')
    .setIssuedAt(now)
    .setExpirationTime(now + (claims.expiresInSeconds ?? 3_600))
    .sign(new TextEncoder().encode(env.AUTH_TEST_SIGNING_SECRET!))
}
