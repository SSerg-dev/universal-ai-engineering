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
- Show evidence of validation in the task evidence package, review record, change request, or equivalent auditable mechanism.
- Distinguish rename, migration, consolidation, and deletion.
- Preserve ADRs and changelog history.
- Keep human-readable and machine-readable registries synchronized.
- Report all deleted governed files in the task evidence package or equivalent review record.
- Treat unexpected pre-existing content as a discovery finding, not as disposable material.
- Never integrate changes into a governing baseline without human approval.
- Do not integrate your own work without explicit human approval.

## Knowledge Preservation

Repository agents MUST NOT delete governed knowledge without:

- documented rationale;
- impact analysis;
- an applicable ADR when architectural scope is affected;
- explicit human approval.

Agents SHOULD consolidate compatible knowledge instead of replacing one version with another. This is a repository agent rule governed by the current architecture and human review process; it is not yet a ratified constitutional principle.

## Architecture Review Gate

- Agents MUST NOT treat implementation completion as approval.
- Agents MUST prepare reviewable evidence after implementation.
- Agents MUST identify the comparison base and changed artifacts.
- Agents MUST NOT integrate changes before explicit human approval.
- Agents MUST correct review findings before requesting approval.
- Agents MUST support review without requiring a Pull Request.
- Agents MAY use a Pull Request when it improves collaboration, traceability, or risk management.
- Agents MUST keep task states distinct: Planned, Implemented, Architecturally Reviewed, and Approved.

## Governing Sources

Start with the [Constitution](constitution/Constitution.md), then the [Project Charter](charter/Project-Charter.md), then the [Universal AI Engineering Architecture](architecture/UAEA.md).
