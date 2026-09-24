import type { Env } from '../config'
import type { StorageProvider } from './contracts'

export class ArtifactStorageProvider implements StorageProvider {
  constructor(private readonly env: Env, private readonly sessionId: string) {}
  async put(key: string, content: string, contentType: string) {
    const size = new TextEncoder().encode(content).byteLength
    if (this.env.APP_ENV === 'production' && (!this.env.DB || !this.env.ARTIFACTS)) throw new Error('PERSISTENCE_UNAVAILABLE')
    if (this.env.ARTIFACTS) await this.env.ARTIFACTS.put(key, content, { httpMetadata: { contentType } })
    if (this.env.DB) await this.env.DB.prepare('INSERT OR REPLACE INTO artifacts (id, session_id, name, content, content_type, size_bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(key, this.sessionId, key.split('/').at(-1), content, contentType, size, new Date().toISOString()).run()
    return { url: `/api/artifacts/${encodeURIComponent(key)}`, size }
  }
}
