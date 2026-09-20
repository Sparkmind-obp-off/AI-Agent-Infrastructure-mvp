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
- Brand/name: intentionally NOT locked

## Core rule

Free-capability-first, Cloudflare-preferred:
1. Use Cloudflare when the required capability is genuinely available on the free tier for the MVP.
2. Do not force a paid Cloudflare capability into the MVP.
3. Use an external provider when it is the viable free/API-accessible option.
4. Keep every external dependency behind an adapter.
5. Premium providers remain optional/BYOK.

## Purpose

This platform is infrastructure for building and operating AI agents: chat is an interface, the agent is orchestration, MCP/tools are connectivity, memory/state persists context, E2B provides isolated execution, and deployment runs on the edge.
