# Evaluation I/O Contract

This implementation contract refines [ADR-0008](decisions/ADR-0008-deterministic-evaluation.md) for the controlled Phase 6 runtime.

The bundled internal-docs@1.0.0 dataset is imported as JSON and copied by the TypeScript build. Its parsed body revision is verified before case execution. Dataset selection is host-owned; the initial CLI accepts uaos eval without a model-controlled path or scenario. Changing a released case/expectation requires a new versioned fixture.

Each case runs the grounded use case with its preallocated runId. A host permission setting admits retrieve_passages or explicitly denies it for the dataset's deny_tool fixture. A host observer captures only validated retrieved passage IDs. A journal wrapper first awaits real JSONL persistence, then records the same schema-validated event for evaluation. Neither model output nor report input supplies the observer's IDs.

The report adapter admits only EvaluationReportSchema and a filename-safe evaluation-/operation-prefixed ID. The configured root is a trusted operator directory. It creates an exclusive private temporary file inside that root, writes the validated report, flushes file contents, closes it, then atomically publishes a no-replace hard link as <evaluationId>.json. Existing files and symlinks are never overwritten. Unsupported hard-link publication fails closed. Temporary files are cleaned on failure and after publication.

The adapter normalizes errors without paths or report content. Cancellation before publication produces no final report. A cancellation racing publication may leave a complete report even when acknowledgment is lost. File sync plus atomic publication does not claim directory-entry durability after power loss on every filesystem, especially Windows. Caller-visible success is returned only after awaited persistence; report IDs are unique and retries never overwrite an artifact.

The initial CLI prints the safe JSON report, exits 0 for a passing gate, 2 for a failing gate, and 1 for execution/configuration/persistence errors. It forwards SIGINT through the existing caller signal. Ordinary ask/cite/state retain their previous behavior. The known unsupported-answer regression is an explicit test-executor decorator, not a production model or HTTP fault switch.

Reports bind dataset and scorer revisions, not an immutable database-wide corpus snapshot. Reproduction also requires the documented index/embedding profile and fixture ingestion from the relevant Git checkout. This is a material limit of this course slice, not a semantic-quality or release-approval claim.
