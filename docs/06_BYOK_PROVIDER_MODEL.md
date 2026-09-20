# BYOK Provider Model

Users may supply their own provider credentials.

Requirements:
- encrypted/secret storage;
- provider-specific adapters;
- no key logging;
- no key exposure to frontend;
- explicit provider/model selection;
- usage accounting;
- graceful failure when a provider is unavailable.

OpenAI, Anthropic, Gemini and other paid providers are optional integrations, not mandatory MVP dependencies.
