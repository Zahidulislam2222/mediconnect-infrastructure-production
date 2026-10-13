# Capacity and reliability engineering contract

Reviewed 2026-10-13. This is the engineering entry point for future capacity and operating acceptance.

## Canonical objectives

- **Capacity:** 1,000,000+ simultaneous users under an explicitly measured activity, endpoint, payload, connection, media, AI and regional workload.
- **Critical-journey availability:** 99.9% at launch and 99.95% at scale, measured per journey/region over a rolling 30-day window.
- **Validation:** staged service, 1k, 10k, 100k and 1M+ tests, followed by soak, skew, dependency and zone/cell failure checks.
- **Recovery:** data-tier RPO/RTO objectives established in the reliability document and verified through isolated consistent restores.

The critical-journey targets supersede the earlier 99% baseline. This file and the public roadmap use one set of objectives.

## Required inputs

| Input | Acceptance evidence |
|---|---|
| Workload | Activity mix, endpoint/read/write rates, session lifetime, item/payload sizes, regional distribution and bursts |
| Per-service capacity | Sustainable throughput at the required p95/p99/error budget, CPU/memory and dependency limits |
| Connections/media/AI | Independent resource and cost model; REST RPS does not size these tiers |
| State and authorization | Tenant/region isolation, conflict/idempotency handling, event recovery and privacy checks |
| Quotas/headroom | Provider and data limits, zone/cell loss reserve and controlled admission |
| Operating readiness | Monitoring, alert response, cost approval, rollback and complete backup/restore |

## Calculator

[`scripts/capacity-plan.mjs`](../scripts/capacity-plan.mjs) reads the maintained [planning input](capacity-plan.example.json). Missing measured throughput leaves replicas unset and exits with status2. Successful arithmetic remains an estimate, not a capacity test; the utility creates no resources.

## Current and future scope

Scoped website, CMS and regional application delivery evidence is in [release status](../docs/RELEASE-STATUS.md). The isolated local-model footprint has its own bounded workload and acceptance. Neither existing replica templates nor a single-host release establish million-user capacity.

The target regional-cell design, workload calculations, bottlenecks, milestone gates and cost controls are maintained in [SCALABILITY.md](../docs/SCALABILITY.md). Availability measurement, budgets and recovery are maintained in [RELIABILITY.md](../docs/RELIABILITY.md). Update those canonical documents when a measured operating contract changes.
