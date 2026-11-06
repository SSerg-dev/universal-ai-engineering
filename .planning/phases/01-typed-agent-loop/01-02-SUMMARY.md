# 01-02 Summary — Typed Agent Loop Core

**Implemented:** Complete. **Architecturally reviewed:** Pending. **Approved:** Pending.

## Delivered

- A single strict TypeScript package on Node.js 24 with a committed dependency lockfile.
- Domain schemas and transitions, application ports, and a use case that enforces one tool invocation before a successful answer.
- A deterministic model, a tool that reads one fixed section from the local Node.js documentation fixture, and a composition function for both future transport adapters.
- Ordered, correlated events through an injected journal port. The application buffers the bounded trace and appends it after the loop, so journal I/O does not consume the model/tool deadline.

## Verification

On Node.js 24.22.1, use `npm ci`, `npm run build`, and `npm test`. Verified a clean install from the lockfile with lifecycle scripts disabled, then ran the build and all 17 tests in two files with network access restricted. The compiled reference run returned Run node --version. Documentation links and all 11 Phase 1 requirement IDs were checked.

The [acceptance matrix](01-01-ACCEPTANCE.md) scenarios for CORE-01, CORE-04, EDU-02, NFR-01, and NFR-02 are exercised at the core boundary. Vitest checks the composed fixture run, model/tool call counts, validation and failure codes, the one-step budget, cancellation and timeout races, late settlements, journal-port failure, and forbidden core imports.

## Next

01-03 adds Node CLI, Fastify HTTP, and a file-backed JSONL adapter, then verifies transport parity and real journal behavior. Phase-wide review evidence and approval are pending.
