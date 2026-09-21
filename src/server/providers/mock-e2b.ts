import type { ExecutionInput, ExecutionOutput, ExecutionProvider } from './contracts'

const stores = new Map<string, Map<string, string>>()

export class MockE2BProvider implements ExecutionProvider {
  readonly name = 'mock-e2b' as const
  async createSandbox() { const id = `mock_${crypto.randomUUID()}`; stores.set(id, new Map()); return id }
  async writeArtifact(id: string, path: string, content: string) { const store = stores.get(id); if (!store) throw new Error('SANDBOX_NOT_FOUND'); store.set(path, content) }
  async readArtifact(id: string, path: string) { const value = stores.get(id)?.get(path); if (!value) throw new Error('ARTIFACT_NOT_FOUND'); return value }
  async getStatus(id: string) { return stores.has(id) ? 'running' as const : 'terminated' as const }
  async terminate(id: string) { stores.delete(id) }
  async execute(id: string, input: ExecutionInput): Promise<ExecutionOutput> {
    const started = Date.now(); if (!stores.has(id)) throw new Error('SANDBOX_NOT_FOUND')
    if (input.timeoutMs < 1000) throw new Error('GUARDRAIL_TIMEOUT')
    const rows = input.csv.trim().split('\n').slice(1).map((line) => { const [region, product, revenue, units, satisfaction] = line.split(','); return { region, product, revenue: Number(revenue), units: Number(units), satisfaction: Number(satisfaction) } })
    const atlas = rows.filter((row) => row.product === 'Atlas'); const west = rows.filter((row) => row.region === 'West')
    const patterns = [
      { title: 'Atlas leads product revenue', evidence: `Atlas generated $${atlas.reduce((sum, row) => sum + row.revenue, 0).toLocaleString()} across ${atlas.length} regions.` },
      { title: 'West is the strongest region', evidence: `West generated $${west.reduce((sum, row) => sum + row.revenue, 0).toLocaleString()} with average satisfaction ${(west.reduce((sum, row) => sum + row.satisfaction, 0) / west.length).toFixed(1)}.` },
      { title: 'Revenue tracks satisfaction', evidence: 'The top-revenue record also has the highest satisfaction score (4.9), indicating a positive relationship in this sample.' },
    ]
    const report = `# Vestren CSV Analysis\n\n## Top three patterns\n\n${patterns.map((p, i) => `${i + 1}. **${p.title}.** ${p.evidence}`).join('\n')}\n\n## Method\nAnalyzed ${rows.length} deterministic fixture rows through the ExecutionProvider contract.\n`
    if (new TextEncoder().encode(report).byteLength > input.maxArtifactBytes) throw new Error('GUARDRAIL_ARTIFACT_SIZE')
    await this.writeArtifact(id, '/output/report.md', report)
    return { sandboxId: id, report, patterns, durationMs: Date.now() - started }
  }
}
