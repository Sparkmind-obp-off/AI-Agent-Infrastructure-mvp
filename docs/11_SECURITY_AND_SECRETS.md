# Security and Secrets

Rules:
- Never commit credentials.
- Never return provider secrets to the browser.
- Never log raw API keys.
- Validate all tool inputs.
- Treat model output as untrusted data.
- Sandbox all untrusted code execution.
- Apply authentication and authorization before tool execution.
- Separate tenant data.
- Record security-relevant audit events.
- Fail closed when authorization or provider configuration is missing.

Environment variables are for deployment configuration; persistent secrets belong in an appropriate secret store.
