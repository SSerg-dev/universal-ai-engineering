# Universal AI Engineering Architecture

```yaml
artifact_id: UAEA
artifact_type: Architecture
version: 0.1.0
status: Draft
parent: UAE-CHARTER
depends_on:
  - UAE-CONSTITUTION
  - UAE-CHARTER
```

## 1. Purpose

Universal AI Engineering Architecture (UAEA) defines the structural architecture of the Universal AI Engineering ecosystem: layers, artifacts, authority boundaries, dependencies, repositories, compatibility rules, and evolution model.

## 2. Architectural Context

Universal AI Engineering is a documentation-first engineering framework for AI-first software systems. It separates governance, architecture, standards, methodology, reference assets, reference implementation, and education so each artifact has a clear authority level and responsibility.

## 3. Architectural Principles

- Architecture precedes specification.
- Specification precedes implementation.
- Evidence supports acceptance.
- Human accountability remains explicit.
- Vendor independence is preserved.
- Lower-level artifacts do not redefine higher-level artifacts.
- Existing governed knowledge is consolidated rather than discarded when compatible with the governing hierarchy.

## 4. Ecosystem Model

```text
+------------------------------------------------+
| Governance                                     |
| Constitution, Project Charter                  |
+------------------------+-----------------------+
                         |
                         v
+------------------------------------------------+
| Architecture                                   |
| UAEA, ADRs, Artifact Registry                  |
+------------------------+-----------------------+
                         |
                         v
+------------------------------------------------+
| Standards                                      |
| UGSD Specification                             |
+------------------------+-----------------------+
                         |
                         v
+------------------------------------------------+
| Methodology                                    |
| UGSD Methodology                               |
+------------------------+-----------------------+
                         |
                         v
+------------------------------------------------+
| Reference Assets                               |
| Templates, schemas, checks, examples           |
+------------------------+-----------------------+
                         |
                         v
+------------------------------------------------+
| Reference Implementation                       |
| Universal Agentic OS                           |
+------------------------+-----------------------+
                         |
                         v
+------------------------------------------------+
| Education                                      |
| Senior AI Agent Engineer Handbook              |
+------------------------------------------------+
```

## 5. Ecosystem Layers

1. Governance
2. Architecture
3. Standards
4. Methodology
5. Reference Assets
6. Reference Implementation
7. Education

## 6. Artifact Authority Model

- The Constitution defines enduring rules.
- The Charter defines project intent, scope, and success.
- UAEA defines ecosystem structure and boundaries.
- Specifications define normative requirements.
- Methodology explains practical application.
- Reference assets encode reusable compliant patterns.
- Implementations demonstrate conformance.
- Educational material teaches and critiques the system.

No lower layer may silently redefine a higher layer.

## 7. Core Artifacts

| Artifact | Layer | Normative? | Primary responsibility |
| --- | --- | ---: | --- |
| Constitution | Governance | Yes | Enduring principles and authority |
| Project Charter | Governance | Yes | Scope, objectives, success |
| UAEA | Architecture | Yes | Structure and dependencies |
| Artifact Registry | Architecture | Yes for metadata | Central artifact index |
| UGSD Specification | Standards | Yes | Lifecycle and conformance |
| UGSD Methodology | Methodology | No, explanatory | Practical guidance |
| Reference Repository | Assets | Mixed | Templates and automation |
| Universal Agentic OS | Implementation | No | Reference conformance |
| Senior Handbook | Education | No | Senior-level application |

## 8. Artifact Dependency Model

Every governed artifact declares its `parent` and `depends_on` relationships and is indexed in the [Artifact Registry](../registry/Artifact-Registry.md). Machine-readable metadata remains in [registry/artifacts.yaml](../registry/artifacts.yaml) for validation and automation.

## 9. Normative Hierarchy

```mermaid
flowchart TD
  Constitution["Constitution of Universal AI Engineering"]
  Charter["Project Charter"]
  UAEA["Universal AI Engineering Architecture"]
  Registry["Artifact Registry"]
  UGSD["UGSD Specification"]
  Methodology["UGSD Methodology"]
  Assets["Templates and Reference Assets"]
  UAOS["Reference Implementation"]
  Handbook["Educational Materials"]

  Constitution --> Charter
  Charter --> UAEA
  UAEA --> Registry
  UAEA --> UGSD
  UGSD --> Methodology
  UGSD --> Assets
  UAEA --> UAOS
  UAOS --> Handbook
  UAEA --> Handbook
```

## 10. Governance Layer

The Governance Layer contains the [Constitution](../constitution/Constitution.md) and [Project Charter](../charter/Project-Charter.md).

