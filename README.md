# AI Agent Infrastructure MVP

Temporary repository name for the AI Agent Infrastructure platform.

## Architecture status

Technical baseline is locked before product naming.

- Frontend: React + TypeScript
- Edge/API: Cloudflare Workers + Hono
- Agent runtime: Cloudflare Agents SDK
- State: Durable Objects + SQLite
- Database: Cloudflare D1
- Object storage: Cloudflare R2
- Default AI: Cloudflare Workers AI
- AI routing/observability: Cloudflare AI Gateway
- Tools: MCP + provider adapters
- Execution sandbox: E2B
- Provider model: BYOK / adapter-first
- VPS/Kubernetes/Supabase: out of MVP scope
- Brand/name: **NOT YET LOCKED — STRATEGIC NAMING ACTIVE**

## Naming status

The naming methodology has been deliberately simplified and reconceived.

Canonical standard:
`docs/42_AI_AGENT_INFRASTRUCTURE_STRATEGIC_BRAND_LOCK_STANDARD.md`

Active cycle:
`docs/41_AI_AGENT_INFRASTRUCTURE_BRAND_NAMING_CYCLE_020_MANUS_EXECUTION_PROMPT.md`

### Strategic naming principle

The objective is **not** to find a name that has never appeared anywhere.

The objective is to find a **premium, simple, modern, brandable, sufficiently distinctive, commercially defensible whole mark** for AI-agent infrastructure.

Collision research remains mandatory, but an incidental use or occupied component is not automatically a terminal rejection. Evidence must be contextualized by:

- whole-mark identity;
- category proximity;
- commercial strength;
- primary association;
- pronunciation;
- domain/social practicality;
- trademark exposure.

Strategic survivor status means:

**STRATEGIC SURVIVOR — PROFESSIONAL CLEARANCE REQUIRED**

It is not legal clearance.

## Core rule

Free-capability-first, Cloudflare-preferred:
1. Use Cloudflare when the required capability is genuinely available on the free tier for the MVP.
2. Do not force a paid Cloudflare capability into the MVP.
3. Use an external provider when it is the viable free/API-accessible option.
4. Keep every external dependency behind an adapter.
5. Premium providers remain optional/BYOK.

## Purpose

This platform is infrastructure for building and operating AI agents: chat is an interface, the agent is orchestration, MCP/tools are connectivity, memory/state persists context, E2B provides isolated execution, and deployment runs on the edge.
