import { Agent } from 'agents'

interface AgentState { sessionId: string; status: string; lastExecutionId?: string; updatedAt: string }

// Deploy as a dedicated Worker Durable Object and bind it to Pages as VESTREN_AGENT.
// The Pages prototype uses D1 until that cross-script binding is provisioned.
export class VestrenSessionAgent extends Agent<Cloudflare.Env, AgentState> {
  initialState: AgentState = { sessionId: '', status: 'idle', updatedAt: new Date(0).toISOString() }
  async onRequest(request: Request) {
    if (request.method === 'GET') return Response.json(this.state)
    if (request.method !== 'PUT') return new Response('Method not allowed', { status: 405 })
    const next = await request.json<Partial<AgentState>>()
    this.setState({ ...this.state, ...next, updatedAt: new Date().toISOString() })
    return Response.json(this.state)
  }
}

export default { fetch: () => new Response('Vestren Agent Durable Object host', { status: 200 }) }
