#!/usr/bin/env bash
set -euo pipefail

echo "=== Importing US Cognito ==="

# User pool
terraform import 'module.cognito_us.aws_cognito_user_pool.pool' us-east-1_fUsIfc7kL

# App clients (client_name -> client_id)
terraform import 'module.cognito_us.aws_cognito_user_pool_client.clients["client-patient-web"]' us-east-1_fUsIfc7kL/20lbag98p4vlj53eumfo11h7ac
terraform import 'module.cognito_us.aws_cognito_user_pool_client.clients["client-doctor-web"]' us-east-1_fUsIfc7kL/6nsqer529j4c8gc688vflosomk
terraform import 'module.cognito_us.aws_cognito_user_pool_client.clients["client-admin-web"]' us-east-1_fUsIfc7kL/3makppltr8e6eaanjab3e1lkh0
terraform import 'module.cognito_us.aws_cognito_user_pool_client.clients["client-staff-web"]' us-east-1_fUsIfc7kL/1rjvst6bo1o2sum28o4pvkf378

# Identity pool
terraform import 'module.cognito_us.aws_cognito_identity_pool.pool[0]' us-east-1:23609247-ceb3-4fc8-88b7-af68aaa40a30

echo ""
echo "=== Importing EU Cognito ==="

# User pool
terraform import 'module.cognito_eu.aws_cognito_user_pool.pool' eu-central-1_5Fc7eFLB5

# App clients
terraform import 'module.cognito_eu.aws_cognito_user_pool_client.clients["client-patient-web"]' eu-central-1_5Fc7eFLB5/1erf0tklmpa0922e3p4eit8iqn
terraform import 'module.cognito_eu.aws_cognito_user_pool_client.clients["client-doctor-web"]' eu-central-1_5Fc7eFLB5/4cmi171ll8dds2cfu26obila9g
terraform import 'module.cognito_eu.aws_cognito_user_pool_client.clients["client-admin-web"]' eu-central-1_5Fc7eFLB5/2eqol49qt7ctig16vsheee496f
terraform import 'module.cognito_eu.aws_cognito_user_pool_client.clients["client-staff-web"]' eu-central-1_5Fc7eFLB5/7dj5pa9m7nbrp7qs2fgua0gjv2

# Identity pool
terraform import 'module.cognito_eu.aws_cognito_identity_pool.pool[0]' eu-central-1:5a8cd657-bd0b-41d3-b53c-eda640bf8e0f

echo ""
echo "=== All Cognito imports complete ==="
