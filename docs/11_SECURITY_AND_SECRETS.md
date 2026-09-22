# Security and Secrets

## Production identity boundary

Vestren uses Auth0 as its single production identity provider for this cycle. The browser uses Auth0 Universal Login and obtains an access token for the Vestren API. The API verifies that token inside Cloudflare Pages Functions through the provider-neutral `IdentityProvider` boundary.

Production verification requires:

- HTTPS issuer;
- remote JWKS signature verification;
- `RS256` allowlist;
- exact issuer;
- exact audience;
- valid expiration;
- stable subject claim.

Malformed, expired, wrong-issuer, wrong-audience, unsigned/unsupported-algorithm, and missing-claim credentials fail closed with normalized errors. Raw provider errors and configuration are not returned.

## Authorization boundary

Authentication proves identity only. D1 remains authoritative for:

`identity (issuer + subject) → user → active tenant membership → project membership/role → permission → resource scope`.

Client tenant/project headers select an already-authorized scope; they are never proof of access. Project IDs and UUID unpredictability are never treated as authorization. Session, execution, artifact, and audit queries repeat tenant/project predicates. Artifact metadata authorization succeeds before R2 is read.

Roles are intentionally small:

- `owner` / `editor`: read plus session creation and execution;
- `viewer`: project/session/artifact/audit read only.

## Development and test identity

Deterministic HMAC test tokens exist only behind both gates:

- `APP_ENV` is not `production`;
- `AUTH_TEST_MODE=true` and `AUTH_TEST_SIGNING_SECRET` exists.

`/api/auth/test` returns 404 in production even if test variables are accidentally present. The test provider has a separate issuer, audience, secret, and code path. It never silently replaces Auth0 production verification.

## Browser and origin security

The current UI and API are same-origin; no permissive credentialed CORS middleware is enabled. Auth0 tokens use the Auth0 React SDK's in-memory cache. The application does not put access tokens in `localStorage` or `sessionStorage`. Exact callback, logout, and allowed-origin URLs must be configured in Auth0 for local, preview, and production environments. Wildcard callback targets and arbitrary return URLs are prohibited.

## Secret handling

Never commit or expose:

- Auth0 secrets or management tokens;
- test signing secrets;
- E2B/provider keys;
- access/refresh tokens;
- private signing keys.

Cloudflare production configuration supplies `AUTH0_ISSUER`, `AUTH0_AUDIENCE`, and other server values. `VITE_AUTH0_DOMAIN`, `VITE_AUTH0_CLIENT_ID`, and `VITE_AUTH0_AUDIENCE` are public SPA build configuration, not secrets. This flow does not require an Auth0 client secret.

Additional rules:

- Treat model output, tool arguments, uploads, and generated code as untrusted.
- Validate all tool inputs and canonical artifact keys.
- Apply authentication and authorization before tools, execution providers, sessions, executions, artifacts, and audits.
- Never return provider keys or write credentials to audit payloads.
- Record only normalized, scoped runtime events; authorization failures must not leak private-resource existence.
- Fail closed when identity, membership, provider, persistence, or execution configuration is missing.
