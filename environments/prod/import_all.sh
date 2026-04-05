#!/usr/bin/env bash
# Master import script for Phase 1 Steps 3-18
# Run from: environments/prod/
# Prerequisites: terraform init (with all modules)
set -euo pipefail

echo "============================================"
echo "Phase 1: Import All Remaining AWS Resources"
echo "============================================"

# ── Step 3: Cognito ─────────────────────────────────────────────────
echo ""
echo "=== Step 3: Cognito ==="
bash import_cognito.sh

# ── Step 4: KMS ─────────────────────────────────────────────────────
echo ""
echo "=== Step 4: KMS ==="
bash import_kms.sh

# ── Step 5: Lambda ──────────────────────────────────────────────────
echo ""
echo "=== Step 5: Lambda ==="
bash import_lambda.sh

# ── Step 6: IAM Roles (45) ─────────────────────────────────────────
echo ""
echo "=== Step 6: IAM Roles ==="
roles=(mediconnect-admin-role mediconnect-auto-group-eu-role-ewcj2kcy mediconnect-auto-group-us-role-msj8mvre mediconnect-azure-role-us mediconnect-billing-service-role-rfaptbgu mediconnect-book-appointment-role-q8q3s008 mediconnect-booking-role mediconnect-cancel-appointment-role-43pkwks2 mediconnect-cleanup-recordings-role-g9twqdgq mediconnect-cleanup-recordings-role-i088yo9g mediconnect-cleanup-service-role-6p3uo83y mediconnect-comm-role mediconnect-create-doctor-role-7vu5yt62 mediconnect-create-patient-role-a2tin7y6 mediconnect-dicom-role mediconnect-doctor-role mediconnect-ehr-service-role-qu55gdhw mediconnect-eks-pod-role mediconnect-failover-proxy-role-enf1d6hy mediconnect-failover-proxy-role-jehbuy9v mediconnect-file-sharing-service-role-yv0v6kc2 mediconnect-get-appointments-role-8f7rs7ve mediconnect-get-doctors-role-bgepsu8i mediconnect-get-patients-role-4p2aska2 mediconnect-get-vitals-role-vttgimn7 mediconnect-graph-service-role-50gdzyo0 mediconnect-imaging-service-role-genwi8el mediconnect-iot-gcp-sync-role-benw9tph mediconnect-lambda-shared-role mediconnect-migration-role mediconnect-patient-role mediconnect-prescription-service-role-5pr8s84o mediconnect-staff-role mediconnect-stream-to-bigquery-role-rht3ozce mediconnect-symptom-checker-role-hmvxvqh5 mediconnect-update-schedule-role-ul1us2xa mediconnect-websocket-handler-role-ibksgcey mediconnect-ws-authorizer-role-5u712lso mediconnect-ws-authorizer-role-62a577ny MediconnectAnalyticsRole MediconnectBillingRole MediconnectBuildRole MediconnectLambdaRole MediconnectPipelineRole MediconnectReplicationRole)
for role in "${roles[@]}"; do
  terraform import "aws_iam_role.roles[\"$role\"]" "$role"
done

# ── Step 7: SNS Topics ─────────────────────────────────────────────
echo ""
echo "=== Step 7: SNS Topics ==="
for topic in mediconnect-appointments mediconnect-high-risk-alerts mediconnect-ops-alerts mediconnect-pharmacy-alerts mediconnect-prescription-alerts billing-alert; do
  terraform import "module.sns_us.aws_sns_topic.topics[\"$topic\"]" "arn:aws:sns:us-east-1:950110266426:$topic"
done
terraform import 'module.sns_eu.aws_sns_topic.topics["mediconnect-high-risk-alerts-eu"]' "arn:aws:sns:eu-central-1:950110266426:mediconnect-high-risk-alerts-eu"

# ── Step 8: SQS Queue ──────────────────────────────────────────────
echo ""
echo "=== Step 8: SQS ==="
terraform import 'aws_sqs_queue.dlq_us' "https://sqs.us-east-1.amazonaws.com/950110266426/mediconnect-dlq"

