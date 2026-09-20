# Provider Adapter Specification

Adapters translate vendor APIs into internal contracts.

Each adapter must:
- expose capability metadata;
- normalize errors;
- expose usage where available;
- enforce timeout;
- avoid leaking credentials;
- be independently testable;
- have a mock implementation for unit tests.

No agent business logic may branch on vendor-specific SDK objects.
