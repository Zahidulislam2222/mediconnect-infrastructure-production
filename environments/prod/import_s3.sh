#!/usr/bin/env bash
# Import existing S3 buckets into Terraform state
# Run from: environments/prod/
# Prerequisites: terraform init

set -euo pipefail

echo "=== Importing US (us-east-1) S3 buckets ==="

# Infrastructure
terraform import 'module.s3_us.aws_s3_bucket.buckets["mediconnect-audit-logs-950110266426"]' mediconnect-audit-logs-950110266426
terraform import 'module.s3_us.aws_s3_bucket.buckets["mediconnect-cicd-950110266426"]' mediconnect-cicd-950110266426
terraform import 'module.s3_us.aws_s3_bucket.buckets["mediconnect-datalake-950110266426"]' mediconnect-datalake-950110266426

# PHI / clinical data
terraform import 'module.s3_us.aws_s3_bucket.buckets["mediconnect-patient-data"]' mediconnect-patient-data
terraform import 'module.s3_us.aws_s3_bucket.buckets["mediconnect-doctor-data"]' mediconnect-doctor-data
terraform import 'module.s3_us.aws_s3_bucket.buckets["mediconnect-prescriptions"]' mediconnect-prescriptions
terraform import 'module.s3_us.aws_s3_bucket.buckets["mediconnect-ehr-records"]' mediconnect-ehr-records
terraform import 'module.s3_us.aws_s3_bucket.buckets["mediconnect-medical-images"]' mediconnect-medical-images

# Communication / media
terraform import 'module.s3_us.aws_s3_bucket.buckets["mediconnect-consultation-files"]' mediconnect-consultation-files
terraform import 'module.s3_us.aws_s3_bucket.buckets["mediconnect-consultation-recordings"]' mediconnect-consultation-recordings
terraform import 'module.s3_us.aws_s3_bucket.buckets["mediconnect-media-assets"]' mediconnect-media-assets

# Sub-resources: versioning
for bucket in mediconnect-audit-logs-950110266426 mediconnect-cicd-950110266426 mediconnect-datalake-950110266426 mediconnect-patient-data mediconnect-doctor-data mediconnect-prescriptions mediconnect-ehr-records mediconnect-medical-images mediconnect-consultation-files mediconnect-consultation-recordings mediconnect-media-assets; do
  terraform import "module.s3_us.aws_s3_bucket_versioning.buckets[\"$bucket\"]" "$bucket"
  terraform import "module.s3_us.aws_s3_bucket_server_side_encryption_configuration.buckets[\"$bucket\"]" "$bucket"
  terraform import "module.s3_us.aws_s3_bucket_public_access_block.buckets[\"$bucket\"]" "$bucket"
done

# Sub-resources: CORS (only buckets that have CORS)
for bucket in mediconnect-patient-data mediconnect-doctor-data mediconnect-prescriptions mediconnect-ehr-records mediconnect-media-assets; do
  terraform import "module.s3_us.aws_s3_bucket_cors_configuration.buckets[\"$bucket\"]" "$bucket"
done

# Sub-resources: lifecycle (only buckets that have lifecycle rules)
for bucket in mediconnect-patient-data mediconnect-doctor-data; do
  terraform import "module.s3_us.aws_s3_bucket_lifecycle_configuration.buckets[\"$bucket\"]" "$bucket"
done

echo ""
echo "=== Importing EU (eu-central-1) S3 buckets ==="

for bucket in mediconnect-consultation-recordings-eu mediconnect-doctor-data-eu mediconnect-ehr-records-eu mediconnect-medical-images-eu mediconnect-patient-data-eu mediconnect-prescriptions-eu; do
  terraform import "module.s3_eu.aws_s3_bucket.buckets[\"$bucket\"]" "$bucket"
  terraform import "module.s3_eu.aws_s3_bucket_versioning.buckets[\"$bucket\"]" "$bucket"
  terraform import "module.s3_eu.aws_s3_bucket_server_side_encryption_configuration.buckets[\"$bucket\"]" "$bucket"
  terraform import "module.s3_eu.aws_s3_bucket_public_access_block.buckets[\"$bucket\"]" "$bucket"
done

echo ""
echo "=== All S3 bucket imports complete ==="
echo "Run 'terraform plan' to verify no drift."
