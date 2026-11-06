# Phase 1 Acceptance

The [Iteration 1 ADR](../../../docs/architecture/decisions/ADR-0003-iteration-1-typed-agent-loop.md) defines the contracts. Run the plans in order.

| Plan | Scenario and expected result | Requirements |
|---|---|---|
| 01-01 | Compare `e4a25e9` to `b8650a3`. The recovery SHA resolves, Git changes reconcile with RESET-0001, and the reset record distinguishes implementation from review and approval. | FOUND-01 |
| 01-01 | Review domain schemas, application ports, transition table, dependency rules, and this requirement mapping before implementing the loop. | ARCH-01 |
| 01-02 | Ask the reference question with the fixture and deterministic model. Expect `Run node --version.`, two model requests, one tool invocation, the observation passed to the second request, and one terminal success. | EDU-02, CORE-01, CORE-04 |
| 01-02 | Submit blank input, an invalid model action, invalid tool arguments, or an answer before tool use. Expect the appropriate typed failure and zero tool invocations. A repeated tool request fails with one invocation in total. An invalid tool observation fails before the second model request. | CORE-01, CORE-04 |
| 01-02 | Inject model and tool failures. Expect distinct stable codes and no later calls. Set a one-step budget. Expect `LIMIT_EXCEEDED` before the second model request. | CORE-01, CORE-04 |
| 01-02 | Use controlled timers and cancellation on pending effects. Expect `TIMEOUT` or `CANCELLED`, the first signal to win, late completions to be ignored, and exactly one terminal result. | CORE-04 |
| 01-02 | Compile and run the tests on Node.js 24 offline after installation. Enforce core import rules and run the same use case with replacement ports. | NFR-01, NFR-02 |
| 01-03 | Send the same question through CLI and HTTP. Expect the same answer. Send malformed input through both and verify the same domain code with a nonzero CLI exit and HTTP 400. Verify normal success returns CLI exit 0 and HTTP 200. | CORE-02, EDU-02 |
| 01-03 | Parse every JSONL line against the event schema. For successful and failed runs, group by opaque run ID, verify increasing sequence and one terminal event, and check that marker text from inputs, observations, answers, and exceptions is absent. Inject a write failure and verify the unchanged run outcome with `journalStatus: incomplete`. | CORE-03, CORE-04 |
| 01-03 | Record reproducible commands, output, known limitations, requirement coverage, and separate implementation, architectural review, and explicit approval states. | EDU-03, NFR-03 |

The exit condition for 01-01 is a coherent reset record, an ADR with concrete contracts, and test cases with observable outcomes and requirement IDs. The 01-02 tests exercise the core and deterministic adapters. The 01-03 tests exercise the real CLI, HTTP, and JSONL adapters. Phase approval requires explicit human approval.
