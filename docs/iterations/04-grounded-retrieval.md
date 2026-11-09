# Iteration 4 — Grounded Retrieval

Iteration 4 ingests controlled Markdown into PostgreSQL/pgvector, retrieves active passages, and returns exact quotations with immutable citations. CLI and HTTP use the same loop, registry, and request-scoped grounding validator. A success still requires exactly one tool call and two model calls.

The teaching embedding is a deterministic 512-dimensional lexical hash fixture. This demonstrates ingestion, vector storage/search, reproducibility, and provenance. It does not establish semantic retrieval quality. A real embedding model remains a replaceable provider choice with its own immutable profile.

## Start the local teaching database

Use Node.js 24 and Docker. Create a password once and retain it outside Git for subsequent starts of this database volume. The Compose file pins the reviewed pgvector image digest and binds its port to loopback.

```powershell
npm ci
npm run build
$env:UAOS_POSTGRES_PASSWORD = [guid]::NewGuid().ToString('N')
docker compose -f compose.retrieval.yaml up -d --wait
$env:UAOS_DATABASE_URL = "postgresql://uaos:$($env:UAOS_POSTGRES_PASSWORD)@127.0.0.1:55432/uaos_course"
$env:UAOS_INDEX_ID = 'course-docs-v1'
$env:UAOS_ITERATION = '4'
npm run ingest
npm run uaos -- ask 'execution journal'
```

Ingestion prints document IDs, revision hashes, and passage counts. The question command reads the existing index; it does not ingest or change active documents. A missing database/index produces a safe failure. PostgreSQL initialization credentials apply to a new volume; changing the password environment variable does not change an existing database password.

```powershell
npm run uaos -- ask '!!!'
docker compose -f compose.retrieval.yaml down
```

The punctuation-only question has no usable embedding and returns grounding.status=abstained with no_evidence and zero claims. It still executes one successful retrieval tool. Stopping Compose preserves its named volume and indexed revisions. The disposable database test command below uses separate tmpfs storage.

## Call HTTP and resolve a citation

Start the server in a terminal with the same database/index configuration.

```powershell
node --input-type=module -e "import { startServer } from './dist/src/composition/server.js'; await startServer({ iteration: 4, databaseUrl: process.env.UAOS_DATABASE_URL, indexId: process.env.UAOS_INDEX_ID });"
```

```powershell
$result = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:3000/api/v1/agent-runs' -ContentType 'application/json' -Body '{"question":"execution journal"}'
$result.grounding
$citation = $result.grounding.claims[0].citation
$body = $citation | ConvertTo-Json -Compress
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:3000/api/v1/citations/resolve' -ContentType 'application/json' -Body $body
npm run uaos -- cite $body
```

The dedicated iteration 4 success adds grounding version 1.0 to the existing run fields. An answered result contains one to three quote/citation claims. CLI renders each exact quotation and its JSON citation in answer text. The resolver returns the stored passage. Neither cite nor the resolver starts another agent run or adds another journal file.

Each citation contains indexId, documentId, revision, passageId, start, and end. Resolution checks all six fields in the configured index. Unknown exact identities return not found; malformed or cross-index identities fail validation. The HTTP resolver is POST /api/v1/citations/resolve because it accepts the structured identity as JSON. It is a read operation.

## Follow identity and indexing

[ADR-0006](../architecture/decisions/ADR-0006-grounded-retrieval.md) fixes identity rules before implementation. Source files have safe filename-derived IDs and an initial H1 title. The loader admits at most 100 regular Markdown files of at most 1,000,000 bytes each. It bounds reads, rejects malformed UTF-8, and excludes symlinks. The configured root is an operator-controlled source location.

Ingestion converts newlines to LF and preserves canonical content, including formatting and whitespace. revision is SHA-256 over those UTF-8 bytes. The utf16-v1 chunker covers the content with contiguous non-overlapping spans of at most 1024 JavaScript UTF-16 code units, preserving surrogate pairs. start is inclusive and end exclusive. Passage IDs hash the index/document/revision/chunker/ordinal/span tuple.

