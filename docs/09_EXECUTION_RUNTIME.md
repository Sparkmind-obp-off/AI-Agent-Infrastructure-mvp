# Execution Runtime

## Contract

ExecutionProvider:
- createSandbox
- execute
- readArtifact
- writeArtifact
- terminate
- getStatus

## MVP implementation

E2BProvider.

Execution must enforce:
- timeout;
- resource limits supported by provider;
- explicit command allow/deny policy;
- artifact boundaries;
- no direct access to platform secrets;
- audit logging.

Generated code is untrusted by default.
