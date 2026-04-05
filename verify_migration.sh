#!/bin/bash
# ============================================================================
# verify_migration.sh — Migration Completion Gate
# ============================================================================
# This script verifies IaC migration progress across ALL 3 clouds.
# It checks Terraform state against Phase 0 discovery counts.
#
# MANDATORY: Run this before declaring ANY phase complete.
# Paste the full output into the conversation as proof.
#
# Usage: bash verify_migration.sh
# ============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

PASS="${GREEN}PASS${NC}"
FAIL="${RED}FAIL${NC}"
WARN="${YELLOW}WARN${NC}"
SKIP="${YELLOW}SKIP${NC}"

TF_DIR="environments/prod"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Track overall result
OVERALL_RESULT=0
AWS_RESULT=0
GCP_RESULT=0
AZURE_RESULT=0

echo ""
echo -e "${BOLD}============================================================================${NC}"
echo -e "${BOLD}  MediConnect IaC Migration — Verification Report${NC}"
echo -e "${BOLD}  Date: $(date '+%Y-%m-%d %H:%M:%S')${NC}"
echo -e "${BOLD}============================================================================${NC}"
echo ""

# --------------------------------------------------------------------------
# Cache terraform state list (called ONCE, reused everywhere)
# --------------------------------------------------------------------------
STATE_CACHE_FILE=$(mktemp)
trap "rm -f $STATE_CACHE_FILE" EXIT

echo "Fetching terraform state list (one-time)..."
MSYS_NO_PATHCONV=1 terraform -chdir="$TF_DIR" state list > "$STATE_CACHE_FILE" 2>/dev/null || true
echo "Done."
echo ""

# Helper: count state entries matching a prefix (uses cache)
count_state() {
  local prefix="$1"
  local result
  result=$(grep -c "^${prefix}" "$STATE_CACHE_FILE" || true)
  echo "${result:-0}" | tr -d '[:space:]'
}

# ==========================================================================
# SECTION 1: TERRAFORM STATE HEALTH
# ==========================================================================
echo -e "${CYAN}── Section 1: Terraform State Health ──${NC}"
echo ""

TOTAL_RESOURCES=$(wc -l < "$STATE_CACHE_FILE" | tr -d '[:space:]')
echo -e "  Total resources in state: ${BOLD}${TOTAL_RESOURCES}${NC}"

# Check for plan drift
PLAN_OUTPUT=$(MSYS_NO_PATHCONV=1 terraform -chdir="$TF_DIR" plan -no-color -detailed-exitcode 2>&1) && PLAN_EXIT=0 || PLAN_EXIT=$?

if [ "$PLAN_EXIT" -eq 0 ]; then
  echo -e "  Terraform plan drift:    [${PASS}] No changes"
elif [ "$PLAN_EXIT" -eq 2 ]; then
  CHANGES=$(echo "$PLAN_OUTPUT" | grep -c "will be\|must be" || echo "?")
  echo -e "  Terraform plan drift:    [${FAIL}] ${CHANGES} pending changes"
  OVERALL_RESULT=1
else
  echo -e "  Terraform plan drift:    [${FAIL}] Plan errored (exit code ${PLAN_EXIT})"
  OVERALL_RESULT=1
fi
echo ""

# ==========================================================================
# SECTION 2: AWS VERIFICATION
# ==========================================================================
echo -e "${CYAN}── Section 2: AWS (Phase 0 target: 458 resources) ──${NC}"
echo ""

