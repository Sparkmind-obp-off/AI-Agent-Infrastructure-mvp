# VESTREN Workbench

Vestren is the execution layer for reliable AI agents. This repository implements the Workbench vertical slice:

**Identity → Tenant → Project → Authorization → Intent → Context → Plan → Tool → Execute → Verify → Artifact → Audit**

## Current status

Implemented and locally tested:

- React 19 + TypeScript Workbench UI;
- Cloudflare Pages Functions + Hono API;
- Auth0 OIDC access-token boundary using RS256, remote JWKS, exact issuer, and audience validation;
- provider-neutral `IdentityProvider` interface;
- D1-backed users, tenants, tenant memberships, projects, and project memberships;
- server-authoritative project permissions (`owner`, `editor`, `viewer`);
- project-scoped sessions, executions, artifacts, and audit reads;
- explicitly gated deterministic test identity for local/test environments only;
- validated pasted CSV input (or the existing deterministic fixture), ToolProvider/MCP fixture boundary, ExecutionProvider with E2B and mock-E2B, guardrails, scoped D1 execution records, and R2 artifacts;
- integration tests covering HTTP authentication through D1/R2 authorization behavior;
- S3 Workers AI structured planning at `/api/agent/runs`, with strict scope/tool/argument validation and one bounded CSV action through the existing ToolProvider and ExecutionProvider. The S2 `/api/runs` deterministic route remains available in local/test only; production rejects it and requires real E2B, Workers AI, D1 and R2.

The production identity **code path exists**, but Auth0 tenant/application values and owner memberships are owner-managed deployment configuration. A deployment without those values fails closed and must not be described as a verified live login. The live root displays Owner Sign In and public setup values; `/api/owner/status` requires real Auth0 identity and both tenant/project owner roles.

## Identity decision

**Provider:** Auth0 using OAuth 2.0/OIDC access tokens.

Why it fits:

- standards-based JWT/JWKS verification works in Cloudflare Workers;
- the browser uses Auth0 Universal Login rather than a custom password system;
- provider SDK objects remain outside business logic;
- API tokens are verified server-side with only `RS256`, exact issuer, and exact audience;
- the application, not token scope claims, owns tenant/project authorization in D1;
- realistic RS256/JWKS and deterministic local identity fixtures are testable without production credentials.

Browser tokens use Auth0's in-memory cache. No signing key, client secret, or refresh token is stored in application source or browser storage.

## Functional URIs

| Method | URI | Authentication / purpose |
|---|---|---|
| `GET` | `/` | Workbench UI and Auth0 entry point |
| `GET` | `/api/health` | Public health and configured identity-provider status |
| `GET` | `/api/public-config` | Only public Auth0 SPA settings and exact callback/logout URLs; no credentials |
| `GET` | `/api/owner/status` | Auth0-authenticated tenant + project owner only; scoped operational/secret status, never values |
| `POST` | `/api/auth/test` | Explicit `development`/`test` deterministic identity; requires both test gates |
| `GET` | `/api/me` | Authenticated identity and authoritative accessible project list |
| `POST` | `/api/runs` | `execution:start`; body `{ sessionId: UUID, goal: string, csv?: string }`. When omitted, the deterministic fixture is used. |
| `POST` | `/api/agent/runs` | Same authenticated body/scope; Workers AI proposes a structured, server-validated single-action plan. Fails closed without the `AI` binding. |
| `GET` | `/api/sessions/:id` | `session:read`; scoped session and audit trail |
| `GET` | `/api/executions/:id` | `session:read`; scoped execution metadata |
| `GET` | `/api/artifacts/:key` | `artifact:read`; canonical and scoped artifact download |

Project-scoped routes require:

```http
Authorization: Bearer <Auth0 access token>
X-Vestren-Tenant: <authorized tenant id>
X-Vestren-Project: <authorized project id>
```

These scope headers select from memberships; they do not grant access.

## Authorization model

D1 is authoritative:

1. a verified identity is normalized to `(issuer, subject)`;
2. Vestren resolves an internal user;
3. active tenant membership is required;
4. the project must belong to that tenant;
5. project membership and role determine permissions;
6. the resource query repeats tenant/project scope before access.

Project roles:

- `owner` and `editor`: project/session read, session create, execution start, artifact read, audit read;
- `viewer`: project/session/artifact/audit read only.

## Data architecture

- **D1:** `users`, `tenants`, `tenant_memberships`, `projects`, `project_memberships`, `sessions`, `executions`, `artifacts`, `audit_events`.
- **R2:** report artifact bodies after D1 authorization.
- **S3 agent trail:** existing session/execution status and scoped audit events record plan creation/validation, tool selection, execution and verification; no raw model output or credentials are persisted.
- **Durable Objects:** prepared Agents SDK session class; not yet the live state owner.
- **Migrations:** `0001_initial.sql`, `0002_identity_and_memberships.sql`, then `0003_execution_input.sql` (source/size metadata, normalized error and completion time; raw input is not persisted).

