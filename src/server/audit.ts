import type { AuditEvent } from '../shared/types'

export class AuditTrail {
  readonly events: AuditEvent[] = []
  constructor(private readonly scope: { tenantId: string; projectId: string; agentId: string; sessionId: string }) {}

  emit(input: Pick<AuditEvent, 'action' | 'reason' | 'status'> & Partial<AuditEvent>) {
    const event: AuditEvent = {
      event_id: crypto.randomUUID(), timestamp: new Date().toISOString(),
      tenant_id: this.scope.tenantId, project_id: this.scope.projectId,
      agent_id: this.scope.agentId, session_id: this.scope.sessionId,
      latency_ms: 0, usage: { tool_calls: 0, iterations: 0, estimated_cost_usd: 0 }, ...input,
    }
    delete event.error_class
    if (input.error_class) event.error_class = input.error_class.replace(/(key|token|secret)=[^\s]+/gi, '$1=[REDACTED]')
    this.events.push(event)
    return event
  }
}
