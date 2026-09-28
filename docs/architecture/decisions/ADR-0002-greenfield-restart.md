# ADR-0002: Restart as a Minimal Agentic OS Course

- **Status:** Authorized for implementation; baseline approval pending
- **Date:** 2026-09-28
- **Decision owner:** Project Founder
- **Recovery commit:** `e4a25e9`

## Context

The existing repository is a small documentation-first framework with 23 tracked files and no implementation. Its Draft Constitution, Charter, architecture, registry, standard, placeholder areas, and three pending review records create more governance surface than the first educational Agentic OS iteration needs.

The project goal has since become concrete through direct design discussion: build a personal ten-iteration TypeScript course around one internal-documentation assistant. Continuing to normalize the old Draft hierarchy would delay the learning product and preserve abstractions that have not yet demonstrated value.

On 2026-09-28 the Project Founder explicitly authorized retiring the old working-tree baseline and recreating the project from the agreed design. Git history at `e4a25e9` remains the complete recovery source. Uncommitted GSD ingestion artifacts were separately archived before deletion.

## Decision

Restart the active working tree as a minimal greenfield project.

Keep:

- `.git/` and its complete history;
- local `.codex/` GSD tooling, excluded from Git;
- `LICENSE`;
- a compact project brief, GSD planning artifacts, ADR history, changelog, and task evidence.

Retire from the active working tree:

- the Draft Constitution, Charter, UAEA, UGSD Specification, registries, pending review packages, legacy roadmap, and placeholder component directories;
- the completed brownfield-ingestion planning projection and its root manifest.

Recreate:

- a concise `README.md` and `AGENTS.md`;
- `.planning/` through the greenfield GSD flow;
- only the architecture and source directories justified by the current iteration.

## Impact Analysis

### Benefits

- The active tree directly represents the product being designed.
- New contributors and agents have fewer overlapping authority documents to reconcile.
- Architecture is introduced only when a runnable iteration requires it.
- The ten-version course remains the organizing structure.

### Costs and Risks

- The old governance model is no longer visible in the default working tree.
- Links to retired paths stop resolving on the new branch state.
- Concepts from the old Draft baseline can be lost if Git history is discarded.
- Reintroducing formal multi-artifact governance later will require a new explicit decision.

### Mitigations

- Preserve Git history and the exact recovery commit.
- Preserve ADR-0001 in the new documentation tree.
- Consolidate legacy artifacts and review states in `docs/archive/LEGACY-BASELINE.md`.
- Record every retired path in `docs/reviews/RESET-0001-evidence.md`.
- Do not delete `.git` or rewrite history.

## Consequences

- The project is treated as greenfield for GSD planning.
- GSD is an operational workflow, not architectural authority.
- Architecture contracts precede code, but the repository starts with only the minimum contracts required for Iteration 1.
- The retirement is implemented for review; it does not by itself mark the new project baseline Approved or Stable.
