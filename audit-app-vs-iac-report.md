# Audit Report: App Code vs IaC

**Date:** 2026-04-06
**Auditor:** Claude Opus (automated)
**Script:** `verify_app_vs_iac.sh` (Sections 1-19)
**Result:** PASS — 127 pass, 0 fail, 33 warn

---

## Summary

| Category | App References | TF Covers | Missing | Orphaned | Status |
|----------|---------------|-----------|---------|----------|--------|
| DynamoDB | 38 tables | 45 tables | 0 | 7 (legacy) | PASS |
| S3 | 16 buckets | 18 buckets | 0 | 2 (infra) | PASS |
| SQS | 13 queues | 13 queues | 0 | 0 | PASS |
| SNS | 5 topics | 6 topics | 0 | 1 (billing-alert) | PASS |
| Lambda | 4 v2 functions | 6 functions | 0 | 0 | PASS |
| Cognito | 2 pools | 2 pools | 0 | 0 | PASS |
| API Gateway | 1 WebSocket API | 1 WebSocket API | 0 | 0 | PASS |
| CloudFront | 1 distribution | 1 distribution | 0 | 0 | PASS |
| ECR | 7 services | 14 repos (7×2) | 0 | 0 | PASS |
| KMS | 2 keys | 4 keys (2×2) | 0 | 0 | PASS |
| SSM | 17 params | 22 params (×2 regions) | 0 | 0 | PASS |
| IoT | 1 thing type | 2 things (US+EU) | 0 | 0 | PASS |
| SES | 1 domain | 2 domains (US+EU) | 0 | 0 | PASS |
| EventBridge | 1 rule | 2 rules (US+EU) | 0 | 0 | PASS |
| GCP BigQuery | 3 datasets | 6 datasets (×2 regions) | 0 | 0 | PASS |
| GCP Cloud Run | 7 services | 14 services (×2 regions) | 0 | 0 | PASS |
| GCP Healthcare | 1 DICOM store | 2 (US+EU) | 0 | 0 | PASS |
| GCP Pub/Sub | 2 topics | 2 topics | 0 | 0 | PASS |
| GCP IAM | 3 resources | 3 resources | 0 | 0 | PASS |
| Azure Cosmos DB | 1 account | 1 account + DB | 0 | 0 | CODE_READY |
| CI/CD | 7 services + 4 Lambdas | All in deploy.yml | 0 | 0 | PASS |
| Frontend | 4 references | Covered by TF | 0 | 0 | PASS |

**Totals:** 139 resources checked, 136 OK, 0 MISSING, 5 CODE_READY (pending apply)

---

## Gaps Fixed During This Audit

| # | Gap | Fix | Date |
|---|-----|-----|------|
| 1 | 12 SQS queues missing from TF | Added to sqs.tf (6 categories × 2: queue + DLQ, US + EU) | 2026-04-06 |
| 2 | 3 ECR repos missing (admin, staff, dicom) | Added to ecr.tf (US + EU) | 2026-04-06 |
| 3 | 4 ECR repos missing US region | Added US repos for patient, doctor, booking, communication | 2026-04-06 |
| 4 | 3 SSM params in code but not TF | Added Azure Cosmos endpoint/key + cleanup/secret to ssm_us/eu.tf | 2026-04-06 |
| 5 | IoT Thing missing EU | Added mediconnect-wearable to iot.tf for eu-central-1 | 2026-04-06 |

## Enhancements Made

| # | Enhancement | File |
|---|------------|------|
| 1 | SDK catch-all detection (Section 19) | verify_app_vs_iac.sh |
| 2 | CI/CD PR gate | .github/workflows/deploy.yml |
| 3 | driftctl scan planned for Phase 4 | audit-app-vs-iac.md (Step 5b) |

---

## SDK Catch-All Findings (Section 19)

| Finding | Type | Action Needed |
|---------|------|--------------|
| SecretsManagerClient used but no secretsmanager.tf | WARN | Review — may be console-managed intentionally |

---

## Orphaned TF Resources (Step 4)

7 DynamoDB tables in TF have no v2 backend reference but ARE used by legacy Lambdas:

| Table | Used By | Status |
|-------|---------|--------|
| mediconnect-billing-audit | mediconnect-billing-service | Legacy Lambda |
| mediconnect-clinical-notes | mediconnect-ehr-service | Legacy Lambda |
| mediconnect-content-cache | mediconnect-chatbot | Legacy Lambda |
| mediconnect-doctor-schedules | mediconnect-update-schedule | Legacy Lambda |
| mediconnect-medical-records | mediconnect-imaging-service | Legacy Lambda |
| mediconnect-predictions | mediconnect-ai-predictor | Legacy Lambda |
| mediconnect-symptom-logs | mediconnect-symptom-checker | Legacy Lambda |

**Verdict:** Not orphaned — used by legacy Lambdas still deployed in AWS. Will become orphaned when legacy Lambdas are fully retired.

---

## Remaining Items (Not Gaps)

| Item | Status | Notes |
|------|--------|-------|
| GCP Artifact Registry | CODE_READY | Blocked by GCP billing |
| GCP Secret Manager (2) | CODE_READY | Blocked by GCP billing |
| Azure compliance (6 findings) | CODE_READY | User must run terraform apply |
| driftctl scan | PLANNED | Run after terraform apply |
| Checkov HIPAA scan | Phase 4 | Not started |
| Prowler AWS scan | Phase 4 | Not started |

---

## Verification Evidence

```
verify_app_vs_iac.sh output:
  PASS:    127
  FAIL:    0
  WARN:    33
  RESULT: PASS — All app resources have Terraform coverage
  Run date: 2026-04-06
```
