# Data and Memory Architecture

## D1 sources of truth

Identity and scope:

- `users`: normalized external identities; unique `(issuer, subject)`;
- `tenants`: tenant records;
- `tenant_memberships`: active/suspended user membership and minimal tenant role;
- `projects`: authoritative tenant ownership of each project;
- `project_memberships`: project role (`owner`, `editor`, `viewer`).

Runtime records:

- `sessions`: tenant/project-scoped task state;
- `executions`: attached to a session;
- `artifacts`: metadata/content fallback attached to a session;
- `audit_events`: attached to a session.

Resolution path:

`verified external identity → internal user → active tenant membership → project within tenant → project membership/permission → resource`.

The identity provider does not grant application tenant/project access. Provisioning memberships is owner-controlled. Existing runtime tables remain intact; migration `0002_identity_and_memberships.sql` only adds identity/scope tables and indexes.

## Durable Objects

Cloudflare Agents SDK Durable Objects are prepared for future live agent/session coordination, conversational state, and realtime lifecycle ownership. D1 is still the implemented live persistence source in the current Pages deployment.

## R2

R2 stores generated artifacts. D1 artifact and session metadata must pass tenant/project authorization before any R2 object read.

Memory must be scoped by tenant/project/agent/session. No implicit cross-project memory is permitted.
