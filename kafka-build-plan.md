# Kafka Event Streaming — Build Plan

**Status:** PLAN READY — waiting for user go-ahead
**Model:** Apache Kafka (Docker local) + AWS MSK Serverless (production)
**Decision Date:** 2026-04-06
**Codebase Audit:** COMPLETE — 30+ events, 7 topics, 5 missing events identified

---

## Architecture Decision

- **Local Dev:** Apache Kafka 3.9 in Docker (KRaft mode — no ZooKeeper)
- **Production:** AWS MSK Serverless (US + EU regions)
- **SQS:** KEPT for simple job queues (reminders, GDPR erasure, cleanup, DLQ)
- **Migration Strategy:** Feature-flagged adapter in `shared/event-bus.ts` — zero changes to services
- **Client Library:** `kafkajs` (Node.js), `aiokafka` (Python)

## Security & Compliance Requirements

| Requirement | Implementation |
|-------------|---------------|
| **HIPAA** | MSK is HIPAA-eligible under AWS BAA. Encryption at rest (AES-256) + in transit (TLS 1.2). IAM auth. |
| **GDPR** | Separate MSK cluster per region. US events in us-east-1, EU events in eu-central-1. No cross-region data flow. |
| **SOC 2** | MSK covered under AWS SOC 2 Type II. Access logging via CloudWatch. |
| **PCI-DSS** | Payment events encrypted. IAM restricts who can read payment topics. |
| **Data Residency** | EU patient events NEVER leave eu-central-1. Enforced by separate Kafka clusters. |
| **Audit Trail** | Kafka retains events for configurable period (7 days default, audit topic = 365 days). |
| **PHI in Events** | Events contain IDs only (patientId, appointmentId). NO raw PHI in Kafka messages. PHI stays in DynamoDB. |
| **Access Control** | IAM policies per topic — services can only read/write topics they need. |
| **Encryption** | At rest: AWS-managed KMS. In transit: TLS 1.2 enforced. Cannot disable. |

## What Stays Synchronous (NEVER Move to Kafka)

These are clinical safety gates — async would endanger patients:

1. **Allergy cross-check** (prescription.controller.ts) — blocks on allergy match
2. **Drug interaction check** (prescription.controller.ts) — blocks on MAJOR interaction
3. **Med reconciliation** (prescription.controller.ts) — blocks on critical conflicts

## What Stays on SQS (Simple Job Queues)

| Queue | Reason |
|-------|--------|
| Appointment reminders | One consumer, send once, delete |
| GDPR erasure tasks | Process once, must not duplicate |
| Notification delivery trigger | Fire-and-forget to SES |
| DLQ (all categories) | Failed message retry — SQS native feature |
| Cleanup jobs | One-time background tasks |

## Kafka Topics (7)

| Topic | Retention | Partitions | Producers | Consumers |
|-------|-----------|------------|-----------|-----------|
| `mediconnect.appointments` | 7 days | 3 | booking-service | analytics, audit, notification, doctor-dashboard, calendar, payout |
| `mediconnect.clinical` | 7 days | 3 | doctor-service | audit, analytics, public-health, EHR, pharmacy |
| `mediconnect.vitals` | 3 days | 6 | patient-service (IoT) | alerts, analytics, doctor-dashboard, BigQuery |
| `mediconnect.payments` | 30 days | 3 | booking-service | analytics, payout, fraud-detection, notification, audit |
| `mediconnect.patients` | 7 days | 3 | patient-service | audit, analytics, welcome-email, MPI |
| `mediconnect.audit` | 365 days | 3 | all services | compliance-scanner, SIEM, archival, analytics |
| `mediconnect.subscriptions` | 30 days | 2 | booking-service | analytics, notification, admin-dashboard |

## Missing Events to Add (Found in Audit)

| Event | Service | Where to Add |
|-------|---------|-------------|
| `VIDEO_CALL_STARTED` / `VIDEO_CALL_ENDED` | communication-service | chat.controller.ts |
| `STAFF_SHIFT_CHANGED` | staff-service | staff.controller.ts |
| `DOCTOR_RATE_CHANGED` | doctor-service | tier.controller.ts |
| `DICOM_STUDY_UPLOADED` | dicom-service | upload router |
| `ELIGIBILITY_CHECKED` | booking-service | eligibility.controller.ts |

---

## Build Order (12 Steps)

Each step is independently committable. If session dies, next agent reads this file and resumes from the last completed step. Check the `## Progress Tracker` at the bottom of this file.

