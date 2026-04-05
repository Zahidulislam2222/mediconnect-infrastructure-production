# Audit: App Code vs IaC — Comparison Plan

**Purpose:** Verify that every cloud resource the application code references exists in Terraform, and every Terraform resource is actually used by the app.

**Date created:** 2026-04-05
**Status:** NOT STARTED
**Last agent:** (update this when you work on it)

---

## How This Plan Works

This plan is designed so ANY agent can pick it up, even with zero context. Each step has:
- Exact files to read
- Exact patterns to search
- Exact output format
- A checkbox to mark done

**Rules for agents working on this:**
1. Do NOT skip steps or guess answers
2. Read the actual code — do not rely on CLAUDE.md descriptions alone
3. Mark each step done with the date and findings
4. If you run out of context, save progress to this file before stopping
5. Do NOT run `terraform apply` or any command that changes cloud resources

---

## Step 1: Extract ALL resource references from backend code

### 1A: DynamoDB table names

**Sources to check (read each file and grep for table names):**

| # | File/Pattern | What to look for |
|---|-------------|-----------------|
| 1 | `backend_v2/shared/aws-config.ts` | Any table name constants |
| 2 | `backend_v2/patient-service/src/**/*.ts` | `TABLE_*` env vars, `TableName`, hardcoded `mediconnect-*` strings |
| 3 | `backend_v2/doctor-service/src/**/*.ts` | Same |
| 4 | `backend_v2/booking-service/src/**/*.ts` | Same |
| 5 | `backend_v2/communication-service/src/**/*.ts` | Same |
| 6 | `backend_v2/staff-service/src/**/*.ts` | Same |
| 7 | `backend_v2/admin-service/**/*.py` | Same (Python: `os.environ`, hardcoded strings) |
| 8 | `backend_v2/dicom-service/**/*.py` | Same |
| 9 | `legacy_lambdas/*/index.mjs` or `*.js` or `*.py` | Same — each Lambda may reference tables |
| 10 | `CLAUDE.md` (DynamoDB Tables section) | Cross-reference list against code findings |

**Grep patterns:**
```bash
# Find all DynamoDB table references in backend code
grep -rn "mediconnect-" backend_v2/ --include="*.ts" --include="*.py" | grep -v node_modules | grep -v ".d.ts"
grep -rn "TABLE_\|TableName\|DYNAMO_TABLE" backend_v2/ --include="*.ts" --include="*.py" | grep -v node_modules
grep -rn "mediconnect-" legacy_lambdas/ --include="*.mjs" --include="*.js" --include="*.py" | grep -v node_modules
```

**Compare against:** `environments/prod/dynamodb_us.tf` + `environments/prod/dynamodb_eu.tf`

**Output format:**
```
| Table Name | Referenced By | In TF? | Status |
|------------|--------------|--------|--------|
| mediconnect-patients | patient-service, CLAUDE.md | YES | OK |
| mediconnect-xyz | doctor-service | NO | MISSING |
```

**Status:** [ ] NOT STARTED
**Findings:** (agent fills this in)

---

### 1B: S3 bucket names

**Sources to check:**

| # | File/Pattern | What to look for |
|---|-------------|-----------------|
| 1 | `backend_v2/shared/aws-config.ts` | `getRegionalS3Client`, bucket name patterns |
| 2 | All service `src/**/*.ts` files | `Bucket:`, `bucket:`, `BUCKET`, `mediconnect-` with S3 context |
| 3 | `legacy_lambdas/*/` | Same |
| 4 | `backend_v2/shared/audit.ts` | Audit log bucket references |
| 5 | `backend_v2/shared/kms-crypto.ts` | Any S3 references |

**Grep patterns:**
```bash
grep -rn "Bucket.*mediconnect\|mediconnect.*bucket\|S3.*mediconnect" backend_v2/ --include="*.ts" | grep -v node_modules
grep -rn "mediconnect.*bucket\|Bucket.*mediconnect" legacy_lambdas/ --include="*.mjs" --include="*.js" | grep -v node_modules
```

**Compare against:** `environments/prod/s3_us.tf` + `s3_eu.tf` + `s3_dr.tf`

**Output format:** Same table format as 1A

**Status:** [ ] NOT STARTED

---

### 1C: SQS queue names

