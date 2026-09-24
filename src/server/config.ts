import type { Guardrails } from '../shared/types'

export interface Env {
  DB?: D1Database
  AI?: { run(model: string, input: { messages: { role: 'system' | 'user'; content: string }[]; response_format: { type: 'json_object' } }): Promise<unknown> }
  ARTIFACTS?: R2Bucket
  E2B_API_KEY?: string
  APP_ENV?: 'development' | 'test' | 'preview' | 'production'
  AUTH0_ISSUER?: string
  AUTH0_AUDIENCE?: string
  AUTH_TEST_MODE?: string
  AUTH_TEST_SIGNING_SECRET?: string
  EXECUTION_PROVIDER?: string
  MAX_TOOL_CALLS?: string
  MAX_ITERATIONS?: string
  EXECUTION_TIMEOUT_MS?: string
  MAX_ARTIFACT_BYTES?: string
}

const bounded = (value: string | undefined, fallback: number, min: number, max: number) => {
  const number = Number(value ?? fallback)
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback
}

export const getGuardrails = (env: Env): Guardrails => ({
  maxToolCalls: bounded(env.MAX_TOOL_CALLS, 3, 1, 10),
  maxIterations: bounded(env.MAX_ITERATIONS, 4, 1, 10),
  executionTimeoutMs: bounded(env.EXECUTION_TIMEOUT_MS, 15_000, 1_000, 60_000),
  sandboxLifetimeMs: 60_000,
  maxArtifactBytes: bounded(env.MAX_ARTIFACT_BYTES, 65_536, 1_024, 1_048_576),
  dailyRuns: 25,
})
