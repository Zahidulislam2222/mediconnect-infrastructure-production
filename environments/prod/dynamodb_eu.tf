module "dynamodb_eu" {
  source = "../../modules/aws/dynamodb"

  providers = {
    aws = aws.eu
  }

  tables = {
    "mediconnect-appointments" = {
      hash_key               = "appointmentId"
      point_in_time_recovery = true
      stream_enabled         = true
      stream_view_type       = "NEW_AND_OLD_IMAGES"
      global_secondary_indexes = [
        {
          name      = "StatusIndex"
          hash_key  = "status"
          range_key = "createdAt"
        },
        {
          name     = "DoctorIndex"
          hash_key = "doctorId"
        },
        {
          name     = "PatientIndex"
          hash_key = "patientId"
        },
      ]
    }

    "mediconnect-audit-logs" = {
      hash_key               = "logId"
      point_in_time_recovery = true
      ttl_enabled            = true
      ttl_attribute          = "ttl"
    }

    "mediconnect-billing-audit" = {
      hash_key = "auditId"
    }

    "mediconnect-booking-locks" = {
      hash_key = "lockId"
    }

    "mediconnect-chat-connections" = {
      hash_key = "connectionId"
      global_secondary_indexes = [
        {
          name     = "UserIdIndex"
          hash_key = "userId"
        },
      ]
    }

    "mediconnect-chat-history" = {
      hash_key  = "conversationId"
      range_key = "timestamp"
    }

    "mediconnect-clinical-notes" = {
      hash_key  = "patientId"
      range_key = "timestamp"
    }

    # EU: no TTL (unlike US)
    "mediconnect-content-cache" = {
      hash_key = "cacheKey"
    }

    "mediconnect-doctor-schedules" = {
      hash_key = "doctorId"
    }

    "mediconnect-doctors" = {
      hash_key = "doctorId"
    }

    "mediconnect-drug-interactions" = {
      hash_key = "drugName"
    }

    "mediconnect-graph-data" = {
      hash_key  = "PK"
      range_key = "SK"
    }

    "mediconnect-health-records" = {
      hash_key  = "patientId"
      range_key = "recordId"
    }

    "mediconnect-iot-vitals" = {
      hash_key               = "patientId"
      range_key              = "timestamp"
      point_in_time_recovery = true
    }

    "mediconnect-knowledge-base" = {
      hash_key = "topic"
    }

    "mediconnect-medical-records" = {
      hash_key  = "patientId"
      range_key = "recordId"
    }

    # EU: no streams (unlike US)
    "mediconnect-patients" = {
      hash_key               = "patientId"
      point_in_time_recovery = true
    }

    "mediconnect-pharmacy-inventory" = {
      hash_key  = "pharmacyId"
      range_key = "drugId"
    }

    "mediconnect-predictions" = {
      hash_key = "predictionId"
    }

    # EU: no streams, GSIs have no range keys (unlike US)
    "mediconnect-prescriptions" = {
      hash_key = "prescriptionId"
      global_secondary_indexes = [
        {
          name     = "DoctorIndex"
          hash_key = "doctorId"
        },
        {
          name     = "PatientIndex"
          hash_key = "patientId"
        },
      ]
    }

    "mediconnect-symptom-logs" = {
      hash_key  = "sessionId"
      range_key = "timestamp"
    }

    "mediconnect-transactions" = {
      hash_key = "billId"
      global_secondary_indexes = [
        {
          name      = "DoctorIndex"
          hash_key  = "doctorId"
          range_key = "createdAt"
        },
        {
          name     = "PatientIndex"
          hash_key = "patientId"
        },
      ]
    }

    # EU: no TTL (unlike US)
    "mediconnect-video-sessions" = {
      hash_key = "appointmentId"
    }
  }
}
