#!/usr/bin/env bash
# ============================================================================
# Phase 0: AWS Cloud Discovery — READ-ONLY
# Exports all AWS resources for both us-east-1 and eu-central-1
# Output: phase0-aws-discovery-results.md
# ============================================================================
set -euo pipefail

OUT="phase0-aws-discovery-results.md"
REGIONS=("us-east-1" "eu-central-1")

echo "# Phase 0: AWS Cloud Discovery Results" > "$OUT"
echo "Generated: $(date -u '+%Y-%m-%d %H:%M:%S UTC')" >> "$OUT"
echo "" >> "$OUT"

# Helper: run command, capture output, handle errors
discover() {
  local title="$1"
  local region="$2"
  shift 2
  echo "  -> $title ($region)..."
  echo "### $title [$region]" >> "$OUT"
  echo '```' >> "$OUT"
  if output=$("$@" --region "$region" 2>&1); then
    echo "$output" >> "$OUT"
  else
    echo "ERROR or EMPTY: $output" >> "$OUT"
  fi
  echo '```' >> "$OUT"
  echo "" >> "$OUT"
}

# Helper for commands that don't take --region
discover_global() {
  local title="$1"
  shift
  echo "  -> $title (global)..."
  echo "### $title [global]" >> "$OUT"
  echo '```' >> "$OUT"
  if output=$("$@" 2>&1); then
    echo "$output" >> "$OUT"
  else
    echo "ERROR or EMPTY: $output" >> "$OUT"
  fi
  echo '```' >> "$OUT"
  echo "" >> "$OUT"
}

# ─── 0. ACCOUNT IDENTITY ─────────────────────────────────────────────────────
echo "========================================="
echo "Phase 0: AWS Cloud Discovery (read-only)"
echo "========================================="
echo ""
echo "[0/11] Account identity..."
echo "## 0. Account Identity" >> "$OUT"
discover_global "STS Caller Identity" aws sts get-caller-identity --output json
echo ""

# ─── 1. DYNAMODB TABLES ──────────────────────────────────────────────────────
echo "[1/11] DynamoDB tables..."
echo "## 1. DynamoDB Tables" >> "$OUT"
for region in "${REGIONS[@]}"; do
  echo "### Table List [$region]" >> "$OUT"
  echo '```' >> "$OUT"
  tables=$(aws dynamodb list-tables --region "$region" --output json 2>&1)
  echo "$tables" >> "$OUT"
  echo '```' >> "$OUT"
  echo "" >> "$OUT"

  # Get details for each mediconnect table
  for table in $(echo "$tables" | grep -o '"mediconnect-[^"]*"' | tr -d '"' 2>/dev/null); do
    echo "  -> Table details: $table ($region)..."
    echo "#### $table [$region]" >> "$OUT"
    echo '```json' >> "$OUT"
    aws dynamodb describe-table --table-name "$table" --region "$region" --output json 2>&1 \
      | grep -E '"TableName"|"TableStatus"|"KeySchema"|"AttributeDefinitions"|"GlobalSecondaryIndexes"|"BillingMode"|"TableSizeBytes"|"ItemCount"|"PointInTimeRecoveryDescription"|"SSEDescription"|"DeletionProtectionEnabled"|"TableArn"|"StreamSpecification"|"TimeToLiveDescription"' >> "$OUT" 2>/dev/null || true
    echo "" >> "$OUT"
    # Get full describe for import later
    aws dynamodb describe-table --table-name "$table" --region "$region" --output json >> "$OUT" 2>&1
    echo '```' >> "$OUT"
    echo "" >> "$OUT"

    # PITR status
    echo "##### PITR [$table]" >> "$OUT"
    echo '```' >> "$OUT"
    aws dynamodb describe-continuous-backups --table-name "$table" --region "$region" --output json >> "$OUT" 2>&1
    echo '```' >> "$OUT"

    # TTL status
    echo "##### TTL [$table]" >> "$OUT"
    echo '```' >> "$OUT"
    aws dynamodb describe-time-to-live --table-name "$table" --region "$region" --output json >> "$OUT" 2>&1
    echo '```' >> "$OUT"
    echo "" >> "$OUT"
  done
done

# ─── 2. S3 BUCKETS ───────────────────────────────────────────────────────────
echo "[2/11] S3 buckets..."
echo "## 2. S3 Buckets" >> "$OUT"
discover_global "Bucket List" aws s3api list-buckets --output json

