# Iteration 5 — Durable State and Explicit Memory

Iteration 5 adds durable conversation turns and user-written memory to the grounded assistant. A new process can read the same conversation and replay a settled request without repeating model/tool work. Run state, saved conversation history, and explicit memory are different types with different lifetimes.

Content storage is explicit. Ordinary ask/cite remains a standalone grounded operation. Conversation commands intentionally save normalized questions and grounded results, including quotations. JSONL and the separate state audit retain only safe metadata. There is no automatic retention default or model-driven memory extraction.

## Prepare the workspace

Use Node.js 24 and the local PostgreSQL setup from [Iteration 4](04-grounded-retrieval.md). Retain the password for the existing Compose volume outside Git and restore the same database URL/index configuration.

```powershell
npm ci
npm run build
$env:UAOS_ITERATION = '5'
$env:UAOS_INDEX_ID = 'course-docs-v1'
# UAOS_DATABASE_URL must point to your already configured local teaching database.
npm run ingest
```

Iteration 5 initializes its fixed state schema when its runtime starts. It does not create a conversation or ingest documents automatically. The separate ingestion command prepares retrieval data. The existing run and citation endpoints remain available.

## Create and resume a conversation

CLI and HTTP accept the same strict operation envelope. This PowerShell helper uses the compiled binary directly so stdout contains only the JSON result.

```powershell
function Invoke-UaosState($Command) {
  $json = ConvertTo-Json -InputObject $Command -Depth 20 -Compress
  $raw = node ./dist/src/adapters/inbound/cli.js state $json
  if ($LASTEXITCODE -ne 0) { throw 'State command failed.' }
  $raw | ConvertFrom-Json
}
$created = Invoke-UaosState @{ operation = 'create'; retentionSeconds = 3600 }
$conversationId = $created.value.conversationId
$request = @{ operation = 'run_turn'; conversationId = $conversationId; requestId = 'first'; expectedVersion = 0; question = 'execution journal' }
$first = Invoke-UaosState $request
$first.value.result.grounding
$replay = Invoke-UaosState $request
$replay.value.cached
$snapshot = Invoke-UaosState @{ operation = 'read'; conversationId = $conversationId }
$snapshot.value.turns
```

Save the returned conversation ID if you will resume from another terminal. The content and results are in PostgreSQL, not process memory. Reusing the same requestId and normalized question returns the saved result with cached=true, without another run or JSONL file. Reusing that key for another question fails. New work needs the current version; cached replay may use the original expectedVersion.

Each new turn reserves a run ID and a private lease before agent effects. The durable turn and metadata audit name that same run ID, so its JSONL file remains traceable even if the process stops. The snapshot never exposes the private lease token.

## Use history and explicit memory

```powershell
$again = Invoke-UaosState @{ operation = 'run_turn'; conversationId = $conversationId; requestId = 'followup'; expectedVersion = $first.value.version; question = 'again' }
$written = Invoke-UaosState @{ operation = 'write_memory'; conversationId = $conversationId; expectedVersion = $again.value.version; key = 'topic'; value = 'execution journal'; ttlSeconds = 300 }
$remembered = Invoke-UaosState @{ operation = 'run_turn'; conversationId = $conversationId; requestId = 'memory-demo'; expectedVersion = $written.value.version; question = 'memory:topic' }
$deleted = Invoke-UaosState @{ operation = 'delete_memory'; conversationId = $conversationId; expectedVersion = $remembered.value.version; key = 'topic' }
```

The deterministic teaching model receives at most the last six settled turns and currently unexpired explicit memory. again uses the previous settled question as a retrieval query. memory:key uses the named memory value. These are teaching conventions, not general semantic conversation understanding. Notes/history are data; they cannot authorize a tool, change permissions, or bypass citation validation.

Only explicit write_memory/delete_memory operations change memory. A conversation can hold at most 20 entries; each value is at most 2048 characters. TTL is explicit and cannot extend past the conversation's absolute expiry. A conversation contains at most 100 turns. New reads and new execution contexts exclude expired memory. A context already given to an in-flight executor is a snapshot, not a continuously revocable data stream.

Conversation retention is an explicit value from 60 to 604800 seconds. The guide uses one hour. Expiry does not renew when a user asks another question or writes memory. The proposed seven-day teaching preference remains a separate user choice; this API does not silently activate it.

## Call the same commands over HTTP

```powershell
node --input-type=module -e "import { startServer } from './dist/src/composition/server.js'; await startServer({ iteration: 5, databaseUrl: process.env.UAOS_DATABASE_URL, indexId: process.env.UAOS_INDEX_ID });"
```

