# ADR-0017 — Node.js 26 runtime baseline

Date: 2026-11-27. Selected for implementation; architectural review, human approval and stability pending.

The active development and execution baseline moves from Node.js 24 to the Node.js 26 release line. Root and Angular package manifests declare `26.x`; Node.js `26.11.1` is the initially verified runtime. Patch releases within the 26 line remain admissible after the normal validation gates pass.

The TypeScript runtime surface follows the selected major through an exact `@types/node` 26 pin recorded in a separate dependency-admission artifact. This runtime migration does not change the provider-neutral domain/application contracts, public Agentic OS behavior, database schema, transport protocols or Angular isolation boundary.

Node.js 24 records remain historical evidence. Existing phase summaries, approval records, dependency admissions and review artifacts continue to state the runtime that actually produced them; they are not rewritten to imply retrospective Node.js 26 verification. Current manifests, current operator documentation and forward validation use Node.js 26.

Migration acceptance requires root typechecking, core boundary compilation, root tests/build, Angular tests/AOT build and runtime-contract integrity checks under Node.js 26.11.1. Successful implementation does not retroactively approve or stabilize phases whose governance state is pending.