---

### Step 1: Docker Compose — Local Kafka + Kafka UI

**Files:**
- `docker-compose.yml` (MODIFY — add kafka services)

**What to build:**
- Apache Kafka 3.9 broker in KRaft mode (no ZooKeeper)
- Kafka UI (provectus/kafka-ui) for debugging on port 8090
- Use `--profile kafka` so it doesn't start by default
- Network: share existing docker-compose network

**Docker services to add:**
```yaml
kafka:
  image: apache/kafka:3.9.0
  profiles: ["kafka"]
  ports: ["9092:9092"]
  environment:
    KAFKA_NODE_ID: 1
    KAFKA_PROCESS_ROLES: broker,controller
    KAFKA_LISTENERS: PLAINTEXT://0.0.0.0:9092,CONTROLLER://0.0.0.0:9093
    KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:9092
    KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
    KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT
    KAFKA_CONTROLLER_QUORUM_VOTERS: 1@kafka:9093
    KAFKA_LOG_DIRS: /tmp/kraft-combined-logs
    CLUSTER_ID: mediconnect-kafka-cluster-001

kafka-ui:
  image: provectus/kafka-ui:latest
  profiles: ["kafka"]
  ports: ["8090:8080"]
  environment:
    KAFKA_CLUSTERS_0_NAME: mediconnect-local
    KAFKA_CLUSTERS_0_BOOTSTRAPSERVERS: kafka:9092
  depends_on: [kafka]
```

**Run with:** `docker compose --profile kafka up kafka kafka-ui`

**Commit message:** `infra(kafka): add Kafka broker + UI to docker-compose for local development`

---

### Step 2: Terraform — MSK Serverless Clusters (US + EU)

**Files:**
- `environments/prod/kafka.tf` (NEW)
- `environments/prod/security_groups.tf` (MODIFY — add Kafka SG)

**What to build:**
- `aws_msk_serverless_cluster` for US (us-east-1) and EU (eu-central-1)
- IAM authentication (no passwords — uses existing service IAM roles)
- VPC config with existing subnets
- Security group allowing Kafka port 9098 (MSK Serverless uses 9098 for IAM auth)
- CloudWatch logging enabled

**Compliance:**
- HIPAA: MSK is on AWS HIPAA-eligible services list
- GDPR: Separate cluster per region — EU data stays in eu-central-1
- Encryption: automatic AES-256 at rest + TLS 1.2 in transit (cannot disable)

**Commit message:** `infra(kafka): add MSK Serverless clusters for US + EU with IAM auth`

---

### Step 3: Shared Kafka Client (kafkajs)

**Files:**
- `backend_v2/shared/kafka.ts` (NEW)
- `backend_v2/package.json` (MODIFY — add kafkajs dependency)

**What to build:**
- Kafka client factory: `getKafkaProducer(region)` / `getKafkaConsumer(region, groupId)`
- Connection config: local (localhost:9092) vs MSK (IAM auth via aws-msk-iam-sasl-signer-js)
- TLS config for production (mandatory on MSK)
- Graceful shutdown handler (disconnect on SIGTERM)
- Health check: `isKafkaConnected()`
- Feature flag: `KAFKA_ENABLED` env var (default: false — SQS fallback)

**Security:**
- MSK IAM auth: uses `aws-msk-iam-sasl-signer-js` for SASL/OAUTHBEARER
- No passwords stored anywhere
- TLS enforced in production
- Connection retry with backoff (3 attempts, then fallback to SQS)

**Dependencies to add:**
```json
"kafkajs": "^2.2.4",
"aws-msk-iam-sasl-signer-js": "^1.0.0"
```

**Commit message:** `feat(kafka): add shared Kafka client with IAM auth and SQS fallback`

---

### Step 4: Kafka Adapter in Event Bus (Feature-Flagged)

**Files:**
- `backend_v2/shared/event-bus.ts` (MODIFY)

**What to build:**
- Add Kafka producer path alongside existing SQS path
- Feature flag: `process.env.KAFKA_ENABLED === 'true'`
- When enabled: `publishEvent()` → Kafka topic (mapped from EventType)
- When disabled: `publishEvent()` → SQS (existing code, unchanged)
- Dual-write option: `KAFKA_DUAL_WRITE === 'true'` → write to BOTH (for migration)
- Topic mapping: EventType enum → Kafka topic name

