resource "aws_sqs_queue" "dlq_us" {
  provider = aws.us
  name     = "mediconnect-dlq"

  message_retention_seconds = 1209600 # 14 days
  # max_message_size = 1048576 — actual AWS value is 1 MB, but provider v5.x caps validation at 262144; managed outside TF

  lifecycle {
    ignore_changes = [
      redrive_allow_policy,
      max_message_size,
    ]
  }
}

resource "aws_sqs_queue" "dlq_eu" {
  provider = aws.eu
  name     = "mediconnect-dlq"

  message_retention_seconds = 1209600 # 14 days
}

# ============================================================================
# Event Bus Queues (6 categories × 2 regions, each with DLQ)
# Referenced by: backend_v2/shared/event-bus.ts
# ============================================================================

locals {
  sqs_event_queues = {
    "mediconnect-audit-events"       = "mediconnect-audit-events-dlq"
    "mediconnect-clinical-events"    = "mediconnect-clinical-events-dlq"
    "mediconnect-appointment-events" = "mediconnect-appointment-events-dlq"
    "mediconnect-patient-events"     = "mediconnect-patient-events-dlq"
    "mediconnect-security-events"    = "mediconnect-security-events-dlq"
    "mediconnect-system-events"      = "mediconnect-system-events-dlq"
  }
}

# --- US Region (us-east-1) ---

resource "aws_sqs_queue" "event_dlq_us" {
  for_each = local.sqs_event_queues
  provider = aws.us
  name     = each.value

  message_retention_seconds = 1209600 # 14 days
}

resource "aws_sqs_queue" "event_queue_us" {
  for_each = local.sqs_event_queues
  provider = aws.us
  name     = each.key

  message_retention_seconds  = 345600 # 4 days
  visibility_timeout_seconds = 60

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.event_dlq_us[each.key].arn
    maxReceiveCount     = 3
  })
}

# --- EU Region (eu-central-1) ---

resource "aws_sqs_queue" "event_dlq_eu" {
  for_each = local.sqs_event_queues
  provider = aws.eu
  name     = each.value

  message_retention_seconds = 1209600 # 14 days
}

resource "aws_sqs_queue" "event_queue_eu" {
  for_each = local.sqs_event_queues
  provider = aws.eu
  name     = each.key

  message_retention_seconds  = 345600 # 4 days
  visibility_timeout_seconds = 60

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.event_dlq_eu[each.key].arn
    maxReceiveCount     = 3
  })
}
