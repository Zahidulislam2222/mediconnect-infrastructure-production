# Reliability, service levels and disaster recovery

Last reviewed: 2026-09-24 · Status: **TARGET** (nothing below is a measured result or a guarantee)

> The earlier capacity design proposed a 99% objective. For a healthcare service, 99% allows about
> 7 hours 12 minutes of downtime every 30 days, which is too much. This document **raises the target**
> to 99.9% at launch and 99.95% at scale. The earlier text is preserved with a note in
> [architecture/CAPACITY-AND-RELIABILITY.md](../architecture/CAPACITY-AND-RELIABILITY.md).

## 1. Service level objectives (TARGET)

Availability is measured per **critical user journey**, as successful requests divided by eligible
requests over a rolling 30-day window. A server that answers health checks while bookings fail is down.

| Journey | Launch target | Scale target | Latency target (p95) |
|---|---|---|---|
| Sign in and token refresh | 99.9% | 99.95% | < 500 ms |
| View own records and appointments | 99.9% | 99.95% | < 400 ms |
| Book, reschedule or cancel | 99.9% | 99.95% | < 800 ms |
| Join a video consultation | 99.9% | 99.95% | < 3 s to connected |
| Messaging delivery | 99.5% | 99.9% | < 2 s end to end |
| AI assistant | 99.0% | 99.5% | < 8 s (clearly shown as optional) |
| Public website and content | 99.9% | 99.99% (CDN) | < 1.5 s largest contentful paint |

### What the percentages allow (30-day window)

| Target | Allowed unavailability |
|---|---|
| 99% | 7 h 12 min |
| 99.5% | 3 h 36 min |
| 99.9% | 43 min 12 s |
| 99.95% | 21 min 36 s |
| 99.99% | 4 min 19 s |

## 2. Error budget policy

- If a journey burns more than 50% of its monthly budget, feature releases to that journey pause and reliability work takes priority.
- If the budget is exhausted, only fixes and security patches ship until the 30-day window recovers.
- Alerts fire on **burn rate** (for example 2% of the monthly budget used in one hour), not on single errors.
- Planned maintenance counts against the budget unless users are told in advance and the journey stays usable.

## 3. How availability is achieved (design)

| Mechanism | Purpose | Status |
|---|---|---|
| Three availability zones per region, pods spread across zones | Survive a data-centre failure | PLANNED |
| Kubernetes liveness/readiness probes, pod disruption budgets, horizontal autoscaling | Self-healing and safe deploys | RETAINED templates |
| Cell architecture ([SCALABILITY.md](SCALABILITY.md)) | Limit how many users a failure can reach | PLANNED |
| Canary releases to one cell, automatic rollback on SLO regression | Stop bad releases early | PLANNED (rollback step exists in retained workflow) |
| Regional failover of compute; data stays in its legal region | Survive loss of a compute provider or zone | RETAINED design, not verified live |
| Graceful degradation (AI, analytics and recommendations switch off first) | Protect critical journeys under stress | Partly implemented (explicit AI unavailability) |
| Synthetic transactions every minute per journey and region | Detect failure before users report it | PLANNED |

## 4. Disaster recovery targets (TARGET)

| Tier | Data | Recovery point (max data loss) | Recovery time (max downtime) |
|---|---|---|---|
| 1 | Identity, appointments, prescriptions, clinical records, audit log | ≤ 5 minutes | ≤ 1 hour (launch), ≤ 15 minutes (scale) |
| 2 | Messages, uploaded documents, imaging | ≤ 15 minutes | ≤ 4 hours |
| 3 | Analytics, AI knowledge index, CMS drafts | ≤ 24 hours | ≤ 24 hours |

Planned mechanisms: DynamoDB point-in-time recovery and on-demand backups, S3 versioning with
cross-account backup copies, encrypted off-site backups for self-hosted services (CMS, knowledge
service), infrastructure rebuilt from Terraform, and container images pinned by digest.

**A backup does not count until a restore has been tested.** Restore drills run quarterly per tier
and record the measured recovery time and data loss. The self-hosted knowledge service already has a
verified local restore test; cloud-tier restores are not yet verified.

The existing step-by-step runbook is [compliance/disaster-recovery.md](../compliance/disaster-recovery.md).

## 5. Incident response

| Severity | Example | First response | Updates |
|---|---|---|---|
| SEV-1 | Clinical data unavailable, suspected data breach, wrong patient data shown | 15 minutes, 24/7 | Every 30 minutes |
| SEV-2 | One critical journey degraded, one region impaired | 30 minutes | Every hour |
| SEV-3 | Non-critical feature down (AI, analytics) | Next business day | Daily |

1. Detect (alert or report) and declare severity. Name one incident lead.
2. Stabilise first: roll back, shed load, fail over. Diagnose after users are safe.
3. If personal or health data may be involved, start the legal breach clock immediately
   (GDPR 72 hours to the supervisory authority; HIPAA and FTC rules up to 60 days; NIS2 24-hour early
   warning where it applies). See [COMPLIANCE-AND-LAW.md](COMPLIANCE-AND-LAW.md).
4. Communicate on a status page and in-app banner.
5. Write a blameless post-incident review within 5 business days with actions, owners and dates.

## 6. Observability

- **Metrics:** request rate, errors and latency per journey, queue age, consumer lag, cache hit
  ratio, connection counts, saturation. Prometheus and Grafana are already part of the self-hosted stack.
- **Logs:** structured JSON with personal data masked before it is written; separate, access-controlled audit log.
- **Traces:** OpenTelemetry across services (Jaeger is in the self-hosted stack) with no health data in span attributes.
- **Dashboards and alerts** are defined as code and reviewed like application code.

## 7. Current reality (CURRENT, 2026-09-24)

- The only public service is the static showcase. Its uptime is **not** measured against these targets yet.
- No production backend is running, so no SLO data exists.
- DR, failover and restore objectives for cloud tiers are unverified.
