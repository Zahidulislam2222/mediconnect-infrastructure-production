resource "aws_dynamodb_table" "patients" {
  name           = "mediconnect-patients"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "patientId"
  
  attribute {
    name = "patientId"
    type = "S"
  }

  attribute {
    name = "email"
    type = "S"
  }

  global_secondary_index {
    name               = "email-index"
    hash_key           = "email"
    projection_type    = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }
}

resource "aws_dynamodb_table" "appointments" {
  name           = "mediconnect-appointments"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "appointmentId"
  
  attribute {
    name = "appointmentId"
    type = "S"
  }
  
  attribute {
    name = "patientId"
    type = "S"
  }
  
  attribute {
    name = "dateTime"
    type = "S"
  }

  global_secondary_index {
    name               = "patient-index"
    hash_key           = "patientId"
    range_key          = "dateTime"
    projection_type    = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }
}

resource "aws_dynamodb_table" "interactions" {
  name         = "mediconnect-drug-interactions"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "drug1_id"
  range_key    = "drug2_id"

  attribute {
    name = "drug1_id"
    type = "S"
  }
  
  attribute {
    name = "drug2_id"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }
}

# ==========================================
# DynamoDB: mediconnect-doctors
# ==========================================
resource "aws_dynamodb_table" "doctors" {
  name         = "mediconnect-doctors"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "doctorId"

  attribute {
    name = "doctorId"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }
}

# ==========================================
# DynamoDB: mediconnect-transactions
# ==========================================
resource "aws_dynamodb_table" "transactions" {
  name         = "mediconnect-transactions"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "billId"

  attribute {
    name = "billId"
    type = "S"
  }

  attribute {
    name = "referenceId"
    type = "S"
  }

  global_secondary_index {
    name            = "referenceId-index"
    hash_key        = "referenceId"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }
}

# ==========================================
# DynamoDB: mediconnect-video-sessions
# ==========================================
resource "aws_dynamodb_table" "video_sessions" {
  name         = "mediconnect-video-sessions"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "appointmentId"

  attribute {
    name = "appointmentId"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }
}

# ==========================================
# DynamoDB: mediconnect-staff-shifts
# ==========================================
resource "aws_dynamodb_table" "staff_shifts" {
  name         = "mediconnect-staff-shifts"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "shiftId"

  attribute {
    name = "shiftId"
    type = "S"
  }

  attribute {
    name = "staffId"
    type = "S"
  }

  global_secondary_index {
    name            = "StaffIndex"
    hash_key        = "staffId"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }
}

# ==========================================
# DynamoDB: mediconnect-staff-tasks
# ==========================================
resource "aws_dynamodb_table" "staff_tasks" {
  name         = "mediconnect-staff-tasks"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "taskId"

  attribute {
    name = "taskId"
    type = "S"
  }

  attribute {
    name = "assignedTo"
    type = "S"
  }

  global_secondary_index {
    name            = "AssigneeIndex"
    hash_key        = "assignedTo"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }
}

# ==========================================
# DynamoDB: mediconnect-staff-announcements
# ==========================================
resource "aws_dynamodb_table" "staff_announcements" {
  name         = "mediconnect-staff-announcements"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "announcementId"

  attribute {
    name = "announcementId"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }
}

# ==========================================
# DynamoDB: mediconnect-audit-logs
# ==========================================
resource "aws_dynamodb_table" "audit_logs" {
  name         = "mediconnect-audit-logs"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "logId"

  attribute {
    name = "logId"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }
}

# ==========================================
# DynamoDB: mediconnect-mpi-links
# ==========================================
resource "aws_dynamodb_table" "mpi_links" {
  name         = "mediconnect-mpi-links"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "linkId"

  attribute {
    name = "linkId"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }
}

# ==========================================
# DynamoDB: mediconnect-bulk-exports
# ==========================================
resource "aws_dynamodb_table" "bulk_exports" {
  name         = "mediconnect-bulk-exports"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "exportId"

  attribute {
    name = "exportId"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }
}

# ==========================================
# DynamoDB: mediconnect-allergies
# ==========================================
resource "aws_dynamodb_table" "allergies" {
  name         = "mediconnect-allergies"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "patientId"
  range_key    = "allergyId"

  attribute {
    name = "patientId"
    type = "S"
  }

  attribute {
    name = "allergyId"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }
}

