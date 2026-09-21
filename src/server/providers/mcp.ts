import { SAMPLE_CSV } from '../sample'
import type { ToolProvider } from './contracts'

export class SafeMcpToolProvider implements ToolProvider {
  list() { return [{ name: 'read_csv_fixture', description: 'Read the scoped CSV fixture', sideEffect: false, approvalRequired: false }] }
  async call(name: string, args: unknown, authorized: boolean) {
    if (!authorized) throw new Error('AUTHORIZATION_REQUIRED')
    if (name !== 'read_csv_fixture') throw new Error('TOOL_NOT_ALLOWED')
    const input = args as { sessionId?: string }; if (!input?.sessionId) throw new Error('INVALID_TOOL_ARGUMENTS')
    return { content: SAMPLE_CSV }
  }
}
