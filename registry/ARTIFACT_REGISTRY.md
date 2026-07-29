# Universal AI Engineering Artifact Registry

**Document ID:** `UAE-REGISTRY`  
**Version:** `1.0.0-draft`  
**Status:** Draft  
**Authority level:** Architecture metadata  
**Parent:** `UAEA`  

The registry is the central index of governed artifacts. Machine-readable records are stored in [`artifacts.yaml`](artifacts.yaml).

## Registry fields

| Field | Meaning |
|---|---|
| `id` | Stable unique identifier |
| `name` | Human-readable name |
| `type` | Artifact classification |
| `parent` | Primary authority parent |
| `depends_on` | Required upstream artifacts |
| `owner` | Accountable role |
| `status` | Lifecycle state |
| `version` | Artifact version |
| `lifecycle` | Current lifecycle stage |
| `adr` | Related decision records |
| `repository_path` | Canonical location |
| `compatible_with` | Explicit compatibility statements |
| `children` | Direct subordinate artifacts |

## Current registry

| ID | Name | Type | Parent | Depends On | Owner | Status | Version |
|---|---|---|---|---|---|---|---|
| UAE-CONSTITUTION | Constitution of Universal AI Engineering | Constitution | — | — | Governance Owner | Draft | 1.0.0-draft |
| UAE-CHARTER | Universal AI Engineering Project Charter | Charter | UAE-CONSTITUTION | UAE-CONSTITUTION | Project Sponsor | Draft | 1.0.0-draft |
| UAEA | Universal AI Engineering Architecture | Architecture | UAE-CHARTER | UAE-CONSTITUTION, UAE-CHARTER | Architecture Owner | Draft | 1.0.0-draft |
| UAE-REGISTRY | Artifact Registry | Registry | UAEA | UAE-CONSTITUTION, UAEA | Repository Maintainer | Draft | 1.0.0-draft |
| UGSD-SPEC | UGSD Specification | Standard | UAEA | UAE-CONSTITUTION, UAE-CHARTER, UAEA, UAE-REGISTRY | Specification Owner | Draft | 1.0.0-draft |
| UGSD-METHOD | UGSD Methodology | Book | UGSD-SPEC | UGSD-SPEC | Methodology Owner | Planned | 1.0.0-planned |
| UAE-REFERENCE | Reference Repository | Reference Assets | UGSD-SPEC | UGSD-SPEC | Repository Maintainer | Planned | 1.0.0-planned |
| UAOS | Universal Agentic OS | Reference Implementation | UAEA | UGSD-SPEC, UAE-REFERENCE | Architecture Owner | Planned | 1.0.0-planned |
| SAEH | Senior AI Agent Engineer Handbook | Book | UAEA | UGSD-SPEC, UAOS | Education Owner | Planned | 1.0.0-planned |
