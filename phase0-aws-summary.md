# Phase 0: AWS Cloud Discovery Summary

**Account:** 950110266426 (terraform.admin)
**Regions:** us-east-1, eu-central-1 (Frankfurt)
**Date:** 2026-04-05

---

## Resource Inventory

| Resource Type | us-east-1 | eu-central-1 | Total |
|---------------|-----------|---------------|-------|
| DynamoDB Tables | 23 | 23 | 46 |
| S3 Buckets | (global) | — | 18 |
| IAM Roles | (global) | — | 44 mediconnect-* |
| Cognito User Pools | 1 (us-east-1_fUsIfc7kL) | 1 (eu-central-1_5Fc7eFLB5) | 2 |
| KMS Keys (customer) | 1 (496d121c…) | 1 (07cb3935…) | 2 |
| SQS Queues | 1 (mediconnect-dlq) | 0 | 1 |
| SNS Topics | 6 | 1 | 7 |
| Lambda Functions | 5 | 5 | 10 |
| API Gateway (WebSocket) | 1 (mediconnect-ws-chat) | 1 | 2 |
| API Gateway (REST) | 0 | 0 | 0 |
| ECR Repositories | 1 (migration-job) | 4 (doctor, comm, patient, booking) | 5 |
| ECS Clusters | 1 (migration-cluster) | 0 | 1 |
| CloudWatch Alarms | 2 billing + custom | — | varies |
| SSM Parameters | ~25 /mediconnect/* | — | ~25 |
| SES Identities | 2 email addresses | 0 | 2 |
| EventBridge Rules | 1 (stop-recording) | 2 (stop-recording + AutoScaling) | 3 |
| CloudFront Distributions | 1 (mediconnect-frontend-v1 origin) | — | 1 |
| IoT Core | 1 thing (mediconnect-wearable) + endpoint | — | 1 |
| Cognito Identity Pools | 1 (MediconnectIdentityPoolUS) | 1 (MediconnectIdentityPoolEU) | 2 |
| Security Groups | 2 (migration-sg, rds-sg-v2) | 3 (EKS cluster SGs) | 5 |
| DynamoDB Streams | 3 (appointments, patients, prescriptions) | 1 (appointments) | 4 |

**Total unique AWS resources: ~200+**

---

## DynamoDB Tables (23 per region, identical in both)

| Table | PITR | Deletion Protection | Billing |
|-------|------|---------------------|---------|
| mediconnect-appointments | ENABLED | false | PAY_PER_REQUEST |
| mediconnect-audit-logs | ENABLED | false | PAY_PER_REQUEST |
| mediconnect-billing-audit | DISABLED | false | PAY_PER_REQUEST |
| mediconnect-booking-locks | DISABLED | false | PAY_PER_REQUEST |
| mediconnect-chat-connections | DISABLED | false | PAY_PER_REQUEST |
| mediconnect-chat-history | DISABLED | false | PAY_PER_REQUEST |
| mediconnect-clinical-notes | DISABLED | false | PAY_PER_REQUEST |
| mediconnect-content-cache | DISABLED | false | PAY_PER_REQUEST |
| mediconnect-doctor-schedules | DISABLED | false | PAY_PER_REQUEST |
| mediconnect-doctors | DISABLED | false | PAY_PER_REQUEST |
| mediconnect-drug-interactions | DISABLED | false | PAY_PER_REQUEST |
| mediconnect-graph-data | DISABLED | false | PAY_PER_REQUEST |
| mediconnect-health-records | DISABLED | false | PAY_PER_REQUEST |
| mediconnect-iot-vitals | ENABLED | false | PAY_PER_REQUEST |
| mediconnect-knowledge-base | DISABLED | false | PAY_PER_REQUEST |
| mediconnect-medical-records | DISABLED | false | PAY_PER_REQUEST |
| mediconnect-patients | ENABLED | false | PAY_PER_REQUEST |
| mediconnect-pharmacy-inventory | DISABLED | false | PAY_PER_REQUEST |
| mediconnect-predictions | DISABLED | false | PAY_PER_REQUEST |
| mediconnect-prescriptions | DISABLED | false | PAY_PER_REQUEST |
| mediconnect-symptom-logs | DISABLED | false | PAY_PER_REQUEST |
| mediconnect-transactions | DISABLED | false | PAY_PER_REQUEST |
| mediconnect-video-sessions | DISABLED | false | PAY_PER_REQUEST |

### DynamoDB Gap Analysis

**Tables in cloud but NOT in CLAUDE.md (7 surprise tables):**
- mediconnect-billing-audit
- mediconnect-clinical-notes
- mediconnect-content-cache
- mediconnect-doctor-schedules
- mediconnect-medical-records
- mediconnect-predictions
- mediconnect-symptom-logs

**Tables referenced in code but NOT in cloud (21 missing tables):**
- mediconnect-allergies
- mediconnect-immunizations
- mediconnect-emergency-access
- mediconnect-lab-orders
- mediconnect-referrals
- mediconnect-med-reconciliations
- mediconnect-care-plans
- mediconnect-mpi-links
- mediconnect-bulk-exports
- mediconnect-sdoh-assessments
- mediconnect-eligibility-checks
- mediconnect-prior-auth
- mediconnect-reminders
- mediconnect-bluebutton-connections
- mediconnect-ecr-reports
- mediconnect-elr-reports
- mediconnect-consent-ledger
- mediconnect-hl7-messages
- mediconnect-staff-shifts
- mediconnect-staff-tasks
- mediconnect-staff-announcements

---

## S3 Buckets (18 total)

| Bucket | Region | Versioning | Encryption | Public Block |
|--------|--------|------------|------------|--------------|
| mediconnect-audit-logs-950110266426 | us-east-1 | Enabled | AES256 | ALL ON |
| mediconnect-audit-logs-950110266426-dr | eu-central-1 | Enabled | AES256 | ALL ON |
| mediconnect-cicd-950110266426 | us-east-1 | Enabled | AES256 | ALL ON |
| mediconnect-consultation-files | us-east-1 | DISABLED | AES256 | ALL ON |
| mediconnect-consultation-recordings | us-east-1 | DISABLED | AES256 | ALL ON |
| mediconnect-consultation-recordings-eu | eu-central-1 | Enabled | AES256 | ALL ON |
| mediconnect-datalake-950110266426 | us-east-1 | DISABLED | AES256 | ALL ON |
| mediconnect-doctor-data | us-east-1 | DISABLED | AES256 | ALL ON |
| mediconnect-doctor-data-eu | eu-central-1 | DISABLED | AES256 | ALL ON |
| mediconnect-ehr-records | us-east-1 | DISABLED | AES256 | ALL ON |
| mediconnect-ehr-records-eu | eu-central-1 | Enabled | AES256 | ALL ON |
| mediconnect-media-assets | us-east-1 | DISABLED | AES256 | ALL ON |
| mediconnect-medical-images | us-east-1 | DISABLED | AES256 | ALL ON |
| mediconnect-medical-images-eu | eu-central-1 | DISABLED | AES256 | ALL ON |
| mediconnect-patient-data | us-east-1 | DISABLED | AES256 | 1 RULE OFF |
| mediconnect-patient-data-eu | eu-central-1 | DISABLED | AES256 | ALL ON |
| mediconnect-prescriptions | us-east-1 | DISABLED | AES256 | ALL ON |
| mediconnect-prescriptions-eu | eu-central-1 | Enabled | AES256 | ALL ON |

---

## Lambda Functions (10 total)

| Function | us-east-1 | eu-central-1 |
|----------|-----------|---------------|
| mediconnect-cognito-triggers | YES | YES |
| mediconnect-ws-authorizer | YES | YES |
| mediconnect-failover-proxy | YES | YES |
| mediconnect-cleanup-recordings | YES | YES |
| mediconnect-auto-group-us | YES | — |
| mediconnect-auto-group-eu | — | YES |

---

## SNS Topics (7 total)

| Topic | Region |
|-------|--------|
| mediconnect-appointments | us-east-1 |
| mediconnect-high-risk-alerts | us-east-1 |
| mediconnect-ops-alerts | us-east-1 |
| mediconnect-pharmacy-alerts | us-east-1 |
| mediconnect-prescription-alerts | us-east-1 |
| billing-alert | us-east-1 |
| mediconnect-high-risk-alerts-eu | eu-central-1 |

---

## SSM Parameters (~25 /mediconnect/*)

| Parameter | Type |
|-----------|------|
| /mediconnect/prod/cognito/client_id_doctor | String |
| /mediconnect/prod/cognito/client_id_eu_doctor | String |
| /mediconnect/prod/cognito/client_id_eu_patient | String |
| /mediconnect/prod/cognito/client_id_patient | String |
| /mediconnect/prod/cognito/user_pool_id | String |
| /mediconnect/prod/cognito/user_pool_id_eu | String |
| /mediconnect/prod/db/doctor_table | String |
| /mediconnect/prod/db/patient_table | String |
| /mediconnect/prod/db/master_password | SecureString (in TF) |
| /mediconnect/prod/google/client_id | String |
| /mediconnect/prod/google/client_secret | SecureString |
| /mediconnect/prod/kms/signing_key_id | String |
| /mediconnect/prod/mqtt/endpoint | String |
| /mediconnect/prod/s3/doctor_identity_bucket | String |
| /mediconnect/prod/s3/patient_identity_bucket | String |
| /mediconnect/prod/sns/topic_arn_eu | String |
| /mediconnect/prod/sns/topic_arn_us | String |
| /mediconnect/prod/stripe/secret_key | SecureString |
| /mediconnect/stripe/keys | SecureString |
| /mediconnect/stripe/webhook_secret | SecureString |
| /mediconnect/prod/azure/cosmos/endpoint | String (in TF) |
| /mediconnect/prod/azure/cosmos/primary_key | SecureString (in TF) |
| /mediconnect/prod/gcp/sql/connection_name | String (in TF) |

---

## ECR Repositories (5 total)

| Repository | Region | Scan on Push | Tag Mutability |
|------------|--------|-------------|----------------|
| mediconnect-migration-job | us-east-1 | YES | MUTABLE |
| doctor-service | eu-central-1 | NO | MUTABLE |
| communication-service | eu-central-1 | NO | MUTABLE |
| patient-service | eu-central-1 | NO | MUTABLE |
| booking-service | eu-central-1 | NO | MUTABLE |

---

## API Gateway (WebSocket)

| API | Region | Endpoint |
|-----|--------|----------|
| mediconnect-ws-chat | us-east-1 | wss://03n2vxsh7i.execute-api.us-east-1.amazonaws.com |
| mediconnect-ws-chat | eu-central-1 | wss://n37uhok3d7.execute-api.eu-central-1.amazonaws.com |

---

## What Terraform Currently Manages (~5%)

Only 4 modules, all in us-east-1:
1. **aws_ssm_parameter** x4 (GCP SQL conn, DB password, Azure Cosmos endpoint + key)
2. **aws_ecr_repository** (mediconnect-migration-job)
3. **aws_ecs_cluster** (mediconnect-migration-cluster)
4. **aws_ecs_task_definition** + **aws_iam_role** + **aws_security_group** (migration job)

Everything else = manually created in console, NOT in Terraform.

---

## COMPLIANCE FINDINGS (for Phase 2 hardening)

### CRITICAL
1. **DynamoDB deletion protection: ALL tables = false** (46 tables unprotected)
2. **PITR disabled on 19/23 tables** (only appointments, audit-logs, iot-vitals, patients have it)
3. **prescriptions, transactions, doctors, health-records — NO PITR** (data loss risk for PHI)
4. **IAM: multiple policies with Resource="*"** (wildcard access)
5. **21 tables referenced in code don't exist in DynamoDB** (app will crash on those features)

### HIGH
6. **S3 versioning disabled on 12/18 buckets** (including patient-data, doctor-data, prescriptions, medical-images)
7. **S3 encryption is AES256 (SSE-S3) not KMS** — fine for most, but PHI buckets should use KMS
8. **mediconnect-patient-data has 1 public access block rule OFF** (BlockPublicAcls=false)
9. **ECR: 4/5 repos have scan-on-push disabled + all MUTABLE tags**
10. **SQS: only 1 DLQ exists (us-east-1), no queues in eu-central-1**
11. **SNS: only 1 topic in eu-central-1** (vs 6 in us-east-1) — EU alerting gap

### MEDIUM
12. **CloudWatch log retention: many log groups at 1 day** (HIPAA requires longer for audit)
13. **SES: only 2 personal Gmail addresses verified** (no domain verification)
14. **No resource tags on any resource** (cost allocation, compliance tagging missing)
15. **S3: no lifecycle policies found** (storage cost growth uncapped)
16. **DynamoDB Streams inconsistent** — us-east-1 has 3 streams (appointments, patients, prescriptions), eu-central-1 has only 1 (appointments)
17. **KMS key alias** — us-east-1 key is `alias/mediconnect-prescription-signer` (only for signing, no general PHI encryption key found)

---

## Next Steps: Phase 1 (Write Terraform to Match)

Priority order for Phase 1 (import-first, zero-change):
1. DynamoDB tables (23 x 2 regions = 46 imports)
2. S3 buckets (18 imports + configs)
3. Cognito user pools + clients + identity pools (2+2 pools)
4. KMS keys (2 keys)
5. Lambda functions (10 functions)
6. IAM roles (44 roles)
7. SNS topics (7 topics)
8. SQS queues (1 queue)
9. API Gateway WebSocket (2 APIs)
10. SSM parameters (~25, 4 already in TF)
11. ECR repos (5, 1 already in TF)
12. ECS cluster (1, already in TF)
13. CloudWatch alarms (5) + log groups
14. EventBridge rules (3)
15. CloudFront distribution (1)
16. IoT Core (1 thing + endpoint)
17. Security Groups (5)
18. SES identities (2)

Raw data: `phase0-aws-discovery-results.md`
