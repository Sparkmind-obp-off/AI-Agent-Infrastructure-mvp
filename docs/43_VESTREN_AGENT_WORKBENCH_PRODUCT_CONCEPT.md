# VESTREN — AGENT WORKBENCH / EXECUTION PLATFORM CONCEPT

**Status:** CONCEPT BASELINE — 2026-09-21  
**Master brand:** VESTREN — FINAL BRAND LOCK

## 1. Product concept

Vestren is not a chatbot. It is an **agent execution workbench and infrastructure layer** that lets a user submit a goal, give the agent tools and context, let it plan and execute work in an isolated environment, verify the result, and retain an auditable execution trail.

Core loop:

**Intent → Context → Plan → Tool Selection → Execute → Verify → Artifact → Memory → Audit**

The first product experience should make this loop visible and usable rather than trying to expose the entire infrastructure surface.

## 2. Prototype product

### Working prototype: Vestren Workbench

A single web application with:

1. **Task input** — user states what they want done.
2. **Agent session** — durable conversation/session state.
3. **Plan view** — visible steps and current status.
4. **Tool panel** — MCP/native tools available to the agent.
5. **Execution panel** — isolated sandbox execution status.
6. **Artifact panel** — files/results produced by execution.
7. **Verification panel** — checks performed before completion.
8. **Audit timeline** — provider/tool/execution events.
9. **Provider selector** — default provider plus adapter/BYOK path.
10. **Cost/usage guardrail** — visible limits before expensive actions.

The prototype should prove one complete vertical slice, not build a platform marketplace.

## 3. Canonical vertical slice

Example request:

> "Analyze this CSV, find the top three patterns, generate a short report and export the result."

Expected flow:

**Request**
→ create/load agent session  
→ build context  
→ model plans  
→ tool/file access  
→ E2B sandbox created  
→ code executes in isolation  
→ artifacts generated  
→ verification checks output  
→ state + audit events persisted  
→ user receives result + artifact + execution trail

A second simple tool-oriented request should demonstrate MCP connectivity.

## 4. Architecture

### Control plane
React + TypeScript  
→ Cloudflare Workers + Hono  
→ Vestren Agent Runtime

### Durable state
Cloudflare Durable Objects + SQLite

### Application data
Cloudflare D1

### Artifacts
Cloudflare R2

### AI plane
Workers AI as default path where suitable  
+ AI Gateway for routing/observability where applicable  
+ provider adapters/BYOK for external models

### Tool/protocol plane
MCP-first connectivity  
+ native platform tools for core primitives

### Execution plane
ExecutionProvider interface  
→ E2BProvider for MVP

Generated/untrusted code MUST remain outside the Worker request process.

## 5. Why this composition

The stack already defined in the repository is coherent for the prototype:

- Cloudflare provides the durable edge/runtime foundation.
- Durable Objects provide stateful agent sessions.
- D1/R2 separate application records from artifacts.
- MCP provides a vendor-neutral tool boundary.
- E2B provides an isolated execution boundary.
- Provider adapters prevent vendor lock-in.
- Manus/Genspark/OpenHands can act as **build/execution agents**, not as runtime dependencies of the Vestren product.

## 6. Role of external AI agents

### Genspark
Use for fast prototype generation, research, UI exploration, documentation synthesis, and repository implementation when its GitHub/workspace access is available.

### Manus
Use as an autonomous implementation/research/operator layer: inspect repository, implement tasks, run tests, research integrations, and iterate. Manus API v2 can also be used later as an external orchestration capability.

### GitHub connector
Use as the repository source of truth and write-back surface.

### MCP/connectors
Use as the standardized tool boundary. Prefer scoped OAuth/token access and explicit approval for side-effecting actions.

These agents are **development/orchestration tooling around Vestren**, not required components inside the runtime MVP.

## 7. What NOT to add yet

Do not add all of these to the first prototype:

- multi-agent marketplace
- Kubernetes
- custom billing engine
- enterprise IAM
- autonomous 24/7 agents
- full browser automation platform
- complex vector-memory stack
- mandatory LangChain/LangGraph
- multiple sandbox vendors simultaneously
- dozens of integrations

The first proof is one reliable, auditable agent execution loop.

## 8. Prototype success criteria

The prototype is successful when a real user can:

1. create a session;
2. submit a goal;
3. see the agent plan;
4. observe at least one tool call;
5. execute untrusted/generated code in E2B;
6. receive a generated artifact;
7. see verification status;
8. inspect an audit trail;
9. resume the session with durable state;
10. hit explicit usage/time/tool-call guardrails without uncontrolled spend.

## 9. Product direction after prototype

If the vertical slice works, expand in this order:

**Workbench → Tool Registry → Provider Routing → Agent Templates → Team/Workspace → Managed Integrations → Hosted Agent Plans**

The infrastructure remains the product foundation.

## 10. Strategic positioning

Vestren should be understood as:

> **The execution layer for reliable AI agents.**

Supporting language:

- Built on Vestren.
- Powered by Vestren.
- Agents run on Vestren.

Avoid positioning Vestren as merely another chatbot, prompt library, or generic AI wrapper.
