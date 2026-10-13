# Availability, service levels and recovery

Reviewed 2026-10-13. The percentages below are operating objectives. A measured result requires the specified observation window and user-journey data; point-in-time deployment checks are recorded in [release status](RELEASE-STATUS.md).

## Service-level objectives

Measure successful eligible user operations divided by all eligible operations over a rolling 30-day window, per journey and region. Define success, timeouts, dependencies, excluded invalid traffic and measurement gaps before collection. A healthy process whose booking operation fails does not count as a successful booking.

| Journey | Launch availability target | Scale availability target | Proposed p95 latency |
|---|---|---|---|
| Sign-in and token refresh | 99.9% | 99.95% | 500 ms |
| Own records and appointments | 99.9% | 99.95% | 400 ms |
| Book, reschedule or cancel | 99.9% | 99.95% | 800 ms |
| Join consultation | 99.9% | 99.95% | 3 seconds to connected |
| Message delivery | 99.5% | 99.9% | 2 seconds end to end |
| Optional knowledge assistance | 99% | 99.5% | 8 seconds for the future serving tier |
| Public website/content | 99.9% | 99.99% | 1.5 seconds largest contentful paint |

The knowledge latency objective requires measured serving capacity; it is not a statement about the initial CPU-hosted model. Define separate acknowledgement, queue and completion latency when work is asynchronous. Track accessibility, correctness, freshness and privacy alongside availability.

## Error budgets

`error budget = 1 − SLO target`

| Availability | Time-equivalent budget over 30 days |
|---|---|
| 99% | 7 hours 12 minutes |
| 99.5% | 3 hours 36 minutes |
| 99.9% | 43 minutes 12 seconds |
| 99.95% | 21 minutes 36 seconds |
| 99.99% | 4 minutes 19.2 seconds |

These conversions apply to time-based availability. Request-based budgets count failed eligible operations; traffic-weighted failures cannot automatically be reported as wall-clock downtime.

The earlier 99% baseline is superseded by 99.9% launch/99.95% scale for critical journeys. It remains a useful comparison and the initial optional-knowledge objective, not a second conflicting critical-service target.

## Measurement and release decisions

- Combine outside-in journey probes, service counters and provider outcome records. Keep missing telemetry visible.
- Separate latency, valid denials, provider unavailability and server errors; an outage must not disappear through reclassification.
- Record deployment markers and compare the canary with the preceding release.
- Use short/long burn-rate windows for fast outages and slow degradation. Page on user impact, not every isolated exception.
- At 50% of the monthly budget consumed, prioritize reliability and review risky releases; when exhausted, permit only recovery/security changes until the policy's recovery conditions are met.
- Count maintenance impact according to the published measurement policy. Announcing downtime does not make failed user operations successful.

The operating owner approves these policies before activation and publishes observed SLO results only with the actual window, exclusions and data coverage. Method: [Google SRE guidance](https://sre.google/workbook/implementing-slos/).

## Resilience architecture

| Mechanism | Purpose and release gate |
|---|---|
| Multi-zone compute and regional cells | Limit failure impact; prove zone/cell loss at accepted workload |
| Readiness distinct from liveness | Keep traffic away from a booting or dependency-unready service |
| Timeouts, bounded queues and load shedding | Protect core journeys when optional work/dependencies saturate |
| Idempotency and durable events | Recover lost replies and duplicate/reordered events without repeated mutations |
| Immutable releases and rollback | Restore the prior verified application/configuration without rebuilding live |
| Regional data policy | Keep recovery/failover inside the approved legal and contractual data boundary |

Source definitions alone do not establish these operating properties. Verify provider, quota, dependency and routing behavior through the real boundary.

## Disaster-recovery objectives

| Tier | Data | Target recovery point | Target recovery time |
|---|---|---|---|
| 1 | Identity, appointments, prescriptions, clinical records and audit | At most 5 minutes | 1 hour at launch; 15 minutes at scale |
| 2 | Messages, uploaded documents and imaging | At most 15 minutes | 4 hours |
| 3 | Editorial drafts, analytics and rebuildable knowledge indexes | At most 24 hours | 24 hours |

These targets need consistent backups, complete persistent-root inventories, key access and a measured restore. A knowledge index may be rebuildable, but its source documents, metadata, model/version identity and access policy still require recovery coverage.

Test isolated restores with denied access to unrelated production data, record achieved RPO/RTO and verify application behavior after recovery. Local historical restore evidence does not establish a current off-device recovery result. Quarterly drills and material storage/model/architecture changes trigger revalidation.

## Incident response

| Severity | Trigger | Proposed response and communication |
|---|---|---|
| Critical | Suspected disclosure, wrong patient/workspace access or critical journey outage | Named lead; acknowledgement within 15 minutes; updates every 30 minutes |
| High | Regional or important workflow degradation | Acknowledge within 30 minutes; hourly updates |
| Standard | Optional feature failure without critical impact | Business-hours response and tracked resolution |

Stabilize through the approved rollback/admission controls, preserve privacy-safe evidence, involve the designated legal/security contacts immediately when data may be affected, and follow the applicable notification rules in [law and compliance](COMPLIANCE-AND-LAW.md). Do not treat a maximum legal deadline as permission to delay incident escalation.

Record cause, user impact, recovery evidence, escaped gate and corrective action. Validate alert delivery, on-call ownership and public status communication before claiming operated coverage. Detailed procedures: [operations](OPERATIONS.md).
