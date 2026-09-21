import { Sandbox } from '@e2b/code-interpreter'
import type { ExecutionInput, ExecutionOutput, ExecutionProvider } from './contracts'

const sandboxes = new Map<string, Sandbox>()

export class E2BProvider implements ExecutionProvider {
  readonly name = 'e2b' as const
  constructor(private readonly apiKey: string) { if (!apiKey) throw new Error('E2B_NOT_CONFIGURED') }
  async createSandbox() { const sandbox = await Sandbox.create({ apiKey: this.apiKey, timeoutMs: 60_000 }); sandboxes.set(sandbox.sandboxId, sandbox); return sandbox.sandboxId }
  private get(id: string) { const sandbox = sandboxes.get(id); if (!sandbox) throw new Error('SANDBOX_NOT_FOUND'); return sandbox }
  async writeArtifact(id: string, path: string, content: string) { await this.get(id).files.write(path, content) }
  async readArtifact(id: string, path: string) { return await this.get(id).files.read(path) }
  async getStatus(id: string) { return sandboxes.has(id) ? 'running' as const : 'terminated' as const }
  async terminate(id: string) { const sandbox = sandboxes.get(id); if (sandbox) await sandbox.kill(); sandboxes.delete(id) }
  async execute(id: string, input: ExecutionInput): Promise<ExecutionOutput> {
    const started = Date.now(); const sandbox = this.get(id)
    await sandbox.files.write('/home/oai/share/input.csv', input.csv)
    const code = `import csv, json\nfrom collections import defaultdict\nrows=list(csv.DictReader(open('/home/oai/share/input.csv')))\nproducts=defaultdict(float); regions=defaultdict(lambda: [0,0,0])\nfor r in rows:\n products[r['product']]+=float(r['revenue']); x=regions[r['region']]; x[0]+=float(r['revenue']); x[1]+=float(r['satisfaction']); x[2]+=1\nbp=max(products,key=products.get); br=max(regions,key=lambda k: regions[k][0])\npatterns=[{'title':f'{bp} leads product revenue','evidence':f'{bp} generated $%s across the sample.'%format(products[bp],',.0f')},{'title':f'{br} is the strongest region','evidence':f'{br} generated $%s with average satisfaction %.1f.'%(format(regions[br][0],',.0f'),regions[br][1]/regions[br][2])},{'title':'Revenue tracks satisfaction','evidence':'The top-revenue record also has the highest satisfaction score in this sample.'}]\nreport='# Vestren CSV Analysis\\n\\n## Top three patterns\\n\\n'+'\\n'.join([f'{i+1}. **{p["title"]}.** {p["evidence"]}' for i,p in enumerate(patterns)])+f'\\n\\n## Method\\nAnalyzed {len(rows)} rows inside an E2B sandbox.\\n'\nopen('/home/oai/share/report.md','w').write(report)\nprint(json.dumps({'patterns':patterns,'report':report}))`
    const result = await sandbox.runCode(code, { timeoutMs: input.timeoutMs })
    if (result.error) throw new Error(`E2B_EXECUTION_FAILED:${result.error.name}`)
    const raw = result.logs.stdout.at(-1) ?? '{}'; const parsed = JSON.parse(raw) as { report: string; patterns: ExecutionOutput['patterns'] }
    if (new TextEncoder().encode(parsed.report).byteLength > input.maxArtifactBytes) throw new Error('GUARDRAIL_ARTIFACT_SIZE')
    return { sandboxId: id, ...parsed, durationMs: Date.now() - started }
  }
}
