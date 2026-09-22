export interface ExecutionInput { csv: string; timeoutMs: number; maxArtifactBytes: number }
export interface ExecutionOutput { sandboxId: string; report: string; patterns: { title: string; evidence: string }[]; durationMs: number }
export interface ExecutionProvider {
  readonly name: 'e2b' | 'mock-e2b'
  createSandbox(): Promise<string>
  execute(sandboxId: string, input: ExecutionInput): Promise<ExecutionOutput>
  readArtifact(sandboxId: string, path: string): Promise<string>
  writeArtifact(sandboxId: string, path: string, content: string): Promise<void>
  terminate(sandboxId: string): Promise<void>
  getStatus(sandboxId: string): Promise<'running' | 'terminated'>
}

export interface ToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  sideEffect: boolean
  approvalRequired: boolean
  authorizationRequired: boolean
  timeoutMs: number
  failureBehavior: 'fail-closed'
}
export interface ToolProvider { list(): ToolDefinition[]; call(name: string, args: unknown, authorized: boolean): Promise<{ content: string }> }
export interface StorageProvider { put(key: string, content: string, contentType: string): Promise<{ url: string; size: number }> }
export interface LLMProvider { readonly name: string; plan(goal: string): Promise<string[]> }
