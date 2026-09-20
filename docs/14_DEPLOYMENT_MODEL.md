# Deployment Model

MVP deployment:
- React frontend
- Cloudflare Workers API
- Cloudflare-managed data services
- E2B external execution

No VPS is required for the baseline.

Deployment environments:
- local
- preview
- production

Secrets are injected through deployment configuration, never committed.

Repository naming is temporary and may be changed after brand lock.
