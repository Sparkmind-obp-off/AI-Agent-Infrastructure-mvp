import type { Env } from './config'

export interface AuthPrincipal {
  sub: string
  tenant: string
  project: string
  exp: number
}

const bytes = (value: string) => new TextEncoder().encode(value)
const b64 = (value: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(value)))
const isPrincipal = (value: unknown): value is AuthPrincipal => {
  if (!value || typeof value !== 'object') return false
  const claims = value as Partial<AuthPrincipal>
  return typeof claims.sub === 'string' && claims.sub.length > 0
    && typeof claims.tenant === 'string' && claims.tenant.length > 0
    && typeof claims.project === 'string' && claims.project.length > 0
    && typeof claims.exp === 'number' && Number.isFinite(claims.exp)
}

export async function issueDemoToken(env: Env) {
  if (!env.AUTH_SIGNING_SECRET) throw new Error('AUTH_NOT_CONFIGURED')
  const claims: AuthPrincipal = { sub: 'demo-user', tenant: 'demo-tenant', project: 'workbench', exp: Date.now() + 3_600_000 }
  const payload = b64(bytes(JSON.stringify(claims)))
  const key = await crypto.subtle.importKey('raw', bytes(env.AUTH_SIGNING_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return `${payload}.${b64(await crypto.subtle.sign('HMAC', key, bytes(payload)))}`
}

export async function authorize(request: Request, env: Env): Promise<AuthPrincipal | null> {
  const header = request.headers.get('authorization')
  if (!header?.startsWith('Bearer ') || !env.AUTH_SIGNING_SECRET) return null
  const token = header.slice('Bearer '.length)

  try {
    const parts = token.split('.')
    if (parts.length !== 2) return null
    const [payload, signature] = parts
    if (!payload || !signature) return null
    const key = await crypto.subtle.importKey('raw', bytes(env.AUTH_SIGNING_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
    const decoded = Uint8Array.from(atob(signature), (char) => char.charCodeAt(0))
    if (!await crypto.subtle.verify('HMAC', key, decoded, bytes(payload))) return null
    const claims: unknown = JSON.parse(atob(payload))
    return isPrincipal(claims) && claims.exp > Date.now() ? claims : null
  } catch {
    return null
  }
}
