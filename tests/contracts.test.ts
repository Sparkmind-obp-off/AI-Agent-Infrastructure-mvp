import { describe, expect, it } from 'vitest'
import { MockE2BProvider } from '../src/server/providers/mock-e2b'

const requiredMethods = ['createSandbox', 'execute', 'readArtifact', 'writeArtifact', 'terminate', 'getStatus'] as const

describe('ExecutionProvider contract', () => {
  it('keeps vendor behavior behind the stable interface', () => {
    const provider = new MockE2BProvider()
    for (const method of requiredMethods) expect(typeof provider[method]).toBe('function')
    expect(provider.name).toBe('mock-e2b')
  })
})
