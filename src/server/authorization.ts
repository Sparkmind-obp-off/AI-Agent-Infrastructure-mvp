import type { AuthenticatedIdentity } from './auth'
import type { Env } from './config'

export type Permission = 'project:read' | 'session:read' | 'session:create' | 'execution:start' | 'artifact:read' | 'audit:read'
export type ProjectRole = 'owner' | 'editor' | 'viewer'

export interface AuthorizedContext {
  identity: AuthenticatedIdentity
  tenantId: string
  tenantName: string
  projectId: string
  projectName: string
  tenantRole: string
  projectRole: ProjectRole
  permissions: Permission[]
}

export interface AccessibleProject {
  tenantId: string
  tenantName: string
  projectId: string
  projectName: string
  tenantRole: string
  projectRole: ProjectRole
  permissions: Permission[]
}

export class AuthorizationError extends Error {
  constructor(public readonly code: 'AUTHORIZATION_DENIED' | 'TENANT_CONTEXT_INVALID' | 'PROJECT_SCOPE_MISMATCH' | 'IDENTITY_PROVIDER_UNAVAILABLE') {
    super(code)
  }
}

const rolePermissions: Record<ProjectRole, Permission[]> = {
  owner: ['project:read', 'session:read', 'session:create', 'execution:start', 'artifact:read', 'audit:read'],
  editor: ['project:read', 'session:read', 'session:create', 'execution:start', 'artifact:read', 'audit:read'],
  viewer: ['project:read', 'session:read', 'artifact:read', 'audit:read'],
}

const asProjectRole = (role: string): ProjectRole | null => role === 'owner' || role === 'editor' || role === 'viewer' ? role : null

export async function syncIdentity(env: Env, identity: AuthenticatedIdentity) {
  if (!env.DB) throw new AuthorizationError('IDENTITY_PROVIDER_UNAVAILABLE')
  const id = `${identity.provider}:${identity.subject}`
  const now = new Date().toISOString()
  await env.DB.prepare(`INSERT INTO users (id, issuer, subject, email, display_name, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(issuer, subject) DO UPDATE SET email = excluded.email, display_name = excluded.display_name, updated_at = excluded.updated_at`)
    .bind(id, identity.issuer, identity.subject, identity.email ?? null, identity.displayName ?? null, now, now).run()
  const user = await env.DB.prepare('SELECT id FROM users WHERE issuer = ? AND subject = ?')
    .bind(identity.issuer, identity.subject).first<{ id: string }>()
  if (!user) throw new AuthorizationError('AUTHORIZATION_DENIED')
  return user.id
}

export async function listAccessibleProjects(env: Env, identity: AuthenticatedIdentity): Promise<AccessibleProject[]> {
  if (!env.DB) throw new AuthorizationError('IDENTITY_PROVIDER_UNAVAILABLE')
  const userId = await syncIdentity(env, identity)
  const result = await env.DB.prepare(`SELECT t.id AS tenant_id, t.name AS tenant_name, p.id AS project_id, p.name AS project_name,
      tm.role AS tenant_role, pm.role AS project_role
    FROM tenant_memberships tm
    JOIN tenants t ON t.id = tm.tenant_id
    JOIN projects p ON p.tenant_id = t.id
    JOIN project_memberships pm ON pm.project_id = p.id AND pm.user_id = tm.user_id
    WHERE tm.user_id = ? AND tm.status = 'active'
    ORDER BY t.name, p.name`)
    .bind(userId).all<{ tenant_id: string; tenant_name: string; project_id: string; project_name: string; tenant_role: string; project_role: string }>()
  return result.results.flatMap((row) => {
    const projectRole = asProjectRole(row.project_role)
    return projectRole ? [{
      tenantId: row.tenant_id,
      tenantName: row.tenant_name,
      projectId: row.project_id,
      projectName: row.project_name,
      tenantRole: row.tenant_role,
      projectRole,
      permissions: rolePermissions[projectRole],
    }] : []
  })
}

export async function authorizeProject(env: Env, identity: AuthenticatedIdentity, tenantId: string | null, projectId: string | null, permission: Permission): Promise<AuthorizedContext> {
  if (!tenantId) throw new AuthorizationError('TENANT_CONTEXT_INVALID')
  if (!projectId) throw new AuthorizationError('PROJECT_SCOPE_MISMATCH')
  const projects = await listAccessibleProjects(env, identity)
  const selected = projects.find((project) => project.tenantId === tenantId && project.projectId === projectId)
  if (!selected || !selected.permissions.includes(permission)) throw new AuthorizationError('AUTHORIZATION_DENIED')
  return { identity, ...selected }
}

export function requestedScope(request: Request) {
  return {
    tenantId: request.headers.get('x-vestren-tenant'),
    projectId: request.headers.get('x-vestren-project'),
  }
}
