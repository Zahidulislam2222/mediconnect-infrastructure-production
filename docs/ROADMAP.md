# Roadmap

Last reviewed: 2026-09-24 · Every item is **PLANNED** unless marked otherwise. Phases are ordered by
dependency, not fixed dates. A phase is complete only when its exit criteria are met with evidence.

## Where we are (CURRENT)

- ✅ Static showcase live at <https://mediconnect.zahidul-islam.com> on the operator's own server.
- ✅ Full React app, 7 backend services, Terraform and Kubernetes definitions in source, with local test evidence.
- ✅ Security scanning CI workflow (Gitleaks, Semgrep, Bandit) added to all repositories. All four repositories pass. The frontend's full-history secret scan reports without blocking until old credentials are confirmed revoked (see [open security work](SECURITY-ARCHITECTURE.md)).
- ✅ Strapi CMS local build; self-hosted knowledge service with verified local backup restore.
- 🟡 Native Android (Kotlin/Compose) and iOS (SwiftUI): sign-in, registration, MFA, profile, appointments and cancellation done; booking, billing, messaging, consultations and records not finished.
- ⬜ No live clinical backend, no real patient data, no load tests, no audits.

## Phase 1: Foundation (make it correct)

| Work | Exit criteria |
|---|---|
| Close open security items (credential revocation check, route authorisation coverage, upload scanning) | Zero open high findings; full-history scan triaged |
| Booking and payment safety: idempotency keys, transactional outbox, reconciliation, refunds | Retry, replay and lost-response tests pass |
| Immutable build provenance and SBOM for every image | Every deployed image traceable to a commit |
| Branch protection and required reviews on default branches | Enabled on all repositories |
| CMS deployment with backups and restore test | Restore drill passes |
| Knowledge assistant evaluation set and clinician review | Targets in [AI-GOVERNANCE.md](AI-GOVERNANCE.md) met |

## Phase 2: Pilot (small, real, safe)

| Work | Exit criteria |
|---|---|
| Legal entity, privacy notice, terms, BAAs and DPAs, DPIA and HIPAA risk analysis signed | Counsel sign-off per jurisdiction |
| One region, one cell, staging and production environments from Terraform | Plan reviewed, cost approved by owner |
| Observability: SLO dashboards, burn-rate alerts, synthetic journeys, on-call | Alerts tested end to end |
| Independent penetration test and accessibility audit | No open critical or high issues |
| Pilot with a small clinic (hundreds of users) | 99.9% SLO held for 30 days |

## Phase 3: Launch (two regions)

| Work | Exit criteria |
|---|---|
| US and EU data planes live with verified regional isolation | Isolation tests pass |
| Three-zone deployment, canary releases, automatic rollback | Failed canary rolls back automatically |
| Disaster recovery drills per tier | Measured recovery point and time within targets |
| Native apps reach feature parity and pass store review | Parity checklist complete for Android and iOS |
| SOC 2 Type I readiness | Auditor readiness assessment complete |

## Phase 4: Scale to 100,000 concurrent

| Work | Exit criteria |
|---|---|
| Cell architecture with cell router and per-cell quotas | New cell added without downtime |
| Dedicated WebSocket tier, Redis cluster per cell, search index | Load test at 100k concurrent within SLO |
| Hot-partition protection for popular doctors and clinics | Skewed-load test passes |
| SOC 2 Type II observation period | Report issued |

## Phase 5: Scale to 1,000,000+ concurrent

| Work | Exit criteria |
|---|---|
| Multiple cells per region; capacity from measured per-cell limits | 1M concurrent soak test (4+ hours) within SLO |
| 99.95% SLO for critical journeys | Held for 90 days |
| Failure injection: zone, cell, cache and AI provider loss | Critical journeys stay within SLO; no duplicate charges or bookings |
| EHDS and EU AI Act readiness (EHDS from 2027; AI high-risk duties from Dec 2027 / Aug 2028 if applicable) | Legal assessment and technical documentation complete |
| ISO 27001 certification, HITRUST if US enterprise customers need it | Certificates issued |

Detailed design: [SCALABILITY.md](SCALABILITY.md) · Reliability targets: [RELIABILITY.md](RELIABILITY.md)
