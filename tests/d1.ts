import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

class D1TestStatement {
  private values: unknown[] = []
  constructor(private readonly database: Database, private readonly query: string) {}
  bind(...values: unknown[]) { this.values = values; return this }
  async first<T>(column?: string): Promise<T | null> {
    const statement = this.database.prepare(this.query)
    try {
      statement.bind(this.values as never[])
      if (!statement.step()) return null
      const row = statement.getAsObject() as T
      return column ? ((row as Record<string, unknown>)[column] as T ?? null) : row
    } finally { statement.free() }
  }
  async all<T>() {
    const statement = this.database.prepare(this.query)
    const results: T[] = []
    try {
      statement.bind(this.values as never[])
      while (statement.step()) results.push(statement.getAsObject() as T)
    } finally { statement.free() }
    return { success: true, results, meta: {} }
  }
  async run() {
    this.database.run(this.query, this.values as never[])
    return { success: true, meta: { changes: this.database.getRowsModified() } }
  }
  async raw<T>() { const { results } = await this.all<Record<string, unknown>>(); return results.map((row) => Object.values(row)) as T }
}

class D1TestDatabase {
  constructor(private readonly database: Database) {}
  prepare(query: string) { return new D1TestStatement(this.database, query) }
  async batch<T>(statements: D1PreparedStatement[]) { return Promise.all(statements.map((statement) => statement.run())) as T }
  async exec(query: string) { this.database.run(query); return { count: 1, duration: 0 } }
  withSession() { return this as unknown as D1DatabaseSession }
  dump() { return Promise.resolve(this.database.export().buffer as ArrayBuffer) }
}

let SQL: SqlJsStatic

export async function createTestDatabase() {
  SQL ??= await initSqlJs()
  const database = new SQL.Database()
  database.run(readFileSync(resolve('migrations/0001_initial.sql'), 'utf8'))
  database.run(readFileSync(resolve('migrations/0002_identity_and_memberships.sql'), 'utf8'))
  database.run(readFileSync(resolve('migrations/0003_execution_input.sql'), 'utf8'))
  return { binding: new D1TestDatabase(database) as unknown as D1Database, database }
}

export function seedAccess(database: Database, input: { subject: string; tenantId: string; projectId: string; projectRole?: 'owner' | 'editor' | 'viewer'; tenantRole?: 'owner' | 'admin' | 'member' }) {
  const now = new Date().toISOString()
  const userId = `test:${input.subject}`
  database.run('INSERT OR IGNORE INTO users (id, issuer, subject, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [userId, 'https://identity.test.vestren.invalid/', input.subject, now, now])
  database.run('INSERT OR IGNORE INTO tenants (id, name, created_at) VALUES (?, ?, ?)', [input.tenantId, input.tenantId, now])
  database.run('INSERT OR IGNORE INTO projects (id, tenant_id, name, created_at) VALUES (?, ?, ?, ?)', [input.projectId, input.tenantId, input.projectId, now])
  database.run('INSERT OR REPLACE INTO tenant_memberships (tenant_id, user_id, role, status, created_at) VALUES (?, ?, ?, ?, ?)', [input.tenantId, userId, input.tenantRole ?? 'member', 'active', now])
  database.run('INSERT OR REPLACE INTO project_memberships (project_id, user_id, role, created_at) VALUES (?, ?, ?, ?)', [input.projectId, userId, input.projectRole ?? 'editor', now])
}
