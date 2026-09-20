# E2B Integration

E2B is the locked MVP execution provider.

Reason:
The platform requires isolated code execution, while the preferred Cloudflare execution capability is not part of the no-paid-plan baseline.

Integration boundary:
Agent Runtime -> ExecutionProvider -> E2BProvider -> E2B API.

E2B-specific SDK calls remain inside the adapter.

Future replacement:
E2BProvider can be replaced by CloudflareSandboxProvider or another provider without changing agent orchestration.

The E2B free/hobby allowance is finite and therefore must be protected by execution limits.
