# MediConnect: engineering review entry point

**Current release status: integration and security remediation in progress. Paid cloud
infrastructure is retained, not automatically deployed.**

The owner reports that capabilities ran before cost-driven retirement. Preserve that history:
retirement is not evidence that a feature never worked. Historical results retain their dates;
they do not establish present service availability. This guide separates those facts from future
design objectives so a reviewer does not have to infer status from badges or directory names.

## Read the repository in this order

| Question | Authoritative source | What it establishes |
|---|---|---|
| What is retained and why? | [Showcase status](SHOWCASE-STATUS.md) | Cost-driven retirement and deployment guards |
| Which application resource maps to which IaC? | [Resource registry](resource-registry.yaml) | Source coverage, not live existence |
| What was verified, and when? | [Migration status](migration-status.yaml) | Dated checks, historical results and blocked gates |
| Where is the application? | [Backend workspace](backend_v2/package.json) | Five Node services; Python admin/DICOM are separate |
| How does it scale? | [Capacity and reliability design](architecture/CAPACITY-AND-RELIABILITY.md) | Current constraints, target architecture and activation gates |
| How are cloud deployments protected? | [Retained workflow](.github/workflows/deploy.yml) | Manual dispatch and explicit cloud opt-ins; no authorization to run it |
| Where is isolation/availability configured? | [Kubernetes templates](backend_v2/k8s) | Probes, HPA, disruption budgets and network policies, requiring rendering and live verification |

## Status vocabulary

- **LOCAL_TESTED:** named local checks pass; does not imply a deployed feature.
- **LIVE_VERIFIED:** a dated real flow on a named release passes. A static HTTP200 is not a clinical integration test.
- **HISTORICAL:** dated earlier evidence or explicitly attributed owner report. Preserve it without extending its validity.
- **RETAINED_INACTIVE:** implementation remains reviewable; paid dependencies are intentionally unavailable or not currently verified.
- **PLANNED:** design/requirements, not implemented behavior.
- **BLOCKED:** release requirement cannot currently be demonstrated. Never relabel it passed because a dependency is retired.

## Current scope of evidence

The static frontend release and accepted local cinematic journey are separate from the retained
clinical application. The journey's appointment/auth interfaces are fictional demonstrations,
not authenticated backend flows. Flutter migration is requested, not completed. No iOS artifact
has been verified. The CMS and RAG require their own integration, security and deployment gates.

The 2026-09-09 local app/IaC check reports129 pass/0fail/0warn; showcase preservation reports
71Terraform files,13Kubernetes manifests and36legacy entry points. These are source checks.
Five Node HTTP liveness tests pass; these do **not** establish booking, clinical, billing or AI correctness.

Release work must finish authenticated business-flow tests, current dependency/secret scans,
configuration review, clinical-data correctness, operational recovery and independent review.
An earlier compliance scanner mainly searched for source patterns; finding an encryption or
authorization reference is not proof every execution path enforces it.

## Claims a reviewer should not infer

- One million simultaneous users is a **future engineering target**, not measured current capacity.
- 99% availability is a **target**, not an observed service-level result or a guarantee.
- HIPAA/GDPR control implementations, FHIR resource mappings and SOC2 control mappings are
  not interchangeable with legal approval, formal interoperability validation or an independent audit.
- Provider failover, Redis, queues and Kubernetes do not remove downstream quotas, state
  consistency requirements, hot partitions, retry hazards or cost constraints.

Historical feature lists in README describe retained scope. Do not substitute a feature count,
badge, local mock test or screenshot for end-to-end evidence. No paid service is provisioned by
reading this repository or running the offline capacity-planning tool.
