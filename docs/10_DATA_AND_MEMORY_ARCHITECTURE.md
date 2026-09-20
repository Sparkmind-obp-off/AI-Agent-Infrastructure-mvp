# Data and Memory Architecture

D1:
- users
- projects
- agents
- provider configurations metadata
- execution records
- audit index
- usage records

Durable Objects:
- live agent/session state
- conversational state
- coordination
- durable realtime connections

R2:
- uploaded files
- generated artifacts
- execution outputs

Memory must be scoped by tenant/project/agent/session. No implicit cross-project memory.