The manifest binds an index to an embedding profile ID/dimension and chunker. Reusing an index with different configuration fails. Vectors are finite, unit-normalized, dimension-checked, and profile-tagged. Indexing a passage without a usable vector fails before a database write.

Each document replacement commits its complete revision and passages before switching the active pointer, in one transaction. Reingesting identical content is idempotent. Search sees active revisions; previous revisions remain available for existing citations. Replacement is atomic per document, not across a corpus-wide batch. Ingestion currently serializes through the index manifest row, including different documents in the same index.

## Understand retrieval and grounding

The PostgreSQL adapter uses exact cosine distance, threshold 0.15 in runnable composition, a limit of three passages, and deterministic document/ordinal ties. The score is a retrieval similarity, not calibrated confidence. The fixture hashing model can collide and cannot understand paraphrases. Relevance and truth of the source remain distinct from exact provenance.

The model boundary accepts only a grounded_answer containing structured claims. Every quote must equal an observed passage in full, and its citation must match every identity field. Duplicate, shifted, altered, unobserved, or uncited claims fail as INVALID_MODEL_ACTION before run.succeeded. Unsupported free prose cannot be added to the canonical answer. An abstention is valid only when the successful observation has no passages. Retrieval failures remain TOOL_FAILURE and are never disguised as empty evidence.

Iterations 1–3 retain their existing result contracts. Their strict RunAgentResultSchema rejects the new grounding field. Iteration 4 has its own GroundedRunAgentResultSchema. The common loop algorithm remains unchanged; the request-scoped model boundary validates/translates the grounded action and attaches its validated result after the loop's success evidence is persisted.

## Inspect bounds and evidence

Every repository operation owns one client with a 1000 ms connection/statement timeout, 500 ms lock timeout, 1500 ms query/idle-transaction timeout, and a 3000 ms operation deadline. The operation deadline remains active through connection cleanup. Caller cancellation destroys that owned socket; unfinished transactions roll back. A cancellation concurrent with COMMIT can lose acknowledgment of a successful write. Idempotent reingestion recovers that ambiguity.

Ingestion's command has a 30-second batch deadline. Agent composition retains its 5000 ms run deadline, 4000 ms tool deadline, two-model/one-tool budget, and 250 ms terminal-evidence cleanup. JavaScript synchronous work remains non-preemptible. Model/journal adapters must cooperate with cancellation.

```powershell
Get-Content -LiteralPath (Join-Path '.uaos/journal' ($result.runId + '.jsonl'))
npm run validate
npm run test:database
```

The version 1.1 journal contains eight metadata events on success, including document source IDs and outcome/usage fields. It excludes the question, passage, vector, quote, answer, database URL, and raw exception. The explicit resolver returns requested indexed content to the caller; it is separate from the metadata journal.

The database test runner requires Docker and uses the recorded image digest, a unique owner-labeled container, random loopback port, random disposable credential, and tmpfs. It checks exact ownership before removing that container. Failure to start or validate the database fails the command; it cannot silently skip. The normal validation suite uses deterministic fakes and does not require PostgreSQL.

## Exercises

1. Reingest a changed document and show that active search returns its new revision while an old saved citation still resolves.
2. Forge a revision, shift a span, alter a quote, duplicate a claim, and add uncited prose. Identify the rejection point and demonstrate absence of run.succeeded.
3. Inject a passage-insert failure after a document row is written. Prove that neither the partial revision nor a new active pointer becomes visible.
4. Cancel a blocked SQL query and observe its backend disappear. Explain acknowledgment ambiguity if cancellation races with COMMIT.
5. Construct a hash collision or a paraphrase with poor recall. Explain why exact citation validity does not establish semantic relevance, then specify a provider profile and evaluation needed to improve it.

The [review evidence](../reviews/ITERATION-04-evidence.md) traces scope, tests, threats, dependencies, and limits. Architectural review, human approval, and stability remain separate pending states. Memory and retention policy, provider embeddings, production access controls, and corpus-wide publication are later decisions.