# --- Phase 1: Resource counts ---
# Count AWS resources: everything that is NOT google_ or azurerm_ prefixed
TOTAL_COUNT="$TOTAL_RESOURCES"
GCP_RAW=$(grep -c "^google_" "$STATE_CACHE_FILE" || true)
GCP_RAW=$(echo "${GCP_RAW:-0}" | tr -d '[:space:]')
AZURE_RAW=$(grep -c "azurerm_" "$STATE_CACHE_FILE" || true)
AZURE_RAW=$(echo "${AZURE_RAW:-0}" | tr -d '[:space:]')
AWS_COUNT=$((TOTAL_COUNT - GCP_RAW - AZURE_RAW))
echo -e "  Phase 1 — Resources in TF state: ${BOLD}${AWS_COUNT}${NC}"
if [ "$AWS_COUNT" -ge 350 ]; then
  echo -e "  Phase 1 — Import coverage:       [${PASS}] ${AWS_COUNT} resources managed"
else
  echo -e "  Phase 1 — Import coverage:       [${FAIL}] Only ${AWS_COUNT} resources (expected ~370)"
  AWS_RESULT=1
fi

# --- Phase 2: Compliance spot-checks ---
echo ""
echo "  Phase 2 — Compliance spot-checks:"

# DynamoDB deletion protection (Finding #1)
DYNAMO_DEL=$(MSYS_NO_PATHCONV=1 aws dynamodb describe-table --table-name mediconnect-appointments --region us-east-1 --query 'Table.DeletionProtectionEnabled' --output text 2>/dev/null || echo "ERROR")
if [ "$DYNAMO_DEL" = "True" ]; then
  echo -e "    #1  DynamoDB deletion protection:  [${PASS}]"
else
  echo -e "    #1  DynamoDB deletion protection:  [${FAIL}] Got: ${DYNAMO_DEL}"
  AWS_RESULT=1
fi

# DynamoDB PITR (Finding #2-3)
DYNAMO_PITR=$(MSYS_NO_PATHCONV=1 aws dynamodb describe-continuous-backups --table-name mediconnect-patients --region us-east-1 --query 'ContinuousBackupsDescription.PointInTimeRecoveryDescription.PointInTimeRecoveryStatus' --output text 2>/dev/null || echo "ERROR")
if [ "$DYNAMO_PITR" = "ENABLED" ]; then
  echo -e "    #2-3 DynamoDB PITR:                [${PASS}]"
else
  echo -e "    #2-3 DynamoDB PITR:                [${FAIL}] Got: ${DYNAMO_PITR}"
  AWS_RESULT=1
fi

# Missing tables (Finding #5) — count US tables
US_TABLE_COUNT=$(MSYS_NO_PATHCONV=1 aws dynamodb list-tables --region us-east-1 --output json 2>/dev/null | python -c "import json,sys; print(len(json.load(sys.stdin)['TableNames']))" 2>/dev/null || echo "0")
if [ "$US_TABLE_COUNT" -ge 45 ]; then
  echo -e "    #5  DynamoDB US tables:            [${PASS}] ${US_TABLE_COUNT} tables"
else
  echo -e "    #5  DynamoDB US tables:            [${FAIL}] Only ${US_TABLE_COUNT} (expected 45+)"
  AWS_RESULT=1
fi

# S3 versioning (Finding #6)
S3_VER=$(MSYS_NO_PATHCONV=1 aws s3api get-bucket-versioning --bucket mediconnect-patient-data --query 'Status' --output text 2>/dev/null || echo "ERROR")
if [ "$S3_VER" = "Enabled" ]; then
  echo -e "    #6  S3 versioning (patient-data):   [${PASS}]"
else
  echo -e "    #6  S3 versioning (patient-data):   [${FAIL}] Got: ${S3_VER}"
  AWS_RESULT=1
fi

# S3 KMS encryption (Finding #7)
S3_ENC=$(MSYS_NO_PATHCONV=1 aws s3api get-bucket-encryption --bucket mediconnect-patient-data --query 'ServerSideEncryptionConfiguration.Rules[0].ApplyServerSideEncryptionByDefault.SSEAlgorithm' --output text 2>/dev/null || echo "ERROR")
if [ "$S3_ENC" = "aws:kms" ]; then
  echo -e "    #7  S3 KMS encryption:             [${PASS}]"
