module "dynamodb_eu" {
  source = "../../modules/aws/dynamodb"

  providers = {
    aws = aws.eu
  }

  tables = {
    "mediconnect-appointments" = {
      hash_key               = "appointmentId"
      deletion_protection    = true
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
      deletion_protection    = true
      point_in_time_recovery = true
      ttl_enabled            = true
      ttl_attribute          = "ttl"
    }

    "mediconnect-booking-locks" = {
      hash_key               = "lockId"
      deletion_protection    = true
      point_in_time_recovery = true
    }

    "mediconnect-chat-connections" = {
      hash_key               = "connectionId"
      deletion_protection    = true
      point_in_time_recovery = true
      global_secondary_indexes = [
        {
          name     = "UserIdIndex"
          hash_key = "userId"
        },
      ]
    }

    "mediconnect-chat-history" = {
      hash_key               = "conversationId"
      range_key              = "timestamp"
      deletion_protection    = true
      point_in_time_recovery = true
    }

    "mediconnect-doctors" = {
      hash_key               = "doctorId"
      deletion_protection    = true
      point_in_time_recovery = true
    }

    "mediconnect-drug-interactions" = {
      hash_key               = "drugName"
      deletion_protection    = true
      point_in_time_recovery = true
    }

    "mediconnect-graph-data" = {
      hash_key               = "PK"
      range_key              = "SK"
      deletion_protection    = true
      point_in_time_recovery = true
    }

    "mediconnect-health-records" = {
      hash_key               = "patientId"
      range_key              = "recordId"
      deletion_protection    = true
      point_in_time_recovery = true
    }

    "mediconnect-iot-vitals" = {
      hash_key               = "patientId"
      range_key              = "timestamp"
      deletion_protection    = true
      point_in_time_recovery = true
    }

    "mediconnect-knowledge-base" = {
      hash_key               = "topic"
      deletion_protection    = true
      point_in_time_recovery = true
    }

    # EU: no streams (unlike US)
    "mediconnect-patients" = {
      hash_key               = "patientId"
      deletion_protection    = true
      point_in_time_recovery = true
    }

    "mediconnect-pharmacy-inventory" = {
      hash_key               = "pharmacyId"
      range_key              = "drugId"
      deletion_protection    = true
      point_in_time_recovery = true
    }

    # EU: no streams, GSIs have no range keys (unlike US)
    "mediconnect-prescriptions" = {
      hash_key               = "prescriptionId"
      deletion_protection    = true
      point_in_time_recovery = true
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

    "mediconnect-transactions" = {
      hash_key               = "billId"
      deletion_protection    = true
      point_in_time_recovery = true
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
      hash_key               = "appointmentId"
      deletion_protection    = true
      point_in_time_recovery = true
    }

    # ── Tables below are referenced in code but not yet created in AWS ──

    "mediconnect-allergies" = {
      hash_key               = "patientId"
      range_key              = "allergyId"
      deletion_protection    = true
      point_in_time_recovery = true
    }

    "mediconnect-immunizations" = {
      hash_key               = "patientId"
      range_key              = "immunizationId"
      deletion_protection    = true
      point_in_time_recovery = true
    }

    "mediconnect-emergency-access" = {
      hash_key               = "overrideId"
      deletion_protection    = true
      point_in_time_recovery = true
    }

    "mediconnect-lab-orders" = {
      hash_key               = "orderId"
      range_key              = "patientId"
      deletion_protection    = true
      point_in_time_recovery = true
    }

    "mediconnect-referrals" = {
      hash_key               = "referralId"
      deletion_protection    = true
      point_in_time_recovery = true
      global_secondary_indexes = [
        {
          name     = "patientId-index"
          hash_key = "patientId"
        },
      ]
    }

    "mediconnect-med-reconciliations" = {
      hash_key               = "reconId"
      range_key              = "patientId"
      deletion_protection    = true
      point_in_time_recovery = true
    }

    "mediconnect-care-plans" = {
      hash_key               = "carePlanId"
      range_key              = "patientId"
      deletion_protection    = true
      point_in_time_recovery = true
    }

    "mediconnect-mpi-links" = {
      hash_key               = "mpiId"
      deletion_protection    = true
      point_in_time_recovery = true
      global_secondary_indexes = [
        {
          name     = "soundexLastName-index"
          hash_key = "soundexLastName"
        },
      ]
    }

    "mediconnect-bulk-exports" = {
      hash_key               = "exportId"
      deletion_protection    = true
      point_in_time_recovery = true
    }

    "mediconnect-staff-shifts" = {
      hash_key               = "shiftId"
      deletion_protection    = true
      point_in_time_recovery = true
      global_secondary_indexes = [
        {
          name     = "StaffIndex"
          hash_key = "staffId"
        },
      ]
    }

    "mediconnect-staff-tasks" = {
      hash_key               = "taskId"
      deletion_protection    = true
      point_in_time_recovery = true
    }

    "mediconnect-staff-announcements" = {
      hash_key               = "announcementId"
      deletion_protection    = true
      point_in_time_recovery = true
    }

    "mediconnect-sdoh-assessments" = {
      hash_key               = "assessmentId"
      range_key              = "patientId"
      deletion_protection    = true
      point_in_time_recovery = true
    }

    "mediconnect-eligibility-checks" = {
      hash_key               = "checkId"
      deletion_protection    = true
      point_in_time_recovery = true
    }

    "mediconnect-prior-auth" = {
      hash_key               = "authId"
      range_key              = "patientId"
      deletion_protection    = true
      point_in_time_recovery = true
    }

    "mediconnect-reminders" = {
      hash_key               = "reminderId"
      range_key              = "appointmentId"
      deletion_protection    = true
      point_in_time_recovery = true
    }

    "mediconnect-bluebutton-connections" = {
      hash_key               = "connectionId"
      range_key              = "patientId"
      deletion_protection    = true
      point_in_time_recovery = true
    }

    "mediconnect-ecr-reports" = {
      hash_key               = "reportId"
      range_key              = "patientId"
      deletion_protection    = true
      point_in_time_recovery = true
    }

    "mediconnect-elr-reports" = {
      hash_key               = "reportId"
      deletion_protection    = true
      point_in_time_recovery = true
    }

    "mediconnect-consent-ledger" = {
      hash_key               = "patientId"
      range_key              = "consentId"
      deletion_protection    = true
      point_in_time_recovery = true
    }

    "mediconnect-hl7-messages" = {
      hash_key               = "messageId"
      deletion_protection    = true
      point_in_time_recovery = true
    }

    "mediconnect-dicom-studies" = {
      hash_key               = "patientId"
      range_key              = "studyInstanceUID"
      deletion_protection    = true
      point_in_time_recovery = true
    }

    # ── Subscription Tables ──────────────────────────────────────────

    "mediconnect-subscriptions" = {
      hash_key               = "patientId"
      deletion_protection    = true
      point_in_time_recovery = true
      global_secondary_indexes = [
        {
          name     = "StatusIndex"
          hash_key = "status"
        },
        {
          name     = "StripeSubIndex"
          hash_key = "stripeSubscriptionId"
        },
      ]
    }

    "mediconnect-doctor-payouts" = {
      hash_key               = "doctorId"
      range_key              = "periodEndPayoutId"
      deletion_protection    = true
      point_in_time_recovery = true
      global_secondary_indexes = [
        {
          name     = "StatusIndex"
          hash_key = "status"
          range_key = "periodEndPayoutId"
        },
      ]
    }
  }
}
