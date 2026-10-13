# Delivery and scale roadmap

Reviewed 2026-10-13. Milestones are acceptance gates, not promised delivery dates. Current component evidence and open phases are recorded in [release status](RELEASE-STATUS.md).

## Immediate completion

| Workstream | Next acceptance |
|---|---|
| Public website | Resolve external-request privacy acceptance; preserve current article/contact/legal and responsive behavior |
| Backend and identity | Complete deployed patient/privacy scope, real regional role/ownership journeys, provider/native MFA and confirmation behavior |
| Booking, billing and pharmacy | Approved provider flows, signature/replay/idempotency, refunds/reconciliation, authorization and notification evidence |
| CMS | Recover remaining legacy media where possible; prove application-consistent database/media backup and off-host restore |
| Knowledge | Repair/review release guards; isolated existing-host deployment; verify actual local models, embedding dimension, ingestion/retrieval, safety, monitoring and restore |
| Security/recovery | Resolve credential-history findings, least privilege and incident readiness; verify encrypted off-device recovery using separately stored key |
| Documentation | Publish consistent source/docs under the owner identity, reconcile the existing public technical document and refresh its verified export |

Keep each incomplete gate open; documentation or source publication cannot substitute for live acceptance. Native development resumes after non-mobile completion. Preserve React/Capacitor and existing Kotlin/Swift source and prior verification; then finish feature parity, actual providers, physical devices, signing and store acceptance separately.

## Future platform milestones

| Stage | Capacity objective | Exit evidence |
|---|---|---|
| Accepted initial service | Measured demand within approved resources | Full critical journeys, operator/legal activation, alerts/on-call, recovery and a measured SLO window |
| Regional foundation | 1,000 simultaneous synthetic users | Defined workload, tenant/region isolation, correctness, latency, resource and cost measurements |
| Multi-cell growth | 10,000 then 100,000 simultaneous users | Cell isolation, quotas, hot-key behavior, queue backpressure, failure/recovery and repeated soak tests |
| Large-scale validation | 1,000,000+ simultaneous users | Explicit traffic/media/model mix, independently reviewed capacity model, representative staged load, four-hour soak, failure injection and accepted cost envelope |

The target architecture uses independently bounded regional cells, asynchronous work, partition-aware storage, dedicated media and inference capacity, and protected control-plane operations. The existing shared VPS is not the 1M-user deployment. See [scaling](SCALABILITY.md) for demand equations and test gates.

## Reliability and economics

Critical-journey objectives are 99.9% at accepted launch and 99.95% at future scale; knowledge-service objectives are separately scoped. Publish achieved availability only from a defined observation window. Error-budget policy, regional failure handling and measured recovery are required before increasing scope. See [reliability](RELIABILITY.md).

Current work uses approved existing hosting and free-only local-model execution. Growth infrastructure, additional media capacity, providers and large load tests require separately reviewed cost/quotas and explicit approval. A future architecture is not authorization to provision resources or a claim that million-user operation is free.

## Definition of a completed milestone

Record criteria met/total, each gate result, exact revision/configuration, real flow exercised, independent review verdict, remote Git SHA and deployed artifact parity where applicable. Maintain the data/resource inventory, public status and private recovery narrative in the same task. Add a regression gate when a defect escapes.
