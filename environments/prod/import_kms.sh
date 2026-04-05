#!/usr/bin/env bash
set -euo pipefail

echo "=== Importing KMS keys ==="

# US key + alias
terraform import 'module.kms_us.aws_kms_key.keys["mediconnect-prescription-signer"]' 496d121c-7da8-4d32-bb03-7095b00bd237
terraform import 'module.kms_us.aws_kms_alias.keys["mediconnect-prescription-signer"]' alias/mediconnect-prescription-signer

# EU key + alias
terraform import 'module.kms_eu.aws_kms_key.keys["mediconnect-prescription-signer-eu"]' 07cb3935-8b4a-4595-8e8d-5df6a0885d19
terraform import 'module.kms_eu.aws_kms_alias.keys["mediconnect-prescription-signer-eu"]' alias/mediconnect-prescription-signer-eu

echo "=== KMS imports complete ==="
