import type { ExecutionInput, ExecutionOutput, ExecutionProvider } from './contracts'
import { parseCsvInput, SAMPLE_CSV } from '../sample'

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
    const rows = parseCsvInput(input.csv)
    const products = new Map<string, number>(); const regions = new Map<string, { revenue: number; satisfaction: number; count: number }>()
    for (const row of rows) {
      products.set(row.product, (products.get(row.product) ?? 0) + row.revenue)
      const region = regions.get(row.region) ?? { revenue: 0, satisfaction: 0, count: 0 }
      region.revenue += row.revenue; region.satisfaction += row.satisfaction; region.count += 1
      regions.set(row.region, region)
    }
    const [bestProduct, productRevenue] = [...products].sort((a, b) => b[1] - a[1])[0]
    const [bestRegion, regionMetrics] = [...regions].sort((a, b) => b[1].revenue - a[1].revenue)[0]
    const top = [...rows].sort((a, b) => b.revenue - a.revenue)[0]
    const patterns = [
      { title: `${bestProduct} leads product revenue`, evidence: `${bestProduct} generated $${productRevenue.toLocaleString('en-US')} across the input.` },
      { title: `${bestRegion} is the strongest region`, evidence: `${bestRegion} generated $${regionMetrics.revenue.toLocaleString('en-US')} with average satisfaction ${(regionMetrics.satisfaction / regionMetrics.count).toFixed(1)}.` },
      { title: 'Top revenue record', evidence: `${top.product} in ${top.region} generated $${top.revenue.toLocaleString('en-US')} with satisfaction ${top.satisfaction}.` },
    ]
    const report = `# Vestren CSV Analysis\n\n## Top three patterns\n\n${patterns.map((p, i) => `${i + 1}. **${p.title}.** ${p.evidence}`).join('\n')}\n\n## Method\nAnalyzed ${rows.length} ${input.csv === SAMPLE_CSV ? 'deterministic fixture' : 'submitted'} rows through the ExecutionProvider contract.\n`
    if (new TextEncoder().encode(report).byteLength > input.maxArtifactBytes) throw new Error('GUARDRAIL_ARTIFACT_SIZE')
    await this.writeArtifact(id, '/output/report.md', report)
    return { sandboxId: id, report, patterns, durationMs: Date.now() - started }
  }
}