## 11. Architecture Layer

The Architecture Layer contains UAEA, architectural decision records, diagrams, and the Artifact Registry.

## 12. Standards Layer

The Standards Layer contains normative specifications, beginning with the [UGSD Specification](../standards/UGSD-Specification.md).

## 13. Methodology Layer

The Methodology Layer explains how to apply approved standards. It does not redefine normative requirements.

## 14. Reference Assets Layer

The Reference Assets Layer will contain templates, schemas, checks, examples, and other reusable assets.

## 15. Implementation Layer

The Implementation Layer will contain Universal Agentic OS as a reference implementation. Implementations must identify supported specification versions.

## 16. Education Layer

The Education Layer will contain educational material such as the Senior AI Agent Engineer Handbook. Educational artifacts may depend on implementations for examples but remain governed by architecture and applicable specifications.

## 17. Repository Architecture

Initial monorepo structure:

```text
universal-ai-engineering/
|-- README.md
|-- CHANGELOG.md
|-- ROADMAP.md
|-- AGENTS.md
|-- constitution/
|-- charter/
|-- architecture/
|   |-- decisions/
|   `-- diagrams/
|-- registry/
|   `-- artifacts/
|-- standards/
|-- methodology/
|-- reference/
|-- agentic-os/
`-- senior-handbook/
```

The architecture permits later extraction into independent repositories when ownership, release cadence, or contribution volume justifies it.

## 18. Dependency Rules

1. Every artifact declares `parent` and `depends_on`.
2. Cyclic normative dependencies are prohibited.
3. Educational artifacts may depend on implementations and standards.
4. Standards must not depend on one reference implementation.
5. Reference implementations must identify supported specification versions.
6. Registry metadata must be machine-readable and reviewable.

## 19. Versioning Model

Semantic Versioning is used where practical:

- `MAJOR`: incompatible normative or structural change;
- `MINOR`: backward-compatible capability or requirement addition;
- `PATCH`: clarification or correction without intended behavioral incompatibility.

Draft status indicates that an artifact is not approved or stable. Compatibility is explicit, not inferred solely from matching major versions.

## 20. Lifecycle Model

```text
Planned -> Draft -> Review -> Approved -> Stable
                                   |
                                   v
                              Deprecated -> Retired