**Sources to check:**
| # | File/Pattern |
|---|-------------|
| 1 | `backend_v2/shared/event-bus.ts` | Queue URLs, queue names |
| 2 | `backend_v2/admin-service/utils/event_bus.py` | Same (Python) |
| 3 | All services that import event-bus |

**Grep patterns:**
```bash
grep -rn "sqs\|SQS\|QueueUrl\|queue.*mediconnect\|mediconnect.*queue\|mediconnect-dlq" backend_v2/ --include="*.ts" --include="*.py" | grep -v node_modules
```

**Compare against:** `environments/prod/sqs.tf`

**Status:** [ ] NOT STARTED

---

### 1D: SNS topic names

**Sources to check:**
| # | File/Pattern |
|---|-------------|
| 1 | `backend_v2/shared/breach-detection.ts` | SNS alert topics |
| 2 | `backend_v2/shared/notifications.ts` | Notification topics |
| 3 | `backend_v2/booking-service/src/**/reminder.controller.ts` | Reminder SNS |
| 4 | All services |

**Grep patterns:**
```bash
grep -rn "sns\|SNS\|TopicArn\|mediconnect.*topic\|mediconnect.*alert" backend_v2/ --include="*.ts" --include="*.py" | grep -v node_modules
```

**Compare against:** `environments/prod/sns.tf`

**Status:** [ ] NOT STARTED

---

### 1E: Cognito pool references

**Sources to check:**
| # | File/Pattern |
|---|-------------|
| 1 | `backend_v2/shared/` | Auth middleware, JWT verification |
| 2 | `backend_v2/cognito-triggers/index.mjs` | Cognito trigger Lambda |
| 3 | All services' auth middleware |
| 4 | SSM parameters referencing Cognito |

**Grep patterns:**
```bash
grep -rn "UserPoolId\|COGNITO\|cognito\|user.pool" backend_v2/ --include="*.ts" --include="*.mjs" | grep -v node_modules
```

**Compare against:** `environments/prod/cognito_us.tf` + `cognito_eu.tf`

**Status:** [ ] NOT STARTED

---

### 1F: Lambda function names

**Sources to check:**
| # | File/Pattern |
|---|-------------|
| 1 | `environments/prod/lambda_us.tf` + `lambda_eu.tf` | Lambda functions in TF |
| 2 | `legacy_lambdas/` directory listing | Each folder = one Lambda |
| 3 | `backend_v2/cognito-triggers/`, `ws-authorizer/`, `cleanup-recordings/`, `failover-proxy/` | v2 Lambdas |
| 4 | `.github/workflows/deploy.yml` | Lambda deploy targets |

**Comparison:** List every Lambda folder vs every `aws_lambda_function` in TF state.

**Status:** [ ] NOT STARTED

---

### 1G: API Gateway / WebSocket

**Sources to check:**
| # | File/Pattern |
|---|-------------|
| 1 | `backend_v2/communication-service/` | WebSocket event handler |
| 2 | `backend_v2/ws-authorizer/` | WebSocket authorizer |
| 3 | Frontend config (API URLs) |

**Compare against:** `environments/prod/apigateway.tf`

**Status:** [ ] NOT STARTED

---

### 1H: CloudFront / Frontend hosting

**Sources to check:**
| # | File/Pattern |
|---|-------------|
| 1 | `environments/prod/cloudfront.tf` | What TF manages |
| 2 | `mediconnect-hub/` (frontend repo) | What the frontend expects (API URLs, CDN) |
| 3 | `docker-compose.yml` | Frontend service config |

**Status:** [ ] NOT STARTED

---

### 1I: ECR repositories

**Sources to check:**
| # | File/Pattern |
|---|-------------|
| 1 | `environments/prod/ecr.tf` | ECR repos in TF |
| 2 | `.github/workflows/deploy.yml` | Docker build + push targets |
| 3 | `deploy_gcp.sh`, `deploy_azure.sh` | Any additional deploy scripts |

**Comparison:** List every Docker image built in CI/CD vs every `aws_ecr_repository` in TF.

**Status:** [ ] NOT STARTED

---

### 1J: KMS keys

**Sources to check:**
| # | File/Pattern |
|---|-------------|
| 1 | `backend_v2/shared/kms-crypto.ts` | KMS key references |
| 2 | `environments/prod/kms.tf` | Keys in TF |
| 3 | SSM parameters with KMS key IDs |

