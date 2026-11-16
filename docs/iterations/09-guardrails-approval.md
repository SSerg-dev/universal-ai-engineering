# Iteration 9 — Enforce Rules and Pause for an Explicit Decision

Iteration 9 applies a host-owned policy to the existing grounded assistant and adds one consequential action: export the exact reviewed answer to a local Markdown file. The model cannot approve/export it. Preparation, operator approval and publication are separate commands that can occur in separate processes. [ADR-0013](../architecture/decisions/ADR-0013-guarded-execution-and-approved-export.md) defines the guarantees; [the command boundary](../architecture/guard-command-io.md) lists fields/statuses.

## Run the guarded assistant

Use Node.js 24, `npm ci`, and `npm run build`. Set up controlled PostgreSQL/pgvector and UAOS_DATABASE_URL as in [Iteration 4](04-grounded-retrieval.md); do not put credentials into evidence. The selected local teaching policy is [local-course.v1.json](../../fixtures/policies/local-course.v1.json), pinned by canonical SHA-256. A malformed/replaced revision fails before database startup effects. No provider or dependency is added.

```powershell
$env:UAOS_ITERATION = '9'
$env:UAOS_INDEX_ID = 'course-docs-v1'
npm run ingest
node ./dist/src/adapters/inbound/cli.js ask 'execution journal'
node ./dist/src/adapters/inbound/cli.js ask '<<private>>'
```

The first question retrieves controlled evidence with two model attempts/one tool attempt. The marker question is denied before model/tool work. Default input/output limits are 2048/8192 UTF-16 characters; serialized tool argument/observation bounds are 4096/16384 characters. Literal markers normalize NFKC/case and use plain substring checks. The allowed tool is retrieve_passages; export_answer is not a registry capability. Call budgets are two model/one tool attempts, run deadline 5000ms, tool deadline 4000ms. Existing ten public agent errors and metadata-only JSONL remain unchanged. These are explicit teaching rules, not semantic injection/PII detection or monetary/provider-token budgets.

Each request/action/invocation/observation gate requires acknowledged safe audit before allowing later work. Audit failure fails closed; a late acknowledgment cannot restart a cancelled/timed-out run. Existing invocation allow-lists still apply, including evaluation denial cases. The same factory governs ordinary requests, conversation turns, evaluations, streams and export preparation.

## Prepare and inspect

The default export root is `.uaos/exports`; the host may set UAOS_EXPORT_ROOT. No command accepts a path/filename. Only the generated approval ID determines the filename. The default policy requires explicit approval, expires proposals after 300 seconds, leases active preparation/publication for 15 seconds, accounts at most eight pending/active/uncertain actions, and limits export to 32768 actual UTF-8 bytes.

```powershell
$request = @{ operation = 'prepare_export'; requestId = "request-$([guid]::NewGuid())"; question = 'execution journal' } | ConvertTo-Json -Compress
$proposal = (node ./dist/src/adapters/inbound/cli.js guard $request | ConvertFrom-Json).value
$proposal | ConvertTo-Json -Depth 20
$proposal.payload.markdown
```

Review the exact Markdown, citations, destinationId, contentDigest/contentBytes, policyRevision, proposalDigest and expiresAt. This view deliberately contains answer/quote content; journal/audit do not. The question is not stored by approval state: only its digest/request identity. Repeating the same request ID/question reads existing preparation/proposal state; changed input is rejected. Interrupted preparation becomes failed after its lease; it cannot pretend to resume an in-flight model call or rerun silently. Use a new request ID for a new run.

The next command is a deliberate operator choice. Development permission to implement this course is not approval of any runtime proposal. To refuse the proposal:

```powershell
$decision = @{ operation = 'deny'; approvalId = $proposal.approvalId; expectedVersion = $proposal.version; proposalDigest = $proposal.proposalDigest } | ConvertTo-Json -Compress
node ./dist/src/adapters/inbound/cli.js guard $decision
```

