# MediConnect — Multi-Cloud Telemedicine Infrastructure

<div align="center">

![Status](https://img.shields.io/badge/Status-Production-brightgreen)
![HIPAA](https://img.shields.io/badge/HIPAA-Compliant-22C55E)
![GDPR](https://img.shields.io/badge/GDPR-Compliant-3B82F6)
![FHIR](https://img.shields.io/badge/FHIR-R4-8B5CF6)
![Cloud](https://img.shields.io/badge/Cloud-AWS%20%7C%20GCP%20%7C%20Azure-F97316)
![Cost](https://img.shields.io/badge/Idle%20Cost-%241%2Fmo-22C55E)

**Production-grade, multi-cloud telemedicine backend with 7 microservices.**
**Forensically verified HIPAA / GDPR / HL7 FHIR R4 compliance.**
**Zero-Cost Idle architecture: ~$1/month at rest.**

[Live Demo](https://askme-82f72.web.app) · [Frontend Repo](https://github.com/Zahidulislam2222/mediconnect-hub) · [Author](https://zahidul-islam.vercel.app)

</div>

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Microservices](#microservices)
- [Tech Stack](#tech-stack)
- [Repository Structure](#repository-structure)
- [Compliance](#compliance)
- [Cost Model](#cost-model)
- [CI/CD & Deployment](#cicd--deployment)
- [Security](#security)
- [Getting Started](#getting-started)
- [Author](#author)

---

## Overview

MediConnect V2 is a **production-grade global telemedicine platform** built on a three-cloud Zero-Cost Idle architecture. It handles the complete clinical workflow — patient registration with biometric identity verification, AI-assisted doctor credentialing, real-time video consultations, KMS-signed e-prescriptions, pharmacy supply chain, Stripe billing, IoT wearable vitals, DICOM medical imaging, and a full analytics engine.

**Key engineering achievements:**

- Active-active Kubernetes clusters on **AKS (Azure)** and **EKS (AWS)** with automated GCP Cloud Run failover
- **Zero-Cost Idle**: infrastructure costs ~$1/month when no users are active (vs ~$300/month traditional always-on)
- **Forensically verified** HIPAA, GDPR, and HL7 FHIR R4 compliance — proven in code, not just promised
- **Multi-cloud AI Circuit Breaker** across AWS Bedrock → GCP Vertex AI → Azure OpenAI for 99.99% AI availability
- **Multi-region data residency**: US data in `us-east-1`, EU data in `eu-central-1` — GDPR Schrems II compliant
- **0 npm vulnerabilities** — OIDC Workload Identity replacing all static keys

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                    MEDICONNECT V2 ARCHITECTURE                       │
├──────────────────┬───────────────────────┬───────────────────────────┤
│   AWS            │   GCP                 │   Azure                   │
│   Security Hub   │   Compute Backup      │   Compute Primary         │
├──────────────────┼───────────────────────┼───────────────────────────┤
│ • Cognito        │ • Cloud Run           │ • AKS Kubernetes          │
│   (Auth + JWT)   │   (backup failover)   │   (active-active)         │
│ • DynamoDB       │ • BigQuery            │ • Cosmos DB               │
│   (all tables)   │   (analytics DW)      │   (serverless mode)       │
│ • S3 (documents) │ • Artifact Registry   │ • Container Apps          │
│ • KMS (signing)  │   (Docker images)     │   (scale to zero)         │
│ • SSM (vault)    │                       │                           │
│ • IoT Core       │                       │                           │
│ • Rekognition    │                       │                           │
│ • Bedrock (AI)   │                       │                           │
│ • Chime SDK      │                       │                           │
│ • EKS (k8s)      │                       │                           │
│ • Lambda (4 fn)  │                       │                           │
└──────────────────┴───────────────────────┴───────────────────────────┘

Failover: Primary (AKS/EKS) → Backup (GCP Cloud Run, 5s auto-failover)
AI:       AWS Bedrock → GCP Vertex AI → Azure OpenAI (circuit breaker)
Data:     US patients → us-east-1  |  EU patients → eu-central-1
```

---

## Microservices

### Core Services (`backend_v2/`)

| Service | Language | Port | Responsibility |
|---------|----------|------|----------------|
| `patient-service` | Node.js/Express | 8081 | Registration, biometric verify, FHIR Patient, IoT vitals, MQTT bridge |
| `doctor-service` | Node.js/Express | 8082 | Credentialing, AI diploma OCR, scheduling, EHR, e-prescriptions |
| `booking-service` | Node.js/Express | 8083 | Appointment scheduling, Stripe billing, BigQuery analytics |
| `communication-service` | Node.js/Express | 8084 | WebSocket chat, Chime video, Bedrock/OpenAI clinical NLP |
| `admin-service` | Python/FastAPI | 8085 | User management, audit logs, system health, platform analytics |
| `staff-service` | Node.js/Express | 8086 | Shifts, tasks, announcements, staff directory |
| `dicom-service` | Python/FastAPI | 8005 | DICOM upload, HIPAA de-identification, Orthanc PACS, FHIR ImagingStudy |

### Lambda Functions (deployed per-region: US + EU)

| Function | Trigger | Purpose |
|----------|---------|---------|
| `cognito-triggers` | Cognito Post-Confirmation | Auto-assign user to doctor/patient group |
| `ws-authorizer` | API Gateway WebSocket | JWT verification for WebSocket connections |
| `cleanup-recordings` | EventBridge MeetingEnded | Delete Chime media pipelines to stop billing |
| `failover-proxy` | API Gateway integration | Primary → backup failover for WebSocket events |

### Shared Utilities (`shared/`)

| Module | Purpose |
|--------|---------|
| `aws-config.ts` | Regional AWS SDK client factories (memory-cached, GDPR-aware routing) |
| `audit.ts` | FHIR AuditEvent logging, 7-year TTL, breach detection trigger |
| `kms-crypto.ts` | KMS envelope encryption for PHI fields and OAuth tokens |
| `logger.ts` | Winston PII masking (email, SSN, phone, passwords, base64) |
| `breach-detection.ts` | Rate-based anomaly detection (50 PHI ops/5min → SNS alert) |
| `validation.ts` | Zod request validation middleware |
| `rate-limit-store.ts` | Redis-backed distributed rate limiting (in-memory fallback) |
| `fhir-metadata.ts` | FHIR R4 CapabilityStatement (14 resource types) |

---

## Tech Stack

### Backend
| Technology | Usage |
|-----------|-------|
| Node.js + Express + TypeScript | 5 microservices |
| Python + FastAPI | 2 microservices (admin, DICOM) |
| Docker (multi-stage builds) | Containerization |
| WebSocket + Socket.io | Real-time communication |
| Amazon Chime SDK | Video consultation infrastructure |

### Infrastructure & DevOps
| Technology | Usage |
|-----------|-------|
| Kubernetes (AKS + EKS) | Active-active container orchestration |
| GCP Cloud Run | Scale-to-zero backup compute |
| GitHub Actions | CI/CD pipeline (7 services + 4 Lambdas) |
| Terraform | Infrastructure as Code |
| Prometheus + Grafana | Metrics and dashboards |
| Cloudflare Tunnels | Zero-Trust public ingress |

### AI & Machine Learning
| Service | Usage |
|---------|-------|
| AWS Rekognition | Biometric face match (selfie vs government ID) |
| AWS Textract | AI diploma OCR for doctor credentialing |
| AWS Comprehend Medical | FHIR term extraction from symptoms |
| AWS Bedrock (Claude 3.5) | Primary AI consultation engine |
| GCP Vertex AI (Gemini 2.5) | Secondary AI (circuit breaker fallback) |
| Azure OpenAI (GPT-4) | Tertiary AI (circuit breaker fallback) |
| Amazon Transcribe Medical | Voice-to-text for consultations |
| AWS IoT Core (MQTT) | Real-time wearable vitals ingestion |

### Data Stores
| Store | Usage |
|-------|-------|
| AWS DynamoDB | Primary database (9 tables, on-demand billing) |
| AWS S3 | Documents, ID verification, prescriptions, recordings |
| GCP BigQuery | Analytics data warehouse |
| Azure Cosmos DB | Serverless request mode (secondary) |
| Redis | Distributed rate limiting, session caching |

---

## Repository Structure

```
mediconnect-infrastructure-production/
├── .github/workflows/
│   └── deploy.yml                 # CI/CD: build, test, deploy 7 services + 4 Lambdas
│
├── backend_v2/                    # All V2 microservices
│   ├── patient-service/           # Node.js — port 8081
│   ├── doctor-service/            # Node.js — port 8082
│   ├── booking-service/           # Node.js — port 8083
│   ├── communication-service/     # Node.js — port 8084
│   ├── admin-service/             # Python — port 8085
│   ├── staff-service/             # Node.js — port 8086
│   ├── dicom-service/             # Python — port 8005
│   ├── shared/                    # Shared utilities (audit, crypto, logger, FHIR)
│   ├── cognito-triggers/          # Lambda: user group assignment
│   ├── ws-authorizer/             # Lambda: WebSocket JWT auth
│   ├── cleanup-recordings/        # Lambda: Chime pipeline cleanup
│   ├── failover-proxy/            # Lambda: primary→backup failover
│   ├── k8s/                       # Kubernetes manifests (AKS + EKS)
│   ├── package.json               # npm workspaces root
│   └── docker-compose.yml         # Local development
│
├── environments/                  # Per-environment config (staging/prod)
├── modules/                       # Terraform modules
├── migration_app/                 # V1 → V2 data migration scripts
├── docker-compose.yml             # Root orchestration
└── deploy_*.sh                    # Manual deployment scripts
```

---

## Compliance

### HIPAA 2026

| Control | Implementation |
|---------|---------------|
| Zero-Trust Identity | Cognito RS256 JWT verified on every request via JWKS |
| PHI/PII Masking | Recursive scrubber strips SSN, email, passwords before logging |
| Immutable Audit Trail | UUID-stamped `writeAuditLog` on every clinical action (7-year TTL) |
| Encryption at Rest | AWS KMS RSA-256 for e-prescriptions, AES-256 for all databases |
| Breach Detection | Rate-based anomaly detection (50 PHI ops/5min → SNS alert) |
| Minimum Necessary | RBAC enforced — doctors cannot access other doctors' patients |
| Auto-Logout | 15-minute inactivity timeout with Cognito session invalidation |

### GDPR / Schrems II

| Control | Implementation |
|---------|---------------|
| Data Residency | EU data pinned to `eu-central-1` / `europe-west` — cross-border flow blocked |
| Right to Access | Dedicated patient portal for personal medical history |
| Right to Erasure | S3 lifecycle policies auto-delete verification images post-processing |
| Consent Management | Granular cookie consent (essential/functional/analytics) with timestamps |
| Data Minimisation | Only verified JWT `sub` used as identity — no unnecessary PII |

### HL7 FHIR R4

14 resource types mapped: Patient, Practitioner, PractitionerRole, Appointment, MedicationRequest, Medication, Observation, Condition, AllergyIntolerance, CarePlan, Encounter, DocumentReference, DiagnosticReport, ImagingStudy.

---

## Cost Model

| | V1 (Always-On) | V2 (Zero-Cost Idle) |
|--|----------------|---------------------|
| Compute | $110/mo (EC2 + Azure) | $0/mo (scale to zero) |
| Database | $80/mo (RDS + ElastiCache) | $0/mo (DynamoDB on-demand) |
| Auth | $0/mo | $0/mo (Cognito <50k MAU) |
| Crypto | $2/mo | $1/mo (KMS) |
| **Total (idle)** | **~$292/mo** | **~$1/mo** |

---

## CI/CD & Deployment

### GitHub Actions Pipeline

Triggered on push to `main` when `backend_v2/**` changes:

```
Push to main
  ├── test-and-lint          npm ci + npm test --workspaces
  ├── build-and-push         Docker build → GCP Artifact Registry (+ACR/ECR if K8s enabled)
  ├── deploy-gcp             Cloud Run (always active, scale-to-zero, 256Mi)
  ├── deploy-staging         K8s staging namespace (when enabled)
  ├── deploy-prod-k8s        K8s prod namespace (auto-rollback on failure)
  └── deploy-lambdas         4 Lambda functions → us-east-1 + eu-central-1
```

### Kubernetes

- **AKS** (Azure East US) + **EKS** (AWS eu-central-1) — active-active
- HPA: 1–5 replicas, scales on CPU/Memory > 70%
- Probes: `/health` (liveness), `/ready` (readiness)
- Namespace isolation: staging cannot reach production

---

## Security

| Layer | Implementation |
|-------|---------------|
| **Identity** | AWS Cognito RS256 JWT, verified against JWKS on every request |
| **Secrets** | AWS SSM Parameter Store (WithDecryption) — no `.env` files in production |
| **Network** | Cloudflare Tunnels — zero open inbound ports |
| **Transport** | TLS 1.2+ enforced, HSTS (1 year) |
| **API** | Helmet (CSP + HSTS), rate limiting (Redis-backed), Zod validation |
| **Cryptography** | AWS KMS for e-prescriptions, PHI field encryption |
| **Containers** | OIDC Workload Identity — no static AWS/GCP keys |
| **Kubernetes** | Namespace isolation, Network Policies, RBAC |
| **Payments** | Stripe server-confirmed PaymentIntents — client cannot fake confirmation |
| **IDOR** | All resources verified against JWT `sub` — ownership enforced server-side |

---

## Getting Started

### Prerequisites

- Node.js 20+
- Python 3.12+ (for admin-service and dicom-service)
- Docker
- AWS CLI configured

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

### Docker Build

```bash
# Build from repo root (required — Dockerfiles use repo root as context)
docker build -f backend_v2/patient-service/Dockerfile -t patient-service .
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

**MediConnect V2** — Built with precision. Secured by design. Compliant by default.

*© 2026 Zahidul Islam. All rights reserved.*

</div>
