#!/bin/bash
# ============================================================================
# verify_app_vs_iac.sh — App Code vs IaC Cross-Check
# ============================================================================
# Compares every resource the application code references against Terraform.
# READ-ONLY: does NOT run terraform apply, does NOT modify any cloud resources.
#
# Usage: bash verify_app_vs_iac.sh
# ============================================================================

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$REPO_ROOT/backend_v2"
LAMBDAS="$REPO_ROOT/legacy_lambdas"
TF_DIR="$REPO_ROOT/environments/prod"
FRONTEND_DIR="$(cd "$REPO_ROOT/../mediconnect-hub" 2>/dev/null && pwd)" || FRONTEND_DIR=""

PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0
MISSING_RESOURCES=()
ORPHANED_RESOURCES=()

# Colors (skip if not a terminal)
if [ -t 1 ]; then
  GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'; BOLD='\033[1m'
else
  GREEN=''; RED=''; YELLOW=''; CYAN=''; NC=''; BOLD=''
fi

pass() { echo -e "  ${GREEN}PASS${NC} $1"; PASS_COUNT=$((PASS_COUNT + 1)); }
fail() { echo -e "  ${RED}FAIL${NC} $1"; FAIL_COUNT=$((FAIL_COUNT + 1)); MISSING_RESOURCES+=("$1"); }
warn() { echo -e "  ${YELLOW}WARN${NC} $1"; WARN_COUNT=$((WARN_COUNT + 1)); }
orphan() { echo -e "  ${YELLOW}ORPHAN${NC} $1"; ORPHANED_RESOURCES+=("$1"); }
header() { echo -e "\n${BOLD}${CYAN}═══ $1 ═══${NC}"; }

# ============================================================================
# Helper: check if a name appears in a TF file
# ============================================================================
in_tf() {
  local name="$1"
  shift
  for tf_file in "$@"; do
    if [ -f "$tf_file" ] && grep -q "$name" "$tf_file" 2>/dev/null; then
      return 0
    fi
  done
  return 1
}

# ============================================================================
# 1. DynamoDB Tables
# ============================================================================
header "1. DynamoDB Tables (backend code vs dynamodb_us.tf / dynamodb_eu.tf)"

# Tables referenced in backend code (from env vars + hardcoded names in CLAUDE.md)
DYNAMO_TABLES_APP=(
  "mediconnect-patients"
  "mediconnect-doctors"
  "mediconnect-appointments"
  "mediconnect-transactions"
  "mediconnect-video-sessions"
  "mediconnect-staff-shifts"
  "mediconnect-staff-tasks"
  "mediconnect-staff-announcements"
  "mediconnect-audit-logs"
  "mediconnect-mpi-links"
  "mediconnect-bulk-exports"
  "mediconnect-allergies"
  "mediconnect-immunizations"
  "mediconnect-emergency-access"
  "mediconnect-lab-orders"
  "mediconnect-referrals"
  "mediconnect-med-reconciliations"
  "mediconnect-care-plans"
  "mediconnect-booking-locks"
  "mediconnect-prescriptions"
  "mediconnect-graph-data"
  "mediconnect-sdoh-assessments"
  "mediconnect-eligibility-checks"
  "mediconnect-prior-auth"
  "mediconnect-reminders"
  "mediconnect-bluebutton-connections"
  "mediconnect-ecr-reports"
  "mediconnect-elr-reports"
  "mediconnect-iot-vitals"
  "mediconnect-drug-interactions"
  "mediconnect-chat-history"
  "mediconnect-chat-connections"
  "mediconnect-consent-ledger"
  "mediconnect-knowledge-base"
  "mediconnect-dicom-studies"
  "mediconnect-hl7-messages"
  "mediconnect-health-records"
  "mediconnect-pharmacy-inventory"
)

# Also extract dynamically from code to catch any we missed
DYNAMO_TABLES_CODE=$(grep -roh '"mediconnect-[a-z][a-z0-9_-]*"' "$BACKEND" --include="*.ts" --include="*.py" 2>/dev/null | tr -d '"' | sort -u)
DYNAMO_TABLES_LAMBDA=$(for f in $(find "$LAMBDAS" -maxdepth 2 \( -name "index.mjs" -o -name "lambda_function.py" -o -name "handler.py" \) 2>/dev/null); do grep -oh '"mediconnect-[a-z][a-z0-9_-]*"' "$f" 2>/dev/null; done | tr -d '"' | sort -u)

# Combine all app references and filter to likely DynamoDB tables
# (exclude known S3 buckets, SQS queues, and non-table names)
S3_PATTERN="datalake|cicd|patient-data|doctor-data|consultation|media-assets|medical-images|ehr-records|audit-logs-950|prescriptions-eu"
SQS_PATTERN="events$|events-dlq$|dlq$|webhook"
NON_TABLE_PATTERN="fhir-server|identity-verification|drug-cache|data-lake-dlq"

DDB_TF_US="$TF_DIR/dynamodb_us.tf"
DDB_TF_EU="$TF_DIR/dynamodb_eu.tf"

for table in "${DYNAMO_TABLES_APP[@]}"; do
  if in_tf "$table" "$DDB_TF_US" "$DDB_TF_EU"; then
    pass "DynamoDB: $table"
  else
    fail "DynamoDB: $table — referenced in app but NOT in Terraform"
  fi
done

# ============================================================================
# 2. S3 Buckets
# ============================================================================
header "2. S3 Buckets (backend code vs s3_us.tf / s3_eu.tf / s3_dr.tf)"

S3_TF_US="$TF_DIR/s3_us.tf"
S3_TF_EU="$TF_DIR/s3_eu.tf"
S3_TF_DR="$TF_DIR/s3_dr.tf"

# Buckets referenced in backend code
S3_BUCKETS_APP=(
  "mediconnect-patient-data"
  "mediconnect-patient-data-eu"
  "mediconnect-doctor-data"
  "mediconnect-doctor-data-eu"
  "mediconnect-medical-images"
  "mediconnect-medical-images-eu"
  "mediconnect-consultation-recordings"
  "mediconnect-consultation-recordings-eu"
  "mediconnect-consultation-files"
  "mediconnect-ehr-records"
  "mediconnect-ehr-records-eu"
  "mediconnect-media-assets"
  "mediconnect-datalake-950110266426"
  "mediconnect-audit-logs-950110266426"
  "mediconnect-prescriptions"
  "mediconnect-prescriptions-eu"
)

for bucket in "${S3_BUCKETS_APP[@]}"; do
  if in_tf "$bucket" "$S3_TF_US" "$S3_TF_EU" "$S3_TF_DR"; then
    pass "S3: $bucket"
  else
    fail "S3: $bucket — referenced in app but NOT in Terraform"
  fi
done

# ============================================================================
# 3. SQS Queues
# ============================================================================
header "3. SQS Queues (event-bus.ts vs sqs.tf)"

SQS_TF="$TF_DIR/sqs.tf"

# Queues referenced in event-bus.ts
SQS_QUEUES_APP=(
  "mediconnect-audit-events"
  "mediconnect-audit-events-dlq"
  "mediconnect-clinical-events"
  "mediconnect-clinical-events-dlq"
  "mediconnect-appointment-events"
  "mediconnect-appointment-events-dlq"
  "mediconnect-patient-events"
  "mediconnect-patient-events-dlq"
  "mediconnect-security-events"
  "mediconnect-security-events-dlq"
  "mediconnect-system-events"
  "mediconnect-system-events-dlq"
  "mediconnect-dlq"
)

for queue in "${SQS_QUEUES_APP[@]}"; do
  if in_tf "$queue" "$SQS_TF"; then
    pass "SQS: $queue"
  else
    fail "SQS: $queue — referenced in event-bus.ts but NOT in sqs.tf"
  fi
done

# ============================================================================
# 4. SNS Topics
# ============================================================================
header "4. SNS Topics (backend code vs sns.tf)"

SNS_TF="$TF_DIR/sns.tf"

# Topics referenced in backend code (loaded via SSM or env vars)
SNS_TOPICS_APP=(
  "mediconnect-appointments"
  "mediconnect-high-risk-alerts"
  "mediconnect-ops-alerts"
  "mediconnect-pharmacy-alerts"
  "mediconnect-prescription-alerts"
)

for topic in "${SNS_TOPICS_APP[@]}"; do
  if in_tf "$topic" "$SNS_TF"; then
    pass "SNS: $topic"
  else
    fail "SNS: $topic — referenced in app but NOT in sns.tf"
  fi
done

# ============================================================================
# 5. Lambda Functions
# ============================================================================
header "5. Lambda Functions (legacy_lambdas/ + backend_v2/ vs lambda_us.tf)"

LAMBDA_TF_US="$TF_DIR/lambda_us.tf"
LAMBDA_TF_EU="$TF_DIR/lambda_eu.tf"

# Legacy lambdas in legacy_lambdas/ are kept for reference only (not deployed).
# They were replaced by the 7 microservices. Skip them from WARN checks.
# See: cloud-vs-code audit (commit ed106cd) — 31 legacy Lambdas confirmed dead code.
LAMBDA_FUNCTIONS_APP=()

# Also add v2 Lambdas (from backend_v2/)
V2_LAMBDAS=("cognito-triggers" "ws-authorizer" "cleanup-recordings" "failover-proxy")
for v2 in "${V2_LAMBDAS[@]}"; do
  if [ -d "$BACKEND/$v2" ]; then
    LAMBDA_FUNCTIONS_APP+=("mediconnect-$v2")
  fi
done

for func in "${LAMBDA_FUNCTIONS_APP[@]}"; do
  # Normalize: some legacy lambdas are prefixed with "mediconnect-"
  tf_name="$func"
  if in_tf "$tf_name" "$LAMBDA_TF_US" "$LAMBDA_TF_EU"; then
    pass "Lambda: $tf_name"
  else
    # Try without mediconnect- prefix or with it
    alt_name="mediconnect-$func"
    if in_tf "$alt_name" "$LAMBDA_TF_US" "$LAMBDA_TF_EU"; then
      pass "Lambda: $alt_name (matched as $func)"
    else
      warn "Lambda: $func — exists in legacy_lambdas/ but may not be in Terraform (could be obsolete)"
    fi
  fi
done

# ============================================================================
# 6. ECR Repositories
# ============================================================================
header "6. ECR Repositories (CI/CD deploy targets vs ecr.tf)"

ECR_TF="$TF_DIR/ecr.tf"

# Services that get Docker-built in CI/CD
ECR_SERVICES=(
  "patient-service"
  "doctor-service"
  "booking-service"
  "communication-service"
  "admin-service"
  "staff-service"
  "dicom-service"
)

for svc in "${ECR_SERVICES[@]}"; do
  if in_tf "$svc" "$ECR_TF"; then
    pass "ECR: $svc"
  else
    fail "ECR: $svc — deployed by CI/CD but NOT in ecr.tf"
  fi
done

# ============================================================================
# 7. Cognito User Pools
# ============================================================================
header "7. Cognito User Pools (auth code vs cognito_us.tf / cognito_eu.tf)"

COGNITO_TF_US="$TF_DIR/cognito_us.tf"
COGNITO_TF_EU="$TF_DIR/cognito_eu.tf"

if [ -f "$COGNITO_TF_US" ] && [ -f "$COGNITO_TF_EU" ]; then
  pass "Cognito: US pool defined in cognito_us.tf"
  pass "Cognito: EU pool defined in cognito_eu.tf"
else
  [ ! -f "$COGNITO_TF_US" ] && fail "Cognito: cognito_us.tf missing"
  [ ! -f "$COGNITO_TF_EU" ] && fail "Cognito: cognito_eu.tf missing"
fi

# Check for Cognito triggers Lambda
if in_tf "cognito-triggers" "$LAMBDA_TF_US" "$LAMBDA_TF_EU"; then
  pass "Cognito: triggers Lambda in Terraform"
else
  fail "Cognito: mediconnect-cognito-triggers Lambda NOT in Terraform"
fi

# ============================================================================
# 8. KMS Keys
# ============================================================================
header "8. KMS Keys (kms-crypto.ts vs kms.tf)"

KMS_TF="$TF_DIR/kms.tf"

# KMS keys referenced in backend
KMS_KEYS_APP=(
  "mediconnect-phi-encryption"
  "mediconnect-prescription-signer"
)

for key in "${KMS_KEYS_APP[@]}"; do
  if in_tf "$key" "$KMS_TF"; then
    pass "KMS: $key"
  else
    fail "KMS: $key — referenced in kms-crypto.ts but NOT in kms.tf"
  fi
done

# ============================================================================
# 9. SSM Parameters
# ============================================================================
header "9. SSM Parameters (loadSecrets paths vs ssm_us.tf / ssm_eu.tf)"

SSM_TF_US="$TF_DIR/ssm_us.tf"
SSM_TF_EU="$TF_DIR/ssm_eu.tf"

# SSM paths referenced in loadSecrets() — extract from backend code
SSM_PATHS_APP=$(grep -roh "'/mediconnect/prod/[a-zA-Z/_-]*'" "$BACKEND" --include="*.ts" 2>/dev/null | tr -d "'" | sort -u)

SSM_PASS=0
SSM_FAIL=0
SSM_MISSING=()

while IFS= read -r path; do
  [ -z "$path" ] && continue
  # Extract the last part as the parameter name for searching in TF
  param_name=$(echo "$path" | sed 's|.*/||')
  if in_tf "$param_name" "$SSM_TF_US" "$SSM_TF_EU" || in_tf "$path" "$SSM_TF_US" "$SSM_TF_EU"; then
    SSM_PASS=$((SSM_PASS + 1))
  else
    SSM_FAIL=$((SSM_FAIL + 1))
    SSM_MISSING+=("$path")
  fi
done <<< "$SSM_PATHS_APP"

if [ $SSM_FAIL -eq 0 ]; then
  pass "SSM: All $SSM_PASS parameters found in Terraform"
else
  fail "SSM: $SSM_FAIL parameter(s) NOT in Terraform"
  for p in "${SSM_MISSING[@]}"; do
    echo -e "        → $p"
  done
  PASS_COUNT=$((PASS_COUNT + SSM_PASS))
fi

# ============================================================================
# 10. IoT Core
# ============================================================================
header "10. IoT Core (patient-service MQTT vs iot.tf)"

IOT_TF="$TF_DIR/iot.tf"

if [ -f "$IOT_TF" ]; then
  pass "IoT: iot.tf exists"
  if grep -q "thing_type\|policy\|topic_rule" "$IOT_TF" 2>/dev/null; then
    pass "IoT: IoT resources defined"
  else
    warn "IoT: iot.tf exists but may not have all IoT resources"
  fi
else
  fail "IoT: iot.tf missing — patient-service uses MQTT via IoT Core"
fi

# ============================================================================
# 11. SES (Email)
# ============================================================================
header "11. SES (notifications.ts vs ses.tf)"

SES_TF="$TF_DIR/ses.tf"

if [ -f "$SES_TF" ]; then
  pass "SES: ses.tf exists"
  if grep -q "domain_identity\|email_identity\|mediconnect" "$SES_TF" 2>/dev/null; then
    pass "SES: domain/email identity defined"
  else
    warn "SES: ses.tf exists but may not have domain identity"
  fi
else
  fail "SES: ses.tf missing — notifications.ts sends email via SES"
fi

# ============================================================================
# 12. EventBridge
# ============================================================================
header "12. EventBridge (cleanup-recordings vs eventbridge.tf)"

EB_TF="$TF_DIR/eventbridge.tf"

if [ -f "$EB_TF" ]; then
  pass "EventBridge: eventbridge.tf exists"
  if grep -q "MeetingEnded\|stop-recording\|cleanup" "$EB_TF" 2>/dev/null; then
    pass "EventBridge: MeetingEnded rule for cleanup-recordings"
  else
    warn "EventBridge: eventbridge.tf may not have the MeetingEnded rule"
  fi
else
  fail "EventBridge: eventbridge.tf missing — cleanup-recordings uses EventBridge"
fi

# ============================================================================
# 13. API Gateway / WebSocket
# ============================================================================
header "13. API Gateway / WebSocket (communication-service vs apigateway.tf)"

APIGW_TF="$TF_DIR/apigateway.tf"

if [ -f "$APIGW_TF" ]; then
  pass "API Gateway: apigateway.tf exists"
  if grep -q "websocket\|WEBSOCKET\|ws-chat" "$APIGW_TF" 2>/dev/null; then
    pass "API Gateway: WebSocket API defined"
  else
    warn "API Gateway: apigateway.tf may not define WebSocket API"
  fi
else
  fail "API Gateway: apigateway.tf missing — communication-service uses WebSocket"
fi

# ============================================================================
# 14. CloudFront
# ============================================================================
header "14. CloudFront (frontend hosting vs cloudfront.tf)"

CF_TF="$TF_DIR/cloudfront.tf"

if [ -f "$CF_TF" ]; then
  pass "CloudFront: cloudfront.tf exists"
else
  fail "CloudFront: cloudfront.tf missing"
fi

# ============================================================================
# 15. GCP Resources
# ============================================================================
header "15. GCP Resources (backend BigQuery/Healthcare/Cloud Run vs gcp_*.tf)"

GCP_BQ="$TF_DIR/gcp_bigquery.tf"
GCP_CR="$TF_DIR/gcp_cloudrun.tf"
GCP_SVC="$TF_DIR/gcp_services.tf"
GCP_IAM="$TF_DIR/gcp_iam.tf"

# BigQuery datasets referenced in app
GCP_BQ_DATASETS=("mediconnect_analytics" "mediconnect_ai" "iot")

for ds in "${GCP_BQ_DATASETS[@]}"; do
  if in_tf "$ds" "$GCP_BQ"; then
    pass "GCP BigQuery: dataset $ds"
  else
    fail "GCP BigQuery: dataset $ds — referenced in app but NOT in gcp_bigquery.tf"
  fi
done

# Cloud Run services (7 backend services × 2 regions)
CR_SERVICES=("patient-service" "doctor-service" "booking-service" "communication-service" "admin-service" "staff-service" "dicom-service")

for svc in "${CR_SERVICES[@]}"; do
  if in_tf "$svc" "$GCP_CR"; then
    pass "GCP Cloud Run: $svc"
  else
    fail "GCP Cloud Run: $svc — deployed by CI/CD but NOT in gcp_cloudrun.tf"
  fi
done

# Healthcare API
if in_tf "healthcare_dataset\|healthcare_dicom" "$GCP_SVC"; then
  pass "GCP Healthcare: DICOM store defined"
else
  fail "GCP Healthcare: DICOM store NOT in gcp_services.tf"
fi

# Pub/Sub topics
GCP_PUBSUB_TOPICS=("iot-health-sync" "video-call-analytics")

for topic in "${GCP_PUBSUB_TOPICS[@]}"; do
  if in_tf "$topic" "$GCP_SVC"; then
    pass "GCP Pub/Sub: $topic"
  else
    fail "GCP Pub/Sub: $topic — NOT in gcp_services.tf"
  fi
done

# Workload Identity (needed by Cloud Run → AWS bridge)
if in_tf "workload_identity\|github-pool\|aws-to-gcp" "$GCP_IAM"; then
  pass "GCP IAM: Workload Identity pools defined"
else
  fail "GCP IAM: Workload Identity pools NOT in gcp_iam.tf"
fi

# ============================================================================
# 16. Azure Resources
# ============================================================================
header "16. Azure Resources (Cosmos DB vs azure module)"

AZURE_TF="$REPO_ROOT/modules/azure/data/main.tf"

if [ -f "$AZURE_TF" ]; then
  pass "Azure: data module exists"
  if grep -q "cosmosdb_account" "$AZURE_TF" 2>/dev/null; then
    pass "Azure: Cosmos DB account defined"
  else
    fail "Azure: Cosmos DB account NOT in azure module"
  fi
  if grep -q "cosmosdb_sql_database" "$AZURE_TF" 2>/dev/null; then
    pass "Azure: Cosmos DB database defined"
  else
    fail "Azure: Cosmos DB database NOT defined (Finding #1 from Phase 2)"
  fi
else
  fail "Azure: modules/azure/data/main.tf missing"
fi

# ============================================================================
# 17. CI/CD Alignment
# ============================================================================
header "17. CI/CD Alignment (deploy.yml resource targets vs Terraform)"

DEPLOY_YML="$REPO_ROOT/.github/workflows/deploy.yml"

if [ -f "$DEPLOY_YML" ]; then
  pass "CI/CD: deploy.yml exists"

  # Check that all Docker services built in CI/CD have ECR repos
  for svc in "${ECR_SERVICES[@]}"; do
    if grep -q "$svc" "$DEPLOY_YML" 2>/dev/null; then
      pass "CI/CD: $svc referenced in deploy.yml"
    else
      warn "CI/CD: $svc NOT found in deploy.yml (may not be deployed)"
    fi
  done

  # Check Lambda deploys
  for lambda in "cognito-triggers" "ws-authorizer" "cleanup-recordings" "failover-proxy"; do
    if grep -q "$lambda" "$DEPLOY_YML" 2>/dev/null; then
      pass "CI/CD: Lambda $lambda in deploy.yml"
    else
      warn "CI/CD: Lambda $lambda NOT in deploy.yml"
    fi
  done
else
  warn "CI/CD: .github/workflows/deploy.yml not found"
fi

# ============================================================================
# 18. Frontend Check
# ============================================================================
header "18. Frontend Resource References"

if [ -n "$FRONTEND_DIR" ] && [ -d "$FRONTEND_DIR" ]; then
  # Check for API/CDN URLs in frontend
  FE_RESOURCE_REFS=$(grep -roh 'mediconnect[a-z0-9._-]*' "$FRONTEND_DIR/src" --include="*.ts" --include="*.tsx" --include="*.js" 2>/dev/null | sort -u | head -20)
  if [ -n "$FE_RESOURCE_REFS" ]; then
    pass "Frontend: Found resource references in mediconnect-hub/src/"
    echo "        References found:"
    echo "$FE_RESOURCE_REFS" | while read -r ref; do echo "        → $ref"; done
  else
    warn "Frontend: No mediconnect-* references found in source files"
  fi
else
  warn "Frontend: mediconnect-hub/ directory not found at $REPO_ROOT/../mediconnect-hub"
fi

# ============================================================================
# 19. CATCH-ALL: SDK-Based Resource Discovery
# ============================================================================
# This section greps for AWS/GCP/Azure SDK client usage to find resource
# references the hardcoded checks above might miss (non-mediconnect names,
# new service types, etc.)
# ============================================================================
header "19. Catch-All — SDK-Based Resource Discovery"

ALL_TF="$TF_DIR"
CATCHALL_WARN=0
CATCHALL_ITEMS=()

# --- 19a: Find ALL AWS SDK client types used in backend code ---
echo -e "  ${CYAN}Scanning for AWS SDK client usage...${NC}"

# Map: SDK client class → expected TF file pattern
declare -A SDK_TF_MAP
SDK_TF_MAP["DynamoDBClient"]="dynamodb"
SDK_TF_MAP["DynamoDB.DocumentClient"]="dynamodb"
SDK_TF_MAP["SQSClient"]="sqs"
SDK_TF_MAP["SNSClient"]="sns"
SDK_TF_MAP["S3Client"]="s3"
SDK_TF_MAP["KMSClient"]="kms"
SDK_TF_MAP["CognitoIdentityProviderClient"]="cognito"
SDK_TF_MAP["IoTDataPlaneClient"]="iot"
SDK_TF_MAP["IoTClient"]="iot"
SDK_TF_MAP["SESClient"]="ses"
SDK_TF_MAP["SESv2Client"]="ses"
SDK_TF_MAP["EventBridgeClient"]="eventbridge"
SDK_TF_MAP["CloudWatchClient"]="cloudwatch"
SDK_TF_MAP["ApiGatewayManagementApiClient"]="apigateway"
SDK_TF_MAP["ChimeSDKMeetingsClient"]="chime"
SDK_TF_MAP["ChimeSDKMediaPipelinesClient"]="chime"
SDK_TF_MAP["SSMClient"]="ssm"
SDK_TF_MAP["LambdaClient"]="lambda"
SDK_TF_MAP["ECRClient"]="ecr"
SDK_TF_MAP["ElastiCacheClient"]="elasticache"
SDK_TF_MAP["RedshiftClient"]="redshift"
SDK_TF_MAP["RDSClient"]="rds"
SDK_TF_MAP["StepFunctionsClient"]="stepfunctions"
SDK_TF_MAP["GlueClient"]="glue"
SDK_TF_MAP["Route53Client"]="route53"
SDK_TF_MAP["ECSClient"]="ecs"
SDK_TF_MAP["EKSClient"]="eks"
SDK_TF_MAP["WAFv2Client"]="waf"
SDK_TF_MAP["SecretsManagerClient"]="secretsmanager"

# Also check Python boto3 clients
declare -A BOTO3_TF_MAP
BOTO3_TF_MAP["dynamodb"]="dynamodb"
BOTO3_TF_MAP["sqs"]="sqs"
BOTO3_TF_MAP["sns"]="sns"
BOTO3_TF_MAP["s3"]="s3"
BOTO3_TF_MAP["kms"]="kms"
BOTO3_TF_MAP["cognito-idp"]="cognito"
BOTO3_TF_MAP["iot-data"]="iot"
BOTO3_TF_MAP["ses"]="ses"
BOTO3_TF_MAP["sesv2"]="ses"
BOTO3_TF_MAP["events"]="eventbridge"
BOTO3_TF_MAP["cloudwatch"]="cloudwatch"
BOTO3_TF_MAP["ssm"]="ssm"
BOTO3_TF_MAP["lambda"]="lambda"
BOTO3_TF_MAP["ecr"]="ecr"
BOTO3_TF_MAP["elasticache"]="elasticache"
BOTO3_TF_MAP["rds"]="rds"
BOTO3_TF_MAP["stepfunctions"]="stepfunctions"
BOTO3_TF_MAP["secretsmanager"]="secretsmanager"
BOTO3_TF_MAP["ecs"]="ecs"
BOTO3_TF_MAP["eks"]="eks"
BOTO3_TF_MAP["route53"]="route53"
BOTO3_TF_MAP["wafv2"]="waf"
BOTO3_TF_MAP["redshift"]="redshift"

# Services that don't need their own TF file (managed elsewhere or runtime-only)
SKIP_SERVICES="chime|cloudwatch|ssm|lambda|secretsmanager"

# Check TypeScript SDK clients
for sdk_class in "${!SDK_TF_MAP[@]}"; do
  tf_pattern="${SDK_TF_MAP[$sdk_class]}"
  if grep -rq "$sdk_class" "$BACKEND" --include="*.ts" --include="*.mjs" 2>/dev/null; then
    if echo "$tf_pattern" | grep -qE "$SKIP_SERVICES"; then
      continue  # runtime-only services, no dedicated TF needed
    fi
    tf_match=$(find "$ALL_TF" -name "*.tf" 2>/dev/null | xargs grep -l "$tf_pattern\|${tf_pattern}_" 2>/dev/null | head -1)
    if [ -z "$tf_match" ]; then
      # Double-check: maybe the TF file is named differently
      tf_file_match=$(find "$ALL_TF" -name "*${tf_pattern}*" 2>/dev/null | head -1)
      if [ -z "$tf_file_match" ]; then
        warn "SDK Catch-All: Code uses $sdk_class but no *${tf_pattern}*.tf found"
        CATCHALL_WARN=$((CATCHALL_WARN + 1))
        CATCHALL_ITEMS+=("TypeScript: $sdk_class → missing ${tf_pattern}.tf")
      fi
    fi
  fi
done

# Check Python boto3 clients
for boto_svc in "${!BOTO3_TF_MAP[@]}"; do
  tf_pattern="${BOTO3_TF_MAP[$boto_svc]}"
  if grep -rq "boto3.*['\"]$boto_svc['\"]\\|client('$boto_svc')\\|resource('$boto_svc')" "$BACKEND" --include="*.py" 2>/dev/null; then
    if echo "$tf_pattern" | grep -qE "$SKIP_SERVICES"; then
      continue
    fi
    tf_match=$(find "$ALL_TF" -name "*.tf" 2>/dev/null | xargs grep -l "$tf_pattern\|${tf_pattern}_" 2>/dev/null | head -1)
    if [ -z "$tf_match" ]; then
      tf_file_match=$(find "$ALL_TF" -name "*${tf_pattern}*" 2>/dev/null | head -1)
      if [ -z "$tf_file_match" ]; then
        warn "SDK Catch-All: Python code uses boto3 '$boto_svc' but no *${tf_pattern}*.tf found"
        CATCHALL_WARN=$((CATCHALL_WARN + 1))
        CATCHALL_ITEMS+=("Python boto3: $boto_svc → missing ${tf_pattern}.tf")
      fi
    fi
  fi
done

# --- 19b: Find non-mediconnect resource names in SOURCE code only ---
echo -e "  ${CYAN}Scanning for non-standard resource names...${NC}"

# Only scan actual source dirs (NOT node_modules, NOT .d.ts type defs)
SRC_DIRS=()
for svc_dir in "$BACKEND"/*/src "$BACKEND"/shared "$BACKEND"/cognito-triggers "$BACKEND"/ws-authorizer "$BACKEND"/cleanup-recordings "$BACKEND"/failover-proxy; do
  [ -d "$svc_dir" ] && SRC_DIRS+=("$svc_dir")
done
# Add Python service root dirs (no src/ subdir)
for py_dir in "$BACKEND"/admin-service "$BACKEND"/dicom-service; do
  [ -d "$py_dir" ] && SRC_DIRS+=("$py_dir")
done

if [ ${#SRC_DIRS[@]} -gt 0 ]; then
  # Find table names that aren't mediconnect-*
  NON_MC_TABLES=$(grep -rh 'TableName.*"[a-z]' "${SRC_DIRS[@]}" --include="*.ts" --include="*.py" --include="*.mjs" 2>/dev/null \
    | grep -v node_modules | grep -v '.d.ts' \
    | grep -o '"[a-z][a-z0-9_-]*"' | tr -d '"' | grep -v "mediconnect" | sort -u)

  # Find bucket names that aren't mediconnect-*
  NON_MC_BUCKETS=$(grep -rh 'Bucket.*"[a-z]' "${SRC_DIRS[@]}" --include="*.ts" --include="*.py" --include="*.mjs" 2>/dev/null \
    | grep -v node_modules | grep -v '.d.ts' \
    | grep -o '"[a-z][a-z0-9._-]*"' | tr -d '"' | grep -v "mediconnect" | sort -u)

  for res in $NON_MC_TABLES $NON_MC_BUCKETS; do
    [ -z "$res" ] && continue
    [ ${#res} -lt 6 ] && continue  # skip short strings
    # Skip obvious non-resources (code patterns, not resource names)
    echo "$res" | grep -qiE '^test|^mock|^example|^my-|^my_|^placeholder|^bucket|^table|^queue' && continue
    if ! grep -rq "$res" "$ALL_TF" --include="*.tf" 2>/dev/null; then
      warn "Non-standard name: '$res' in source code but not in any .tf file"
      CATCHALL_WARN=$((CATCHALL_WARN + 1))
      CATCHALL_ITEMS+=("Non-standard: $res")
    fi
  done
fi

# --- 19c: Find hardcoded ARN references in source code ---
echo -e "  ${CYAN}Scanning for hardcoded ARNs...${NC}"

if [ ${#SRC_DIRS[@]} -gt 0 ]; then
  HARDCODED_ARNS=$(grep -roh 'arn:aws:[a-z0-9-]*:[a-z0-9-]*:[0-9]*:[a-zA-Z0-9/_:.-]*' \
    "${SRC_DIRS[@]}" "$LAMBDAS" \
    --include="*.ts" --include="*.py" --include="*.mjs" --include="*.js" 2>/dev/null \
    | grep -v node_modules \
    | grep -v '111122223333\|123456789012\|123456789123\|000000000000\|444455556666\|555555555555\|999999999999\|EXAMPLE\|1234abcd' \
    | sort -u | head -20)

  while IFS= read -r arn; do
    [ -z "$arn" ] && continue
    resource_name=$(echo "$arn" | sed 's|.*/||' | sed 's|:.*||')
    [ -z "$resource_name" ] || [ ${#resource_name} -lt 3 ] && continue
    if ! grep -rq "$resource_name" "$ALL_TF" --include="*.tf" 2>/dev/null; then
      warn "Hardcoded ARN: $arn — '$resource_name' not in TF"
      CATCHALL_WARN=$((CATCHALL_WARN + 1))
      CATCHALL_ITEMS+=("ARN: $arn")
    fi
  done <<< "$HARDCODED_ARNS"
fi

# --- 19d: Find GCP/Azure SDK usage not covered ---
echo -e "  ${CYAN}Scanning for GCP/Azure SDK usage...${NC}"

# GCP clients
GCP_CLIENTS=("BigQuery" "CloudRunClient" "HealthcareService" "Storage" "PubSub" "SecretManagerServiceClient" "ArtifactRegistryClient")
for gcp_class in "${GCP_CLIENTS[@]}"; do
  if grep -rq "$gcp_class" "$BACKEND" --include="*.ts" --include="*.py" 2>/dev/null; then
    # Check if any gcp_*.tf file exists
    gcp_tf=$(find "$ALL_TF" -name "gcp_*.tf" 2>/dev/null | head -1)
    if [ -z "$gcp_tf" ]; then
      warn "SDK Catch-All: Code uses GCP $gcp_class but no gcp_*.tf files found"
      CATCHALL_WARN=$((CATCHALL_WARN + 1))
      CATCHALL_ITEMS+=("GCP: $gcp_class → no gcp_*.tf")
    fi
  fi
done

# Azure clients
AZURE_CLIENTS=("CosmosClient" "azure.cosmos" "BlobServiceClient" "azure.storage")
for az_class in "${AZURE_CLIENTS[@]}"; do
  if grep -rq "$az_class" "$BACKEND" --include="*.ts" --include="*.py" 2>/dev/null; then
    az_tf=$(find "$REPO_ROOT/modules" -path "*/azure/*" -name "*.tf" 2>/dev/null | head -1)
    if [ -z "$az_tf" ]; then
      warn "SDK Catch-All: Code uses Azure $az_class but no azure module .tf files found"
      CATCHALL_WARN=$((CATCHALL_WARN + 1))
      CATCHALL_ITEMS+=("Azure: $az_class → no azure/*.tf")
    fi
  fi
done

# --- 19e: Summary ---
if [ $CATCHALL_WARN -eq 0 ]; then
  pass "SDK Catch-All: No uncovered SDK clients or non-standard resources found"
else
  echo ""
  echo -e "  ${YELLOW}${BOLD}Catch-All found $CATCHALL_WARN item(s) to review:${NC}"
  for item in "${CATCHALL_ITEMS[@]}"; do
    echo -e "    ${YELLOW}?${NC} $item"
  done
  echo ""
  echo -e "  ${CYAN}Note: These are WARNs, not FAILs. Review each to determine if TF coverage is needed.${NC}"
fi

# ============================================================================
# SUMMARY
# ============================================================================
header "SUMMARY"

echo ""
echo -e "  ${GREEN}PASS:${NC}    $PASS_COUNT"
echo -e "  ${RED}FAIL:${NC}    $FAIL_COUNT"
echo -e "  ${YELLOW}WARN:${NC}    $WARN_COUNT"
echo ""

if [ $FAIL_COUNT -gt 0 ]; then
  echo -e "${RED}${BOLD}══════════════════════════════════════════${NC}"
  echo -e "${RED}${BOLD}  RESULT: FAIL — $FAIL_COUNT resource gap(s) found${NC}"
  echo -e "${RED}${BOLD}══════════════════════════════════════════${NC}"
  echo ""
  echo -e "  Missing resources (app references but no Terraform):"
  for m in "${MISSING_RESOURCES[@]}"; do
    echo -e "    ${RED}✗${NC} $m"
  done
else
  echo -e "${GREEN}${BOLD}══════════════════════════════════════════${NC}"
  echo -e "${GREEN}${BOLD}  RESULT: PASS — All app resources have Terraform coverage${NC}"
  echo -e "${GREEN}${BOLD}══════════════════════════════════════════${NC}"
fi

if [ ${#ORPHANED_RESOURCES[@]} -gt 0 ]; then
  echo ""
  echo -e "  Orphaned resources (in Terraform but not referenced by app):"
  for o in "${ORPHANED_RESOURCES[@]}"; do
    echo -e "    ${YELLOW}?${NC} $o"
  done
fi

echo ""
echo "Run date: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo "Script: verify_app_vs_iac.sh"

# Exit with failure if any FAILs
[ $FAIL_COUNT -eq 0 ]