# ── Step 9: API Gateway WebSocket ───────────────────────────────────
echo ""
echo "=== Step 9: API Gateway ==="
# US
terraform import 'aws_apigatewayv2_api.ws_chat_us' 03n2vxsh7i
terraform import 'aws_apigatewayv2_stage.ws_chat_us_production' 03n2vxsh7i/production
terraform import 'aws_apigatewayv2_authorizer.ws_us_authorizer' 03n2vxsh7i/20l80b
terraform import 'aws_apigatewayv2_integration.ws_us_failover' 03n2vxsh7i/x4666e6
terraform import 'aws_apigatewayv2_route.ws_us_connect' 03n2vxsh7i/jzy3fbf
terraform import 'aws_apigatewayv2_route.ws_us_disconnect' 03n2vxsh7i/ijbjozu
terraform import 'aws_apigatewayv2_route.ws_us_send_message' 03n2vxsh7i/u87gtvi
# EU — need EU route/integration/authorizer IDs
EU_ROUTES=$(aws apigatewayv2 get-routes --api-id n37uhok3d7 --region eu-central-1 --output json 2>/dev/null)
EU_INTEGRATIONS=$(aws apigatewayv2 get-integrations --api-id n37uhok3d7 --region eu-central-1 --output json 2>/dev/null)
EU_AUTHORIZERS=$(aws apigatewayv2 get-authorizers --api-id n37uhok3d7 --region eu-central-1 --output json 2>/dev/null)

EU_CONNECT_ROUTE=$(echo "$EU_ROUTES" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));const r=d.Items.find(i=>i.RouteKey==='\$connect');process.stdout.write(r.RouteId)")
EU_DISCONNECT_ROUTE=$(echo "$EU_ROUTES" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));const r=d.Items.find(i=>i.RouteKey==='\$disconnect');process.stdout.write(r.RouteId)")
EU_SENDMSG_ROUTE=$(echo "$EU_ROUTES" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));const r=d.Items.find(i=>i.RouteKey==='sendMessage');process.stdout.write(r.RouteId)")
EU_INTEGRATION=$(echo "$EU_INTEGRATIONS" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));process.stdout.write(d.Items[0].IntegrationId)")
EU_AUTHORIZER=$(echo "$EU_AUTHORIZERS" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));process.stdout.write(d.Items[0].AuthorizerId)")

terraform import 'aws_apigatewayv2_api.ws_chat_eu' n37uhok3d7
terraform import 'aws_apigatewayv2_stage.ws_chat_eu_production' n37uhok3d7/production
terraform import "aws_apigatewayv2_authorizer.ws_eu_authorizer" "n37uhok3d7/$EU_AUTHORIZER"
terraform import "aws_apigatewayv2_integration.ws_eu_failover" "n37uhok3d7/$EU_INTEGRATION"
terraform import "aws_apigatewayv2_route.ws_eu_connect" "n37uhok3d7/$EU_CONNECT_ROUTE"
terraform import "aws_apigatewayv2_route.ws_eu_disconnect" "n37uhok3d7/$EU_DISCONNECT_ROUTE"
terraform import "aws_apigatewayv2_route.ws_eu_send_message" "n37uhok3d7/$EU_SENDMSG_ROUTE"

# ── Step 10: SSM Parameters ────────────────────────────────────────
echo ""
echo "=== Step 10: SSM Parameters ==="
# US String params
for param in "/mediconnect/prod/cognito/user_pool_id" "/mediconnect/prod/cognito/user_pool_id_eu" "/mediconnect/prod/db/doctor_table" "/mediconnect/prod/db/patient_table" "/mediconnect/prod/google/client_id" "/mediconnect/prod/mqtt/endpoint" "/mediconnect/prod/s3/doctor_identity_bucket" "/mediconnect/prod/s3/patient_identity_bucket" "/mediconnect/prod/sns/topic_arn_eu" "/mediconnect/prod/sns/topic_arn_us"; do
  MSYS_NO_PATHCONV=1 terraform import "aws_ssm_parameter.us_string[\"$param\"]" "$param"