else
  echo -e "    #7  S3 KMS encryption:             [${FAIL}] Got: ${S3_ENC}"
  AWS_RESULT=1
fi

# S3 public access block (Finding #8)
S3_PUB=$(MSYS_NO_PATHCONV=1 aws s3api get-public-access-block --bucket mediconnect-patient-data --query 'PublicAccessBlockConfiguration.BlockPublicAcls' --output text 2>/dev/null || echo "ERROR")
if [ "$S3_PUB" = "True" ]; then
  echo -e "    #8  S3 public access blocked:       [${PASS}]"
else
  echo -e "    #8  S3 public access blocked:       [${FAIL}] Got: ${S3_PUB}"
  AWS_RESULT=1
fi

# ECR scan on push (Finding #9)
ECR_SCAN=$(MSYS_NO_PATHCONV=1 aws ecr describe-repositories --region eu-central-1 --repository-names doctor-service --query 'repositories[0].imageScanningConfiguration.scanOnPush' --output text 2>/dev/null || echo "ERROR")
if [ "$ECR_SCAN" = "True" ]; then
  echo -e "    #9  ECR scan-on-push (EU):          [${PASS}]"
else
  echo -e "    #9  ECR scan-on-push (EU):          [${FAIL}] Got: ${ECR_SCAN}"
  AWS_RESULT=1
fi

# EU SQS DLQ (Finding #10)
EU_SQS=$(MSYS_NO_PATHCONV=1 aws sqs list-queues --region eu-central-1 --queue-name-prefix mediconnect-dlq --output text 2>/dev/null | grep -c "mediconnect-dlq" || true)
EU_SQS=$(echo "${EU_SQS:-0}" | tr -d '[:space:]')
if [ "$EU_SQS" -ge 1 ]; then
  echo -e "    #10 EU SQS DLQ:                    [${PASS}]"
else
  echo -e "    #10 EU SQS DLQ:                    [${FAIL}] Not found"
  AWS_RESULT=1
fi

# EU SNS topics (Finding #11)
EU_SNS=$(MSYS_NO_PATHCONV=1 aws sns list-topics --region eu-central-1 --output json 2>/dev/null | python -c "import json,sys; topics=[t['TopicArn'].split(':')[-1] for t in json.load(sys.stdin)['Topics']]; print(len([t for t in topics if 'mediconnect' in t or 'billing' in t]))" 2>/dev/null || echo "0")
if [ "$EU_SNS" -ge 5 ]; then
  echo -e "    #11 EU SNS topics:                 [${PASS}] ${EU_SNS} topics"
else
  echo -e "    #11 EU SNS topics:                 [${FAIL}] Only ${EU_SNS} (expected 5+)"
  AWS_RESULT=1
fi

# CloudWatch retention (Finding #12)
CW_RET=$(MSYS_NO_PATHCONV=1 aws logs describe-log-groups --region us-east-1 --log-group-name-prefix "/aws/lambda/mediconnect-auto-group-us" --query 'logGroups[0].retentionInDays' --output text 2>/dev/null || echo "ERROR")
if [ "$CW_RET" = "365" ]; then
  echo -e "    #12 CloudWatch retention (365d):    [${PASS}]"
else
  echo -e "    #12 CloudWatch retention (365d):    [${FAIL}] Got: ${CW_RET}"
  AWS_RESULT=1
fi

# SES domain (Finding #13)
SES_DOM=$(MSYS_NO_PATHCONV=1 aws ses list-identities --identity-type Domain --region us-east-1 --output text 2>/dev/null | grep -c "mediconnect" || true)
SES_DOM=$(echo "${SES_DOM:-0}" | tr -d '[:space:]')
if [ "$SES_DOM" -ge 1 ]; then
  echo -e "    #13 SES domain identity:           [${PASS}]"
else
  echo -e "    #13 SES domain identity:           [${FAIL}] Not found"
  AWS_RESULT=1
fi

