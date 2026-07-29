# Universal AI Engineering Artifact Registry

```yaml
artifact_id: UAE-REGISTRY
artifact_type: Architecture
version: 0.1.0
status: Draft
parent: UAEA
depends_on:
  - UAE-CONSTITUTION
  - UAE-CHARTER
  - UAEA
```

The Artifact Registry is the central configuration and traceability index for the Universal AI Engineering ecosystem. It is a lightweight CMDB for governed artifacts, not merely a list of documents.

The human-readable registry documentation lives in this file. The synchronized machine-readable representation lives in [artifacts.yaml](artifacts.yaml).

## Registry Schema

| Field | Meaning |
| --- | --- |
| ID | Stable artifact identifier |
| Name | Official artifact name |
| Type | Governance, Architecture, Standard, Methodology, Template, Implementation, Education |
| Version | Semantic version |
| Status | Planned, Draft, Review, Approved, Stable, Deprecated, Retired |
| Owner | Accountable owner |
| Parent | Direct governing artifact |
| Depends On | Required upstream artifacts |
| Children | Direct subordinate artifacts |
| References | Non-authority related artifacts |
| ADR | Related architectural decisions |
| Repository | Repository or path |
| Changelog | Change history location |
| Lifecycle | Current lifecycle phase |
| Compatible Versions | Known compatibility constraints |
| Tags | Classification tags |
| Created | Creation date when known |
| Updated | Last update date when known |

## Initial Registry Records

| ID | Name | Type | Version | Status | Owner | Parent | Depends On | Children | References | ADR | Repository | Changelog | Lifecycle | Compatible Versions | Tags | Created | Updated |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| UAE-CONSTITUTION | Constitution of Universal AI Engineering | Governance | 0.1.0 | Draft | Governance Owner; Sergei as final human authority | None | None | UAE-CHARTER | None | ADR-0001 | constitution/Constitution.md | CHANGELOG.md | Draft | None | foundation, governance | 2026-07-29 | 2026-07-29 |
| UAE-CHARTER | Universal AI Engineering Project Charter | Governance | 0.1.0 | Draft | Project Sponsor | UAE-CONSTITUTION | UAE-CONSTITUTION | UAEA | None | ADR-0001 | charter/Project-Charter.md | CHANGELOG.md | Draft | UAE-CONSTITUTION 0.1.0 | foundation, governance | 2026-07-29 | 2026-07-29 |
| UAEA | Universal AI Engineering Architecture | Architecture | 0.1.0 | Draft | Architecture Owner | UAE-CHARTER | UAE-CONSTITUTION, UAE-CHARTER | UAE-REGISTRY, UGSD-SPEC, UAOS, SAEH | None | ADR-0001 | architecture/UAEA.md | CHANGELOG.md | Draft | UAE-CONSTITUTION 0.1.0, UAE-CHARTER 0.1.0 | foundation, architecture | 2026-07-29 | 2026-07-29 |
| UAE-REGISTRY | Universal AI Engineering Artifact Registry | Architecture | 0.1.0 | Draft | Repository Maintainer | UAEA | UAE-CONSTITUTION, UAE-CHARTER, UAEA | None | registry/artifacts.yaml | ADR-0001 | registry/Artifact-Registry.md | CHANGELOG.md | Draft | UAEA 0.1.0 | foundation, registry | 2026-07-29 | 2026-07-29 |
| UGSD-SPEC | UGSD Specification | Standard | 0.1.0 | Draft | Specification Owner | UAEA | UAE-CONSTITUTION, UAE-CHARTER, UAEA, UAE-REGISTRY | UGSD-METHODOLOGY, UAE-REFERENCE | None | ADR-0001 | standards/UGSD-Specification.md | CHANGELOG.md | Draft | UAEA 0.1.0 | foundation, standard | 2026-07-29 | 2026-07-29 |
| UGSD-METHODOLOGY | UGSD Methodology | Methodology | 0.1.0 | Planned | Methodology Owner | UGSD-SPEC | UGSD-SPEC | None | None | None | methodology/README.md | CHANGELOG.md | Planned | UGSD-SPEC 0.1.0 | methodology | 2026-07-29 | 2026-07-29 |
| UAE-REFERENCE | Universal AI Engineering Reference Repository | Template | 0.1.0 | Planned | Repository Maintainer | UGSD-SPEC | UGSD-SPEC, UGSD-METHODOLOGY | UAOS | None | None | reference/README.md | CHANGELOG.md | Planned | UGSD-SPEC 0.1.0 | reference, templates | 2026-07-29 | 2026-07-29 |
| UAOS | Universal Agentic OS | Implementation | 0.1.0 | Planned | Architecture Owner | UAEA | UGSD-SPEC, UAE-REFERENCE | None | SAEH | None | agentic-os/README.md | CHANGELOG.md | Planned | UGSD-SPEC 0.1.0 | implementation | 2026-07-29 | 2026-07-29 |
| SAEH | Senior AI Agent Engineer Handbook | Education | 0.1.0 | Planned | Education Owner | UAEA | UGSD-SPEC, UAOS | None | None | None | senior-handbook/README.md | CHANGELOG.md | Planned | UGSD-SPEC 0.1.0, UAOS 0.1.0 | education | 2026-07-29 | 2026-07-29 |

## Lifecycle Transitions

```text
Planned -> Draft -> Review -> Approved -> Stable
                                   |
                                   v
                              Deprecated -> Retired
```

`Approved` means formally accepted but not necessarily released as a stable baseline. `Stable` means released and intended for supported use. Only Approved or Stable artifacts normally become Deprecated. Retired artifacts remain traceable but are no longer active.

Changes to foundation artifacts require formal architectural review, registry updates, and explicit human approval.