# Get details for each mediconnect bucket
for bucket in $(aws s3api list-buckets --output json 2>/dev/null | grep -o '"mediconnect-[^"]*"' | tr -d '"'); do
  echo "  -> Bucket details: $bucket..."
  echo "### $bucket" >> "$OUT"

  echo "#### Location" >> "$OUT"
  echo '```' >> "$OUT"
  aws s3api get-bucket-location --bucket "$bucket" --output json >> "$OUT" 2>&1
  echo '```' >> "$OUT"

  echo "#### Versioning" >> "$OUT"
  echo '```' >> "$OUT"
  aws s3api get-bucket-versioning --bucket "$bucket" --output json >> "$OUT" 2>&1
  echo '```' >> "$OUT"

  echo "#### Encryption" >> "$OUT"
  echo '```' >> "$OUT"
  aws s3api get-bucket-encryption --bucket "$bucket" --output json >> "$OUT" 2>&1
  echo '```' >> "$OUT"

  echo "#### Public Access Block" >> "$OUT"
  echo '```' >> "$OUT"
  aws s3api get-public-access-block --bucket "$bucket" --output json >> "$OUT" 2>&1
  echo '```' >> "$OUT"

  echo "#### CORS" >> "$OUT"
  echo '```' >> "$OUT"
  aws s3api get-bucket-cors --bucket "$bucket" --output json >> "$OUT" 2>&1
  echo '```' >> "$OUT"

  echo "#### Lifecycle" >> "$OUT"
  echo '```' >> "$OUT"
  aws s3api get-bucket-lifecycle-configuration --bucket "$bucket" --output json >> "$OUT" 2>&1
  echo '```' >> "$OUT"

  echo "#### Policy" >> "$OUT"
  echo '```' >> "$OUT"
  aws s3api get-bucket-policy --bucket "$bucket" --output json >> "$OUT" 2>&1
  echo '```' >> "$OUT"

  echo "#### Replication" >> "$OUT"
  echo '```' >> "$OUT"
  aws s3api get-bucket-replication --bucket "$bucket" --output json >> "$OUT" 2>&1
  echo '```' >> "$OUT"

  echo "#### Tags" >> "$OUT"
  echo '```' >> "$OUT"
  aws s3api get-bucket-tagging --bucket "$bucket" --output json >> "$OUT" 2>&1
  echo '```' >> "$OUT"
  echo "" >> "$OUT"
done

# ─── 3. IAM ROLES & POLICIES ─────────────────────────────────────────────────
echo "[3/11] IAM roles & policies..."
echo "## 3. IAM Roles & Policies" >> "$OUT"

echo "### All Roles (mediconnect filter)" >> "$OUT"
echo '```' >> "$OUT"
aws iam list-roles --output json 2>&1 | grep -A5 '"RoleName": "mediconnect\|"RoleName": "Mediconnect\|"RoleName": "MEDICONNECT' >> "$OUT" 2>/dev/null || echo "No mediconnect roles found via grep" >> "$OUT"
echo '```' >> "$OUT"
echo "" >> "$OUT"

# Full role list for manual review
echo "### All Role Names" >> "$OUT"
echo '```' >> "$OUT"
aws iam list-roles --query 'Roles[].RoleName' --output json >> "$OUT" 2>&1
echo '```' >> "$OUT"
echo "" >> "$OUT"

# Get policies for each mediconnect role
for role in $(aws iam list-roles --query 'Roles[].RoleName' --output text 2>/dev/null | tr '\t' '\n' | grep -i mediconnect); do
  echo "  -> Role details: $role..."
  echo "### Role: $role" >> "$OUT"

  echo "#### Attached Policies" >> "$OUT"
  echo '```' >> "$OUT"
  aws iam list-attached-role-policies --role-name "$role" --output json >> "$OUT" 2>&1
  echo '```' >> "$OUT"

  echo "#### Inline Policies" >> "$OUT"
  echo '```' >> "$OUT"
  inline_policies=$(aws iam list-role-policies --role-name "$role" --output json 2>&1)
  echo "$inline_policies" >> "$OUT"
  echo '```' >> "$OUT"

  # Get each inline policy document
  for policy_name in $(echo "$inline_policies" | grep -o '"[^"]*"' | tr -d '"' | grep -v PolicyNames 2>/dev/null); do
    echo "#### Inline Policy: $policy_name" >> "$OUT"
    echo '```json' >> "$OUT"
    aws iam get-role-policy --role-name "$role" --policy-name "$policy_name" --output json >> "$OUT" 2>&1
    echo '```' >> "$OUT"
  done

  echo "#### Trust Policy" >> "$OUT"
  echo '```json' >> "$OUT"
  aws iam get-role --role-name "$role" --query 'Role.AssumeRolePolicyDocument' --output json >> "$OUT" 2>&1
  echo '```' >> "$OUT"
  echo "" >> "$OUT"