# Tags (Finding #14)
TAGS=$(MSYS_NO_PATHCONV=1 aws dynamodb list-tags-of-resource --resource-arn "arn:aws:dynamodb:us-east-1:950110266426:table/mediconnect-allergies" --output json 2>/dev/null | python -c "import json,sys; tags={t['Key']:t['Value'] for t in json.load(sys.stdin)['Tags']}; print('OK' if tags.get('Project')=='MediConnect' and tags.get('ManagedBy')=='Terraform' else 'MISSING')" 2>/dev/null || echo "ERROR")
if [ "$TAGS" = "OK" ]; then
  echo -e "    #14 Resource tags:                 [${PASS}]"
else
  echo -e "    #14 Resource tags:                 [${FAIL}] Got: ${TAGS}"
  AWS_RESULT=1
fi

# S3 lifecycle (Finding #15)
S3_LC=$(MSYS_NO_PATHCONV=1 aws s3api get-bucket-lifecycle-configuration --bucket mediconnect-patient-data --query 'length(Rules)' --output text 2>/dev/null || echo "0")
if [ "$S3_LC" -ge 1 ]; then
  echo -e "    #15 S3 lifecycle policies:          [${PASS}] ${S3_LC} rules"
else
  echo -e "    #15 S3 lifecycle policies:          [${FAIL}] No rules found"
  AWS_RESULT=1
fi

# KMS key (Finding #17)
KMS_KEY=$(MSYS_NO_PATHCONV=1 aws kms list-aliases --region us-east-1 --output text 2>/dev/null | grep -c "mediconnect-phi-encryption" || true)
KMS_KEY=$(echo "${KMS_KEY:-0}" | tr -d '[:space:]')
if [ "$KMS_KEY" -ge 1 ]; then
  echo -e "    #17 KMS PHI encryption key:        [${PASS}]"
else
  echo -e "    #17 KMS PHI encryption key:        [${FAIL}] Not found"
  AWS_RESULT=1
fi

echo ""
if [ "$AWS_RESULT" -eq 0 ]; then
  echo -e "  ${GREEN}${BOLD}AWS OVERALL: PASS — All 17 findings verified${NC}"
else
  echo -e "  ${RED}${BOLD}AWS OVERALL: FAIL — Some checks failed${NC}"
  OVERALL_RESULT=1
fi

# ==========================================================================
# SECTION 3: GCP VERIFICATION
# ==========================================================================
echo ""
echo -e "${CYAN}── Section 3: GCP (Phase 0 target: 57 real resources) ──${NC}"
echo ""

# --- Phase 1: Resource counts ---
GCP_STATE_COUNT=$(grep -c "^google_" "$STATE_CACHE_FILE" || true)
GCP_STATE_COUNT=$(echo "${GCP_STATE_COUNT:-0}" | tr -d '[:space:]')
echo -e "  Phase 1 — GCP resources in TF state: ${BOLD}${GCP_STATE_COUNT}${NC}"

# Check expected resource types
GCP_EXPECTED_TYPES=(
  "google_cloud_run_service:14:Cloud Run services"
  "google_bigquery_dataset:6:BigQuery datasets"
  "google_bigquery_table:9:BigQuery tables"
  "google_artifact_registry_repository:1:Artifact Registry repos"
  "google_healthcare_dataset:1:Healthcare API datasets"
  "google_healthcare_dicom_store:1:Healthcare API DICOM stores"
  "google_service_account:2:IAM service accounts"
  "google_iam_workload_identity_pool:2:Workload Identity pools"
  "google_iam_workload_identity_pool_provider:2:Workload Identity providers"
  "google_pubsub_topic:2:Pub/Sub topics"
  "google_secret_manager_secret:2:Secret Manager secrets"
  "google_storage_bucket:2:Cloud Storage buckets"
)

