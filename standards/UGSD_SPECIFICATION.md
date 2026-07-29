# UGSD Specification

**Full name:** Universal Get Stuff Done Specification  
**Document ID:** `UGSD-SPEC`  
**Version:** `1.0.0-draft`  
**Status:** Draft skeleton  
**Authority level:** Normative standard  
**Parent:** `UAEA`  

## 1. Purpose

UGSD defines a vendor-independent, evidence-driven lifecycle for engineering work performed by humans and AI agents.

This initial file establishes the normative structure that will be completed in the next production phase.

## 2. Normative language

The terms **MUST**, **MUST NOT**, **REQUIRED**, **SHOULD**, **SHOULD NOT**, and **MAY** indicate requirement strength.

## 3. Scope

UGSD will define:

- lifecycle phases;
- work-item states and valid transitions;
- human and agent roles;
- required and optional artifacts;
- approval, quality, security, evaluation, and release gates;
- deviation handling;
- evidence packages;
- conformance profiles;
- compatibility and versioning.

## 4. Core lifecycle

```text
Discovery
  → Specification
  → Planning
  → Architecture Review
  → Execution
  → Verification
  → Evaluation
  → Delivery
  → Retrospective
  → Knowledge Capture
```

## 5. Preliminary roles

- Accountable Human
- Product Owner
- Human Architect
- Planner
- Implementer
- Reviewer
- Evaluator
- Release Authority
- Automation / CI System

A tool may implement more than one role, but required independence constraints will be defined by conformance profile.

## 6. Preliminary artifacts

- Discovery Record
- Specification
- Plan
- Task
- Architecture Decision Record
- Review Record
- Verification Evidence
- Evaluation Report
- Release Record
- Retrospective
- Knowledge Record

## 7. Preliminary gates

- Definition of Ready
- Specification Approval
- Architecture Approval
- Execution Authorization
- Verification Gate
- Evaluation Gate
- Security Gate
- Release Approval

## 8. State model — placeholder

The complete state machine will define:

- permitted transitions;
- transition authority;
- entry criteria;
- exit criteria;
- required artifacts;
- blocking conditions;
- rollback and cancellation semantics.

## 9. Conformance — placeholder

Planned profiles:

- UGSD Core
- UGSD Team
- UGSD Regulated
- UGSD Agent-First

A conformance claim MUST identify:

- specification version;
- profile;
- deviations;
- evidence location;
- approval authority.

## 10. Open specification decisions

1. Exact work-item state machine.
2. Minimum artifact set for UGSD Core.
3. Independence rules for review and evaluation.
4. Evidence package schema.
5. Profile inheritance.
6. Exception and emergency-change procedure.
7. Machine-readable conformance manifest.

## 11. Planned next sections

- Terminology
- Lifecycle semantics
- Roles and responsibilities
- Artifact schemas
- State transitions
- Gates
- Evaluation
- Security and risk
- Release and rollback
- Knowledge capture
- Conformance
- Compatibility
- Governance
