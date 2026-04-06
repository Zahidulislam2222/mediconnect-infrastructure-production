# Cloud vs Code vs IaC — Three-Way Audit Plan

**Purpose:** Find stale, orphaned, and unused resources by comparing what ACTUALLY exists in the cloud against what the app code uses and what Terraform manages.

**Date created:** 2026-04-06
**Status:** NOT STARTED
**Working directory:** `C:\Users\muham\Dev\mediconnect-project\mediconnect-infrastructure-production`

---

## Why This Audit

The previous agent (Phases 0-3) did a **code-to-IaC comparison** (20-step audit, 127 PASS).
But it NEVER queried the actual cloud. This means:
- Orphaned cloud resources (exist in cloud, nobody uses them) were NOT detected
- Stale legacy services (deployed but dead) were NOT confirmed
- S3 buckets, Lambdas, DynamoDB tables that cost money but serve no purpose — unknown

This audit adds the **cloud layer** to complete the picture.

---

## Pre-Flight (MANDATORY — do this before ANY step)

```bash
# Verify CLI auth
aws sts get-caller-identity
gcloud auth list
az account show

# Verify working directory
cd C:\Users\muham\Dev\mediconnect-project\mediconnect-infrastructure-production
```

**CLI credentials (confirmed 2026-04-06):**
- AWS: `terraform.admin` on account `950110266426`
- GCP: `muhammadzahidulislam2222@gmail.com` on `enhanced-oasis-452313-p7`
- Azure: Subscription `827c3b0b-84bb-4bf6-b98f-2d8e72dbd549`

---

## Rules for Any Agent Working on This

1. **READ-ONLY commands only** — NEVER create, modify, or delete cloud resources
2. **Check ALL 3 clouds** — AWS + GCP + Azure. Never declare done based on one cloud.
3. **Do NOT code until user says go** — this is research/audit, not implementation
4. **Update this file after each step** — mark checkboxes, write findings
5. **Update memory** after each step so next agent can continue
6. **Cross-check against source inventories** before declaring anything done

---

## Step 1: Query AWS Cloud (Read-Only)

### 1A: S3 Buckets
- [ ] **Command:** `aws s3api list-buckets --query 'Buckets[].Name' --output text`
- [ ] **Compare against:** `resource-registry.yaml` (S3 section) + `verify_app_vs_iac.sh` S3 bucket lists
- [ ] **Compare against:** `backend_v2/` code (grep for bucket names)
- [ ] **Output:** Table of every bucket with columns: `Bucket Name | In App Code? | In Terraform? | Verdict`

### 1B: DynamoDB Tables
- [ ] **Command (US):** `aws dynamodb list-tables --region us-east-1`
- [ ] **Command (EU):** `aws dynamodb list-tables --region eu-central-1`
- [ ] **Compare against:** `resource-registry.yaml` (DynamoDB section)
- [ ] **Compare against:** `backend_v2/` code + `legacy_lambdas/` code
- [ ] **Output:** Table with: `Table Name | Region | In App Code? | In Terraform? | Verdict`

### 1C: Lambda Functions
- [ ] **Command (US):** `aws lambda list-functions --region us-east-1 --query 'Functions[].FunctionName'`
- [ ] **Command (EU):** `aws lambda list-functions --region eu-central-1 --query 'Functions[].FunctionName'`
- [ ] **Compare against:** `legacy_lambdas/` directory (which ones have code locally?)
- [ ] **Compare against:** `backend_v2/cognito-triggers/`, `backend_v2/cleanup-recordings/`, `backend_v2/failover-proxy/`
- [ ] **Check:** Which Lambdas are still receiving invocations? `aws lambda get-function --function-name X` for last modified
- [ ] **Output:** Table with: `Function Name | Region | In legacy_lambdas/? | In backend_v2/? | In Terraform? | Verdict`

### 1D: SQS Queues
- [ ] **Command (US):** `aws sqs list-queues --region us-east-1`
- [ ] **Command (EU):** `aws sqs list-queues --region eu-central-1`
- [ ] **Compare against:** `sqs.tf` and `resource-registry.yaml`