**Status:** [ ] NOT STARTED

---

### 1K: SSM Parameters

**Sources to check:**
| # | File/Pattern |
|---|-------------|
| 1 | `backend_v2/shared/` | `loadSecrets()` function — lists every SSM path |
| 2 | `environments/prod/ssm_us.tf` + `ssm_eu.tf` | Parameters in TF |

**Comparison:** Every SSM path in `loadSecrets()` should have a matching `aws_ssm_parameter` in TF.

**Status:** [ ] NOT STARTED

---

### 1L: IoT Core

**Sources to check:**
| # | File/Pattern |
|---|-------------|
| 1 | `backend_v2/patient-service/` | MQTT broker connection |
| 2 | `environments/prod/iot.tf` | IoT resources in TF |

**Status:** [ ] NOT STARTED

---

### 1M: SES (email sending)

**Sources to check:**
| # | File/Pattern |
|---|-------------|
| 1 | `backend_v2/shared/notifications.ts` | SES send email calls |
| 2 | `environments/prod/ses.tf` | SES identities in TF |

**Status:** [ ] NOT STARTED

---

### 1N: EventBridge

**Sources to check:**
| # | File/Pattern |
|---|-------------|
| 1 | `backend_v2/cleanup-recordings/index.mjs` | EventBridge trigger |
| 2 | `environments/prod/eventbridge.tf` | Rules in TF |

**Status:** [ ] NOT STARTED

---

### 1O: GCP resources from backend code

**Sources to check:**
| # | File/Pattern |
|---|-------------|
| 1 | `backend_v2/shared/` | BigQuery client, Google Auth |
| 2 | `legacy_lambdas/mediconnect-iot-gcp-sync/` | GCP IoT sync |
| 3 | `legacy_lambdas/mediconnect-stream-to-bigquery/` | BigQuery streaming |
| 4 | All services with `pushVitalToBigQuery`, `pushRevenueToBigQuery`, `pushAppointmentToBigQuery` |
| 5 | Docker CMD with OIDC token (Cloud Run auth) |

**Compare against:** `environments/prod/gcp_bigquery.tf`, `gcp_cloudrun.tf`, `gcp_iam.tf`, `gcp_services.tf`

**Status:** [ ] NOT STARTED

---

### 1P: Azure resources from backend code

**Sources to check:**
| # | File/Pattern |
|---|-------------|
| 1 | `modules/aws/identity/` | Azure Cosmos endpoint/key references |
| 2 | `environments/prod/main.tf` | `module.azure_data` outputs used by `module.aws_identity` |

**Compare against:** `modules/azure/data/main.tf`

**Status:** [ ] NOT STARTED

---

## Step 2: Extract ALL resource references from CI/CD

**Source:** `.github/workflows/deploy.yml`

Check for:
- ECR repos pushed to
- Lambda functions deployed
- Cloud Run services deployed
- K8s namespaces/deployments
- Any resource created by CI/CD that should be in TF

**Status:** [ ] NOT STARTED

---

## Step 3: Extract ALL resource references from frontend

**Source:** `mediconnect-hub/` (separate repo at `../mediconnect-hub/`)

Check for:
- API Gateway URLs
- CloudFront URLs
- Cognito pool IDs
- S3 bucket references (if any direct uploads)
- WebSocket endpoints

**Status:** [ ] NOT STARTED

---

## Step 4: Reverse check — Orphaned TF resources

Check every resource in `terraform state list` (412 resources) against the app code. If a resource exists in TF but nothing in the app references it, flag it as potentially orphaned.

**Status:** [ ] NOT STARTED

---

## Step 5: Generate final report + driftctl scan

Create `audit-app-vs-iac-report.md` with:

| Category | App Needs | TF Has | Missing | Orphaned |
|----------|----------|--------|---------|----------|
| DynamoDB tables | X | Y | Z | W |
| S3 buckets | ... | ... | ... | ... |
| ... | | | | |

Plus detailed line-by-line findings for every missing/orphaned resource.

### 5b: driftctl Cloud Coverage Scan

Run `driftctl scan` against each cloud to find resources in the cloud but NOT in Terraform state.
This catches resources created manually, by CI/CD, or by other tools.

```bash
# AWS (requires AWS credentials)
driftctl scan --from tfstate://environments/prod/terraform.tfstate

# GCP
driftctl scan --provider gcp --from tfstate://environments/prod/terraform.tfstate

# Output: coverage percentage + list of unmanaged resources
```

