# 🏥 MediConnect — Multi-Cloud Telemedicine Platform (V2)

<div align="center">

![Status](https://img.shields.io/badge/Status-Live%20%7C%20Demo-brightgreen)
![HIPAA](https://img.shields.io/badge/HIPAA-Compliant%202026-blue)
![GDPR](https://img.shields.io/badge/GDPR-Compliant-blue)
![FHIR](https://img.shields.io/badge/FHIR-R4%20Verified-blueviolet)
![Cloud](https://img.shields.io/badge/Cloud-AWS%20%7C%20GCP%20%7C%20Azure-orange)
![Cost](https://img.shields.io/badge/Idle%20Cost-%241%2Fmo-success)
![License](https://img.shields.io/badge/License-Private-red)

**Production-grade, multi-cloud telemedicine infrastructure.**
**Forensically verified HIPAA / GDPR / HL7 FHIR R4 compliance.**
**Zero-Cost Idle architecture: ~$1/month at rest.**

[🌐 Live Demo](https://askme-82f72.web.app) · [👤 Author](https://github.com/Zahidulislam2222) · [📋 Architecture Docs](#architecture)

</div>

---

## 📑 Table of Contents

- [Overview](#overview)
- [Live Demo](#live-demo)
- [Architecture](#architecture)
- [Microservices](#microservices)
- [Repository Structure](#repository-structure)
- [Tech Stack](#tech-stack)
- [Compliance](#compliance)
- [Cost Model](#cost-model)
- [CI/CD & Deployment](#cicd--deployment)
- [Security](#security)
- [Author](#author)

---

## Overview

MediConnect V2 is a **production-grade global telemedicine platform** built on a three-cloud Zero-Cost Idle architecture. It handles the complete clinical workflow — patient registration with biometric identity verification, AI-assisted doctor credentialing, real-time video consultations, KMS-signed e-prescriptions, pharmacy supply chain, Stripe billing, IoT wearable vitals, and a full analytics engine.

**Key engineering achievements:**

- Active-active Kubernetes clusters on **AKS (Azure)** and **EKS (AWS)** with automated GCP Cloud Run failover
- **Zero-Cost Idle**: infrastructure costs ~$1/month when no users are active (vs ~$300/month traditional always-on)
- **Forensically verified** HIPAA, GDPR, and HL7 FHIR R4 compliance — proven in code, not just promised
- **Multi-cloud AI Circuit Breaker** across AWS Bedrock → GCP Vertex AI → Azure OpenAI for 99.99% AI availability
- **0 npm vulnerabilities** — OIDC Workload Identity replacing all static keys

---

## Live Demo

> ⚠️ Demo environment uses test data only. No real patient data is stored.

| Interface | URL |
|-----------|-----|
| 🌐 Web App (Patient) | [askme-82f72.web.app](https://askme-82f72.web.app) |
| 🩺 Patient Service API | GCP Cloud Run (auto-scales) |
| 👨‍⚕️ Doctor Service API | Azure Container Apps (auto-scales) |

> Screenshots coming soon — contact author for a live walkthrough.

---

## Architecture

MediConnect V2 uses a **"Three-Cloud Split"** strategy, assigning each cloud provider a specific role to maximise free tiers and scale-to-zero behaviour:

```
┌─────────────────────────────────────────────────────────────────┐
│                     MEDICONNECT V2 ARCHITECTURE                  │
├──────────────────┬──────────────────────┬───────────────────────┤
│   AWS            │   GCP                │   Azure               │
│   Security Hub   │   Relational Heart   │   Compute Layer       │
├──────────────────┼──────────────────────┼───────────────────────┤
│ • Cognito        │ • Cloud Run          │ • Container Apps      │
│   (Auth + JWT)   │   (patient-service)  │   (doctor-service)    │
│ • DynamoDB       │ • Cloud SQL          │   (booking-service)   │
│   (patients,     │   (PostgreSQL 15)    │   (comm-service)      │
│    audit logs,   │   Auto-pause idle    │   Scale to zero       │
│    chat history) │ • BigQuery           │ • AKS Kubernetes      │
│ • S3             │   (analytics DW)     │   (active-active)     │
│   (documents,    │ • Pub/Sub            │ • Cosmos DB           │
│    ID verify,    │   (event streaming)  │   (serverless mode)   │
│    prescriptions)│ • Artifact Registry  │                       │
│ • KMS            │                      │                       │
│   (RX signing)   │                      │                       │
│ • SSM Vault      │                      │                       │
│ • Rekognition    │                      │                       │
│ • Textract       │                      │                       │
│ • Comprehend Med │                      │                       │
│ • Bedrock        │                      │                       │
│ • IoT Core       │                      │                       │
│ • EKS (k8s)      │                      │                       │
└──────────────────┴──────────────────────┴───────────────────────┘

Failover Logic:
Primary: AKS (Azure eastus) + EKS (AWS eu-central-1)
Backup:  GCP Cloud Run (automatic 5s failover on 5xx)

AI Circuit Breaker:
AWS Bedrock → GCP Vertex AI → Azure OpenAI
(auto-fallback, 99.99% AI availability)

Data Residency:
US patients  →  us-east-1 / us-central1
EU patients  →  eu-central-1 / europe-west
(GDPR Schrems II compliant — EU data never leaves EU)
```

---

## Microservices

The platform is composed of **6 core Dockerized microservices** inside `backend_v2/`:

| Service | Cloud Host | Responsibility |
|---------|-----------|----------------|
| `patient-service` | GCP Cloud Run | Registration, biometric verify, FHIR Patient resource, IoT vitals |
| `doctor-service` | Azure Container Apps | Credentialing, AI diploma OCR, scheduling, FHIR Practitioner |
| `booking-service` | Azure Container Apps | Atomic slot locking, Stripe payments, FHIR Appointment resource |
| `communication-service` | Azure Container Apps | WebSocket chat, AI consultation, FHIR ImagingReport, Chime video |
| `ws-authorizer` | AWS Lambda | Cognito JWT verification for all WebSocket connections |
| `failover-proxy` | GCP Cloud Run | Health-check router, automatic traffic rerouting on failure |

**Supporting services:**

| Module | Purpose |
|--------|---------|
| `shared/` | Centralized audit logger, FHIR mappers, SSM vault loader |
| `cognito-triggers/` | Pre-signup, post-confirmation, and custom auth Lambda triggers |
| `cleanup-recordings/` | Auto-delete Chime video recordings after retention period |
| `k8s/` | Kubernetes manifests — HPA, PDB, Network Policies, Ingress |

---

## Repository Structure

```
mediconnect-infrastructure-develop/
│
├── .github/
│   └── workflows/
│       └── deploy.yml              # GitHub Actions CI/CD pipeline
│
├── backend_v2/                     # All V2 microservices
│   ├── booking-service/            # Appointments + Stripe payments
│   ├── cleanup-recordings/         # Chime recording lifecycle
│   ├── cognito-triggers/           # AWS Cognito Lambda hooks
│   ├── communication-service/      # WebSocket + AI chat + video
│   ├── doctor-service/             # Doctor onboarding + credentialing
│   ├── failover-proxy/             # Multi-cloud health router
│   ├── k8s/                        # Kubernetes manifests
│   ├── patient-service/            # Patient registration + vitals
│   ├── shared/                     # audit.ts, FHIR mappers, SSM loader
│   ├── ws-authorizer/              # Lambda JWT auth for WebSocket
│   ├── verify_consolidation.js     # Cross-service data integrity check
│   └── verify_health.js            # Health check runner
│
├── environments/                   # Per-environment config (staging/prod)
├── legacy_lambdas/                 # Archived V1 Lambda functions (reference)
├── migration_app/                  # V1 → V2 data migration scripts
├── modules/                        # Shared Terraform modules
│
├── deploy_azure.sh                 # Azure Container Apps deployment
├── deploy_booking.sh               # Booking service deployment
├── deploy_communication.sh         # Communication service deployment
├── deploy_doctor_global.sh         # Doctor service (multi-region)
├── deploy_gcp.sh                   # GCP Cloud Run deployment
├── deploy_patient_global.sh        # Patient service (multi-region)
│
├── docker-compose.yml              # Local multi-service orchestration
├── aks.kubeconfig                  # Azure Kubernetes config
├── eks.kubeconfig                  # AWS Kubernetes config
├── cloudflare-connector.yaml       # Cloudflare Tunnel (Zero-Trust ingress)
└── aks-bridge-policy.json          # AKS network bridge policy
```

---

## Tech Stack

### Frontend
| Technology | Usage |
|-----------|-------|
| React.js + Vite | Web application (SPA) |
| TypeScript | Full type safety |
| Tailwind CSS | UI styling |
| Framer Motion | Animations |
| Capacitor | iOS/Android mobile wrapper |
| Firebase Hosting | Web deployment (CDN) |
| Recharts | Analytics dashboards |
| AWS Amplify SDK | Cognito auth integration |

### Backend
| Technology | Usage |
|-----------|-------|
| Node.js + Express | All microservices |
| TypeScript | Full type safety |
| Docker + Multi-stage builds | Containerization |
| WebSocket + Socket.io | Real-time communication |
| REST APIs | Service-to-service communication |
| Python | Analytics scripts |

### Infrastructure & DevOps
| Technology | Usage |
|-----------|-------|
| Kubernetes (AKS + EKS) | Active-active container orchestration |
| Terraform | Infrastructure as Code |
| GitHub Actions | CI/CD pipeline |
| Cloudflare Tunnels | Zero-Trust public ingress (no open ports) |
| Prometheus + Grafana | Metrics and dashboards |
| Alertmanager → Slack | Automated incident alerts |
| Docker Compose | Local development orchestration |

### AI & Machine Learning
| Service | Usage |
|---------|-------|
| AWS Rekognition | Biometric face match (Selfie vs Government ID) |
| AWS Textract | AI diploma OCR for doctor credentialing |
| AWS Comprehend Medical | FHIR term extraction from symptoms |
| AWS Bedrock (Claude 3.5) | Primary AI consultation engine |
| GCP Vertex AI (Gemini 2.5) | Secondary AI (circuit breaker fallback) |
| Azure OpenAI (GPT-4) | Tertiary AI (circuit breaker fallback) |
| Amazon Transcribe Medical | Voice-to-text for consultations |
| Amazon Chime SDK | Video consultation infrastructure |
| AWS IoT Core (MQTT) | Real-time wearable vitals ingestion |

---

## Compliance

MediConnect V2 has undergone a **forensic compliance audit** across all backend services.

### ✅ HIPAA 2026 — PASSED

| Control | Evidence |
|---------|---------|
| Zero-Trust Identity | `auth.middleware.ts` — RS256 JWT verified against AWS Cognito JWKS. `patientId` extracted from verified token only — spoofing is mathematically impossible |
| PHI/PII Masking | `logger.ts` — recursive scrubber strips SSN, email, passwords before CloudWatch |
| Immutable Audit Trail | `shared/audit.ts` — UUID-stamped `writeAuditLog` on every clinical action capturing Actor ID, IP, Region, Timestamp |
| Encryption at Rest | AWS KMS RSA-256 key signing on all e-prescriptions |
| Minimum Necessary | RBAC enforced — doctors cannot access other doctors' patients |

### ✅ GDPR / Schrems II — PASSED

| Control | Evidence |
|---------|---------|
| Data Residency | EU data pinned to `eu-central-1` and `europe-west`. Cross-border flow physically blocked at service level |
| Right to Access | Dedicated patient portal for personal medical history only |
| Right to Erasure | S3 lifecycle policies auto-delete ID verification images post-processing |
| Data Minimisation | Only verified JWT `sub` used as identity — no unnecessary PII in request bodies |

### ✅ HL7 FHIR R4 — PASSED (90% Structural)

| Resource | Mapping |
|----------|---------|
| `Patient` | `patient.controller.ts` → FHIR R4 `Patient` resource with `telecom`, `birthDate` |
| `Practitioner` | `doctor.controller.ts` → FHIR R4 `Practitioner` resource |
| `Appointment` | `booking.controller.ts` → FHIR R4 `Appointment` resource |
| `ImagingReport` | `imaging.controller.ts` → FHIR `ImagingReport` mapping |
| `Observation` | Heart rate readings → LOINC code `8867-4` in FHIR `Bundle` |

---

## Cost Model

### Legacy Architecture V1 (Always-On)
| Service | Monthly Cost |
|---------|-------------|
| AWS EC2 (LB + Servers) | $75.00 |
| AWS RDS PostgreSQL | $45.00 |
| AWS ElastiCache Redis | $35.00 |
| AWS NAT Gateway | $35.00 |
| AWS Secrets Manager | $2.00 |
| Azure AI Services (Idle) | $100.00 |
| **TOTAL** | **~$292/month** |

### Architecture V2 (Zero-Cost Idle)
| Service | Monthly Cost |
|---------|-------------|
| GCP Cloud Run (scale to zero) | $0.00 |
| GCP Cloud SQL (auto-pause) | $0.00 |
| Azure Container Apps (scale to zero) | $0.00 |
| AWS DynamoDB (on-demand) | $0.00 |
| AWS Cognito (< 50k MAU) | $0.00 |
| AWS SSM Parameter Store | $0.00 |
| AWS KMS (prescription signing) | $1.00 |
| **TOTAL (IDLE)** | **~$1/month** |

> 💡 You only pay when real users are actively using the platform.

---

## CI/CD & Deployment

### GitHub Actions Pipeline (`.github/workflows/deploy.yml`)

```
Git Push → main
    │
    ├── Lint & Type Check (tsc)
    ├── npm audit (0 vulnerabilities gate)
    ├── Unit Tests
    │
    ├── Build Docker Images (multi-stage)
    │
    ├── Deploy to GCP Cloud Run  (patient-service)
    ├── Deploy to Azure Container Apps  (doctor, booking, communication)
    └── Health Check Verification
```

### Manual Deployment Scripts

```bash
# Deploy all services
./deploy_patient_global.sh      # Patient service → GCP (multi-region)
./deploy_doctor_global.sh       # Doctor service → Azure (multi-region)
./deploy_booking.sh             # Booking service → Azure
./deploy_communication.sh       # Communication service → Azure
./deploy_gcp.sh                 # GCP infrastructure
./deploy_azure.sh               # Azure infrastructure
```

### Kubernetes (Production)
- **AKS** (Azure East US) — primary cluster
- **EKS** (AWS eu-central-1) — active-active secondary
- HPA configured: scales on CPU/Memory > 70%
- PDB configured: minimum 2 replicas always running
- Network Policies: Default-Deny, namespace isolation
- Cloudflare Tunnels: zero open inbound ports

---

## Security

| Layer | Implementation |
|-------|---------------|
| **Identity** | AWS Cognito RS256 JWT — verified on every request via JWKS endpoint |
| **Secrets** | AWS SSM Parameter Store — no secrets in code or environment files |
| **Network** | Cloudflare Tunnels — no public inbound ports on any cluster |
| **Transport** | TLS 1.2+ enforced on all cross-cloud service communication |
| **API** | `helmet` (CSP + HSTS) + `express-rate-limit` (100 req/15min) |
| **Cryptography** | AWS KMS RSA-256 for e-prescription digital signatures |
| **Container** | OIDC Workload Identity — no static AWS/GCP keys in containers |
| **Kubernetes** | Namespace isolation Network Policies — staging cannot reach production |
| **Payments** | Stripe Webhooks only — client cannot fake payment confirmation |
| **IDOR** | All resources verified against JWT `sub` — ownership enforced server-side |

---

## Author

**Zahidul Islam**
Hybrid Cloud Architect · Full Stack Engineer · HealthTech Specialist

> *"I build systems that are secure by architecture, compliant by default, and cost-optimized to the penny."*

| | |
|--|--|
| 🌐 Portfolio | [zahidul-islam.vercel.app](https://zahidul-islam.vercel.app) |
| 💼 GitHub | [github.com/Zahidulislam2222](https://github.com/Zahidulislam2222) |
| 📧 Email | muhammadzahidulislam2222@gmail.com |
| 📍 Location | Dhaka, Bangladesh (Remote) |

**Professional note:** I take on only ethical projects consistent with my values. I do not work on interest-based finance, gambling, adult content, or any activity that conflicts with Islamic principles.

---

<div align="center">

**MediConnect V2** — Built with precision. Secured by design. Compliant by default.

*© 2026 Zahidul Islam. All rights reserved.*

</div>
