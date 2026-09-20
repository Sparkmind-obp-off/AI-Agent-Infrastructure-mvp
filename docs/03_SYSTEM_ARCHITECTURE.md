# System Architecture

## Control plane
React UI -> Cloudflare Workers/Hono -> Agent Runtime -> State/Memory -> Tools.

## Data plane
D1 stores application records. Durable Objects own durable agent/session state. R2 stores files and artifacts.

## AI plane
Workers AI is the default model path. AI Gateway handles routing/observability where applicable. External models are reached through provider adapters and BYOK credentials.

## Execution plane
The agent requests execution through an ExecutionProvider interface. E2B is the initial implementation. The core runtime never imports E2B-specific behavior directly.

## Protocol plane
MCP is the preferred tool connectivity protocol. Native tools may exist for platform primitives.

## Boundary
Control plane != execution plane. Untrusted/generated code must not run inside the Worker request process.