```

`Approved` means formally accepted but not necessarily released as a stable baseline. `Stable` means released and intended for supported use. Only Approved or Stable artifacts normally become Deprecated. Retired artifacts remain traceable but are no longer active.

## 21. Traceability Model

Traceability is maintained through metadata blocks, the human-readable registry, the machine-readable registry, internal links, changelog entries, and architectural decision records.

## 22. Architecture Review Gate

Architecture Review Gate (ARG) is the mandatory review checkpoint that verifies that a proposed change conforms to governing architecture, specifications, traceability requirements, validation requirements, and human approval rules before acceptance into the governing baseline.

ARG is a governance and quality-control concept. It is independent of any specific source-control platform. In the current repository, ARG is normally implemented through review of small commits on `master` and a task evidence package. A Pull Request, temporary branch diff, commit range, patch, local review, repository-native change request, or equivalent auditable mechanism may also implement ARG when useful.

### Purpose

ARG prevents implementation completion from being treated as architectural approval. It creates a reviewable checkpoint between implementation and acceptance into the governing baseline.

### Scope

ARG applies to material changes that affect governed artifacts, architecture, specifications, registry metadata, evidence practices, implementation behavior, or release readiness.

### Entry Criteria

- the planned change has been implemented;
- changed artifacts are identifiable;
- comparison base is identified;
- implementation evidence is available;
- known limitations and unresolved questions are recorded.

### Review Subjects

ARG reviews the implementation against:

- the Constitution;
- the Project Charter;
- UAEA;
- applicable specifications;
- artifact dependencies;
- traceability requirements;
- knowledge-preservation rules;
- validation evidence;
- acceptance criteria.

### Evidence Requirements

The evidence package should include task ID, task title, task status, scope, changed files, summary of changes, governing artifacts reviewed, acceptance criteria, validation performed, validation results, known limitations, unresolved questions, commit SHA or patch identifier, comparison base, reviewer findings, approval record, and acceptance record.

Evidence should be proportional to architectural impact, implementation risk, security impact, number of affected artifacts, reversibility, and compliance requirements.

### Possible Outcomes

- Architecturally Reviewed: review completed without blocking findings.
- Changes Required: review found blocking issues that must be corrected.
- Rejected: the implementation should not proceed in its current form.

Review comments alone do not imply approval.

### Human Approval

ARG does not replace accountable human approval. A task may be Architecturally Reviewed while still pending human approval.

### Integration

ARG must occur before final acceptance into the governing baseline. Integration is acceptance of an approved implementation into the current governing baseline. It is a governance concept, not a Git operation, and it does not imply a Git merge. A commit in `master` does not automatically imply that a governed artifact is Stable.

### Platform Independence

The current repository uses a single long-lived branch, `master`, with small, logically complete commits. The review mechanism may be:

- commit range;
- patch;
- local review;
- Pull Request;
- temporary development branch diff;
- repository-native change request;
- equivalent auditable mechanism.

No source-control platform, Pull Request workflow, feature branch, or merge commit is required by the governing architecture.

### Proportionality

Small, low-risk changes may use concise evidence and lightweight review. High-impact or high-risk changes require deeper evidence, review, and traceability.

## 23. Task State Model

```text
Planned -> Implemented -> Architecturally Reviewed -> Approved
```

Planned: architecture, requirements, scope, constraints, and acceptance criteria are sufficiently defined for implementation. The task has not yet been implemented.

Implemented: the planned change has been implemented and is ready for independent architectural review. Implementation completion does not imply approval.

Architecturally Reviewed: the implementation has been reviewed against governing artifacts, dependencies, traceability, knowledge-preservation rules, validation evidence, and acceptance criteria. This state does not authorize acceptance into the governing baseline unless the accountable human also approves.

Approved: the accountable human has explicitly authorized the change for acceptance into the governing baseline. Approved is a task decision state and must not be confused with the lifecycle status of a governed document or released artifact.

Correction path:

```text
Implemented -> Architecture Review -> Changes Required -> Implemented
```

A task that fails ARG must not progress to Approved. The reviewer records findings, severity, required corrections, affected artifacts, evidence reviewed, and final review result. After corrections, the implementation must pass ARG again.

## 24. Integration Model

Implementation is the creation or modification of project artifacts.

Architecture Review is evaluation of the implementation against governing requirements.

Approval is explicit authorization by the accountable human.

Integration is acceptance of an approved implementation into the current governing baseline.

Integration MUST NOT imply a Git merge. It is a governance concept, not a Git operation.

Release is publication of an identified and versioned project baseline for supported use.

A change may be accepted into the governing baseline without being part of a formal stable release.

## 25. Repository Workflow

The current repository uses a single-branch workflow because it is maintained by one accountable human:

```text
master
   |
   +-- Planned
   |
   +-- Implemented
   |
   +-- Architecture Review Gate
   |
   +-- Approved
   |
   +-- Continue Development
```

The standard repository workflow uses:

- one long-lived branch: `master`;
- small, logically complete commits;
- Architecture Review Gate after implementation;
- explicit human approval;
- continued development on `master`.

Development branches may be used temporarily if necessary, but they are not part of the standard repository workflow.

## 26. Change Governance

Material architecture changes require:

- proposal;
- impact analysis;
- ADR;
- affected-artifact list;
- migration and compatibility assessment;
- approval;
- registry update;
- verification.

## 27. AI Integration Architecture

AI systems implement capabilities and roles. Normative documents refer to abstract roles such as planner, analyst, architect, implementer, reviewer, evaluator, release assistant, and documentation assistant.

Products may implement these roles, but no product is embedded as a mandatory dependency.

Repository-specific examples may use current tools, but the universal architecture uses abstract roles such as Accountable Human, Task Author, Implementer, Architecture Reviewer, and Integrator.

## 28. Architectural Decision Records

Architectural Decision Records capture material architecture decisions and their consequences. Existing ADRs must be preserved unless explicit architectural approval authorizes retirement.

## 29. Architectural Invariants

- governing authority is explicit;
- implementation cannot redefine architecture;
- standards remain implementation-independent;
- evidence is required for acceptance;
- every artifact is registered;
- change history is preserved;
- human accountability remains identifiable.
- every material change MUST pass Architecture Review Gate before acceptance into the governing baseline.
- repository workflow does not require Pull Requests, feature branches, or Git merge operations.

## 30. Foundation Architecture Baseline

The proposed foundation baseline consists of the Constitution, Project Charter, UAEA, Artifact Registry, and UGSD Specification skeleton. Final acceptance requires explicit human approval.

## 31. Evolution Policy

Material architectural changes require impact analysis, registry synchronization, review, and explicit human approval.

## 32. Open Architectural Questions

- Exact ADR template.
- Registry machine-readable schema validation.
- Normative keyword conventions.
- Conformance profile model.
- Documentation build and publication process.