### 1E: SNS Topics
- [ ] **Command (US):** `aws sns list-topics --region us-east-1`
- [ ] **Command (EU):** `aws sns list-topics --region eu-central-1`
- [ ] **Compare against:** `sns.tf` and `resource-registry.yaml`

### 1F: ECR Repositories
- [ ] **Command (US):** `aws ecr describe-repositories --region us-east-1 --query 'repositories[].repositoryName'`
- [ ] **Command (EU):** `aws ecr describe-repositories --region eu-central-1 --query 'repositories[].repositoryName'`
- [ ] **Check:** Which repos have recent images? Which are empty?

### 1G: API Gateway
- [ ] **Command (US):** `aws apigatewayv2 get-apis --region us-east-1`
- [ ] **Command (EU):** `aws apigatewayv2 get-apis --region eu-central-1`

### 1H: CloudFront
- [ ] **Command:** `aws cloudfront list-distributions --query 'DistributionList.Items[].{Id:Id,Domain:DomainName,Origins:Origins.Items[0].DomainName}'`

### 1I: Cognito User Pools
- [ ] **Command (US):** `aws cognito-idp list-user-pools --region us-east-1 --max-results 20`
- [ ] **Command (EU):** `aws cognito-idp list-user-pools --region eu-central-1 --max-results 20`

### 1J: KMS Keys
- [ ] **Command (US):** `aws kms list-keys --region us-east-1` + `aws kms describe-key` for each
- [ ] **Command (EU):** `aws kms list-keys --region eu-central-1`

### 1K: IAM Roles
- [ ] **Command:** `aws iam list-roles --query 'Roles[?starts_with(RoleName,`mediconnect`)].RoleName'`

### 1L: SSM Parameters
- [ ] **Command (US):** `aws ssm describe-parameters --region us-east-1 --parameter-filters "Key=Name,Option=BeginsWith,Values=/mediconnect"`
- [ ] **Command (EU):** `aws ssm describe-parameters --region eu-central-1 --parameter-filters "Key=Name,Option=BeginsWith,Values=/mediconnect"`

### 1M: IoT
- [ ] **Command (US):** `aws iot list-things --region us-east-1`
- [ ] **Command (EU):** `aws iot list-things --region eu-central-1`

### 1N: SES
- [ ] **Command (US):** `aws ses list-identities --region us-east-1`
- [ ] **Command (EU):** `aws ses list-identities --region eu-central-1`

### 1O: EventBridge
- [ ] **Command (US):** `aws events list-rules --region us-east-1`
- [ ] **Command (EU):** `aws events list-rules --region eu-central-1`

### 1P: Security Groups
- [ ] **Command:** `aws ec2 describe-security-groups --region us-east-1 --filters "Name=group-name,Values=mediconnect-*" --query 'SecurityGroups[].{Name:GroupName,Id:GroupId}'`

### 1Q: CloudWatch Log Groups
- [ ] **Command (US):** `aws logs describe-log-groups --region us-east-1 --log-group-name-prefix /aws/lambda/mediconnect`
- [ ] **Command (EU):** `aws logs describe-log-groups --region eu-central-1 --log-group-name-prefix /aws/lambda/mediconnect`

---

## Step 2: Query GCP Cloud (Read-Only)

### 2A: Cloud Run Services
- [ ] **Command:** `gcloud run services list --project=mediconnect-analytics --format="table(name,region,status)"`

### 2B: BigQuery Datasets
- [ ] **Command:** `bq ls --project_id=mediconnect-analytics`

### 2C: Pub/Sub Topics
- [ ] **Command:** `gcloud pubsub topics list --project=mediconnect-analytics`

### 2D: Healthcare API
- [ ] **Command:** `gcloud healthcare datasets list --project=mediconnect-analytics`

### 2E: IAM Service Accounts
- [ ] **Command:** `gcloud iam service-accounts list --project=mediconnect-analytics`

### 2F: Workload Identity Pools
- [ ] **Command:** `gcloud iam workload-identity-pools list --project=mediconnect-analytics --location=global`

### 2G: Artifact Registry (if billing enabled)
- [ ] **Command:** `gcloud artifacts repositories list --project=mediconnect-analytics`

---

## Step 3: Query Azure Cloud (Read-Only)