done

# ─── 4. COGNITO USER POOLS ───────────────────────────────────────────────────
echo "[4/11] Cognito user pools..."
echo "## 4. Cognito User Pools" >> "$OUT"
for region in "${REGIONS[@]}"; do
  echo "### User Pools [$region]" >> "$OUT"
  echo '```' >> "$OUT"
  pools=$(aws cognito-idp list-user-pools --max-results 20 --region "$region" --output json 2>&1)
  echo "$pools" >> "$OUT"
  echo '```' >> "$OUT"
  echo "" >> "$OUT"

  for pool_id in $(echo "$pools" | grep -o '"Id": "[^"]*"' | awk -F'"' '{print $4}' 2>/dev/null); do
    echo "  -> Pool details: $pool_id ($region)..."
    echo "#### Pool: $pool_id [$region]" >> "$OUT"
    echo '```json' >> "$OUT"
    aws cognito-idp describe-user-pool --user-pool-id "$pool_id" --region "$region" --output json >> "$OUT" 2>&1
    echo '```' >> "$OUT"

    echo "##### App Clients" >> "$OUT"
    echo '```' >> "$OUT"
    aws cognito-idp list-user-pool-clients --user-pool-id "$pool_id" --region "$region" --output json >> "$OUT" 2>&1
    echo '```' >> "$OUT"

    echo "##### Groups" >> "$OUT"
    echo '```' >> "$OUT"
    aws cognito-idp list-groups --user-pool-id "$pool_id" --region "$region" --output json >> "$OUT" 2>&1
    echo '```' >> "$OUT"

    echo "##### Lambda Triggers" >> "$OUT"
    echo '```' >> "$OUT"
    aws cognito-idp describe-user-pool --user-pool-id "$pool_id" --region "$region" --query 'UserPool.LambdaConfig' --output json >> "$OUT" 2>&1
    echo '```' >> "$OUT"
    echo "" >> "$OUT"
  done
done

# ─── 5. KMS KEYS ─────────────────────────────────────────────────────────────
echo "[5/11] KMS keys..."
echo "## 5. KMS Keys" >> "$OUT"
for region in "${REGIONS[@]}"; do
  echo "### KMS Keys [$region]" >> "$OUT"
  echo '```' >> "$OUT"
  keys=$(aws kms list-keys --region "$region" --output json 2>&1)
  echo "$keys" >> "$OUT"
  echo '```' >> "$OUT"
  echo "" >> "$OUT"

  for key_id in $(echo "$keys" | grep -o '"KeyId": "[^"]*"' | awk -F'"' '{print $4}' 2>/dev/null); do
    # Only show customer-managed keys (skip AWS-managed)
    key_meta=$(aws kms describe-key --key-id "$key_id" --region "$region" --output json 2>/dev/null)
    key_manager=$(echo "$key_meta" | grep -o '"KeyManager": "[^"]*"' | awk -F'"' '{print $4}' 2>/dev/null)
    if [ "$key_manager" = "CUSTOMER" ]; then
      echo "  -> Customer key: $key_id ($region)..."
      echo "#### Key: $key_id [$region]" >> "$OUT"
      echo '```json' >> "$OUT"
      echo "$key_meta" >> "$OUT"
      echo '```' >> "$OUT"

      echo "##### Aliases" >> "$OUT"
      echo '```' >> "$OUT"
      aws kms list-aliases --key-id "$key_id" --region "$region" --output json >> "$OUT" 2>&1
      echo '```' >> "$OUT"

      echo "##### Key Policy" >> "$OUT"
      echo '```json' >> "$OUT"
      aws kms get-key-policy --key-id "$key_id" --policy-name default --region "$region" --output json >> "$OUT" 2>&1
      echo '```' >> "$OUT"
      echo "" >> "$OUT"
    fi
  done
