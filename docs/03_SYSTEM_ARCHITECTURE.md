# System Architecture

## Identity and authorization plane

Auth0 Universal Login → OAuth 2.0/OIDC access token → `IdentityProvider` → RS256/JWKS verification → normalized identity `(issuer, subject)` → D1 user/membership resolution → tenant → project → permission.

Authentication and authorization are separate boundaries. Provider-specific token objects do not enter runtime business logic. Tenant and project claims supplied by the client are not authoritative; D1 memberships are.

## Control plane

React UI → Cloudflare Pages Functions/Hono → authorization service → Agent Runtime → state/memory → tools.

## Data plane

D1 stores identities, tenants, memberships, projects, sessions, executions, artifact metadata, and audit events. Durable Objects are prepared for live agent/session state. R2 stores generated artifact bodies.

Every resource access follows an explicit tenant/project relationship. Artifact metadata is authorized before R2 access.

## AI plane

Workers AI is the default future model path. AI Gateway handles routing/observability where applicable. External models are reached through provider adapters and BYOK credentials.

## Execution plane

The authorized agent request reaches an `ExecutionProvider`. E2B is the initial real adapter and mock-E2B is the deterministic test/development adapter. The core runtime never imports E2B-specific behavior directly.

## Protocol plane

MCP is the preferred tool connectivity protocol. Native tools may exist for platform primitives. Tool and provider execution happen only after identity, tenant, project, and permission resolution.

## Boundary

Control plane != execution plane. Untrusted/generated code must not run inside the Worker request process.
