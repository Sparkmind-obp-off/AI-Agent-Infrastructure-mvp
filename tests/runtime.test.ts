import { describe, expect, it } from 'vitest'
import { runCsvAgent } from '../src/server/runtime'
import { SafeMcpToolProvider } from '../src/server/providers/mcp'
import { MockE2BProvider } from '../src/server/providers/mock-e2b'
import { SAMPLE_CSV } from '../src/server/sample'

const env = { EXECUTION_PROVIDER: 'mock', MAX_TOOL_CALLS: '3', MAX_ITERATIONS: '4', EXECUTION_TIMEOUT_MS: '15000', MAX_ARTIFACT_BYTES: '65536' }

describe('Vestren vertical slice', () => {
  it('completes intent to verified artifact and audit', async () => {
    const result = await runCsvAgent(env, { sessionId: crypto.randomUUID(), goal: 'Analyze this CSV and return a report artifact', authorized: true })
    expect(result.status).toBe('verified')
    expect(result.patterns).toHaveLength(3)
    expect(result.plan.every((step) => step.status === 'complete')).toBe(true)
    expect(result.artifacts[0].name).toBe('vestren-csv-report.md')
    expect(result.audit.map((event) => event.action)).toEqual(expect.arrayContaining(['tool.completed', 'execution.started', 'verification.passed', 'artifact.persisted']))
    expect(result.usage.toolCalls).toBeLessThanOrEqual(result.guardrails.maxToolCalls)
  })

  it('fails closed before a tool call without authorization', async () => {
    await expect(new SafeMcpToolProvider().call('read_csv_fixture', { sessionId: 'x' }, false)).rejects.toThrow('AUTHORIZATION_REQUIRED')
    await expect(runCsvAgent(env, { sessionId: crypto.randomUUID(), goal: 'Analyze this CSV and return a report artifact', authorized: false })).rejects.toThrow('AUTHORIZATION_REQUIRED')
  })

  it('enforces execution timeout and artifact boundaries', async () => {
    const provider = new MockE2BProvider(); const sandbox = await provider.createSandbox()
    await expect(provider.execute(sandbox, { csv: SAMPLE_CSV, timeoutMs: 100, maxArtifactBytes: 65536 })).rejects.toThrow('GUARDRAIL_TIMEOUT')
    await expect(provider.execute(sandbox, { csv: SAMPLE_CSV, timeoutMs: 15000, maxArtifactBytes: 16 })).rejects.toThrow('GUARDRAIL_ARTIFACT_SIZE')
  })
})
