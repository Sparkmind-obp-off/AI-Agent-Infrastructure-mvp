# MVP Scope

## In scope
- agent chat interface
- durable agent/session state
- Workers API
- one default AI provider
- provider adapter interface
- MCP/tool interface
- E2B sandbox execution
- basic file/artifact flow
- audit events
- usage/cost guardrails
- deployment documentation

## Out of scope
- multi-region optimization
- Kubernetes
- complex enterprise IAM
- billing engine
- marketplace
- autonomous long-running production agents
- full browser automation platform
- mandatory LangChain/LangGraph dependency

Definition of done: one agent can receive a request, reason, call a tool, execute isolated code through E2B, verify the result, persist state, and expose an auditable execution trail.
