# Observability and Audit

Every important agent action should produce structured telemetry.

Minimum event fields:

- event ID;
- timestamp;
- tenant/project/agent/session IDs;
- normalized principal subject where authenticated;
- action type;
- provider/model/tool;
- execution ID where applicable;
- latency;
- status and normalized error class;
- bounded usage/cost metadata.

Never store raw access/refresh tokens, signing keys, API keys, provider secrets, or unnecessary personal data.

The Workbench persists successful lifecycle events and normalized `execution.failed` events after a session has been safely claimed. Authorization failures do not reveal whether a foreign private resource exists and are not written into that foreign session's audit stream. Runtime audit events include the stable principal subject but not the bearer token or raw provider object.

Authentication/provider failures are returned through normalized error codes. A future account-level security event stream may record authentication denial metadata without coupling those events to a private session; that stream is not implemented in this cycle.

Observability must answer: What happened? Why? Which identity and authorized scope initiated it? Which provider/tool executed it? What failed? What did it cost?