# ==========================================
# DynamoDB: mediconnect-immunizations
# ==========================================
resource "aws_dynamodb_table" "immunizations" {
  name         = "mediconnect-immunizations"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "patientId"
  range_key    = "immunizationId"

  attribute {
    name = "patientId"
    type = "S"
  }

  attribute {
    name = "immunizationId"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }
}

# ==========================================
# DynamoDB: mediconnect-emergency-access
# ==========================================
resource "aws_dynamodb_table" "emergency_access" {
  name         = "mediconnect-emergency-access"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "overrideId"

  attribute {
    name = "overrideId"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }
}

# ==========================================
# DynamoDB: mediconnect-lab-orders
# ==========================================
resource "aws_dynamodb_table" "lab_orders" {
  name         = "mediconnect-lab-orders"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "orderId"
  range_key    = "patientId"

  attribute {
    name = "orderId"
    type = "S"
  }

  attribute {
    name = "patientId"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }
}

# ==========================================
# DynamoDB: mediconnect-referrals
# ==========================================
resource "aws_dynamodb_table" "referrals" {
  name         = "mediconnect-referrals"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "referralId"

  attribute {
    name = "referralId"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }
}

# ==========================================
# DynamoDB: mediconnect-med-reconciliations
# ==========================================
resource "aws_dynamodb_table" "med_reconciliations" {
  name         = "mediconnect-med-reconciliations"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "reconId"

  attribute {
    name = "reconId"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }
}

# ==========================================
# DynamoDB: mediconnect-care-plans
# ==========================================
resource "aws_dynamodb_table" "care_plans" {
  name         = "mediconnect-care-plans"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "carePlanId"

  attribute {
    name = "carePlanId"
    type = "S"
  }

  attribute {
    name = "patientId"
    type = "S"
  }

  global_secondary_index {
    name            = "patientId-index"
    hash_key        = "patientId"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }
}

# ==========================================
# DynamoDB: mediconnect-prescriptions
# ==========================================
resource "aws_dynamodb_table" "prescriptions" {
  name         = "mediconnect-prescriptions"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "prescriptionId"

  attribute {
    name = "prescriptionId"
    type = "S"
  }

  attribute {
    name = "patientId"
    type = "S"
  }

  global_secondary_index {
    name            = "patientId-index"
    hash_key        = "patientId"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }
}

# ==========================================
# DynamoDB: mediconnect-chat-history
# ==========================================
resource "aws_dynamodb_table" "chat_history" {
  name         = "mediconnect-chat-history"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "conversationId"
  range_key    = "timestamp"

  attribute {
    name = "conversationId"
    type = "S"
  }

  attribute {
    name = "timestamp"
    type = "S"
  }

  attribute {
    name = "patientId"
    type = "S"
  }

  global_secondary_index {
    name            = "patientId-index"
    hash_key        = "patientId"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }
}

# ==========================================
# DynamoDB: mediconnect-chat-connections
# ==========================================
resource "aws_dynamodb_table" "chat_connections" {
  name         = "mediconnect-chat-connections"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "connectionId"

  attribute {
    name = "connectionId"
    type = "S"
  }

  attribute {
    name = "userId"
    type = "S"
  }

  global_secondary_index {
    name            = "UserIdIndex"
    hash_key        = "userId"
    projection_type = "ALL"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }
}

# ==========================================
# DynamoDB: mediconnect-graph-data
# ==========================================
resource "aws_dynamodb_table" "graph_data" {
  name         = "mediconnect-graph-data"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "PK"
  range_key    = "SK"

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }
}

# ==========================================
# DynamoDB: mediconnect-consent-ledger
# ==========================================
resource "aws_dynamodb_table" "consent_ledger" {
  name         = "mediconnect-consent-ledger"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "patientId"
  range_key    = "timestamp"

  attribute {
    name = "patientId"
    type = "S"
  }

  attribute {
    name = "timestamp"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }
}

# ==========================================
# DynamoDB: mediconnect-vitals
# ==========================================
resource "aws_dynamodb_table" "vitals" {
  name         = "mediconnect-vitals"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "patientId"
  range_key    = "timestamp"

  attribute {
    name = "patientId"
    type = "S"
  }

  attribute {
    name = "timestamp"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }
}

