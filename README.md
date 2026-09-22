# VESTREN Workbench

Vestren is the execution layer for reliable AI agents. This repository now contains a focused prototype proving the loop:

**Intent → Context → Plan → Tool → Execute → Verify → Artifact → Memory → Audit**

## Prototype status

The canonical CSV analysis vertical slice is implemented and locally verified. A user can start an authenticated demo session, run a bounded agent task against a deterministic CSV fixture, observe the plan and MCP-style tool activity, execute through an `ExecutionProvider`, verify three findings, persist state/audit records in D1, store the report in R2, and download the artifact.

The deployed demo intentionally uses the explicit `mock-e2b` adapter because no `E2B_API_KEY` is configured. The real `E2BProvider` implementation is present and fails closed when selected without a credential.

## Completed features

- Professional React + TypeScript Workbench UI
- Hono API on Cloudflare Pages Functions
- Signed, short-lived demo authentication boundary
- Tenant/project/session-scoped request handling
- Canonical CSV task and deterministic fixture
- Visible plan, execution activity, findings, verification, artifacts, and audit trail
- Safe read-only `ToolProvider` / MCP adapter boundary
- Stable `ExecutionProvider` contract with E2B and deterministic mock-E2B adapters
- Execution timeout, tool-call, iteration, sandbox-lifetime, artifact-size, and hard per-tenant/project daily-run limits
- Structured, secret-redacted success and failure audit events
- D1 persistence for sessions, execution records, artifacts, and audit index
- R2 artifact storage with canonical-key validation and tenant/project-authorized download route
- Cloudflare Agents SDK Durable Object session class (`src/server/agent-worker.ts`) ready for cross-script deployment
- Contract, authorization-boundary, guardrail, and end-to-end runtime tests

## Functional URIs

| Method | URI | Purpose |
|---|---|---|
| `GET` | `/` | Vestren Workbench UI |
| `GET` | `/api/health` | Runtime and provider health |
| `POST` | `/api/auth/demo` | Issue a one-hour signed demo token |
| `POST` | `/api/runs` | Execute the CSV vertical slice; body: `{ sessionId: UUID, goal: string }` |
| `GET` | `/api/sessions/:id` | Reload a tenant-scoped persisted session and audit trail |
| `GET` | `/api/artifacts/:key` | Download an authenticated report artifact |

All routes except health and demo-token issuance require `Authorization: Bearer <token>`.

## Architecture and data

- **Frontend:** React 19, TypeScript, Vite
- **Control plane:** Cloudflare Pages Functions + Hono
- **Agent state:** D1 in the deployed prototype; Cloudflare Agents SDK Durable Object class is prepared for a dedicated cross-script binding
- **Application records:** Cloudflare D1
- **Artifacts:** Cloudflare R2, with D1 response fallback for local/unit contexts
- **Tool boundary:** `ToolProvider` with a safe MCP-style read tool
- **Execution boundary:** `ExecutionProvider` → `E2BProvider` or explicit `MockE2BProvider`
- **AI planning:** deterministic bounded fallback for the credential-free demo; provider-neutral contracts preserve the Workers AI/BYOK path

D1 tables: `sessions`, `executions`, `artifacts`, and `audit_events`. The migration is in `migrations/0001_initial.sql`.

## User guide

1. Open the Workbench.
2. Review the pre-filled CSV analysis request and scoped fixture.
3. Select **Run agent**.
4. Inspect plan completion, tool/execution events, usage limits, findings, and verification checks.
5. Open **Audit trail** for the full event history.
6. Download `vestren-csv-report.md` from the Artifacts panel.

## Local development

```bash
npm install
printf 'AUTH_SIGNING_SECRET=<local-random-secret>\n' > .dev.vars
npm run typecheck
npm test
npm run build
npx wrangler d1 migrations apply vestren-workbench-production --local
pm2 start ecosystem.config.cjs
curl http://localhost:3000/api/health
```

Do not commit `.dev.vars`.

## Environment variables

Names only:

- `AUTH_SIGNING_SECRET` — required server-side secret
- `EXECUTION_PROVIDER` — `mock` for deterministic demo or `e2b`
- `E2B_API_KEY` — required only when `EXECUTION_PROVIDER=e2b`
- `MAX_TOOL_CALLS`
- `MAX_ITERATIONS`
- `EXECUTION_TIMEOUT_MS`
- `MAX_ARTIFACT_BYTES`

No provider key is exposed to the browser or written to audit payloads.

## Testing

```bash
npm run typecheck
npm test
npm run build
npm audit --omit=dev
```

Tests cover provider and tool contracts, the full request-to-artifact flow, malformed authentication, fail-closed tool authorization, tenant session isolation, artifact path/scope checks, missing E2B credentials, daily quota exhaustion, timeout, artifact-size guardrails, verification, and structured audit output.

## Deployment

- **Platform:** Cloudflare Pages via Wrangler BYOK
- **Cloudflare project:** `vestren-workbench`
- **D1:** `vestren-workbench-production`
- **R2:** `vestren-workbench-artifacts`
- **Production URL:** https://vestren-workbench.pages.dev
- **GitHub:** https://github.com/Sparkmind-obp-off/vestren

Apply migrations and secrets before deploying:

```bash
npx wrangler d1 migrations apply vestren-workbench-production --remote
openssl rand -hex 32 | npx wrangler pages secret put AUTH_SIGNING_SECRET --project-name vestren-workbench
npm run build
npx wrangler pages deploy dist --project-name vestren-workbench
```

## Not yet implemented / known production gaps

- A real E2B call requires an owner-provided `E2B_API_KEY`; current demo runs the contract-compatible deterministic adapter.
- The Cloudflare Agents SDK Durable Object class must be deployed as a dedicated Worker and bound cross-script to Pages before Durable Objects replace D1 as the live session-state owner.
- Workers AI / AI Gateway planning is not enabled in the credential-free deterministic slice.
- Real CSV upload and MIME/content scanning are not enabled; the UI and provider boundaries are ready for an R2-backed upload flow.
- The daily run quota is enforced per tenant/project from D1 execution records; a monthly/account-level quota and reservation-based protection for highly concurrent starts are not yet implemented.

## Recommended next steps

1. Replace demo authentication with the selected production identity provider and add real multi-tenant integration fixtures.
2. Configure `E2B_API_KEY`, switch `EXECUTION_PROVIDER=e2b`, and run the integration test.
3. Deploy and bind `VestrenSessionAgent` as the durable session owner.
4. Add signed R2 upload URLs and CSV validation/scanning.
5. Add Workers AI planning behind `LLMProvider`, optionally routed through AI Gateway.
