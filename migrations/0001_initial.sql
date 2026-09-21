CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, project_id TEXT NOT NULL, goal TEXT NOT NULL, status TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS executions (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, provider TEXT NOT NULL, status TEXT NOT NULL, tool_calls INTEGER NOT NULL, iterations INTEGER NOT NULL, duration_ms INTEGER NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS artifacts (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, name TEXT NOT NULL, content TEXT NOT NULL, content_type TEXT NOT NULL, size_bytes INTEGER NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit_events (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, action TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_audit_session ON audit_events(session_id, created_at);
