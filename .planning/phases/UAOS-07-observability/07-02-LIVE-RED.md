# Live telemetry discovery — 2026-11-15

At source 4ab7476 plus the new observability database tests, Node.js 24.22.1 ran the owned disposable PostgreSQL suite. Existing suites passed 22 tests; all four new observability tests failed because the per-record filesystem exporter exceeded its unchanged 250 ms budget before root/terminal metrics reached disk. Total: 22 passed / 4 failed in four files, 14.65 seconds. The runner removed its owner-verified database container.

HTTP and CLI primary answers, state execution, and the evaluation gate succeeded. Inspection returned incomplete with MISSING_ROOT_SPAN, CORRELATION_MISMATCH, and MISSING_TERMINAL_METRICS rather than hiding missing evidence. No corruption of required execution JSONL was found. [ADR-0010](../../../docs/architecture/decisions/ADR-0010-bounded-telemetry-batches.md) records bounded batch export as the correction; the required journal and optional wait threshold remain unchanged.

After the correction, the same live suite passed all 26 tests in four files in 13.32 seconds, including complete CLI/HTTP/state/evaluation traces and required-journal/exporter failure isolation. The owned container was removed. Focused batch/filesystem checks also passed; the new batch contract first produced two failing tests against the old sequential implementation before the correction.