```powershell
$body = @{ operation = 'read'; conversationId = $conversationId } | ConvertTo-Json -Compress
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:3000/api/v1/conversation-commands' -ContentType 'application/json' -Body $body
```

Supported operations are create, read, run_turn, write_memory, delete_memory, recover, purge, and audit. One application handler validates the envelope for both adapters. Unknown operations, extra authority/time/lease fields, and malformed values fail before dispatch. Earlier iterations do not expose this command endpoint.

A successful command returns ok=true, operation, and value. A run_turn value includes cached, conversationId, version, and result. The command's success means its state outcome was durably acknowledged. The nested result.ok reports whether the agent itself succeeded; a persisted cancelled/failed turn is still a completed state operation. CLI command success exits 0. Inspect result.ok when using the command as an agent-quality gate.

## Explain concurrency and recovery

Only one turn can run in a conversation. A second turn or memory mutation returns CONVERSATION_BUSY while that slot is active. New mutations require expectedVersion, otherwise VERSION_CONFLICT prevents a lost update. Different conversations remain independent.

A lease lasts at most 30 seconds, within the conversation lifetime. A settled result must match its reserved run ID and private token before expiry. A late worker cannot overwrite a recovered turn. This is fencing and idempotent replay, not an exactly-once guarantee for external effects.

Resume is between settled turns. An abruptly stopped process can leave a running turn. Once its lease has expired, explicitly recover it with the current version:

```powershell
$current = Invoke-UaosState @{ operation = 'read'; conversationId = $conversationId }
$recovered = Invoke-UaosState @{ operation = 'recover'; conversationId = $conversationId; requestId = 'interrupted-request'; expectedVersion = $current.value.version }
```

Use an actually interrupted request ID from your snapshot. Recovery marks it interrupted; it does not replay a model/tool step. That old key cannot execute again. A new attempt needs a new requestId. The live test's barrier makes recovery and a late worker race reproducible.

Normal caller cancellation returns a typed cancelled agent result. The service attempts to save that result using an independent 1000 ms settlement signal after the agent's own terminal journal handling. If execution throws unexpectedly, or state settlement fails/loses its acknowledgment, the service does not report durable completion or blindly retry. Read the saved state and use explicit recovery when appropriate. A noncooperative substituted store cannot block the service's settlement return indefinitely; its late underlying work still cannot be claimed as stopped.

## Inspect audit and retention

```powershell
$audit = Invoke-UaosState @{ operation = 'audit'; conversationId = $conversationId }
$audit.value
$purged = Invoke-UaosState @{ operation = 'purge' }
$purged.value
```

State mutation and its safe audit record commit in one PostgreSQL transaction. Safe metadata includes conversation/request/run IDs, monotonic sequence, timestamps, keys, expiry, and outcome codes. It excludes questions, results, memory values, documents, and raw exceptions. The original JSONL journal remains version 1.1 and content-free. This is not a database/JSONL dual-write guarantee.

Expired content is logically inaccessible before physical purge. purge deletes at most 100 expired conversations, visits at most 100 idle conversations with expired memory, and removes at most 1000 expired audit records per invocation. Returned conversations/memories/audits counters make batch progress visible. Repeat as needed. Active conversations defer physical expired-memory removal until settlement or a later purge; new reads still omit it.

Metadata audit has its own 30-day lifetime. A purge tombstone retains only safe metadata. Audit inspection returns the most recent 1000 records for one conversation, ordered by sequence. No background cleanup automation is installed. PostgreSQL volume retention and backup copies remain an operator responsibility.

## Verify and challenge the design

```powershell
npm test -- tests/contracts/state-contracts.test.ts tests/unit/conversation-service.test.ts
npm test -- tests/integration/conversation-adapters.test.ts
npm run validate
npm run test:database
```

1. Replay a saved request after creating a fresh process and prove zero additional agent effects and zero new JSONL files.
2. Submit two turns concurrently, then try a memory write during the first turn. Distinguish busy, stale-version, and reused-key outcomes.
3. Hold an executor past its lease, recover the turn, and release the old executor. Prove the old token cannot settle the new state.
4. Reject an audit insertion after a state update. Prove both roll back together, then compare this guarantee with the separate agent journal.
5. Expire memory and a conversation using the injected clock. Show logical exclusion, inspect physical storage, purge, and inspect the safe tombstone.
6. Explain what happens when COMMIT succeeds but its response is lost. Identify where replay is safe and where a new request ID is an explicit new attempt.

The [evidence record](../reviews/ITERATION-05-evidence.md) records tests and limits. Production identity/access control, encryption policy, semantic context interpretation, mid-turn checkpoint replay, and stronger external-effect guarantees are separate future decisions. Architectural review, approval, and stability remain pending.
