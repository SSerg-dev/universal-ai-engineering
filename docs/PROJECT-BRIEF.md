# Universal Agentic OS Course — Project Brief

## Purpose

Build a personal educational course and reference implementation that explains how an Agentic OS grows through ten small, runnable TypeScript iterations.

The constant walkthrough is an internal-documentation assistant:

`question → document search → tools → answer → state → quality evaluation`

## Primary User

Sergei is the initial learner and operator. The project optimizes for clarity, progressive understanding, and reproducible engineering evidence rather than commercial product breadth.

## Core Value

A learner can understand, build, test, and review a reusable Agentic OS one working iteration at a time.

## Ten Iterations

1. One typed agent loop, one tool, CLI/API, execution journal, and automated tests.
2. Typed multi-tool registry and explicit failure handling.
3. MCP adapter and trust boundary.
4. RAG with PostgreSQL/pgvector and source citations.
5. Durable state and controlled memory.
6. Versioned evaluations and regression gates.
7. Logs, traces, metrics, and correlated execution evidence.
8. Typed streaming events and an Angular/Tailwind inspection UI.
9. Permissions, budgets, validation, guardrails, and human approval.
10. Typed routing and a unified educational engine.

## Technical Direction

- TypeScript and Node.js 24.
- Zod at runtime boundaries.
- Pure domain/application core with explicit ports.
- Fastify and Node CLI as adapters to the same use case.
- Vitest with deterministic fake model and fake tools.
- JSONL execution journal first; PostgreSQL only when persistence and retrieval justify it.
- Angular with Tailwind only when UI is introduced in Iteration 8.
- No React or Next.js.

## First Iteration Boundary

Iteration 1 contains one agent, one tool, a typed agent loop, CLI and HTTP API entry points, a structured execution journal, and automated tests. It deliberately excludes RAG, durable memory, UI, MCP, multi-agent coordination, and production deployment.

## Working Method

- Use official Open GSD Core as the operational planning workflow.
- Define architecture contracts before implementation.
- Work sequentially, one logical task at a time.
- Keep planning, implementation, architectural review, and approval as distinct states.
- Produce reviewable evidence before advancing.

## Success

The milestone succeeds when all ten versions are runnable and comparable, every version has tests and evidence, stable contracts are visible across iterations, and a learner can explain why each capability was introduced.
