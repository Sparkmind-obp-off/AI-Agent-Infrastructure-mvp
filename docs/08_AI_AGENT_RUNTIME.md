# AI Agent Runtime

Agent lifecycle:
1. Receive request.
2. Load session state.
3. Build context.
4. Select model/provider.
5. Plan.
6. Request tool or execution action.
7. Receive result.
8. Verify.
9. Persist state and audit event.
10. Return response.

The agent runtime must support streaming, tool calls, human approval points, retries, timeouts and deterministic audit events.

Chat is only one interface to the runtime.