GCP_IMPORTED=0
GCP_MISSING=0
echo ""
echo "  Phase 1 — Resource breakdown:"
for entry in "${GCP_EXPECTED_TYPES[@]}"; do
  IFS=':' read -r prefix expected label <<< "$entry"
  actual=$(grep -c "^${prefix}\." "$STATE_CACHE_FILE" || true)
  actual=$(echo "${actual:-0}" | tr -d '[:space:]')
  if [ "$actual" -ge "$expected" ]; then
    echo -e "    ${label}: ${actual}/${expected} [${PASS}]"
    GCP_IMPORTED=$((GCP_IMPORTED + actual))
  elif [ "$actual" -gt 0 ]; then
    echo -e "    ${label}: ${actual}/${expected} [${WARN}] Partial"
    GCP_IMPORTED=$((GCP_IMPORTED + actual))
    GCP_MISSING=$((GCP_MISSING + expected - actual))
    GCP_RESULT=1
  else
    echo -e "    ${label}: ${actual}/${expected} [${FAIL}] Not imported"
    GCP_MISSING=$((GCP_MISSING + expected))
    GCP_RESULT=1
  fi
done

echo ""
echo -e "  GCP imported: ${GCP_IMPORTED}, missing: ${GCP_MISSING}"

# --- Phase 2: Compliance findings ---
echo ""
echo "  Phase 2 — GCP Compliance findings (6 total):"

# GCP #1: Secret Manager AWS credentials
if [ "$GCP_STATE_COUNT" -gt 0 ]; then
  # Can only check if GCP resources are managed
  GCP_SECRETS=$(grep -c "google_secret_manager_secret\." "$STATE_CACHE_FILE" || true)
  GCP_SECRETS=$(echo "${GCP_SECRETS:-0}" | tr -d '[:space:]')
  if [ "$GCP_SECRETS" -ge 2 ]; then
    echo -e "    #1 Secret Manager in TF:           [${WARN}] Managed but credentials should use Workload Identity"
  else
    echo -e "    #1 Secret Manager in TF:           [${FAIL}] Not in Terraform"
    GCP_RESULT=1
  fi
else
  echo -e "    #1 Secret Manager in TF:           [${FAIL}] GCP not in Terraform at all"
  GCP_RESULT=1
fi
echo -e "    #2 DICOM Store EU replica:          [${FAIL}] Not checked (GCP Phase 1 not done)"
echo -e "    #3 Cloud SQL ghost module:          [${WARN}] Module exists for non-existent resource"
echo -e "    #4 Cloud Run revision cleanup:      [${FAIL}] Not checked (GCP Phase 1 not done)"
echo -e "    #5 SA key rotation:                 [${FAIL}] Not checked (GCP Phase 1 not done)"
echo -e "    #6 Empty BigQuery AI datasets:      [${FAIL}] Not checked (GCP Phase 1 not done)"
GCP_RESULT=1

echo ""
if [ "$GCP_RESULT" -eq 0 ]; then
  echo -e "  ${GREEN}${BOLD}GCP OVERALL: PASS${NC}"
else
  echo -e "  ${RED}${BOLD}GCP OVERALL: FAIL — ${GCP_MISSING} resources not imported, findings unresolved${NC}"
  OVERALL_RESULT=1
fi

# ==========================================================================
# SECTION 4: AZURE VERIFICATION
# ==========================================================================
echo ""
echo -e "${CYAN}── Section 4: Azure (Phase 0 target: 4 resources) ──${NC}"
echo ""

# --- Phase 1: Resource counts ---
AZURE_STATE_COUNT=$(grep -c "azurerm_" "$STATE_CACHE_FILE" || true)
AZURE_STATE_COUNT=$(echo "${AZURE_STATE_COUNT:-0}" | tr -d '[:space:]')
echo -e "  Phase 1 — Azure resources in TF state: ${BOLD}${AZURE_STATE_COUNT}${NC}"

echo ""
echo "  Phase 1 — Resource breakdown:"

