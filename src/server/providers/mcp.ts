import { z } from 'zod'
import { SAMPLE_CSV } from '../sample'
import type { ToolProvider } from './contracts'

const readCsvInput = z.object({ sessionId: z.string().uuid() }).strict()

export class SafeMcpToolProvider implements ToolProvider {
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
    }]
  }
  async call(name: string, args: unknown, authorized: boolean) {
    if (!authorized) throw new Error('AUTHORIZATION_REQUIRED')
    if (name !== 'read_csv_fixture') throw new Error('TOOL_NOT_ALLOWED')
    const input = readCsvInput.safeParse(args)
    if (!input.success) throw new Error('INVALID_TOOL_ARGUMENTS')
    return { content: SAMPLE_CSV }
  }
}
