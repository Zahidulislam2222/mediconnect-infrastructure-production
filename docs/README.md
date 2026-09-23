# MediConnect platform documentation

Last reviewed: **2026-09-24** · Operator: **MediConnect** · Public site: <https://mediconnect.zahidul-islam.com>

MediConnect is an open-source (MIT) telemedicine platform for patients, clinicians, clinic staff
and administrators, designed for United States and European Union data residency. This folder is
the single platform-wide documentation set. Each repository's README covers only that component
and links back here.

## Read this first: status labels

Every document uses the same labels so a reader never has to guess whether something is running.

| Label | Meaning |
|---|---|
| **CURRENT** | Exists today and was checked on the date shown. |
| **RETAINED** | Source code or infrastructure definitions are kept and reviewable, but the paid cloud runtime was intentionally switched off to control cost. |
| **PLANNED** | Future design. Not built or not yet proven. |
| **TARGET** | A number we are designing towards (for example users or uptime). Not a measured result. |

Today the public website is a **static showcase** served from the operator's own server. The
clinical backend, CMS, AI knowledge service and native mobile apps are implemented to different
degrees and are **not** operating as a live clinical service. Nothing in this documentation is a
certification, legal opinion, uptime guarantee or medical claim.

## Documents

| Document | What it answers |
|---|---|
| [Architecture](ARCHITECTURE.md) | What the system is made of, how the pieces talk, and what is running now. |
| [Scalability to 1M+ concurrent users](SCALABILITY.md) | The future design for one million or more simultaneous users, the bottlenecks, and how each layer scales. |
| [Reliability, SLOs and disaster recovery](RELIABILITY.md) | Uptime targets (99.9% then 99.95%), error budgets, backups, failover, incident response. |
| [Security architecture](SECURITY-ARCHITECTURE.md) | Threat model, identity, encryption, secrets, supply chain, open security work. |
| [Law and compliance map](COMPLIANCE-AND-LAW.md) | Which US, EU and UK laws apply, what each requires, which platform control answers it, and what is still open. |
| [Privacy and data flow](PRIVACY-AND-DATA.md) | What personal and health data exists, where it lives, how long it is kept, and patient rights. |
| [AI safety and governance](AI-GOVERNANCE.md) | Rules for the chatbot and symptom checker: disclosure, clinical limits, privacy, evaluation. |
| [Accessibility](ACCESSIBILITY.md) | WCAG 2.2 AA target and the accessibility laws that apply. |
| [Roadmap](ROADMAP.md) | Phased plan from today's showcase to a scaled, audited service. |
| [Operations runbook](OPERATIONS.md) | Deploy rules, environments, monitoring, on-call and change control. |

Existing detailed records (preserved, with status notes added where they were out of date):

- [Reviewer guide](../REVIEWER-GUIDE.md) and [showcase status](../SHOWCASE-STATUS.md)
- [Capacity and reliability design](../architecture/CAPACITY-AND-RELIABILITY.md) and the offline capacity calculator
- [Disaster recovery runbook](../compliance/disaster-recovery.md), [DPIA](../compliance/dpia.md),
  [BAA readiness](../compliance/baa-readiness.md), [data retention](../compliance/data-retention-policy.md)
- [DICOM conformance](../backend_v2/dicom-service/docs/CONFORMANCE.md) and [software lifecycle](../backend_v2/dicom-service/docs/SOFTWARE_LIFECYCLE.md)

## Repositories

| Repository | Role | Status |
|---|---|---|
| [mediconnect-hub](https://github.com/Zahidulislam2222/mediconnect-hub) | React web app, static showcase, Capacitor app, native Android (Kotlin/Compose) and iOS (Swift/SwiftUI) clients | Showcase CURRENT; full app RETAINED; native apps in progress |
| [mediconnect-infrastructure-production](https://github.com/Zahidulislam2222/mediconnect-infrastructure-production) | Backend microservices, Terraform, Kubernetes, CI/CD, platform docs | RETAINED; locally tested |
| [mediconnect-cms](https://github.com/Zahidulislam2222/mediconnect-cms) | Strapi 5 content management for articles and health content | Local build verified; not deployed |
| [mediconnect-rag](https://github.com/Zahidulislam2222/mediconnect-rag) | LightRAG knowledge service, monitoring, security scanning, backups | Self-hosted stack; integration with the app not accepted |

## Licence

Source code in all four repositories is released under the [MIT Licence](../LICENSE). Third-party
components keep their own licences. Generated media and design assets are listed separately in each
repository's `THIRD-PARTY-NOTICES.md`.

## Disclaimer

MediConnect documentation is engineering documentation, not legal, regulatory or medical advice.
Before handling real patient data, an operator needs its own legal entity, contracts (including
HIPAA Business Associate Agreements and GDPR data processing agreements), a documented risk analysis,
qualified legal review and clinical governance.