done
# US Secure params
for param in "/mediconnect/prod/cognito/client_id_doctor" "/mediconnect/prod/cognito/client_id_eu_doctor" "/mediconnect/prod/cognito/client_id_eu_patient" "/mediconnect/prod/cognito/client_id_patient" "/mediconnect/prod/google/client_secret" "/mediconnect/prod/kms/signing_key_id" "/mediconnect/prod/stripe/secret_key" "/mediconnect/stripe/keys" "/mediconnect/stripe/webhook_secret"; do
  MSYS_NO_PATHCONV=1 terraform import "aws_ssm_parameter.us_secure[\"$param\"]" "$param"
done
# EU String params
for param in "/mediconnect/prod/cognito/user_pool_id" "/mediconnect/prod/cognito/user_pool_id_eu" "/mediconnect/prod/db/doctor_table" "/mediconnect/prod/db/patient_table" "/mediconnect/prod/google/client_id" "/mediconnect/prod/mqtt/endpoint" "/mediconnect/prod/s3/doctor_identity_bucket" "/mediconnect/prod/s3/patient_identity_bucket" "/mediconnect/prod/sns/topic_arn_eu" "/mediconnect/prod/sns/topic_arn_us"; do
  MSYS_NO_PATHCONV=1 terraform import "aws_ssm_parameter.eu_string[\"$param\"]" "$param"
done
# EU Secure params
for param in "/mediconnect/prod/cognito/client_id_doctor" "/mediconnect/prod/cognito/client_id_eu_doctor" "/mediconnect/prod/cognito/client_id_eu_patient" "/mediconnect/prod/cognito/client_id_patient" "/mediconnect/prod/google/client_secret" "/mediconnect/prod/kms/signing_key_id" "/mediconnect/prod/stripe/secret_key" "/mediconnect/stripe/keys" "/mediconnect/stripe/webhook_secret"; do
  MSYS_NO_PATHCONV=1 terraform import "aws_ssm_parameter.eu_secure[\"$param\"]" "$param"
done

# ── Step 11: ECR Repositories ──────────────────────────────────────
echo ""
echo "=== Step 11: ECR ==="
terraform import 'aws_ecr_repository.doctor_service' doctor-service
terraform import 'aws_ecr_repository.communication_service' communication-service
terraform import 'aws_ecr_repository.patient_service' patient-service
terraform import 'aws_ecr_repository.booking_service' booking-service

# ── Step 13: EventBridge ────────────────────────────────────────────
echo ""
echo "=== Step 13: EventBridge ==="
terraform import 'aws_cloudwatch_event_rule.stop_recording_us' mediconnect-stop-recording-rule
terraform import 'aws_cloudwatch_event_rule.stop_recording_eu' mediconnect-stop-recording-rule
terraform import 'aws_cloudwatch_event_target.stop_recording_us' mediconnect-stop-recording-rule/cleanup-recordings
terraform import 'aws_cloudwatch_event_target.stop_recording_eu' mediconnect-stop-recording-rule/cleanup-recordings

# ── Step 14: CloudFront ─────────────────────────────────────────────
echo ""
echo "=== Step 14: CloudFront ==="
terraform import 'aws_cloudfront_distribution.frontend' E2ZU49H6L7GQPU

# ── Step 15: IoT Core ──────────────────────────────────────────────
echo ""
echo "=== Step 15: IoT Core ==="
terraform import 'aws_iot_thing.wearable' mediconnect-wearable

# ── Step 16: Security Groups ───────────────────────────────────────
echo ""
echo "=== Step 16: Security Groups ==="
terraform import 'aws_security_group.migration_sg' sg-0c2093826f18129e4
terraform import 'aws_security_group.rds_sg_v2' sg-0ae552ad7e946e401

# ── Step 17: SES ────────────────────────────────────────────────────
echo ""
echo "=== Step 17: SES ==="
terraform import 'aws_ses_email_identity.mehzsolution' mehzsolution@gmail.com
terraform import 'aws_ses_email_identity.zahidul' muhammadzahidulislam2222@gmail.com

echo ""
echo "============================================"
echo "Phase 1 imports complete!"
echo "Run 'terraform plan' to verify zero drift."
echo "============================================"
