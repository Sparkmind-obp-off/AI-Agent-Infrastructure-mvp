import { z } from 'zod'
import type { ToolProvider } from './providers/contracts'

const planSchema = z.object({
  sessionId: z.string().uuid(),
  tenantId: z.string().min(1),
  projectId: z.string().min(1),
  steps: z.array(z.object({
    tool: z.string().min(1),
    args: z.unknown(),
    expectedResult: z.literal('csv-report'),
  }).strict()).min(1),
}).strict()

export function validateAgentPlan(raw: unknown, scope: { sessionId: string; tenantId: string; projectId: string; source: 'fixture' | 'submitted' }, tools: ToolProvider, maxSteps: number) {
  const parsed = planSchema.safeParse(raw)
  if (!parsed.success) throw new Error('INVALID_AGENT_PLAN')
  const plan = parsed.data
  if (plan.sessionId !== scope.sessionId || plan.tenantId !== scope.tenantId || plan.projectId !== scope.projectId) throw new Error('AUTHORIZATION_SCOPE_MISMATCH')
  if (plan.steps.length > maxSteps || plan.steps.length !== 1) throw new Error('GUARDRAIL_STEP_LIMIT')
  const step = plan.steps[0]
  if (!tools.list().some((tool) => tool.name === step.tool) || step.tool !== 'analyze_csv') throw new Error('TOOL_NOT_ALLOWED')
  const args = z.object({ sessionId: z.string().uuid(), source: z.enum(['fixture', 'submitted']) }).strict().safeParse(step.args)
  if (!args.success || args.data.sessionId !== scope.sessionId || args.data.source !== scope.source) throw new Error('INVALID_TOOL_ARGUMENTS')
  return { id: crypto.randomUUID(), intentReference: scope.sessionId, steps: [{ tool: step.tool, args: args.data, expectedResult: step.expectedResult }] }
}
