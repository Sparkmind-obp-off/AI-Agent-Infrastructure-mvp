# Provider Architecture

Every non-core provider is represented by a stable internal interface.

Required provider categories:
- LLMProvider
- EmbeddingProvider
- ExecutionProvider
- StorageProvider
- SearchProvider
- ToolProvider

Provider selection policy:
Cloudflare Free -> external genuinely-free provider -> BYOK/premium provider.

The application depends on interfaces, not vendor SDKs, except inside adapter modules.

Configuration selects providers at runtime without changing agent orchestration.
