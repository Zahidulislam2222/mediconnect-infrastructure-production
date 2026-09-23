# Capacity and reliability: current implementation versus target

Status: **design and readiness work in progress**, not a certified million-user architecture.
Owner target:1M+ concurrent users, alongside separately measured registered users and MAU.
No paid provisioning is authorized. Existing infrastructure definitions remain preserved.

## What exists and what must change or be verified

| Layer | Retained implementation | Gate before future scaled deployment |
|---|---|---|
| Web delivery | Static frontend packaging; separate authenticated React app | CDN cache policy, asset budgets, authenticated route integration and real-browser latency |
| API compute | Seven service templates, HPA/probes, AKS/EKS/Cloud Run deployment paths | Render all placeholders, validate schemas, benchmark each service, set per-service budgets and verify node capacity |
| Autoscaling | Current workflow renders staging1–1 and production1–5 replicas per service | This historical small footprint is NOT million-user sizing. Set limits from measured sustainable throughput, quota and cost review |
| Rate limiting | Shared Redis implementation with local-memory fallback | Production multi-instance mode must not silently depend on per-process counters; verify outage behavior and shared quotas |
| Data | Regional DynamoDB/S3/KMS references; managed database integration retained | Hot-key tests, indexes/pagination, consistency, regional authorization, encryption, capacity quotas, backup/restore and migration tests |
| Booking/payments | Booking service and Stripe integration | Durable operation-key uniqueness, conditional writes, transactional outbox/reconciliation; lost-response and webhook-replay tests |
| Events | SQS/Kafka integrations | Bounded workers, age/lag alarms, poison-message handling, deduplication and bounded retries; graceful shutdown under load |
| Chat/video | WebSocket and Chime integrations | Connections/instance and reconnect tests, shared fan-out, token handling, idle limits, recording lifecycle and media-provider quotas |
| AI/RAG | Provider routing, LightRAG, caching and tier limits | Grounding/safety/privacy evals, provider contracts, bounded concurrency and spending, tenant-safe cache keys and clear unavailable states |
| Resilience | Multi-cloud routing, probes, PDB and monitoring templates | Zonal spread, dependency-aware readiness, drain/rollback tests, region-safe failover and measured restore objectives |

## Workload contract — no account-count shortcut

Registered accounts measure stored identities; MAU measures distinct active identities over a month;
concurrency measures overlapping sessions/operations. Each needs its own measurement. Specify
active versus idle sessions, API rate and read/write mix, document sizes, call duration, websocket
connections, AI queries, region split, hot-tenant skew, test duration and acceptable p95/p99 latency.

Use [capacity-plan.example.json](capacity-plan.example.json) as a deliberately **unmeasured**
planning input. The offline calculator prints request demand but refuses to invent replica counts
when sustained per-instance throughput is missing:

```bash
node scripts/capacity-plan.mjs architecture/capacity-plan.example.json
node --test scripts/capacity-plan.test.mjs
```

The example's rates are assumptions, not traffic observations. Supply benchmark results from the
same application version, instance size, dependency configuration and latency/error thresholds.
The calculator is only arithmetic: even a populated throughput value does not certify production
capacity. Database/provider limits, network bandwidth, burst capacity and failure domains require
separate evidence. It never starts traffic, updates replicas, invokes providers or provisions resources.

## Proposed future deployment shape

Partition scale into bounded regional cells rather than one unbounded shared backend. Keep EU and
US data-plane routing tied to validated account/tenant context. Each cell needs independently bounded
API workers, event consumers, connection pools, queues and AI concurrency, with per-tenant fairness.
Route video media through an appropriately contracted media service rather than generic API pods.
Use immutable artifact promotion and rollout/rollback controls. A second cloud is not automatic
resilience if it shares the same failing data or identity dependency.

This cell design is **PLANNED**, not yet implemented by existing multi-cloud templates. Required
work includes cell assignment, tenant/region invariants, per-cell quotas, isolation tests and
operational provisioning. Preserve existing templates as the starting point, not as a finished scale claim.

## Reliability target

Proposed objective:99% over a rolling30-day window. Define successful user-facing operations per
critical journey (authentication, booking, record access), alongside a time-based availability
indicator. A time-based99% budget permits7h12m unavailable per30days; request-based budgets use
eligible request counts instead. Do not mix them. Probe a meaningful synthetic transaction, not only
process liveness; avoid paid AI calls in routine probes. Define approved maintenance accounting,
alert ownership, escalation and error-budget release policy before activation.

> ⚠️ *Superseded 2026-09-24: the objective is raised to 99.9% at launch and 99.95% at scale per critical journey. See [docs/RELIABILITY.md](../docs/RELIABILITY.md). The original text is kept unchanged.*

RTO/RPO require product decisions plus measured restore/failover exercises. They are currently
unverified, not zero. No single deployment check proves30-day uptime.

## Activation gates

1. Close source/clinical/auth/configuration findings and all repository test/type/lint/security/build gates.
2. Render manifests without secrets in logs or unresolved placeholders; validate Terraform/Kubernetes offline.
3. Review a fresh native inventory, complete plan, regional data design, quotas and exact operating costs.
4. Obtain owner cost approval and manual infrastructure execution as required by project policy.
5. Run staged representative load/soak/burst tests with abort thresholds and synthetic data; record generator saturation too.
6. Demonstrate exactly-once business outcomes under retries, tenant isolation, graceful overload, rollback and recovery.
7. Publish only measured capacity for the tested workload/release/environment; retain its limitations.

References: [HTTP retry semantics](https://www.rfc-editor.org/rfc/rfc9110.html#name-idempotent-methods),
[Kubernetes HPA](https://kubernetes.io/docs/concepts/workloads/autoscaling/horizontal-pod-autoscale/),
[SLO design](https://sre.google/workbook/implementing-slos/),
[representative load testing](https://docs.aws.amazon.com/wellarchitected/2024-06-27/framework/perf_process_culture_load_test.html).