### 3A: Cosmos DB
- [ ] **Command:** `az cosmosdb list --query '[].{name:name,rg:resourceGroup}' -o table`
- [ ] **Check databases:** `az cosmosdb sql database list --account-name <name> --resource-group mediconnect-rg`

### 3B: Resource Groups
- [ ] **Command:** `az group list --query '[].name' -o tsv`

### 3C: All Resources
- [ ] **Command:** `az resource list --resource-group mediconnect-rg --query '[].{name:name,type:type}' -o table`

---

## Step 4: Read App Code References

### 4A: backend_v2/ — Active services
- [ ] Grep all DynamoDB table names referenced in code
- [ ] Grep all S3 bucket names referenced in code
- [ ] Grep all SQS queue names referenced in code
- [ ] Grep all Lambda invocations from backend_v2
- [ ] Grep all GCP service references (BigQuery, Cloud Run, etc.)

### 4B: legacy_lambdas/ — Old functions
- [ ] List all directories under `legacy_lambdas/`
- [ ] For each: check if a corresponding Lambda exists in AWS (from Step 1C)
- [ ] For each: check if any `backend_v2/` code still calls it
- [ ] Verdict: ACTIVE (still deployed + called), DEPLOYED_UNUSED (deployed but not called), DEAD_CODE (not deployed)

---

## Step 5: Read IaC References

- [ ] `terraform state list` (if state is accessible) OR read `*.tf` files
- [ ] List all resources declared in `environments/prod/*.tf`
- [ ] Note: Previous agent already did this — see `resource-registry.yaml`

---

## Step 6: Three-Way Cross-Reference

Build the master table:

```
| Resource | Type | In Cloud? | In App Code? | In IaC? | Verdict |
|----------|------|-----------|-------------|---------|---------|
| ...      | S3   | YES       | YES         | YES     | ACTIVE  |
| ...      | S3   | YES       | NO          | YES     | STALE   |
| ...      | S3   | YES       | NO          | NO      | ORPHANED|
| ...      | DDB  | NO        | YES         | YES     | BROKEN  |
```

Verdicts:
- **ACTIVE** — In cloud + in code + in IaC → keep
- **STALE** — In cloud + in IaC but NOT in code → candidate for removal
- **ORPHANED** — In cloud but NOT in code or IaC → delete candidate
- **LEGACY** — In cloud + in legacy code but NOT in backend_v2 → migration candidate
- **BROKEN** — In code but NOT in cloud → fix needed
- **IaC_ONLY** — In IaC but NOT in cloud → state drift

---

## Step 7: Generate Report

- [ ] Write findings to `cloud-vs-code-audit-report.md`
- [ ] Update `resource-registry.yaml` with any newly discovered resources
- [ ] Update `migration-status.yaml` with audit results
- [ ] Update memory files for next agent

---

## Progress Tracker

| Step | Status | Agent | Date | Notes |
|------|--------|-------|------|-------|
| 1A S3 | NOT STARTED | | | |
| 1B DynamoDB | NOT STARTED | | | |
| 1C Lambda | NOT STARTED | | | |
| 1D SQS | NOT STARTED | | | |
| 1E SNS | NOT STARTED | | | |
| 1F ECR | NOT STARTED | | | |
| 1G API GW | NOT STARTED | | | |
| 1H CloudFront | NOT STARTED | | | |
| 1I Cognito | NOT STARTED | | | |
| 1J KMS | NOT STARTED | | | |
| 1K IAM | NOT STARTED | | | |
| 1L SSM | NOT STARTED | | | |
| 1M IoT | NOT STARTED | | | |
| 1N SES | NOT STARTED | | | |
| 1O EventBridge | NOT STARTED | | | |
| 1P Security Groups | NOT STARTED | | | |
| 1Q CloudWatch | NOT STARTED | | | |
| 2A-2G GCP | NOT STARTED | | | |
| 3A-3C Azure | NOT STARTED | | | |
| 4A-4B App Code | NOT STARTED | | | |
| 5 IaC | NOT STARTED | | | |
| 6 Cross-Reference | NOT STARTED | | | |
| 7 Report | NOT STARTED | | | |
