export type StepStatus = 'pending' | 'running' | 'complete' | 'failed'

export interface Guardrails {
  maxToolCalls: number
  maxIterations: number
  executionTimeoutMs: number
  sandboxLifetimeMs: number
  maxArtifactBytes: number
  dailyRuns: number
}

export interface AuditEvent {
  event_id: string
  timestamp: string
  tenant_id: string
  project_id: string
  principal_subject?: string
  agent_id: string
  session_id: string
  action: string
  reason: string
  provider?: string
  model_or_tool?: string
  latency_ms: number
  status: 'started' | 'success' | 'denied' | 'failed'
  error_class?: string
  execution_id?: string
  usage: { tool_calls: number; iterations: number; estimated_cost_usd: number }
}

export interface PlanStep { id: string; label: string; status: StepStatus }
export interface Artifact { id: string; name: string; contentType: string; size: number; url: string }
export interface Pattern { title: string; evidence: string }

export interface RunResult {
  sessionId: string
  executionId: string
  status: 'verified' | 'failed'
  executionProvider: 'e2b' | 'mock-e2b'
  summary: string
  patterns: Pattern[]
  plan: PlanStep[]
  artifacts: Artifact[]
  verification: { passed: boolean; checks: string[] }
  audit: AuditEvent[]
  guardrails: Guardrails
  usage: { toolCalls: number; iterations: number; elapsedMs: number; estimatedCostUsd: number }
}
