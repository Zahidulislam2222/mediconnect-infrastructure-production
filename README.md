# MediConnect — Enterprise Healthcare Infrastructure

<div align="center">

![Status](https://img.shields.io/badge/Status-Production-brightgreen)
![HIPAA](https://img.shields.io/badge/HIPAA-Compliant-22C55E)
![GDPR](https://img.shields.io/badge/GDPR-Compliant-3B82F6)
![FHIR](https://img.shields.io/badge/FHIR_R4-35_Resources-8B5CF6)
![SOC 2](https://img.shields.io/badge/SOC_2-96%25-22C55E)
![HL7](https://img.shields.io/badge/HL7_v2.5.1-4_Message_Types-E11D48)
![SMART](https://img.shields.io/badge/SMART_on_FHIR-2.0-06B6D4)
![Cloud](https://img.shields.io/badge/Cloud-AWS%20%7C%20GCP%20%7C%20Azure-F97316)
![Cost](https://img.shields.io/badge/Idle%20Cost-%241%2Fmo-22C55E)
![Tests](https://img.shields.io/badge/Tests-82_Passing-22C55E)
![Vulnerabilities](https://img.shields.io/badge/Vulnerabilities-0-22C55E)

**Production-grade, multi-cloud healthcare backend with 7 microservices, 4 Lambda functions, and 35 FHIR R4 resource types.**
**Forensically verified HIPAA / GDPR / HL7 FHIR R4 / SOC 2 / DICOM compliance — proven in code, not just documentation.**

[Live Demo](https://askme-82f72.web.app) · [Frontend Repo](https://github.com/Zahidulislam2222/mediconnect-hub) · [Author](https://zahidul-islam.vercel.app)

</div>

---

## Table of Contents

- [Overview](#overview)
- [Clinical Use Cases](#clinical-use-cases)
- [Architecture](#architecture)
- [Microservices](#microservices)
- [Clinical Modules](#clinical-modules)
- [FHIR R4 Interoperability](#fhir-r4-interoperability)
- [Compliance Scorecard](#compliance-scorecard)
- [Tech Stack](#tech-stack)
- [Security Architecture](#security-architecture)
- [Cost Model](#cost-model)
- [CI/CD & Deployment](#cicd--deployment)
- [Getting Started](#getting-started)
- [Author](#author)

---

## Overview

MediConnect is a **production-grade global telemedicine platform** built on a three-cloud Zero-Cost Idle architecture. It handles the complete clinical lifecycle — from patient registration with biometric identity verification through AI-assisted consultations, e-prescriptions with RxNorm drug interaction checking, DICOM medical imaging, prior authorization workflows, to population health analytics via FHIR Bulk $export.

### Key Engineering Achievements

| Achievement | Detail |
|------------|--------|
| **35 FHIR R4 Resource Types** | Full interoperability layer with US Core profile validation on all write paths |
| **10 Terminology Systems** | ICD-10-CM, ICD-11, SNOMED CT, LOINC, RxNorm, CVX, CPT/HCPCS, NDC, NPI, DEA |
| **Multi-Cloud Failover** | Active-active AKS/EKS clusters with automatic GCP Cloud Run failover (5s) |
| **Zero-Cost Idle** | ~$1/month when no users active (vs ~$300/month traditional always-on) |
| **AI Circuit Breaker** | AWS Bedrock → GCP Vertex AI → Azure OpenAI for 99.99% AI availability |
| **Multi-Region Data Residency** | US data in `us-east-1`, EU data in `eu-central-1` — GDPR Schrems II compliant |
| **82 Automated Tests** | US Core profile validators + clinical controller unit tests |
| **0 npm Vulnerabilities** | OIDC Workload Identity replacing all static keys |

---

## Clinical Use Cases

### For Patients
- **Video Consultations** — Amazon Chime SDK WebRTC with media pipeline recording
- **AI Symptom Checker** — Claude 3 Haiku with PII scrubbing and clinical NLP
- **Pharmacy** — E-prescriptions with barcode scanner, refill requests, QR fulfillment
- **Health Records** — FHIR-compliant allergies, immunizations, care plans, vitals
- **Blue Button 2.0** — CMS-compliant personal health data export
- **Insurance** — Eligibility verification, prior authorization tracking
- **GDPR Controls** — Data export (Art 15), erasure with 30-day grace (Art 17), consent ledger (Art 7)

### For Providers
- **EHR Integration** — ICD-10/ICD-11 dual coding, SNOMED CT clinical terms, LOINC lab codes
- **e-Prescribing** — RxNorm drug lookup, real-time interaction checking, DEA schedule validation
- **Medication Reconciliation** — 11 drug classes, conflict detection (ACE+ARB, NSAID+Anticoagulant, Opioid+Benzo, SSRI+MAOI), therapeutic duplication alerts
- **Clinical Decision Support** — CDS Hooks 2.0 with 4 services: medication-prescribe, order-select, patient-view, appointment-book
- **Lab Orders** — LOINC-coded ordering, result submission, US Core ServiceRequest validation
- **Referrals** — FHIR ServiceRequest-based specialist referrals with status tracking
- **Master Patient Index** — Soundex phonetic matching, weighted probabilistic scoring, GSI-ready for production scale
- **Emergency Access** — HIPAA §164.312(a)(2)(ii) break-glass override with 6 reason codes, time-limited, full audit trail

### For Population Health
- **Bulk FHIR $export** — Async NDJSON export with paginated DynamoDB scan for production-scale datasets
- **Electronic Lab Reporting (ELR)** — HL7 ORU^R01 generation, reportable condition detection for public health authorities
- **Electronic Case Reporting (eCR)** — RCTC trigger code matching, eICR generation
- **SDOH Screening** — Social Determinants of Health assessment and tracking
- **C-CDA 2.1** — Clinical Document Architecture: CCD, Discharge Summary, Referral Note generation
- **Analytics** — BigQuery streaming for revenue, appointments, and vitals data

### For Operations
- **Prior Authorization** — FHIR ClaimResponse workflow (pending → approved/denied)
- **CPT/HCPCS Billing** — Procedure code lookup and fee schedule
- **Appointment Reminders** — Multi-channel notification system
- **Staff Management** — Shifts, tasks, announcements, directory
- **DICOM Imaging** — Upload, HIPAA Safe Harbor de-identification, Orthanc PACS, FHIR ImagingStudy mapping
- **Audit Compliance** — 191 audit points across 49 files, FHIR AuditEvent format, 7-year retention

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     MEDICONNECT V2 — THREE-CLOUD ARCHITECTURE              │
├─────────────────────┬─────────────────────┬─────────────────────────────────┤
│   AWS (Primary)     │   GCP (Backup)      │   Azure (K8s Primary)          │
│   Security + Data   │   Compute + AI      │   Compute Orchestration        │
├─────────────────────┼─────────────────────┼─────────────────────────────────┤
│ • Cognito (Auth)    │ • Cloud Run         │ • AKS Kubernetes               │
│ • DynamoDB (15+     │   (scale-to-zero    │   (active-active w/ EKS)       │
│   tables)           │    backup compute)  │ • Container Apps               │
│ • S3 (documents,    │ • BigQuery          │   (scale to zero)              │
│   DICOM, exports)   │   (analytics DW)    │ • Azure OpenAI                 │
│ • KMS (PHI encrypt) │ • Vertex AI         │   (AI fallback #2)             │
│ • SSM (secrets)     │   (AI fallback #1)  │ • ACR (Docker images)          │
│ • SNS (breach       │ • Artifact Registry │                                │
│   alerts)           │   (Docker images)   │                                │
│ • IoT Core (MQTT)   │                     │                                │
│ • Bedrock (AI)      │                     │                                │
│ • Chime SDK (video) │                     │                                │
│ • EKS (K8s)         │                     │                                │
│ • Lambda (4 × 2     │                     │                                │
│   regions)          │                     │                                │
└─────────────────────┴─────────────────────┴─────────────────────────────────┘

Data Flow:
  Patient App → x-user-region header → API Gateway → Service → Regional DynamoDB
  US users → us-east-1 resources  |  EU users → eu-central-1 resources

Failover Chain:
  Primary (AKS/EKS) → 5s timeout → Backup (GCP Cloud Run)
  AI: AWS Bedrock (Claude 3) → GCP Vertex AI (Gemini) → Azure OpenAI (GPT-4)
```

---

## Microservices

### 7 Core Services

| Service | Language | Port | Key Responsibilities |
|---------|----------|------|---------------------|
| **patient-service** | Node.js/TS | 8081 | Registration, vitals (MQTT/IoT), FHIR Patient, allergies, immunizations, care plans, MPI, bulk $export, Blue Button 2.0, GDPR (consent/erasure/export), SDOH |
| **doctor-service** | Node.js/TS | 8082 | EHR (ICD-10/11), e-prescriptions (RxNorm), SNOMED CT, lab orders (LOINC), CDS Hooks, med-reconciliation, referrals, C-CDA 2.1, eCR, ELR, emergency access |
| **booking-service** | Node.js/TS | 8083 | Appointments, Stripe billing, prior authorization, insurance eligibility, CPT/HCPCS, Google Calendar sync, BigQuery analytics |
| **communication-service** | Node.js/TS | 8084 | WebSocket chat, Chime video, AI circuit breaker (Bedrock→Vertex→Azure), FHIR mapping |
| **admin-service** | Python/FastAPI | 8085 | User management, audit log viewer, system health, platform analytics |
| **staff-service** | Node.js/TS | 8086 | Shift scheduling, task management, announcements, staff directory |
| **dicom-service** | Python/FastAPI | 8005 | DICOM upload, HIPAA Safe Harbor de-identification (PS3.15 Annex E), Orthanc PACS, FHIR ImagingStudy |

### 4 Lambda Functions (× 2 regions)

| Function | Trigger | Purpose |
|----------|---------|---------|
| `cognito-triggers` | Cognito Post-Confirmation | Auto-assign user to doctor/patient group by client ID |
| `ws-authorizer` | API Gateway WebSocket `$connect` | Verify Cognito JWT from query param, return IAM policy |
| `cleanup-recordings` | EventBridge `MeetingEnded` | Delete Chime media pipelines to stop billing |
| `failover-proxy` | API Gateway integration | Primary → backup failover for WebSocket events |

### 11 Shared Utilities

| Module | Purpose |
|--------|---------|
| `aws-config.ts` | Regional AWS SDK client factories, memory-cached, GDPR-aware routing |
| `audit.ts` | FHIR AuditEvent logging — 191 call sites, 7-year TTL, breach detection trigger |
| `kms-crypto.ts` | KMS envelope encryption for PHI fields (`phi:kms:` prefix) and OAuth tokens |
| `logger.ts` | Winston PII masking — email, SSN, phone, passwords, base64 stripped before logging |
| `breach-detection.ts` | Rate-based anomaly detection (50 PHI ops/5min) + 9 security event types → SNS alert |
| `validation.ts` | Zod request validation middleware with field-level error responses |
| `rate-limit-store.ts` | Redis-backed distributed rate limiting with in-memory fallback |
| `fhir-metadata.ts` | FHIR R4 CapabilityStatement, SMART on FHIR well-known config, EHR launch context |
| `emergency-access.ts` | HIPAA break-glass override — 6 reason codes, time-limited, DynamoDB audit trail |
| `us-core-profiles.ts` | US Core FHIR profile validation — 18 profiles, 12 validators |
| `hl7-parser.ts` | HL7 v2.5.1 message parser — ADT^A01, ORM^O01, ORU^R01, SIU^S12 |

---

## Clinical Modules

### Doctor Service — 13 Clinical Route Groups

| # | Module | API Prefix | Standards |
|---|--------|-----------|-----------|
| 1 | Prescriptions | `/prescription(s)` | RxNorm, US Core MedicationRequest |
| 2 | Drug Reference | `/drugs/rxnorm/*`, `/drugs/ndc/*` | RxNorm (NLM API), NDC crosswalk |
| 3 | NPI Validation | `/doctors/npi/*` | NPPES Registry |
| 4 | SNOMED CT | `/terminology/snomed/*` | SNOMED CT International |
| 5 | EHR | `/ehr` | ICD-10-CM, ICD-11, FHIR resources |
| 6 | DEA Validation | `/doctors/dea/*` | DEA registration, schedules I-V |
| 7 | ICD-11 | `/terminology/icd11/*` | WHO ICD-11, ICD-10→11 crossmap |
| 8 | Electronic Lab Reporting | `/public-health/elr` | HL7 ORU^R01 |
| 9 | CDS Hooks | `/cds-hooks/*` | CDS Hooks 2.0 (4 services) |
| 10 | Lab Orders | `/lab/*` | LOINC, US Core ServiceRequest |
| 11 | Referrals | `/referrals/*` | FHIR ServiceRequest |
| 12 | Med Reconciliation | `/med-reconciliation/*` | 11 drug classes, conflict detection |
| 13 | Emergency Access | `/emergency-access/*` | HIPAA §164.312(a)(2)(ii) |

### Patient Service — 11 Clinical Modules

| Module | Standards | Key Features |
|--------|-----------|-------------|
| GDPR Consent | GDPR Art 6, Art 7 | Append-only ledger, granular purpose, withdrawal |
| Data Erasure | GDPR Art 17 | 30-day grace, anonymization, S3 cleanup |
| Data Export | GDPR Art 15, Art 20 | FHIR Bundle JSON export |
| Allergies | US Core AllergyIntolerance | CRUD with US Core validation |
| Immunizations | US Core Immunization, CVX | CRUD with vaccine code lookup |
| Care Plans | US Core CarePlan | Goal tracking, FHIR mapping |
| Master Patient Index | Soundex, GSI-ready | Probabilistic matching, duplicate scan |
| Bulk $export | FHIR Bulk Data Access | Async jobs, paginated NDJSON |
| Blue Button 2.0 | CMS Blue Button | Patient data access API |
| SDOH | FHIR Observation | Social determinants screening |
| FHIR Metadata | SMART on FHIR 2.0 | CapabilityStatement, well-known config |

---

## FHIR R4 Interoperability

### 35 Resource Types Implemented

```
Patient              Practitioner          PractitionerRole      Appointment
Observation          MedicationRequest     Medication            MedicationStatement
DiagnosticReport     RiskAssessment        Communication         Coverage
Consent              ClinicalImpression    DocumentReference     AuditEvent
AllergyIntolerance   Immunization          Condition             Encounter
CarePlan             Goal                  ServiceRequest        ClaimResponse
DetectedIssue        ImagingStudy          Bundle                OperationOutcome
CapabilityStatement  EpisodeOfCare         Composition           Organization
QuestionnaireResponse  FamilyMemberHistory   RelatedPerson
```

### 10 Terminology Code Systems

| System | Standard | Usage |
|--------|----------|-------|
| ICD-10-CM | WHO/CMS | Diagnosis coding (EHR) |
| ICD-11 | WHO 2025 | Next-gen diagnosis coding with ICD-10 crossmap |
| SNOMED CT | IHTSDO | Clinical terminology, hierarchy, ECL queries |
| LOINC | Regenstrief | Lab order codes, observation categories |
| RxNorm | NLM/NIH | Drug lookup, interactions, NDC crosswalk |
| CVX | CDC | Vaccine codes (immunizations) |
| CPT/HCPCS | AMA/CMS | Procedure billing codes |
| NDC | FDA | National Drug Codes |
| NPI | CMS/NPPES | Provider identification |
| DEA | DEA/DOJ | Controlled substance scheduling |

### Interoperability Standards

| Standard | Implementation |
|----------|---------------|
| **SMART on FHIR 2.0** | `/.well-known/smart-configuration`, EHR launch context, 10 SMART scopes |
| **US Core 6.1** | 18 profile URLs, 12 resource validators, validation on all write paths |
| **CDS Hooks 2.0** | 4 services: medication-prescribe, order-select, patient-view, appointment-book |
| **HL7 v2.5.1** | ADT^A01 (admission), ORM^O01 (orders), ORU^R01 (results), SIU^S12 (scheduling) |
| **C-CDA 2.1** | CCD, Discharge Summary, Referral Note generation |
| **Bulk Data Access** | FHIR $export with async job model, NDJSON output |
| **Blue Button 2.0** | CMS-compliant patient data access |

---

## Compliance Scorecard

| Domain | Score | Controls Verified |
|--------|-------|-------------------|
| **HIPAA** | **100%** | 13/13 — PHI encryption, audit trails, breach detection, emergency access, session timeout, PII masking |
| **GDPR** | **100%** | 10/10 — Consent ledger, erasure, export, data residency, cookie consent, privacy by design |
| **FHIR R4** | **100%** | 10/10 — 35 resource types, 10 terminology systems, SMART on FHIR, CDS Hooks |
| **SOC 2 Security** | **92%** | 5/5 code-level + 1 infrastructure |
| **SOC 2 Availability** | **90%** | 5/5 code-level + 1 infrastructure |
| **SOC 2 Processing Integrity** | **100%** | 5/5 — Zod validation, webhook idempotency, atomic transactions |
| **SOC 2 Confidentiality** | **100%** | 5/5 — PHI classification, field-level encryption, log masking |
| **SOC 2 Privacy** | **100%** | 5/5 — Consent, data subject rights, retention, residency |
| **SOC 2 Overall** | **96%** | 25/27 controls verified |
| **DICOM** | **100%** | 5/5 — Upload, Safe Harbor de-identification, PACS, FHIR ImagingStudy |

### HIPAA Controls (13/13)

| Control | Implementation | Evidence |
|---------|---------------|----------|
| PHI Encryption at Rest | KMS envelope encryption with `phi:kms:` prefix | `shared/kms-crypto.ts` |
| PHI Encryption in Transit | Helmet HSTS (1yr), CSP headers | All `index.ts` files |
| Minimum Necessary Access | Cognito RBAC, 6-tier rate limiting | `auth.middleware.ts` |
| Audit Controls | FHIR AuditEvent format, 7-year TTL | `shared/audit.ts` — 191 call sites |
| Breach Notification | 9 event types + rate anomaly → SNS | `shared/breach-detection.ts` |
| De-identification | HIPAA Safe Harbor, PS3.15 Annex E | `dicom-service/services/deidentification.py` |
| Access Controls | Cognito JWT + per-endpoint role guards | All services |
| PII Masking in Logs | Regex scrubbing: email, SSN, phone, passwords | `shared/logger.ts` |
| Session Timeout | 15-min inactivity auto-logout | Frontend `HipaaGuard` |
| Tab Blur Protection | 12px Gaussian blur on visibility change | Frontend `App.tsx` |
| Emergency Access | Break-glass with 6 reason codes, max 120 min | `shared/emergency-access.ts` |
| Encrypted Frontend Storage | AES-GCM 256-bit via Web Crypto API | Frontend `secure-storage.ts` |
| Business Associate Agreement | Infrastructure supports BAA requirements | DynamoDB encryption, KMS, CloudTrail |

### GDPR Controls (10/10)

| Article | Control | Implementation |
|---------|---------|---------------|
| Art 6, 7 | Consent Management | Append-only consent ledger with granular purpose tracking |
| Art 15 | Right to Access | FHIR Bundle data export endpoint |
| Art 17 | Right to Erasure | Multi-stage: 30-day grace → anonymize → S3 delete → audit |
| Art 20 | Data Portability | FHIR Bundle JSON + Bulk $export NDJSON |
| Art 44-49 | Data Residency | `x-user-region` header → strict US/EU routing |
| Art 7 | Cookie Consent | Granular: essential/functional/analytics with timestamps |
| Art 5 | Data Minimization | Minimal JWT claims, truncated actor IDs in alerts |
| Art 25 | Privacy by Design | KMS encryption, secure-storage, field-level PHI encryption |
| Art 33 | Breach Notification | Automated SNS alerting enables <72h notification |
| — | Consent Immutability | Append-only writes, no UPDATE/DELETE on consent records |

---

## Tech Stack

### Backend Services
| Technology | Usage |
|-----------|-------|
| Node.js 20 + Express + TypeScript | 5 microservices |
| Python 3.12 + FastAPI | 2 microservices (admin, DICOM) |
| Docker (multi-stage builds) | Containerization with workspace skeleton |
| WebSocket + Socket.io | Real-time chat |
| Amazon Chime SDK | Video consultations with media pipeline recording |

### Infrastructure & DevOps
| Technology | Usage |
|-----------|-------|
| Kubernetes (AKS + EKS) | Active-active container orchestration |
| GCP Cloud Run | Scale-to-zero backup compute |
| AWS Lambda | 4 functions × 2 regions = 8 deployments |
| GitHub Actions | CI/CD pipeline (test → build → deploy) |
| Docker Compose | Local development orchestration |

### AI & Machine Learning
| Service | Usage |
|---------|-------|
| AWS Bedrock (Claude 3 Haiku) | Primary AI clinical assistant |
| GCP Vertex AI (Gemini 2.5) | AI fallback #1 |
| Azure OpenAI (GPT-4) | AI fallback #2 |
| AWS Rekognition | Biometric face match (selfie vs government ID) |
| AWS Textract | AI diploma OCR for doctor credentialing |
| AWS Comprehend Medical | FHIR term extraction from clinical text |
| AWS IoT Core (MQTT) | Real-time wearable vitals ingestion |

### Data Stores
| Store | Usage |
|-------|-------|
| AWS DynamoDB | Primary database — 15+ tables, on-demand billing, per-region |
| AWS S3 | Documents, DICOM files, verification images, export artifacts |
| GCP BigQuery | Analytics data warehouse (revenue, appointments, vitals) |
| Redis | Distributed rate limiting, session caching |

---

## Security Architecture

| Layer | Implementation |
|-------|---------------|
| **Identity** | AWS Cognito RS256 JWT, verified against JWKS on every request, multi-region pools |
| **Secrets** | AWS SSM Parameter Store with `WithDecryption` — services exit on vault sync failure |
| **Encryption** | KMS envelope encryption for PHI, AES-GCM 256-bit for frontend storage |
| **Transport** | TLS 1.2+, HSTS (1 year), CSP headers via Helmet |
| **Rate Limiting** | 6 tiers: global (100/15m), auth (20), PHI-read (30), PHI-write (10), search (20), export (5) |
| **Input Validation** | Zod schemas on all request bodies with field-level error responses |
| **Breach Detection** | 9 security event types + rate anomaly (50 PHI/5min) → SNS alerting |
| **Audit Trail** | 191 audit points across 49 files, FHIR AuditEvent format, 7-year TTL |
| **PII Protection** | Winston PII masking (email, SSN, phone, passwords, base64) |
| **Containers** | OIDC Workload Identity — zero static AWS/GCP keys in containers |
| **Network** | Strict CORS whitelist, Helmet CSP, namespace isolation in K8s |
| **Payments** | Stripe server-confirmed PaymentIntents with webhook signature verification |
| **Emergency Access** | Break-glass with time limits, reason codes, compliance alerting |

---

## Cost Model

| Resource | V1 (Always-On) | V2 (Zero-Cost Idle) |
|----------|----------------|---------------------|
| Compute | $110/mo (EC2 + Azure) | **$0/mo** (scale to zero) |
| Database | $80/mo (RDS + ElastiCache) | **$0/mo** (DynamoDB on-demand) |
| Auth | $0/mo | **$0/mo** (Cognito <50k MAU) |
| Crypto | $2/mo | **$1/mo** (KMS) |
| Storage | $100/mo | **$0/mo** (S3 pay-per-request) |
| **Total (idle)** | **~$292/mo** | **~$1/mo** |

---

## CI/CD & Deployment

### GitHub Actions Pipeline (5 stages)

```
Push to main (backend_v2/** changes)
  │
  ├── 1. test-and-lint        npm ci + npm test --workspaces + npm audit
  │                           ↓ (blocks deployment on critical vulnerabilities)
  │
  ├── 2. build-and-push       Docker build × 7 services → GCP Artifact Registry
  │   │                       (+Azure ACR, +AWS ECR when K8s enabled)
  │   │
  │   └── 3. deploy-gcp       Cloud Run deploy (scale-to-zero, 256Mi)
  │       │                   Both us-central1 + europe-west3
  │       │
  │       ├── 4. deploy-k8s   Staging → smoke tests → Production
  │       │                   Auto-rollback via kubectl rollout undo
  │       │
  │       └── 5. deploy-lambdas  4 functions × 2 regions (parallel)
  │                              Auto-create if missing, update if exists
  │
  └── deploy-lambdas (parallel with build-and-push — no Docker dependency)
```

### Kubernetes

- **AKS** (Azure) + **EKS** (AWS) — active-active
- HPA: 1–5 replicas, scales on CPU/Memory > 70%
- Probes: `/health` (liveness), `/ready` (readiness)
- Namespace isolation: staging ↔ production

---

## Getting Started

### Prerequisites

- Node.js 20+ (via nvm)
- Python 3.12+ (for admin-service and dicom-service)
- Docker Desktop
- AWS CLI configured with appropriate IAM role

### Local Development

```bash
cd backend_v2
npm install                           # Install all workspace dependencies

# Start individual services
cd patient-service && npm run dev     # Port 8081
cd doctor-service && npm run dev      # Port 8082
cd booking-service && npm run dev     # Port 8083

# Python services
cd admin-service
pip install -r requirements.txt
uvicorn main:app --port 8085

cd dicom-service
pip install -r requirements.txt
uvicorn main:app --port 8005
```

### Run Tests

```bash
cd backend_v2
npx ts-node shared/__tests__/us-core-profiles.test.ts        # 27 assertions
npx ts-node shared/__tests__/clinical-controllers.test.ts     # 55 assertions
```

### Docker Build

```bash
# Build from repo root (required — Dockerfiles use repo root as context)
docker build -f backend_v2/patient-service/Dockerfile -t patient-service .
```

### Full Stack (docker-compose)

```bash
docker-compose up                     # All 7 services + frontend
```

---

## Author

**Zahidul Islam** — Hybrid Cloud Architect · Full Stack Engineer · HealthTech Specialist

| | |
|--|--|
| Portfolio | [zahidul-islam.vercel.app](https://zahidul-islam.vercel.app) |
| GitHub | [github.com/Zahidulislam2222](https://github.com/Zahidulislam2222) |
| Email | muhammadzahidulislam2222@gmail.com |

---

<div align="center">

**MediConnect** — Enterprise-grade healthcare infrastructure.
Built with precision. Secured by design. Compliant by default.

*© 2026 Zahidul Islam. All rights reserved.*

</div>