# ==========================================
# DynamoDB: mediconnect-booking-locks
# ==========================================
resource "aws_dynamodb_table" "booking_locks" {
  name         = "mediconnect-booking-locks"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "lockId"

  attribute {
    name = "lockId"
    type = "S"
  }

  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }
}

# ==========================================
# DynamoDB: mediconnect-knowledge-base
# ==========================================
resource "aws_dynamodb_table" "knowledge_base" {
  name         = "mediconnect-knowledge-base"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "topic"

  attribute {
    name = "topic"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }
}

# ==========================================
# DynamoDB: mediconnect-webhook-events
# ==========================================
resource "aws_dynamodb_table" "webhook_events" {
  name         = "mediconnect-webhook-events"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "eventId"

  attribute {
    name = "eventId"
    type = "S"
  }

  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }
}

# ==========================================
# DynamoDB: mediconnect-reminders
# ==========================================
resource "aws_dynamodb_table" "reminders" {
  name         = "mediconnect-reminders"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "reminderId"

  attribute {
    name = "reminderId"
    type = "S"
  }

  attribute {
    name = "appointmentId"
    type = "S"
  }

  global_secondary_index {
    name            = "appointmentId-index"
    hash_key        = "appointmentId"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }
}

# ==========================================
# DynamoDB: mediconnect-pharmacy-inventory
# ==========================================
resource "aws_dynamodb_table" "pharmacy_inventory" {
  name         = "mediconnect-pharmacy-inventory"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pharmacyId"
  range_key    = "drugId"

  attribute {
    name = "pharmacyId"
    type = "S"
  }

  attribute {
    name = "drugId"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }
}

# ==========================================
# DynamoDB: mediconnect-prior-auth
# ==========================================
resource "aws_dynamodb_table" "prior_auth" {
  name         = "mediconnect-prior-auth"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "authId"

  attribute {
    name = "authId"
    type = "S"
  }

  attribute {
    name = "patientId"
    type = "S"
  }

  global_secondary_index {
    name            = "patientId-index"
    hash_key        = "patientId"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }
}

# ==========================================
# DynamoDB: mediconnect-eligibility-checks
# ==========================================
resource "aws_dynamodb_table" "eligibility_checks" {
  name         = "mediconnect-eligibility-checks"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "checkId"

  attribute {
    name = "checkId"
    type = "S"
  }

  attribute {
    name = "patientId"
    type = "S"
  }

  global_secondary_index {
    name            = "patientId-index"
    hash_key        = "patientId"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }
}

# ==========================================
# DynamoDB: mediconnect-health-records
# ==========================================
resource "aws_dynamodb_table" "health_records" {
  name         = "mediconnect-health-records"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "patientId"
  range_key    = "recordId"

  attribute {
    name = "patientId"
    type = "S"
  }

  attribute {
    name = "recordId"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }
}

# ==========================================
# DynamoDB: mediconnect-elr-reports
# ==========================================
resource "aws_dynamodb_table" "elr_reports" {
  name         = "mediconnect-elr-reports"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "reportId"

  attribute {
    name = "reportId"
    type = "S"
  }

  attribute {
    name = "patientId"
    type = "S"
  }

  global_secondary_index {
    name            = "patientId-index"
    hash_key        = "patientId"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }
}

resource "aws_s3_bucket" "recordings" {
  bucket = "mediconnect-recordings-${var.project}-${var.environment}"
}

resource "aws_s3_bucket_server_side_encryption_configuration" "recordings_enc" {
  bucket = aws_s3_bucket.recordings.id
  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = var.kms_key_arn
      sse_algorithm     = "aws:kms"
    }
  }
}

# IoT Core & Analytics
resource "aws_kinesis_stream" "iot_vitals" {
  name        = "mediconnect-iot-vitals"
  shard_count = 1
  retention_period = 24
  
  encryption_type = "KMS"
  kms_key_id      = var.kms_key_arn
}

resource "aws_timestreamwrite_database" "iot_db" {
  database_name = "mediconnect-iot"
  kms_key_id    = var.kms_key_arn
}

resource "aws_timestreamwrite_table" "vital_signs" {
  database_name = aws_timestreamwrite_database.iot_db.database_name
  table_name    = "vital_signs"

  retention_properties {
    magnetic_store_retention_period_in_days = 90
    memory_store_retention_period_in_hours  = 24
  }
}
