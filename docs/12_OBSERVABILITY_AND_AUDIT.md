# Observability and Audit

Every important agent action should produce structured telemetry.

Minimum event fields:
- event_id
- timestamp
- tenant/project/agent/session IDs
- action type
- provider
- model/tool
- latency
- status
- error class
- execution ID when applicable

Never store raw secrets or unnecessary sensitive payloads.

The current Workbench persists both successful lifecycle events and normalized `execution.failed` events after a session has been safely claimed. Authorization failures that do not own the target session are not written into that session's audit stream.

Observability must answer:
What happened? Why? Which provider? Which tool? What execution ran? What failed? What did it cost?
