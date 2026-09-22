# Cost Guardrails

The MVP must make cost visible before scale.

Controls:
- provider allowlist
- daily/monthly usage limits
- execution timeout
- maximum tool calls per turn
- maximum agent iterations
- model selection policy
- E2B sandbox lifetime limit
- artifact size limits
- fail-safe behavior when quota is exhausted

The current Workbench enforces the daily run limit from D1 execution records per tenant/project before claiming a session or starting a provider. Monthly/account-level quotas and concurrency-safe quota reservations remain future work.

A free-tier system must not silently become a paid system.