**Topic mapping:**
```typescript
const TOPIC_MAP: Record<string, string> = {
  'audit.log': 'mediconnect.audit',
  'security.breach_alert': 'mediconnect.audit',
  'security.phi_access': 'mediconnect.audit',
  'clinical.prescription_issued': 'mediconnect.clinical',
  'clinical.prescription_dispensed': 'mediconnect.clinical',
  'clinical.prescription_cancelled': 'mediconnect.clinical',
  'clinical.drug_interaction': 'mediconnect.clinical',
  'clinical.lab_result': 'mediconnect.clinical',
  'clinical.vital_alert': 'mediconnect.vitals',
  'appointment.booked': 'mediconnect.appointments',
  'appointment.cancelled': 'mediconnect.appointments',
  'appointment.completed': 'mediconnect.appointments',
  'appointment.reminder': 'mediconnect.appointments',
  'patient.registered': 'mediconnect.patients',
  'patient.updated': 'mediconnect.patients',
  'patient.deleted': 'mediconnect.patients',
  'consent.updated': 'mediconnect.patients',
  'subscription.created': 'mediconnect.subscriptions',
  'subscription.cancelled': 'mediconnect.subscriptions',
  'subscription.renewed': 'mediconnect.subscriptions',
  'subscription.payment_failed': 'mediconnect.payments',
  'subscription.dispute': 'mediconnect.payments',
  'payout.executed': 'mediconnect.payments',
};
```

**Critical: Zero changes to any service code.** Only `shared/event-bus.ts` changes.

**Fallback behavior:**
```
if KAFKA_ENABLED=true:
  try Kafka → success → done
  catch → log error → fallback to SQS → done
  
if KAFKA_ENABLED=false:
  SQS only (current behavior, unchanged)
```

**Commit message:** `feat(kafka): add feature-flagged Kafka adapter to event bus with SQS fallback`

---

### Step 5: Kafka Topic Auto-Creation Script

**Files:**
- `backend_v2/scripts/kafka-setup.ts` (NEW)

**What to build:**
- Script to create all 7 topics with correct partitions and retention
- Runs once on first deploy or `npx tsx scripts/kafka-setup.ts`
- Idempotent: safe to run multiple times (skips existing topics)
- Configures retention per topic (audit=365d, vitals=3d, default=7d)

**Topic configs:**
```
mediconnect.appointments: 3 partitions, 7 days retention
mediconnect.clinical:     3 partitions, 7 days retention
mediconnect.vitals:       6 partitions, 3 days retention (high volume)
mediconnect.payments:     3 partitions, 30 days retention
mediconnect.patients:     3 partitions, 7 days retention
mediconnect.audit:        3 partitions, 365 days retention (compliance)
mediconnect.subscriptions: 2 partitions, 30 days retention
```

**Commit message:** `feat(kafka): add topic auto-creation script with compliance retention`

---

### Step 6: Add Missing Events (5 new EventTypes)

**Files:**
- `backend_v2/shared/event-bus.ts` (MODIFY — add 5 new EventTypes)
- `backend_v2/communication-service/src/controllers/chat.controller.ts` (MODIFY)
- `backend_v2/staff-service/src/controllers/staff.controller.ts` (MODIFY)
- `backend_v2/doctor-service/src/controllers/tier.controller.ts` (MODIFY)
- `backend_v2/booking-service/src/controllers/eligibility.controller.ts` (MODIFY)
- `backend_v2/admin-service/utils/event_bus.py` (MODIFY — add 5 new types)
- `backend_v2/dicom-service/utils/event_bus.py` (MODIFY — add 5 new types)

**New EventTypes:**
```typescript
VIDEO_CALL_STARTED = "communication.video_started",
VIDEO_CALL_ENDED = "communication.video_ended",
STAFF_SHIFT_CHANGED = "system.staff_shift_changed",
DOCTOR_RATE_CHANGED = "clinical.doctor_rate_changed",
DICOM_STUDY_UPLOADED = "clinical.dicom_uploaded",
ELIGIBILITY_CHECKED = "appointment.eligibility_checked",
```

**Where to add publishEvent() calls:**
- communication-service: after video session created/ended
- staff-service: after shift create/update/delete
- doctor-service/tier.controller.ts: after rate update
- booking-service/eligibility.controller.ts: after eligibility check
- dicom-service: after successful upload (Python: publish_event)

**Commit message:** `feat(kafka): add 6 missing cross-service events for complete streaming coverage`

