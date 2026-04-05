# CloudWatch Log Groups for active Lambda functions + ECS
# Legacy Lambda log groups (27 in us-east-1 with 0 bytes) managed via CLI with 30-day retention

# ── US (us-east-1) ─────────────────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "lambda_us_auto_group" {
  provider          = aws.us
  name              = "/aws/lambda/mediconnect-auto-group-us"
  retention_in_days = 365
}

resource "aws_cloudwatch_log_group" "lambda_us_failover_proxy" {
  provider          = aws.us
  name              = "/aws/lambda/mediconnect-failover-proxy"
  retention_in_days = 365
}

resource "aws_cloudwatch_log_group" "lambda_us_ws_authorizer" {
  provider          = aws.us
  name              = "/aws/lambda/mediconnect-ws-authorizer"
  retention_in_days = 365
}

resource "aws_cloudwatch_log_group" "ecs_migration" {
  provider          = aws.us
  name              = "/ecs/mediconnect-migration"
  retention_in_days = 90
}

# ── EU (eu-central-1) ──────────────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "lambda_eu_auto_group" {
  provider          = aws.eu
  name              = "/aws/lambda/mediconnect-auto-group-eu"
  retention_in_days = 365
}

resource "aws_cloudwatch_log_group" "lambda_eu_failover_proxy" {
  provider          = aws.eu
  name              = "/aws/lambda/mediconnect-failover-proxy"
  retention_in_days = 365
}

resource "aws_cloudwatch_log_group" "lambda_eu_ws_authorizer" {
  provider          = aws.eu
  name              = "/aws/lambda/mediconnect-ws-authorizer"
  retention_in_days = 365
}