done

# ─── 6. SQS QUEUES ───────────────────────────────────────────────────────────
echo "[6/11] SQS queues..."
echo "## 6. SQS Queues" >> "$OUT"
for region in "${REGIONS[@]}"; do
  echo "### Queue List [$region]" >> "$OUT"
  echo '```' >> "$OUT"
  queues=$(aws sqs list-queues --region "$region" --output json 2>&1)
  echo "$queues" >> "$OUT"
  echo '```' >> "$OUT"
  echo "" >> "$OUT"

  for queue_url in $(echo "$queues" | grep -o '"https://[^"]*"' | tr -d '"' 2>/dev/null); do
    queue_name=$(basename "$queue_url")
    echo "  -> Queue: $queue_name ($region)..."
    echo "#### $queue_name [$region]" >> "$OUT"
    echo '```json' >> "$OUT"
    aws sqs get-queue-attributes --queue-url "$queue_url" --attribute-names All --region "$region" --output json >> "$OUT" 2>&1
    echo '```' >> "$OUT"
    echo "" >> "$OUT"
  done
done

# ─── 7. SNS TOPICS ───────────────────────────────────────────────────────────
echo "[7/11] SNS topics..."
echo "## 7. SNS Topics" >> "$OUT"
for region in "${REGIONS[@]}"; do
  discover "Topic List" "$region" aws sns list-topics --output json

  for topic_arn in $(aws sns list-topics --region "$region" --output json 2>/dev/null | grep -o '"TopicArn": "[^"]*"' | awk -F'"' '{print $4}'); do
    topic_name=$(echo "$topic_arn" | awk -F: '{print $NF}')
    echo "  -> Topic: $topic_name ($region)..."
    echo "#### $topic_name [$region]" >> "$OUT"
    echo '```json' >> "$OUT"
    aws sns get-topic-attributes --topic-arn "$topic_arn" --region "$region" --output json >> "$OUT" 2>&1
    echo '```' >> "$OUT"

    echo "##### Subscriptions" >> "$OUT"
    echo '```' >> "$OUT"
    aws sns list-subscriptions-by-topic --topic-arn "$topic_arn" --region "$region" --output json >> "$OUT" 2>&1
    echo '```' >> "$OUT"
    echo "" >> "$OUT"
  done
done

# ─── 8. LAMBDA FUNCTIONS ─────────────────────────────────────────────────────
echo "[8/11] Lambda functions..."
echo "## 8. Lambda Functions" >> "$OUT"
for region in "${REGIONS[@]}"; do
  echo "### Function List [$region]" >> "$OUT"
  echo '```' >> "$OUT"
  functions=$(aws lambda list-functions --region "$region" --output json 2>&1)
  echo "$functions" >> "$OUT"
  echo '```' >> "$OUT"
  echo "" >> "$OUT"

  for func_name in $(echo "$functions" | grep -o '"FunctionName": "[^"]*"' | awk -F'"' '{print $4}' 2>/dev/null); do
    echo "  -> Lambda: $func_name ($region)..."
    echo "#### $func_name [$region]" >> "$OUT"

    echo "##### Event Source Mappings" >> "$OUT"
    echo '```' >> "$OUT"
    aws lambda list-event-source-mappings --function-name "$func_name" --region "$region" --output json >> "$OUT" 2>&1
    echo '```' >> "$OUT"

    echo "##### Environment Variables (keys only)" >> "$OUT"
    echo '```' >> "$OUT"
    aws lambda get-function-configuration --function-name "$func_name" --region "$region" \
      --query 'Environment.Variables | keys(@)' --output json >> "$OUT" 2>&1
    echo '```' >> "$OUT"

    echo "##### Triggers/Permissions" >> "$OUT"
    echo '```' >> "$OUT"
    aws lambda get-policy --function-name "$func_name" --region "$region" --output json >> "$OUT" 2>&1 || echo "(no resource policy)" >> "$OUT"
    echo '```' >> "$OUT"
    echo "" >> "$OUT"
  done
done

