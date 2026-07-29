# Repository Agent Instructions

AI coding and documentation agents working in this repository MUST preserve the Universal AI Engineering authority hierarchy.

## Required Practices

- Inspect repository history and existing content before replacing governed artifacts.
- Read higher-level governing artifacts before editing lower-level artifacts.
- Never redefine the architecture from implementation files.
- Preserve stable artifact identifiers.
- Update the [Artifact Registry](registry/Artifact-Registry.md) and [machine-readable registry](registry/artifacts.yaml) when adding or changing governed artifacts.
- Use Architectural Decision Records for architectural changes.
- Do not mark documents Approved or Stable without explicit human approval.
- Validate internal links before presenting work for review.
- Preserve traceability between artifacts, dependencies, owners, status, versions, and repository locations.
- Show evidence of validation in implementation notes or pull request descriptions.
- Distinguish rename, migration, consolidation, and deletion.
- Preserve ADRs and changelog history.
- Keep human-readable and machine-readable registries synchronized.
- Report all deleted governed files in the pull request description.
- Treat unexpected pre-existing content as a discovery finding, not as disposable material.
- Never merge without human approval.
- Do not merge your own work.

## Knowledge Preservation

Repository agents MUST NOT delete governed knowledge without:

- documented rationale;
- impact analysis;
- an applicable ADR when architectural scope is affected;
- explicit human approval.

Agents SHOULD consolidate compatible knowledge instead of replacing one version with another. This is a repository agent rule governed by the current architecture and human review process; it is not yet a ratified constitutional principle.

## Governing Sources

Start with the [Constitution](constitution/Constitution.md), then the [Project Charter](charter/Project-Charter.md), then the [Universal AI Engineering Architecture](architecture/UAEA.md).