Production users are provisioned by inserting memberships through an owner-controlled administrative process. Self-service tenant creation is not implemented.

To submit real input, paste unquoted CSV into the existing Workbench CSV field or send `csv` to `/api/agent/runs`. The server accepts only the header `region,product,revenue,units,satisfaction`, 1–1,000 data rows, at most 64 KiB, with nonnegative numeric revenue, positive integer units, and satisfaction from 0 to 5. There is no file upload. Only validated input reaches the selected execution provider; the execution record stores source and byte count, not the raw CSV.

## Local development

```bash
npm install
cat > .dev.vars <<'VARS'
APP_ENV=development
AUTH_TEST_MODE=true
AUTH_TEST_SIGNING_SECRET=<local-random-secret>
EXECUTION_PROVIDER=mock
VARS
npm run typecheck
npm test
VITE_ENABLE_TEST_AUTH=true npm run build
npx wrangler d1 migrations apply vestren-workbench-production --local
pm2 start ecosystem.config.cjs
curl http://localhost:3000/api/health
```

The Vite development UI can request `/api/auth/test`; the endpoint returns 404 whenever `APP_ENV=production`, even if other test variables are accidentally present.

## Auth0 configuration

Create one Auth0 Single Page Application and one API. Register exact local, preview, and production callback/logout/origin URLs in Auth0. Do not use wildcard callback URLs.

Server-side Cloudflare variables/secrets:

- `APP_ENV=production`
- `AUTH0_ISSUER` — canonical HTTPS issuer, normally `https://<tenant-or-custom-domain>/`
- `AUTH0_AUDIENCE` — Auth0 API identifier

Public Cloudflare Pages production variables (also returned via `/api/public-config`; values come from the owner-managed Auth0 SPA/API):

- `AUTH0_DOMAIN` — Auth0 hostname (without scheme)
- `AUTH0_CLIENT_ID` — public SPA client identifier
- `AUTH0_ISSUER` — exact HTTPS issuer ending in `/`
- `AUTH0_AUDIENCE` — public API identifier

Legacy browser-safe build variables (optional fallback; no longer required when runtime public variables are configured):

- `VITE_AUTH0_DOMAIN`
- `VITE_AUTH0_CLIENT_ID`
- `VITE_AUTH0_AUDIENCE`
- `VITE_ENABLE_TEST_AUTH=true` — local test build only; never set for production

Local/test-only variables:

- `AUTH_TEST_MODE=true`
- `AUTH_TEST_SIGNING_SECRET`

Execution variables:

- `EXECUTION_PROVIDER`
- `E2B_API_KEY` when `EXECUTION_PROVIDER=e2b`
- `MAX_TOOL_CALLS`, `MAX_ITERATIONS`, `EXECUTION_TIMEOUT_MS`, `MAX_ARTIFACT_BYTES`
- `AI` — Workers AI binding in `wrangler.jsonc`, with account-level Workers AI access required for live agent planning. No OpenAI key is used.

Never commit real values. `AUTH0_CLIENT_SECRET` is not required by this SPA + bearer-token design.

## Testing

```bash
npm run typecheck
npm test
npm run build
npm audit --omit=dev
```

The suite covers identity and authorization, tenant/project isolation, malformed and submitted CSV input, scoped D1 execution metadata, normalized provider failure, scoped R2 artifacts, E2B adapter contract with a stub sandbox, deterministic fixture execution, and guardrails.

## Deployment

- **Platform:** Cloudflare Pages via Wrangler BYOK
- **Cloudflare project:** `vestren-workbench`
- **D1:** `vestren-workbench-production`
- **R2:** `vestren-workbench-artifacts`
- **Production:** https://vestren-workbench.pages.dev
- **GitHub:** https://github.com/Sparkmind-obp-off/vestren

Before production identity smoke testing:

1. configure exact Auth0 URLs;
2. set server and build variables;
3. apply `0002_identity_and_memberships.sql` and `0003_execution_input.sql` remotely before deploying updated execution code;
4. provision at least two test identities across separate tenants/projects;
5. build and deploy;
6. verify unauthenticated denial, successful login, role denial, and cross-tenant denial.

## Not yet implemented / verified gaps

- Owner-supplied Auth0 configuration and real-user production login must be verified after configuration.
- No self-service tenant/project provisioning or invitation UI exists.
- Identity logout invalidates the local Auth0 session; immediate API-token revocation remains governed by Auth0 token lifetime/provider policy.
- Real E2B execution requires a working runtime `E2B_API_KEY`; production selects E2B and rejects mock fallback. A configured secret is not proof of successful live execution.
- Durable Object live session ownership and real CSV upload/scanning remain future work. Live Workers AI and E2B verification require owner-managed access; deterministic S3 tests do not establish live provider success.

## Recommended next action

Configure the Auth0 application/API and two production test users, provision their D1 memberships in separate tenants, then run the documented production identity and isolation smoke test.
