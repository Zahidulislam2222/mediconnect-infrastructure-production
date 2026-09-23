# Architecture

Last reviewed: 2026-09-24. Status labels (CURRENT, RETAINED, PLANNED, TARGET) are defined in the
[documentation index](README.md).

## 1. What MediConnect does

MediConnect connects four kinds of users around one care journey, from a clinic visit to follow-up at home:

| Role | Main jobs |
|---|---|
| Patient | Register, verify identity, book and pay for visits, video consultations, messages, prescriptions and pharmacy, health records, data export and erasure, consent. |
| Doctor | Patient queue, electronic health record (ICD-10/11, SNOMED CT, LOINC), e-prescribing (RxNorm), lab orders, referrals, clinical decision support, earnings. |
| Staff | Shifts, tasks, announcements, directory, front-desk support. |
| Admin | User management, audit log review, system health, platform analytics. |

## 2. What is running today (CURRENT, 2026-09-24)

```text
Browser ──HTTPS──► Cloudflare (DNS and proxy) ──► mediconnect.zahidul-islam.com (operator VPS, Caddy reverse proxy)
                          │
                          └─► Nginx container serving the compiled static showcase
                              (no login, no payments, no backend calls; fictional demo data only)
```

- The public site is a **static showcase** (release `20260915-pharmacy-01`). Browser security policy
  on that host restricts connections to the same origin, so it cannot reach the retained backend.
- The full React application, backend services, CMS, AI knowledge service and native apps exist in
  source and have local test evidence, but **no live clinical service is operated**.
- An earlier Firebase Hosting deployment (`askme-82f72.web.app`) is **retired**. Its automatic
  deployment workflow is kept for reference and disabled.

## 3. Full platform design (RETAINED implementation)

```text
                 ┌──────────────────────────── Clients ────────────────────────────┐
                 │ React web app │ Capacitor app │ Android (Compose) │ iOS (SwiftUI) │
                 └───────┬───────────────────────────────────────────────────────────┘
                         │ HTTPS + Cognito JWT + x-user-region (US | EU)
                         ▼
          ┌──────────── Regional API layer (one per data region) ────────────┐
          │ patient  doctor  booking  communication  staff   (Node.js / TS)   │
          │ admin  dicom                                   (Python / FastAPI) │
          └───┬──────────┬───────────┬──────────────┬─────────────┬──────────┘
              │          │           │              │             │
         DynamoDB      S3 + KMS    SQS / Kafka    Chime SDK    LightRAG (AI)
        (regional)   (regional)    (events)       (video)      + model providers
              │
        Cognito user pools (US, EU) · Stripe (payments) · BigQuery (pseudonymised analytics)
```

### Backend services

| Service | Stack | Responsibility |
|---|---|---|
| patient-service | Node.js / TypeScript | Registration, profile, vitals, FHIR Patient, allergies, immunisations, care plans, master patient index, bulk export, consent, erasure, export |
| doctor-service | Node.js / TypeScript | EHR, e-prescriptions, terminology, lab orders, CDS Hooks, medication reconciliation, referrals, C-CDA, public-health reporting, emergency access |
| booking-service | Node.js / TypeScript | Appointments, Stripe billing, subscriptions, prior authorisation, insurance eligibility, calendar sync |
| communication-service | Node.js / TypeScript | WebSocket chat, video sessions, AI assistant routing |
| staff-service | Node.js / TypeScript | Shifts, tasks, announcements, directory |
| admin-service | Python / FastAPI | User management, audit viewer, system health, analytics |
| dicom-service | Python / FastAPI | Medical image upload, DICOM de-identification (PS3.15 Annex E), PACS forwarding, FHIR ImagingStudy |

### Key design decisions

| Decision | Why |
|---|---|
| Separate US and EU data planes, selected from validated user context | Keeps EU health data in the EU and US data in the US; required for GDPR transfer rules and customer contracts. |
| Microservices split by clinical domain | Each domain scales, deploys and fails independently; audit scope stays small. |
| Field-level envelope encryption for health data (KMS) | Database administrators and backups see ciphertext, not diagnoses. |
| Append-only audit events in FHIR AuditEvent format | Supports HIPAA audit controls and incident investigation. |
| FHIR R4, HL7 v2, DICOM, SMART on FHIR, CDS Hooks | Interoperability with hospitals and EHR vendors instead of a closed data silo. |
| Infrastructure as code (Terraform) and Kubernetes manifests | Reproducible environments and reviewable change history. |
| Deploy workflows need manual approval and a cost acknowledgement | Prevents accidental cloud spend and unreviewed production changes. |
| Static showcase separated from the clinical app | The public demo cannot leak real data or start paid services. |

## 4. Request path (RETAINED design)

1. The client signs in with Amazon Cognito and obtains a short-lived token through the SDK (never stored raw in local storage).
2. `src/lib/api.ts` in the web app adds the token and the region header and selects the regional endpoint.
3. The service verifies the token against the pool's public keys, checks role and resource ownership, and validates the body with Zod or Pydantic.
4. Health data fields are encrypted before storage; each access writes an audit event.
5. Side effects (notifications, analytics, erasure cascades) are published as events and handled by consumers.

## 5. Supporting systems

| System | Repository | Status |
|---|---|---|
| Strapi 5 CMS for articles, diseases, drugs, FAQs, health tips and wellness programmes | mediconnect-cms | Local build verified; not deployed |
| LightRAG knowledge graph with Nginx, Authelia 2FA, Prometheus, Grafana, Loki, Jaeger | mediconnect-rag | Self-hosted stack; app integration not accepted |
| Security CI (Gitleaks, Semgrep, Bandit) on every repository | all | CURRENT, passing on all four repositories; the frontend history scan is report-only ([open work](SECURITY-ARCHITECTURE.md)) |
| Terraform for AWS, GCP and Azure; Kubernetes manifests with probes, HPA, PDB and network policy | this repository | RETAINED |

## 6. Where to go next

- How this design grows to one million or more simultaneous users: [SCALABILITY.md](SCALABILITY.md)
- Uptime and recovery design: [RELIABILITY.md](RELIABILITY.md)
- Threats and controls: [SECURITY-ARCHITECTURE.md](SECURITY-ARCHITECTURE.md)
