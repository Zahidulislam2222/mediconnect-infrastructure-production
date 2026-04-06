# CloudWatch Log Groups for active Lambda functions + ECS
# Legacy Lambda log groups (27 in us-east-1 with 0 bytes) managed via CLI with 30-day retention

# ── KMS Keys for CloudWatch Logs ──────────────────────────────────────────

data "aws_caller_identity" "current" {}

resource "aws_kms_key" "cloudwatch_us" {
  provider            = aws.us
  description         = "Encrypts CloudWatch Log Groups (us-east-1)"
  enable_key_rotation = true

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "EnableRootAccount"
        Effect    = "Allow"
        Principal = { AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root" }
        Action    = "kms:*"
        Resource  = "*"
      },
      {
        Sid       = "AllowCloudWatchLogs"
        Effect    = "Allow"
        Principal = { Service = "logs.us-east-1.amazonaws.com" }
        Action = [
          "kms:Encrypt*",
          "kms:Decrypt*",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:Describe*"
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_kms_alias" "cloudwatch_us" {
  provider      = aws.us
  name          = "alias/mediconnect-cloudwatch-us"
  target_key_id = aws_kms_key.cloudwatch_us.key_id
}

resource "aws_kms_key" "cloudwatch_eu" {
  provider            = aws.eu
  description         = "Encrypts CloudWatch Log Groups (eu-central-1)"
  enable_key_rotation = true

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "EnableRootAccount"
        Effect    = "Allow"
        Principal = { AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root" }
        Action    = "kms:*"
        Resource  = "*"
      },
      {
        Sid       = "AllowCloudWatchLogs"
        Effect    = "Allow"
        Principal = { Service = "logs.eu-central-1.amazonaws.com" }
        Action = [
          "kms:Encrypt*",
          "kms:Decrypt*",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:Describe*"
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_kms_alias" "cloudwatch_eu" {
  provider      = aws.eu
  name          = "alias/mediconnect-cloudwatch-eu"
  target_key_id = aws_kms_key.cloudwatch_eu.key_id
}

# ── US (us-east-1) ─────────────────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "lambda_us_auto_group" {
  provider          = aws.us
  name              = "/aws/lambda/mediconnect-auto-group-us"
  retention_in_days = 365
  kms_key_id        = aws_kms_key.cloudwatch_us.arn
}

resource "aws_cloudwatch_log_group" "lambda_us_failover_proxy" {
  provider          = aws.us
  name              = "/aws/lambda/mediconnect-failover-proxy"
  retention_in_days = 365
  kms_key_id        = aws_kms_key.cloudwatch_us.arn
}

resource "aws_cloudwatch_log_group" "lambda_us_ws_authorizer" {
  provider          = aws.us
  name              = "/aws/lambda/mediconnect-ws-authorizer"
  retention_in_days = 365
  kms_key_id        = aws_kms_key.cloudwatch_us.arn
}

resource "aws_cloudwatch_log_group" "ecs_migration" {
  provider          = aws.us
  name              = "/ecs/mediconnect-migration"
  retention_in_days = 365
  kms_key_id        = aws_kms_key.cloudwatch_us.arn
}

# ── EU (eu-central-1) ──────────────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "lambda_eu_auto_group" {
  provider          = aws.eu
  name              = "/aws/lambda/mediconnect-auto-group-eu"
  retention_in_days = 365
  kms_key_id        = aws_kms_key.cloudwatch_eu.arn
}

resource "aws_cloudwatch_log_group" "lambda_eu_failover_proxy" {
  provider          = aws.eu
  name              = "/aws/lambda/mediconnect-failover-proxy"
  retention_in_days = 365
  kms_key_id        = aws_kms_key.cloudwatch_eu.arn
}

resource "aws_cloudwatch_log_group" "lambda_eu_ws_authorizer" {
  provider          = aws.eu
  name              = "/aws/lambda/mediconnect-ws-authorizer"
  retention_in_days = 365
  kms_key_id        = aws_kms_key.cloudwatch_eu.arn
}
