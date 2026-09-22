import { describe, expect, it } from 'vitest'
import { MockE2BProvider } from '../src/server/providers/mock-e2b'
import { SafeMcpToolProvider } from '../src/server/providers/mcp'

const requiredMethods = ['createSandbox', 'execute', 'readArtifact', 'writeArtifact', 'terminate', 'getStatus'] as const

describe('ExecutionProvider contract', () => {
  it('keeps vendor behavior behind the stable interface', () => {
    const provider = new MockE2BProvider()
    for (const method of requiredMethods) expect(typeof provider[method]).toBe('function')
    expect(provider.name).toBe('mock-e2b')
  })

  it('declares a bounded fail-closed tool contract', () => {
    const [tool] = new SafeMcpToolProvider().list()
    expect(tool).toMatchObject({
      name: 'read_csv_fixture',
      sideEffect: false,
      approvalRequired: false,
      authorizationRequired: true,
      timeoutMs: 1_000,
      failureBehavior: 'fail-closed',
    })
    expect(tool.inputSchema).toMatchObject({ type: 'object', additionalProperties: false })
  })
})