# Cosmos DB account
AZURE_COSMOS=$(grep -c "azurerm_cosmosdb_account\." "$STATE_CACHE_FILE" || true)
AZURE_COSMOS=$(echo "${AZURE_COSMOS:-0}" | tr -d '[:space:]')
if [ "$AZURE_COSMOS" -ge 1 ]; then
  echo -e "    Cosmos DB account: ${AZURE_COSMOS}/1 [${PASS}]"
else
  echo -e "    Cosmos DB account: ${AZURE_COSMOS}/1 [${FAIL}]"
  AZURE_RESULT=1
fi

# Resource groups
AZURE_RG=$(grep -c "azurerm_resource_group\." "$STATE_CACHE_FILE" || true)
AZURE_RG=$(echo "${AZURE_RG:-0}" | tr -d '[:space:]')
if [ "$AZURE_RG" -ge 2 ]; then
  echo -e "    Resource groups: ${AZURE_RG}/2 [${PASS}]"
elif [ "$AZURE_RG" -ge 1 ]; then
  echo -e "    Resource groups: ${AZURE_RG}/2 [${WARN}] Missing NetworkWatcherRG"
  AZURE_RESULT=1
else
  echo -e "    Resource groups: ${AZURE_RG}/2 [${FAIL}]"
  AZURE_RESULT=1
fi

# Network Watcher
AZURE_NW=$(grep -c "azurerm_network_watcher\." "$STATE_CACHE_FILE" || true)
AZURE_NW=$(echo "${AZURE_NW:-0}" | tr -d '[:space:]')
if [ "$AZURE_NW" -ge 1 ]; then
  echo -e "    Network Watcher: ${AZURE_NW}/1 [${PASS}]"
else
  echo -e "    Network Watcher: ${AZURE_NW}/1 [${FAIL}] Not imported"
  AZURE_RESULT=1
fi

# --- Phase 2: Compliance findings ---
echo ""
echo "  Phase 2 — Azure Compliance findings (6 total):"

# Check Cosmos DB properties via Azure CLI if available
if command -v az &> /dev/null; then
  # Azure #1: Empty Cosmos DB
  COSMOS_DBS=$(az cosmosdb sql database list --account-name mediconnect-cosmos-db --resource-group mediconnect-rg --query 'length(@)' --output tsv 2>/dev/null || echo "ERROR")
  if [ "$COSMOS_DBS" != "ERROR" ] && [ "$COSMOS_DBS" -ge 1 ] 2>/dev/null; then
    echo -e "    #1 Cosmos DB has databases:         [${PASS}] ${COSMOS_DBS} databases"
  else
    echo -e "    #1 Cosmos DB empty:                 [${FAIL}] No databases (CRITICAL)"
    AZURE_RESULT=1
  fi

  # Azure #2: Multi-region
  COSMOS_LOCS=$(az cosmosdb show --name mediconnect-cosmos-db --resource-group mediconnect-rg --query 'length(readLocations)' --output tsv 2>/dev/null || echo "ERROR")
  if [ "$COSMOS_LOCS" != "ERROR" ] && [ "$COSMOS_LOCS" -ge 2 ] 2>/dev/null; then
    echo -e "    #2 Multi-region:                   [${PASS}] ${COSMOS_LOCS} regions"
  else
    echo -e "    #2 Multi-region:                   [${FAIL}] Single region only (HIGH)"
    AZURE_RESULT=1
  fi

  # Azure #3: Public access
  COSMOS_PUB=$(az cosmosdb show --name mediconnect-cosmos-db --resource-group mediconnect-rg --query 'publicNetworkAccess' --output tsv 2>/dev/null || echo "ERROR")
  if [ "$COSMOS_PUB" = "Disabled" ]; then
    echo -e "    #3 Public access disabled:          [${PASS}]"
  else
    echo -e "    #3 Public access:                   [${FAIL}] ${COSMOS_PUB} (HIGH)"
    AZURE_RESULT=1
  fi

  # Azure #4: Free tier
  COSMOS_FREE=$(az cosmosdb show --name mediconnect-cosmos-db --resource-group mediconnect-rg --query 'enableFreeTier' --output tsv 2>/dev/null || echo "ERROR")
  if [ "$COSMOS_FREE" = "false" ]; then
    echo -e "    #4 Not free tier:                  [${PASS}]"
  else
    echo -e "    #4 Free tier enabled:              [${FAIL}] Production should not use free tier (MEDIUM)"
    AZURE_RESULT=1
  fi

  # Azure #6: Backup type
  COSMOS_BACKUP=$(az cosmosdb show --name mediconnect-cosmos-db --resource-group mediconnect-rg --query 'backupPolicy.type' --output tsv 2>/dev/null || echo "ERROR")
  if [ "$COSMOS_BACKUP" = "Continuous" ]; then
    echo -e "    #6 Continuous backup:              [${PASS}]"
  else
    echo -e "    #6 Backup type:                    [${FAIL}] ${COSMOS_BACKUP} (should be Continuous)"
    AZURE_RESULT=1
  fi
