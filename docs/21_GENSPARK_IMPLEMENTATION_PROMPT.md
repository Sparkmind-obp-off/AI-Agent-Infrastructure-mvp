# Genspark Implementation Prompt

Implement this repository as an AI Agent Infrastructure MVP according to every document in /docs.

## Locked architecture
- React + TypeScript frontend
- Cloudflare Workers + Hono
- Cloudflare Agents SDK
- Durable Objects + SQLite
- Cloudflare D1
- Cloudflare R2
- Workers AI as the default model path where available
- AI Gateway where useful and free-compatible
- MCP for tool connectivity
- E2B as the MVP execution provider through an ExecutionProvider adapter
- Provider-agnostic/BYOK architecture

## Non-negotiable rules
- Read all /docs before coding.
- Keep vendor-specific code inside adapters.
- Never commit or expose secrets.
- Validate environment configuration.
- Add structured audit events.
- Add tests for contracts, authorization, execution limits and failure paths.
- Add health checks and local-development instructions.
- Keep MVP scope small and executable.
- Do not rename the repository or introduce a brand.
- Do not add paid-only infrastructure merely to satisfy a feature.
- If a capability is paid on Cloudflare Free, preserve the adapter boundary and use the approved external provider instead.
- Do not make OpenAI, Anthropic, VPS, Kubernetes, Supabase or LangChain mandatory.

## Acceptance test
A user can select/create an agent, send a request, receive an agent response, invoke a tool, execute isolated code via E2B, persist session state, retrieve the execution result, and inspect an audit trail.

Before completion:
1. run tests;
2. run type checks;
3. run lint/build;
4. verify environment variables;
5. verify no secrets are committed;
6. verify provider adapters are replaceable;
7. document known free-tier limits and unresolved risks.
