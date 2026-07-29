# UGSD Specification

UGSD - Universal Get Stuff Done Specification

```yaml
artifact_id: UGSD-SPEC
artifact_type: Standard
version: 0.1.0
status: Draft
parent: UAEA
depends_on:
  - UAE-CONSTITUTION
  - UAE-CHARTER
  - UAEA
  - UAE-REGISTRY
```

## 1. Introduction

UGSD is intended to define a vendor-independent, evidence-driven lifecycle for engineering work performed by humans and AI agents.

This document remains a skeleton. Preliminary notes are non-normative until approved through the governing process.

## 2. Purpose

TBD.

Preliminary: UGSD will provide a common lifecycle, artifact model, quality gate model, and conformance vocabulary for AI-first engineering work.

## 3. Scope

TBD.

Preliminary: UGSD is expected to cover lifecycle phases, work-item states, roles, required and optional artifacts, approval gates, evidence packages, conformance profiles, compatibility, and versioning.

## 4. Normative Language

The terms MUST, MUST NOT, REQUIRED, SHOULD, SHOULD NOT, and MAY are reserved for normative requirements.

Preliminary or non-normative notes do not establish approved requirements.

## 5. Terminology

TBD.

## 6. UGSD Principles

TBD.

## 7. Roles

TBD.

Preliminary candidate roles:

- Accountable Human
- Product Owner
- Human Architect
- Planner
- Implementer
- Reviewer
- Evaluator
- Release Authority
- Automation / CI System

## 8. Artifact Model

TBD.

Preliminary candidate artifacts:

- Discovery Record
- Specification
- Plan
- Task
- Architectural Decision Record
- Review Record
- Verification Evidence
- Evaluation Report
- Release Record
- Retrospective
- Knowledge Record

## 9. Lifecycle

TBD.

Preliminary candidate lifecycle:

```text
Discovery
  -> Specification
  -> Planning
  -> Implementation
  -> Architecture Review Gate
  -> Human Approval
  -> Continue Development
  -> Verification
  -> Evaluation
  -> Delivery
  -> Retrospective
  -> Knowledge Capture
```

Preliminary task decision lifecycle:

```text
Planned -> Implemented -> Architecturally Reviewed -> Approved
```

Preliminary correction path:

```text
Implemented -> Architecture Review -> Changes Required -> Implemented
```

## 10. Discovery

TBD.

## 11. Planning

TBD.

## 12. Execution

TBD.

## 13. Verification

TBD.

## 14. Delivery

TBD.

## 15. Evidence Requirements

TBD.

Preliminary: implementation evidence should identify task ID, task title, task status, scope, changed files, summary of changes, governing artifacts reviewed, acceptance criteria, validation performed, validation results, known limitations, unresolved questions, commit SHA or patch identifier, comparison base, reviewer findings, approval record, and integration record.

Preliminary: evidence should be proportional to architectural impact, implementation risk, security impact, affected artifacts, reversibility, and compliance requirements.

## 16. Quality Gates

TBD.

Preliminary candidate gates:

- Definition of Ready
- Specification Approval
- Architecture Approval
- Architecture Review Gate
- Execution Authorization
- Verification Gate
- Evaluation Gate
- Security Gate
- Release Approval

## 17. Human Approval

TBD.

Preliminary: human approval is distinct from implementation completion and architectural review. A task should not be accepted into a governing baseline until the accountable human explicitly approves it.

## 18. Agent Responsibilities

TBD.

Preliminary: agents may implement, prepare evidence, and correct findings, but they should not treat implementation completion as approval. Agents should support review using commit review, patches, local review records, Pull Requests, temporary branch diffs, or equivalent auditable mechanisms.

## 19. Change Management

TBD.

Preliminary: changes that fail Architecture Review Gate should enter Changes Required and return to Implemented only after correction. Review comments should not be treated as approval.

## 20. Traceability

TBD.

Preliminary: task traceability should connect task definition, implementation evidence, comparison base, changed artifacts, review findings, human approval, acceptance record, and release record when applicable.

## 21. Conformance

TBD.

Preliminary future profiles:

- UGSD Core
- UGSD Team
- UGSD Regulated
- UGSD Agent-First

## 22. Exceptions

TBD.

## 23. Versioning

TBD.

## 24. Appendices

TBD.

Preliminary open specification decisions:

1. Exact work-item state machine.
2. Minimum artifact set for UGSD Core.
3. Independence rules for review and evaluation.
4. Evidence package schema.
5. Profile inheritance.
6. Exception and emergency-change procedure.
7. Machine-readable conformance manifest.