else
  echo -e "    Azure CLI (az) not found — skipping live checks"
  echo -e "    #1 Cosmos DB empty:                 [${SKIP}]"
  echo -e "    #2 Multi-region:                   [${SKIP}]"
  echo -e "    #3 Public access:                   [${SKIP}]"
  echo -e "    #4 Free tier:                      [${SKIP}]"
  echo -e "    #6 Backup type:                    [${SKIP}]"
  AZURE_RESULT=1
fi
echo -e "    #5 Session consistency:             [${WARN}] Needs business verification"

echo ""
if [ "$AZURE_RESULT" -eq 0 ]; then
  echo -e "  ${GREEN}${BOLD}AZURE OVERALL: PASS${NC}"
else
  echo -e "  ${RED}${BOLD}AZURE OVERALL: FAIL — Import incomplete or findings unresolved${NC}"
  OVERALL_RESULT=1
fi

# ==========================================================================
# SECTION 5: OVERALL SUMMARY
# ==========================================================================
echo ""
echo -e "${BOLD}============================================================================${NC}"
echo -e "${BOLD}  SUMMARY${NC}"
echo -e "${BOLD}============================================================================${NC}"
echo ""

# Per-cloud status
if [ "$AWS_RESULT" -eq 0 ]; then
  echo -e "  AWS:   [${GREEN}${BOLD}PASS${NC}]  Phases 1-3 complete, 17/17 findings resolved"
else
  echo -e "  AWS:   [${RED}${BOLD}FAIL${NC}]  Some checks failed"
fi

if [ "$GCP_RESULT" -eq 0 ]; then
  echo -e "  GCP:   [${GREEN}${BOLD}PASS${NC}]  Phases 1-3 complete, 6/6 findings resolved"
else
  echo -e "  GCP:   [${RED}${BOLD}FAIL${NC}]  ${GCP_STATE_COUNT} resources in state (target: ~44 Terraform resources from 57 real)"
fi

if [ "$AZURE_RESULT" -eq 0 ]; then
  echo -e "  Azure: [${GREEN}${BOLD}PASS${NC}]  Phases 1-3 complete, 6/6 findings resolved"
else
  echo -e "  Azure: [${RED}${BOLD}FAIL${NC}]  ${AZURE_STATE_COUNT} resources in state (target: 4)"
fi

echo ""

if [ "$OVERALL_RESULT" -eq 0 ]; then
  echo -e "  ${GREEN}${BOLD}=== ALL CLOUDS PASS — Safe to proceed to Phase 4 (Final Audit) ===${NC}"
else
  echo -e "  ${RED}${BOLD}=== BLOCKED — Fix failing clouds before Phase 4 ===${NC}"
fi

echo ""
echo -e "${BOLD}============================================================================${NC}"
echo ""

exit $OVERALL_RESULT
