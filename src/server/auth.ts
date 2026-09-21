import type { Env } from './config'

const bytes = (value: string) => new TextEncoder().encode(value)
const b64 = (value: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(value)))

export async function issueDemoToken(env: Env) {
  if (!env.AUTH_SIGNING_SECRET) throw new Error('AUTH_NOT_CONFIGURED')
  const payload = b64(bytes(JSON.stringify({ sub: 'demo-user', tenant: 'demo-tenant', exp: Date.now() + 3_600_000 })))
  const key = await crypto.subtle.importKey('raw', bytes(env.AUTH_SIGNING_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return `${payload}.${b64(await crypto.subtle.sign('HMAC', key, bytes(payload)))}`
}

export async function authorize(request: Request, env: Env) {
  const token = request.headers.get('authorization')?.replace(/^Bearer /, '')
  if (!token || !env.AUTH_SIGNING_SECRET) return null
  const [payload, signature] = token.split('.'); if (!payload || !signature) return null
  const key = await crypto.subtle.importKey('raw', bytes(env.AUTH_SIGNING_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
  const decoded = Uint8Array.from(atob(signature), (char) => char.charCodeAt(0))
  if (!await crypto.subtle.verify('HMAC', key, decoded, bytes(payload))) return null
  const claims = JSON.parse(atob(payload)) as { sub: string; tenant: string; exp: number }
  return claims.exp > Date.now() ? claims : null
}
