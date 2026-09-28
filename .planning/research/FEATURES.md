# Feature Research

**Domain:** Educational Agentic OS and internal-documentation assistant
**Researched:** 2026-09-28
**Confidence:** HIGH

## Table Stakes

| Feature | Why Expected | Complexity |
|---------|--------------|------------|
| Typed run contract | Every later capability depends on a stable execution model | MEDIUM |
| Tool invocation | Demonstrates observable agent action | MEDIUM |
| Shared CLI and API use case | Provides direct use and an integration boundary without duplication | LOW |
| Execution journal | Makes behavior inspectable and teachable | LOW |
| Deterministic tests | Model output cannot be the only correctness oracle | MEDIUM |
| Evidence per iteration | Ten versions must be comparable and reviewable | MEDIUM |

## Differentiators

| Feature | Value | Complexity |
|---------|-------|------------|
| Ten runnable evolutionary versions | Teaches why architecture changes | HIGH |
| Explicit trust boundaries | Makes MCP, tools, and RAG risks visible | MEDIUM |
| Quality as a product feature | Evaluations and observability are not afterthoughts | HIGH |
| Live execution inspector | Shows events, tools, citations, and failures | HIGH |

## Anti-Features

| Feature | Why Problematic | Alternative |
|---------|-----------------|-------------|
| Everything in Iteration 1 | Hides boundaries and failure causes | One capability per iteration |
| Autonomous multi-agent swarm | Adds orchestration before one loop is trustworthy | One engine with routing in Phase 10 |
| UI-first implementation | Couples UX to unstable semantics | UI after streaming contract |
| Hidden memory | Creates unexplained behavior and privacy risk | Explicit scoped writes in Phase 5 |

## Feature Dependencies

```text
typed loop → tool contracts → MCP
typed loop → RAG → state → evaluations → observability
observability → streaming → Angular UI → guardrails → router
```

## Iteration 1 MVP

- [ ] One typed agent loop and deterministic tool.
- [ ] Shared CLI/API application use case.
- [ ] Structured JSONL journal.
- [ ] Automated success and failure tests.
- [ ] Architecture decision and review evidence.

## Future Consideration

- Multi-tenancy and organization administration.
- Production availability and recovery objectives.
- Independent autonomous agent teams.

## Sources

- `docs/PROJECT-BRIEF.md`
- https://modelcontextprotocol.io/specification/latest
- https://vitest.dev/guide/

---
*Feature research for: Universal Agentic OS Course*
*Researched: 2026-09-28*
