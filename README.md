# Universal AI Engineering

Universal AI Engineering (UAE) is an open engineering framework for designing, governing, implementing, verifying, and evolving AI-first software systems.

UAE is an engineering framework rather than only a book. It defines governance, architecture, standards, methodology, templates, reference assets, a reference implementation, and educational material.

## Project Status

Foundation Release 1.0 is in draft. The governance model is still being established, and no foundation artifact is approved or stable yet.

> Architecture first. Specifications second. Implementation third. Evidence always.

## Ecosystem Layers

1. Governance
2. Architecture
3. Standards
4. Methodology
5. Templates and reference assets
6. Reference implementation
7. Education

## Document Hierarchy

```text
Constitution of Universal AI Engineering
        ↓
Project Charter
        ↓
Universal AI Engineering Architecture
        ↓
UGSD Specification
        ↓
UGSD Methodology
        ↓
Templates and Reference Assets
        ↓
Reference Implementation
        ↓
Educational Materials
```

Lower-level artifacts must not override or contradict higher-level artifacts.

## Repository Navigation

- [Constitution](constitution/Constitution.md)
- [Project Charter](charter/Project-Charter.md)
- [Universal AI Engineering Architecture](architecture/UAEA.md)
- [Artifact Registry](registry/Artifact-Registry.md)
- [UGSD Specification](standards/UGSD-Specification.md)
- [Methodology](methodology/README.md)
- [Reference Assets](reference/README.md)
- [Universal Agentic OS](agentic-os/README.md)
- [Senior AI Agent Engineer Handbook](senior-handbook/README.md)

## Foundation Release 1.0 Scope

Foundation Release 1.0 will establish the initial Constitution, Project Charter, Universal AI Engineering Architecture, Artifact Registry, UGSD Specification skeleton, repository governance instructions, and roadmap.

## Development Workflow

The project is currently maintained by one human owner. The default workflow is:

```text
Task
  -> Implementation
  -> Architecture Review Gate
  -> Human Approval
  -> Integration
```

Pull Requests are optional. Architectural review and explicit human approval remain mandatory before integration into the governing baseline. The workflow is platform-independent and may be implemented through any auditable review mechanism.

## Contribution Status

External contribution rules are not finalized. Until governance is approved, proposed changes SHOULD preserve artifact identifiers, maintain traceability, update the Artifact Registry when governed artifacts change, pass Architecture Review Gate, and require human approval before integration.