**Tools location:** Checkov and Prowler are in `D:\RAGSetup` docker-compose (separate project).
- Checkov mounts `mediconnect-infrastructure-production/environments/prod` → scans TF → outputs to `D:\RAGSetup\reports\hipaa\`
- Prowler scans live AWS account → outputs to `D:\RAGSetup\reports\soc2\`
- driftctl: SKIPPED (maintenance mode since 2023, use `terraform plan` instead)

**Phase 4 agent workflow:**
1. Run Checkov + Prowler from D:\RAGSetup (`docker compose run checkov` / `docker compose run prowler`)
2. Read reports from `D:\RAGSetup\reports\`
3. Generate compliance summary in this repo

**Status:** [ ] NOT STARTED

---

## Progress Tracker

| Step | Status | Agent | Date | Findings |
|------|--------|-------|------|----------|
| 1A DynamoDB | DONE | Claude Opus | 2026-04-06 | 38 app tables, 45 TF tables (38 app + 7 legacy-only). All 38 PASS. |
| 1B S3 | DONE | Claude Opus | 2026-04-06 | 16 app buckets, all in TF (s3_us + s3_eu + s3_dr). PASS. |
| 1C SQS | DONE | Claude Opus | 2026-04-06 | 13 queues (6 categories × 2 + global DLQ). All in sqs.tf. PASS. |
| 1D SNS | DONE | Claude Opus | 2026-04-06 | 5 app topics + billing-alert. All in sns.tf (US + EU). PASS. |
| 1E Cognito | DONE | Claude Opus | 2026-04-06 | 2 pools (US+EU), 4 clients each, MFA on, triggers Lambda. All in TF. PASS. |
| 1F Lambda | DONE | Claude Opus | 2026-04-06 | 4 v2 Lambdas in TF (both regions). 31 legacy intentionally not in TF. PASS. |
| 1G API Gateway | DONE | Claude Opus | 2026-04-06 | WebSocket API (3 routes, REQUEST authorizer, failover proxy). Both regions. PASS. |
| 1H CloudFront | DONE | Claude Opus | 2026-04-06 | Distribution + S3 origin + SPA rewrite. Cognito callback matches. PASS. |
| 1I ECR | DONE | Claude Opus | 2026-04-06 | 7 services × 2 regions = 14 repos. All in ecr.tf. PASS. |
| 1J KMS | DONE | Claude Opus | 2026-04-06 | 2 keys (phi-encryption, prescription-signer) × 2 regions. PASS. |
| 1K SSM | DONE | Claude Opus | 2026-04-06 | 17 params (10 String + 12 SecureString including Azure Cosmos + cleanup). PASS. |
| 1L IoT | DONE | Claude Opus | 2026-04-06 | mediconnect-wearable thing in US + EU. PASS. |
| 1M SES | DONE | Claude Opus | 2026-04-06 | mediconnect.health domain + DKIM + MAIL FROM in both regions. PASS. |
| 1N EventBridge | DONE | Claude Opus | 2026-04-06 | MeetingEnded → cleanup-recordings rule in US + EU. PASS. |
| 1O GCP | DONE | Claude Opus | 2026-04-06 | 6 BQ datasets, 14 Cloud Run services, Healthcare API, 2 Pub/Sub topics, IAM + WIF. PASS. |
| 1P Azure | DONE | Claude Opus | 2026-04-06 | Cosmos DB account + database + container. 2 RGs. CODE_READY. PASS. |
| 2 CI/CD | DONE | Claude Opus | 2026-04-06 | 7 services in build matrix, 4 Lambdas deployed, verify_app_vs_iac.sh added as gate. PASS. |
| 3 Frontend | DONE | Claude Opus | 2026-04-06 | mediconnect-hub refs: mediconnect.health, data-export, secure-storage-v1. PASS. |
| 4 Orphans | DONE | Claude Opus | 2026-04-06 | 7 legacy-only DynamoDB tables in TF with no v2 app ref (billing-audit, clinical-notes, content-cache, doctor-schedules, medical-records, predictions, symptom-logs) — used by legacy Lambdas. OK. |
| 5 Report | DONE | Claude Opus | 2026-04-06 | See audit-app-vs-iac-report.md |
