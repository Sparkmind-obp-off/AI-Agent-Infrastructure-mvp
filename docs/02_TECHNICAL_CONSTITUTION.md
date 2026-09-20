# Technical Constitution

1. Free first.
2. API access must be real and usable for the MVP.
3. No mandatory paid dependency for the core proof of concept.
4. Cloudflare is preferred when its free tier actually satisfies the capability.
5. Do not use Cloudflare merely for branding if the required feature is paid.
6. External services are isolated behind adapters.
7. Secrets never enter source control.
8. Agent actions are observable and auditable.
9. Sandbox execution is isolated from the control plane.
10. Provider replacement must not require rewriting the agent core.
11. MVP scope is deliberately small.
12. Production scale is an upgrade path, not an MVP prerequisite.
