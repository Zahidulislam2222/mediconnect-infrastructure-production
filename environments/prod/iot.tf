# ── AWS IoT Core ───────────────────────────────────────────────────────────
# Patient-service connects via MQTT to stream vitals from wearable devices.
# MQTT endpoint: /mediconnect/prod/mqtt/endpoint in SSM
# Subscribes to: mediconnect/vitals/#

# --- US (us-east-1) ---

resource "aws_iot_thing" "wearable" {
  provider = aws.us
  name     = "mediconnect-wearable"
}

resource "aws_iot_policy" "wearable_us" {
  provider = aws.us
  name     = "mediconnect-wearable-policy"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["iot:Connect"]
        Resource = ["arn:aws:iot:us-east-1:950110266426:client/mediconnect-*"]
      },
      {
        Effect   = "Allow"
        Action   = ["iot:Publish"]
        Resource = ["arn:aws:iot:us-east-1:950110266426:topic/mediconnect/vitals/*"]
      },
      {
        Effect   = "Allow"
        Action   = ["iot:Subscribe"]
        Resource = ["arn:aws:iot:us-east-1:950110266426:topicfilter/mediconnect/vitals/*"]
      },
      {
        Effect   = "Allow"
        Action   = ["iot:Receive"]
        Resource = ["arn:aws:iot:us-east-1:950110266426:topic/mediconnect/vitals/*"]
      }
    ]
  })

  lifecycle {
    ignore_changes = [policy]
  }
}

resource "aws_iot_topic_rule" "vitals_us" {
  provider    = aws.us
  name        = "mediconnect_vitals_stream"
  enabled     = true
  sql         = "SELECT * FROM 'mediconnect/vitals/#'"
  sql_version = "2016-03-23"

  cloudwatch_logs {
    log_group_name = "/aws/iot/mediconnect-vitals"
    role_arn       = "arn:aws:iam::950110266426:role/mediconnect-iot-rule-role"
  }

  lifecycle {
    ignore_changes = [cloudwatch_logs, lambda, sns, sqs]
  }
}

# --- EU (eu-central-1) ---

resource "aws_iot_thing" "wearable_eu" {
  provider = aws.eu
  name     = "mediconnect-wearable"
}

resource "aws_iot_policy" "wearable_eu" {
  provider = aws.eu
  name     = "mediconnect-wearable-policy"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["iot:Connect"]
        Resource = ["arn:aws:iot:eu-central-1:950110266426:client/mediconnect-*"]
      },
      {
        Effect   = "Allow"
        Action   = ["iot:Publish"]
        Resource = ["arn:aws:iot:eu-central-1:950110266426:topic/mediconnect/vitals/*"]
      },
      {
        Effect   = "Allow"
        Action   = ["iot:Subscribe"]
        Resource = ["arn:aws:iot:eu-central-1:950110266426:topicfilter/mediconnect/vitals/*"]
      },
      {
        Effect   = "Allow"
        Action   = ["iot:Receive"]
        Resource = ["arn:aws:iot:eu-central-1:950110266426:topic/mediconnect/vitals/*"]
      }
    ]
  })

  lifecycle {
    ignore_changes = [policy]
  }
}

resource "aws_iot_topic_rule" "vitals_eu" {
  provider    = aws.eu
  name        = "mediconnect_vitals_stream"
  enabled     = true
  sql         = "SELECT * FROM 'mediconnect/vitals/#'"
  sql_version = "2016-03-23"

  cloudwatch_logs {
    log_group_name = "/aws/iot/mediconnect-vitals"
    role_arn       = "arn:aws:iam::950110266426:role/mediconnect-iot-rule-role"
  }

  lifecycle {
    ignore_changes = [cloudwatch_logs, lambda, sns, sqs]
  }
}