---

### Step 7: Kafka Consumers — Analytics Pipeline

**Files:**
- `backend_v2/shared/kafka-consumers.ts` (NEW)

**What to build:**
- Consumer group: `mediconnect-analytics`
- Subscribes to: appointments, clinical, payments, subscriptions, patients
- Routes events to BigQuery streaming functions (existing pushToBigQuery)
- Replaces direct BigQuery calls in booking.controller.ts and patient.controller.ts
- Dead-letter handling: failed events go to `mediconnect.dlq` topic
- Idempotent processing: store processed eventId in DynamoDB

**Consumer logic:**
```
Read from mediconnect.appointments
  → if appointment.booked: pushAppointmentToBigQuery()
  → if appointment.completed: pushRevenueToBigQuery()
  
Read from mediconnect.vitals
  → pushVitalToBigQuery()
  
Read from mediconnect.payments
  → pushRevenueToBigQuery()
```

**Commit message:** `feat(kafka): add analytics consumer for BigQuery streaming pipeline`

---

### Step 8: Kafka Consumers — Notification Pipeline

**Files:**
- `backend_v2/shared/kafka-notification-consumer.ts` (NEW)

**What to build:**
- Consumer group: `mediconnect-notifications`
- Subscribes to: appointments, clinical, subscriptions, payments
- Routes to existing sendNotification() function
- Replaces direct sendNotification() calls scattered across controllers

**Consumer logic:**
```
Read from mediconnect.appointments
  → if appointment.booked: sendNotification(BOOKING_CONFIRMATION)
  → if appointment.cancelled: sendNotification(BOOKING_CANCELLATION)

Read from mediconnect.clinical
  → if prescription_issued: sendNotification(PRESCRIPTION_ISSUED)
  → if prescription_cancelled: sendNotification(PRESCRIPTION_CANCELLED)

Read from mediconnect.payments
  → if payment_failed: sendNotification(PAYMENT_FAILED)
  → if payment_success: sendNotification(PAYMENT_SUCCESS)
```

**Commit message:** `feat(kafka): add notification consumer for centralized event-driven notifications`

---

### Step 9: Kafka Health Check + Monitoring

**Files:**
- `backend_v2/shared/kafka.ts` (MODIFY — add health check)
- `backend_v2/booking-service/src/controllers/booking.controller.ts` (already has /health)

**What to build:**
- `isKafkaConnected()` function for /health and /ready endpoints
- CloudWatch metrics: message rate, consumer lag, error count
- Consumer lag alerting: if lag > 1000 messages → log warning
- Dead-letter topic monitoring

**Commit message:** `feat(kafka): add health check and monitoring for Kafka connectivity`

---

### Step 10: Python Kafka Client (Admin + DICOM services)

**Files:**
- `backend_v2/admin-service/utils/kafka_client.py` (NEW)
- `backend_v2/admin-service/utils/event_bus.py` (MODIFY — add Kafka path)
- `backend_v2/dicom-service/utils/kafka_client.py` (NEW)
- `backend_v2/dicom-service/utils/event_bus.py` (MODIFY — add Kafka path)
- `backend_v2/admin-service/requirements.txt` (MODIFY — add aiokafka)
- `backend_v2/dicom-service/requirements.txt` (MODIFY — add aiokafka)

**What to build:**
- Python Kafka client with same feature-flag pattern as Node.js
- `KAFKA_ENABLED` env var check
- MSK IAM auth via `aws-msk-iam-sasl-signer-python`
- Same topic mapping as Node.js
- Fallback to SQS if Kafka unavailable

**Commit message:** `feat(kafka): add Python Kafka client for admin-service and dicom-service`

---

### Step 11: Tests + Verification

**Files:**
- `backend_v2/shared/__tests__/compliance/kafka-integration.test.ts` (NEW)

**What to test:**
- Feature flag OFF → events go to SQS (no Kafka calls)
- Feature flag ON → events go to Kafka topic
- Topic mapping covers ALL EventType values
- Kafka client has TLS config for production
- IAM auth configured (not password-based)
- Audit topic has 365-day retention
- PHI check: event payloads contain IDs only, no raw PHI
- Fallback: Kafka failure → SQS delivery
- All 7 Kafka topics defined
- All 29+ EventTypes have a topic mapping
- Consumer groups defined with proper naming
- Dead-letter topic exists
- Docker Compose has kafka profile
- Terraform has MSK clusters for both US and EU
- Security group allows port 9098