Or, only after review, explicitly approve that same bound proposal:

```powershell
$decision = @{ operation = 'approve'; approvalId = $proposal.approvalId; expectedVersion = $proposal.version; proposalDigest = $proposal.proposalDigest } | ConvertTo-Json -Compress
$approved = (node ./dist/src/adapters/inbound/cli.js guard $decision | ConvertFrom-Json).value
```

Approval does not publish. A later process can claim the approved action without asking the question again:

```powershell
$execution = @{ operation = 'execute'; approvalId = $approved.approvalId; expectedVersion = $approved.version; proposalDigest = $approved.proposalDigest } | ConvertTo-Json -Compress
node ./dist/src/adapters/inbound/cli.js guard $execution
```

The artifact is `.uaos/exports/<approvalId>.md` unless the host selected another root. Exact bytes are staged/flushed privately and linked without replacing an existing artifact. Matching content can acknowledge the same action; unexpected existing content is preserved. A policy change invalidates unexecuted proposals; expiry prevents a new execution claim. Approval and publication claims are versioned transactional database/audit changes; late workers are fenced.

## Inspect ambiguity and maintenance

Database and filesystem are separate transactions. A file may exist even if publication/settlement acknowledgment was lost. Such work is executing/uncertain and still consumes capacity; execute never silently retries it. Read current state and explicitly reconcile:

```powershell
$read = @{ operation = 'read'; approvalId = $proposal.approvalId } | ConvertTo-Json -Compress
$current = (node ./dist/src/adapters/inbound/cli.js guard $read | ConvertFrom-Json).value
$reconcile = @{ operation = 'reconcile'; approvalId = $current.approvalId; expectedVersion = $current.version; proposalDigest = $current.proposalDigest } | ConvertTo-Json -Compress
node ./dist/src/adapters/inbound/cli.js guard $reconcile
```

Reconcile is for uncertain state. It verifies an existing artifact by bound digest/byte count; positive evidence can record success, absence remains uncertain and does not publish again. An active execution lease returns busy; read after expiry may advance the version. Cancellation bounds authorization/waiting, not arbitrary underlying I/O at an exact instant. There is no exactly-once claim or automatic filesystem rollback.

```powershell
$audit = @{ operation = 'audit'; scopeId = $proposal.approvalId } | ConvertTo-Json -Compress
node ./dist/src/adapters/inbound/cli.js guard $audit
node ./dist/src/adapters/inbound/cli.js guard '{"operation":"purge_expired"}'
node ./dist/src/adapters/inbound/cli.js inspect $proposal.runId
```

Access/maintenance removes expired private payloads and retains metadata audit/receipts. Published user artifacts are not silently deleted. Conversation retention remains independent. This is one trusted local operator with a trusted host/database/filesystem, not a remote authentication or tenant system. A hash binds data but does not authenticate a malicious administrator.

## HTTP, streaming and verification

```powershell
node --input-type=module -e 'import {startServer} from "./dist/src/composition/server.js"; await startServer({iteration:9,databaseUrl:process.env.UAOS_DATABASE_URL,indexId:process.env.UAOS_INDEX_ID});'
```

POST the same strict JSON commands to `/api/v1/guard-commands`. Origin, when supplied, must match the server origin; proposal responses use no-store. Existing `/api/v1/agent-runs`, conversations, citations and stream endpoints remain available. The [Iteration 8 Angular inspector](08-streaming-angular-ui.md) can consume guarded streams unchanged; approval is explicit CLI/API work in this slice.

```powershell
npm run validate:all
npm run test:database
```

Tests use deterministic models and owned disposable infrastructure. Adversarial evidence covers policy/size/tool/call boundaries, failed/hung audit, stale decisions/policies, CAS/leases, restart, cancellation, no-overwrite, lost acknowledgment and explicit reconciliation. See [Phase 9 evidence](../reviews/ITERATION-09-evidence.md). Architectural review, human approval and stability remain pending.
