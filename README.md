# VESTREN

Vestren is an AI-agent execution infrastructure platform: a reusable runtime for building agents that can understand requests, plan, call tools, execute work, verify results, persist state, and produce auditable outcomes.

## Architecture status

Technical baseline is locked.

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
- Brand/name: **VESTREN — FINAL BRAND LOCK**

## Brand & Naming Status

**VESTREN — FINAL BRAND LOCK**

Vestren is the approved master brand for this project. Naming exploration is closed.

Canonical standard:
`docs/42_AI_AGENT_INFRASTRUCTURE_STRATEGIC_BRAND_LOCK_STANDARD.md`

Final brand decision:
`docs/VESTREN_FINAL_BRAND_LOCK.md`

Final brand lock master system prompt:
`docs/VESTREN_FINAL_BRAND_LOCK_MASTER_SYSTEM_PROMPT.md`

Historical Cycle 020 execution artifact (canonical `.md.md`):
`docs/AI_AGENT_INFRASTRUCTURE_BRAND_NAMING_CYCLE_020_SUMMARY.md.md`

The internal brand lock is distinct from formal legal clearance. Professional trademark/legal review remains a separate workstream. Unrelated uses are not automatic blockers; reopening requires material new evidence of a same-category legal or commercial conflict.

## Core rule

Free-capability-first, Cloudflare-preferred:
1. Use Cloudflare when the required capability is genuinely available on the free tier for the MVP.
2. Do not force a paid Cloudflare capability into the MVP.
3. Use an external provider when it is the viable free/API-accessible option.
4. Keep every external dependency behind an adapter.
5. Premium providers remain optional/BYOK.

## Purpose

Vestren is infrastructure for building and operating AI agents: chat is an interface, the agent is orchestration, MCP/tools are connectivity, memory/state persists context, E2B provides isolated execution, and deployment runs on the edge.
