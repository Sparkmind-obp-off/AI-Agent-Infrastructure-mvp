import type { LLMProvider, ToolDefinition } from './contracts'
import type { Env } from '../config'

export const WORKERS_AI_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast'

export class WorkersAIProvider implements LLMProvider {
  readonly name = 'workers-ai'
  constructor(private readonly ai: NonNullable<Env['AI']>) {}

  async plan(input: { goal: string; sessionId: string; tenantId: string; projectId: string; tools: ToolDefinition[] }): Promise<unknown> {
    try {
      const result = await this.ai.run(WORKERS_AI_MODEL, {
        messages: [
          { role: 'system', content: 'Return only a JSON object with keys sessionId, tenantId, projectId, steps. steps must be an array of objects with keys tool, args, expectedResult. Only select a listed tool. Do not emit scripts, code, or additional keys. The server validates every field and may reject your answer.' },
          { role: 'user', content: JSON.stringify({ intent: input.goal, sessionId: input.sessionId, tenantId: input.tenantId, projectId: input.projectId, tools: input.tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) }) },
        ],
        response_format: { type: 'json_object' },
      })
      if (typeof result !== 'object' || result === null || !('response' in result) || typeof result.response !== 'string') throw new Error('LLM_PROVIDER_FAILED')
      return JSON.parse(result.response)
    } catch {
      throw new Error('LLM_PROVIDER_FAILED')
    }
  }
}
