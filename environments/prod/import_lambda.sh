#!/usr/bin/env bash
set -euo pipefail

echo "=== Importing US Lambda functions ==="
for fn in mediconnect-cognito-triggers mediconnect-ws-authorizer mediconnect-failover-proxy mediconnect-cleanup-recordings mediconnect-auto-group-us; do
  terraform import "module.lambda_us.aws_lambda_function.functions[\"$fn\"]" "$fn"
done

echo ""
echo "=== Importing EU Lambda functions ==="
for fn in mediconnect-cognito-triggers mediconnect-ws-authorizer mediconnect-failover-proxy mediconnect-cleanup-recordings mediconnect-auto-group-eu; do
  terraform import "module.lambda_eu.aws_lambda_function.functions[\"$fn\"]" "$fn"
done

echo "=== Lambda imports complete ==="
