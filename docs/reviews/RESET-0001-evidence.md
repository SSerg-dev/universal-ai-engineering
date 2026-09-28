# RESET-0001 Greenfield Restart Evidence

## Task State

- **Planned:** Complete
- **Authorized:** Complete — Project Founder responded `yes` / `go` on 2026-09-28
- **Implemented:** Complete
- **Architecturally Reviewed:** Pending
- **Approved:** Pending

## Comparison Base

- Git commit: `e4a25e9`
- Branch at authorization: `master`
- Existing tracked files: 23
- Existing tracked size: approximately 65.9 KiB

## Rationale

Replace an unapproved documentation-heavy foundation with the smallest greenfield structure that supports the agreed ten-iteration Agentic OS course.

## Declared Retirements

Directories:

- `agentic-os/`
- `architecture/`
- `charter/`
- `constitution/`
- `methodology/`
- `reference/`
- `registry/`
- `reviews/`
- `senior-handbook/`
- `standards/`
- `.planning/` (brownfield ingestion projection)

Files:

- `ROADMAP.md`
- `.gsd-ingest-manifest.yaml`

Root files `README.md`, `AGENTS.md`, `CHANGELOG.md`, and `.gitignore` will be replaced rather than silently retained. `LICENSE`, `.git/`, and local `.codex/` remain.

## Deleted Tracked Files

All deletions are recoverable from Git commit `e4a25e9`.

| Former path | Classification | Treatment |
|-------------|----------------|-----------|
| `ROADMAP.md` | Legacy strategic roadmap | Retired; replaced by GSD roadmap and project brief |
| `agentic-os/README.md` | Planned placeholder | Retired; scope consolidated into project brief and roadmap |
| `architecture/UAEA.md` | Draft architecture | Retired; relevant boundaries consolidated into research and new planning |
| `architecture/decisions/ADR-0001-foundation-baseline.md` | Draft ADR | Migrated to `docs/architecture/decisions/ADR-0001-foundation-baseline.md` |
| `architecture/decisions/README.md` | Planned placeholder | Retired |
| `architecture/diagrams/README.md` | Planned placeholder | Retired |
| `charter/Project-Charter.md` | Draft charter | Retired and indexed in legacy archive |
| `constitution/Constitution.md` | Draft constitution | Retired and indexed in legacy archive |
| `methodology/README.md` | Planned placeholder | Retired |
| `reference/README.md` | Planned placeholder | Retired |
| `registry/Artifact-Registry.md` | Draft registry | Retired and indexed in legacy archive |
| `registry/artifacts.yaml` | Draft machine registry | Retired and indexed in legacy archive |
| `registry/artifacts/README.md` | Planned placeholder | Retired |
| `reviews/UAE-0002-architecture-review-gate.md` | Pending review evidence | Consolidated into legacy archive index |
| `reviews/UAE-0003-single-branch-workflow.md` | Pending review evidence | Consolidated into legacy archive index |
| `reviews/UAE-0004-foundation-consistency-review.md` | Pending review evidence | Consolidated into legacy archive index |
| `senior-handbook/README.md` | Planned placeholder | Retired |
| `standards/UGSD-Specification.md` | Draft standard | Retired and indexed in legacy archive |

## New Active Files

- `docs/PROJECT-BRIEF.md`
- `docs/architecture/decisions/ADR-0001-foundation-baseline.md`
- `docs/architecture/decisions/ADR-0002-greenfield-restart.md`
- `docs/archive/LEGACY-BASELINE.md`
- `docs/reviews/RESET-0001-evidence.md`
- `.planning/PROJECT.md`
- `.planning/config.json`
- `.planning/research/{STACK,FEATURES,ARCHITECTURE,PITFALLS,SUMMARY}.md`
- `.planning/REQUIREMENTS.md`
- `.planning/ROADMAP.md`
- `.planning/STATE.md`

## Recovery

- Restore tracked legacy content with Git from `e4a25e9`.
- Restore untracked planning content from the external pre-reset ZIP created before deletion.
- Do not delete or rewrite `.git` history.

## Validation Required After Implementation

- [x] Only declared legacy paths were retired; Git status matches the table above.
- [x] `.git`, `.codex`, and `LICENSE` remain.
- [x] New minimal root, documentation, research, and GSD artifacts exist.
- [x] Official GSD runtime identity: `@opengsd/gsd-core` 1.15.0.
- [x] GSD project health: healthy, zero errors, zero warnings.
- [x] GSD roadmap validation: passed with zero warnings.
- [x] GSD consistency validation: passed.
- [x] Research summary validation: passed.
- [x] Requirement coverage: 24 requirements, 24 traceability rows, 24 roadmap mappings, zero missing, zero duplicates.
- [x] Link integrity: 8 repository-relative Markdown links, zero broken.
- [x] `.planning/config.json` generated and parsed by GSD.

## Residual Notes

- `.codex/.gsd-staging/` could not be removed because the host denied access. It is local GSD state under the Git-ignored `.codex/` directory and does not affect repository contents.
- The working tree remains uncommitted pending roadmap review and explicit acceptance of the reset result.