**Also run:**
- `bash verify_app_vs_iac.sh` — must still show 0 FAIL
- All existing tests must still pass (no regressions)

**Commit message:** `test(kafka): add Kafka integration tests covering security and compliance`

---

### Step 12: Update Documentation + Memory + Commit

**Files:**
- `migration-status.yaml` (MODIFY)
- `resource-registry.yaml` (MODIFY — add MSK clusters)
- `CLAUDE.md` (MODIFY — add Kafka section)
- `README.md` (MODIFY — add Kafka to tech stack)
- Memory files (MODIFY)

**What to update:**
- Phase 4 status with Kafka addition
- Resource registry: 2 MSK clusters (US + EU)
- README: Add Kafka to architecture diagram, tech stack, event streaming section
- CLAUDE.md: Add Kafka usage, topic list, consumer groups
- Memory: Full status for next agent

**Commit message:** `docs(kafka): update documentation, README, and migration status`

---

## Progress Tracker

**IMPORTANT: Next agent — check these boxes to know where to resume.**

- [ ] Step 1: Docker Compose (local Kafka)
- [ ] Step 2: Terraform (MSK Serverless US + EU)
- [ ] Step 3: Shared Kafka client (kafkajs + IAM)
- [ ] Step 4: Event bus adapter (feature-flagged)
- [ ] Step 5: Topic auto-creation script
- [ ] Step 6: Missing events (6 new EventTypes)
- [ ] Step 7: Analytics consumer (BigQuery pipeline)
- [ ] Step 8: Notification consumer
- [ ] Step 9: Health check + monitoring
- [ ] Step 10: Python Kafka client (admin + dicom)
- [ ] Step 11: Tests + verification
- [ ] Step 12: Documentation + memory + final commit

## Dependency Graph

```
Step 1 (Docker) ─────────────────────────────────┐
Step 2 (Terraform) ── parallel ──────────────┐    │
Step 3 (Kafka client) ← needs npm install    │    │
  │                                          │    │
Step 4 (Event bus adapter) ← Step 3          │    │
  │                                          │    │
Step 5 (Topic setup) ← Step 3               │    │
  │                                          │    │
Step 6 (Missing events) ← Step 4            │    │
  │                                          │    │
Step 7 (Analytics consumer) ← Step 4, 5     │    │
Step 8 (Notification consumer) ← Step 4, 5  │    │
  │                                          │    │
Step 9 (Health check) ← Step 3              │    │
Step 10 (Python client) ← Step 4 pattern    │    │
  │                                          │    │
Step 11 (Tests) ← ALL previous steps        │    │
Step 12 (Docs) ← ALL previous steps         │    │
```

## Estimated Changes

| Metric | Count |
|--------|-------|
| New files | ~10 |
| Modified files | ~12 |
| New Terraform resources | 2 MSK clusters + 2 security groups |
| New npm dependencies | 2 (kafkajs, aws-msk-iam-sasl-signer-js) |
| New pip dependencies | 2 (aiokafka, aws-msk-iam-sasl-signer-python) |
| New EventTypes | 6 |
| Kafka topics | 7 |
| Consumer groups | 2 (analytics, notifications) |
| New test assertions | ~25 |
| Existing code broken | 0 (feature-flagged, SQS unchanged) |

## Rules for Any Agent Building This

1. **Feature flag everything** — `KAFKA_ENABLED=false` by default. SQS continues working.
2. **Never put PHI in Kafka events** — IDs only (patientId, appointmentId). PHI stays in DynamoDB.
3. **Separate clusters per region** — US events in us-east-1, EU events in eu-central-1. GDPR.
4. **IAM auth only** — no passwords, no SASL/PLAIN. MSK IAM + aws-msk-iam-sasl-signer.
5. **TLS enforced** — cannot disable on MSK Serverless. Local dev uses PLAINTEXT (Docker only).
6. **Audit topic = 365 days retention** — HIPAA requires replayable audit trail.
7. **Clinical safety gates stay synchronous** — allergy, drug interaction, med reconciliation NEVER async.
8. **SQS stays for job queues** — reminders, GDPR erasure, cleanup, DLQ.
9. **Dual-write during migration** — `KAFKA_DUAL_WRITE=true` sends to both Kafka + SQS for safety.
10. **No terraform apply** — user applies manually.
11. **Run verify_app_vs_iac.sh** before and after work.
12. **Update memory** after completing each step.