# ─── 9. API GATEWAY ──────────────────────────────────────────────────────────
echo "[9/11] API Gateway..."
echo "## 9. API Gateway" >> "$OUT"
for region in "${REGIONS[@]}"; do
  echo "### REST APIs [$region]" >> "$OUT"
  echo '```' >> "$OUT"
  aws apigateway get-rest-apis --region "$region" --output json >> "$OUT" 2>&1
  echo '```' >> "$OUT"

  echo "### WebSocket APIs (API Gateway v2) [$region]" >> "$OUT"
  echo '```' >> "$OUT"
  aws apigatewayv2 get-apis --region "$region" --output json >> "$OUT" 2>&1
  echo '```' >> "$OUT"
  echo "" >> "$OUT"
done

# ─── 10. SSM PARAMETERS ──────────────────────────────────────────────────────
echo "[10/11] SSM parameters (names only, no values)..."
echo "## 10. SSM Parameters (names + types only, no secret values)" >> "$OUT"
for region in "${REGIONS[@]}"; do
  echo "### Parameters [$region]" >> "$OUT"
  echo '```' >> "$OUT"
  aws ssm describe-parameters --region "$region" \
    --query 'Parameters[].{Name:Name, Type:Type, Tier:Tier, LastModifiedDate:LastModifiedDate}' \
    --output json >> "$OUT" 2>&1
  echo '```' >> "$OUT"
  echo "" >> "$OUT"
done

# ─── 11. ECR, ECS, CLOUDWATCH ────────────────────────────────────────────────
echo "[11/11] ECR, ECS, CloudWatch..."
echo "## 11. ECR Repositories" >> "$OUT"
for region in "${REGIONS[@]}"; do
  discover "ECR Repos" "$region" aws ecr describe-repositories --output json
done

echo "## 12. ECS Clusters" >> "$OUT"
for region in "${REGIONS[@]}"; do
  discover "ECS Clusters" "$region" aws ecs list-clusters --output json

  for cluster_arn in $(aws ecs list-clusters --region "$region" --output json 2>/dev/null | grep -o '"arn:[^"]*"' | tr -d '"'); do
    cluster_name=$(echo "$cluster_arn" | awk -F/ '{print $NF}')
    echo "  -> Cluster: $cluster_name ($region)..."
    echo "#### $cluster_name [$region]" >> "$OUT"
    echo '```json' >> "$OUT"
    aws ecs describe-clusters --clusters "$cluster_arn" --region "$region" --output json >> "$OUT" 2>&1
    echo '```' >> "$OUT"

    echo "##### Services" >> "$OUT"
    echo '```' >> "$OUT"
    aws ecs list-services --cluster "$cluster_arn" --region "$region" --output json >> "$OUT" 2>&1
    echo '```' >> "$OUT"

    echo "##### Tasks" >> "$OUT"
    echo '```' >> "$OUT"
    aws ecs list-tasks --cluster "$cluster_arn" --region "$region" --output json >> "$OUT" 2>&1
    echo '```' >> "$OUT"
    echo "" >> "$OUT"
  done
done

echo "## 13. CloudWatch Alarms" >> "$OUT"
for region in "${REGIONS[@]}"; do
  discover "CloudWatch Alarms" "$region" aws cloudwatch describe-alarms \
    --query 'MetricAlarms[].{Name:AlarmName,Metric:MetricName,State:StateValue}' --output json
done

echo "## 14. CloudWatch Log Groups (mediconnect)" >> "$OUT"
for region in "${REGIONS[@]}"; do
  echo "### Log Groups [$region]" >> "$OUT"
  echo '```' >> "$OUT"
  aws logs describe-log-groups --region "$region" \
    --query 'logGroups[].{Name:logGroupName,RetentionDays:retentionInDays,StoredBytes:storedBytes}' \
    --output json >> "$OUT" 2>&1
  echo '```' >> "$OUT"
  echo "" >> "$OUT"
done

# ─── 15. SES (Email) ─────────────────────────────────────────────────────────
echo "## 15. SES Email Identities" >> "$OUT"
for region in "${REGIONS[@]}"; do
  discover "SES Identities" "$region" aws sesv2 list-email-identities --output json
done

# ─── DONE ─────────────────────────────────────────────────────────────────────
echo "" >> "$OUT"
echo "---" >> "$OUT"
echo "Discovery complete. Total resources cataloged at $(date -u '+%Y-%m-%d %H:%M:%S UTC')" >> "$OUT"

echo ""
echo "========================================="
echo "DONE! Results saved to: $OUT"
echo "========================================="
echo "File size: $(wc -c < "$OUT") bytes"
