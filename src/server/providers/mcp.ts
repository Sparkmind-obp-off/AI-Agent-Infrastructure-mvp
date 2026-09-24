import { z } from 'zod'
import { SAMPLE_CSV } from '../sample'
import type { ToolProvider } from './contracts'

const readCsvInput = z.object({ sessionId: z.string().uuid() }).strict()
const analyzeCsvInput = z.object({ sessionId: z.string().uuid(), source: z.enum(['fixture', 'submitted']) }).strict()

export class SafeMcpToolProvider implements ToolProvider {
  constructor(private readonly scope?: { sessionId: string; csv?: string }) {}
  list() {
    return [{
      name: 'read_csv_fixture',
      description: 'Read the scoped CSV fixture',
      inputSchema: { type: 'object', properties: { sessionId: { type: 'string', format: 'uuid' } }, required: ['sessionId'], additionalProperties: false },
      sideEffect: false,
      approvalRequired: false,
      authorizationRequired: true,
      timeoutMs: 1_000,
      failureBehavior: 'fail-closed' as const,
    }, {
      name: 'analyze_csv',
      description: 'Analyze the scoped CSV using the server-controlled execution provider and return a verified report',
      inputSchema: { type: 'object', properties: { sessionId: { type: 'string', format: 'uuid' }, source: { type: 'string', enum: ['fixture', 'submitted'] } }, required: ['sessionId', 'source'], additionalProperties: false },
      sideEffect: true,
      approvalRequired: false,
      authorizationRequired: true,
      timeoutMs: 60_000,
      failureBehavior: 'fail-closed' as const,
    }]
  }
  async call(name: string, args: unknown, authorized: boolean) {
    if (!authorized) throw new Error('AUTHORIZATION_REQUIRED')
    if (name === 'analyze_csv' && this.scope) {
      const input = analyzeCsvInput.safeParse(args)
      if (!input.success || input.data.sessionId !== this.scope.sessionId || input.data.source !== (this.scope.csv === undefined ? 'fixture' : 'submitted')) throw new Error('INVALID_TOOL_ARGUMENTS')
      return { content: this.scope.csv ?? SAMPLE_CSV }
    }
    if (name !== 'read_csv_fixture') throw new Error('TOOL_NOT_ALLOWED')
    const input = readCsvInput.safeParse(args)
    if (!input.success || (this.scope && input.data.sessionId !== this.scope.sessionId)) throw new Error('INVALID_TOOL_ARGUMENTS')
    return { content: SAMPLE_CSV }
  }
}
