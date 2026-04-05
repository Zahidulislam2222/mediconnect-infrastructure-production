module "s3_us" {
  source = "../../modules/aws/s3"

  providers = {
    aws = aws.us
  }

  buckets = {
    # ── Infrastructure buckets ──────────────────────────────────────────

    "mediconnect-audit-logs-950110266426" = {
      versioning         = true
      bucket_key_enabled = false
      # Replication to DR bucket managed separately (cross-region)
      lifecycle_rules = [
        {
          id                                 = "audit-log-retention"
          noncurrent_version_expiration_days = 2555 # 7 years — HIPAA §164.530(j)
          transitions = [
            { days = 90,  storage_class = "STANDARD_IA" },
            { days = 365, storage_class = "GLACIER" },
          ]
        },
      ]
    }

    "mediconnect-cicd-950110266426" = {
      versioning         = true
      bucket_key_enabled = false
      lifecycle_rules = [
        {
          id                                 = "cicd-cleanup"
          noncurrent_version_expiration_days = 90
          transitions = [
            { days = 30, storage_class = "STANDARD_IA" },
          ]
        },
      ]
    }

    "mediconnect-datalake-950110266426" = {
      versioning         = true
      bucket_key_enabled = false
      lifecycle_rules = [
        {
          id                                 = "datalake-tiering"
          noncurrent_version_expiration_days = 2555 # 7 years
          transitions = [
            { days = 90,  storage_class = "STANDARD_IA" },
            { days = 365, storage_class = "GLACIER" },
          ]
        },
      ]
    }

    # ── PHI / clinical data buckets ─────────────────────────────────────

    "mediconnect-patient-data" = {
      versioning        = true
      sse_algorithm     = "aws:kms"
      kms_master_key_id = module.kms_us.key_arns["mediconnect-phi-encryption"]
      cors_rules = [
        {
          allowed_methods = ["GET", "PUT", "POST", "DELETE", "HEAD"]
          expose_headers  = ["ETag", "x-amz-server-side-encryption", "x-amz-request-id", "x-amz-id-2"]
          max_age_seconds = 3000
        },
      ]
      lifecycle_rules = [
        {
          id     = "delete-patient-id-after-24h"
          prefix = "patient/"
          tags   = { "auto-delete" = "true" }
          expiration_days = 1
        },
        {
          id                                 = "noncurrent-version-cleanup"
          noncurrent_version_expiration_days = 2555 # 7 years — HIPAA
        },
      ]
    }

    "mediconnect-doctor-data" = {
      versioning        = true
      sse_algorithm     = "aws:kms"
      kms_master_key_id = module.kms_us.key_arns["mediconnect-phi-encryption"]
      cors_rules = [
        {
          allowed_methods = ["GET", "PUT", "POST", "DELETE", "HEAD"]
          expose_headers  = ["ETag", "x-amz-server-side-encryption", "x-amz-request-id", "x-amz-id-2"]
          max_age_seconds = 3000
        },
      ]
      lifecycle_rules = [
        {
          id     = "Delete-Doctor-Biometrics-Immediately"
          prefix = "doctor/"
          tags   = { "DataType" = "Biometric" }
          expiration_days = 1
        },
        {
          id     = "7-Year-Doctor-Retention-Purge"
          prefix = "doctor/"
          tags   = { "Status" = "Deleted", "RetentionPeriod" = "7Years" }
          expiration_days = 2555
        },
        {
          id                                 = "noncurrent-version-cleanup"
          noncurrent_version_expiration_days = 2555 # 7 years — HIPAA
        },
      ]
    }

    "mediconnect-prescriptions" = {
      versioning        = true
      sse_algorithm     = "aws:kms"
      kms_master_key_id = module.kms_us.key_arns["mediconnect-phi-encryption"]
      cors_rules = [
        {
          allowed_methods = ["GET", "HEAD"]
          max_age_seconds = 3000
        },
      ]
      lifecycle_rules = [
        {
          id                                 = "phi-retention"
          noncurrent_version_expiration_days = 2555 # 7 years — HIPAA/DEA
        },
      ]
    }

    "mediconnect-ehr-records" = {
      versioning        = true
      sse_algorithm     = "aws:kms"
      kms_master_key_id = module.kms_us.key_arns["mediconnect-phi-encryption"]
      cors_rules = [
        {
          allowed_methods = ["PUT", "GET", "HEAD"]
          expose_headers  = ["ETag"]
        },
      ]
      lifecycle_rules = [
        {
          id                                 = "phi-retention"
          noncurrent_version_expiration_days = 2555 # 7 years — HIPAA/CLIA
        },
      ]
    }

    "mediconnect-medical-images" = {
      versioning        = true
      sse_algorithm     = "aws:kms"
      kms_master_key_id = module.kms_us.key_arns["mediconnect-phi-encryption"]
      lifecycle_rules = [
        {
          id                                 = "phi-retention"
          noncurrent_version_expiration_days = 2555 # 7 years — HIPAA/ACR
          transitions = [
            { days = 180, storage_class = "STANDARD_IA" },
            { days = 365, storage_class = "GLACIER" },
          ]
        },
      ]
    }

    # ── Communication / media buckets ───────────────────────────────────

    "mediconnect-consultation-files" = {
      versioning        = true
      sse_algorithm     = "aws:kms"
      kms_master_key_id = module.kms_us.key_arns["mediconnect-phi-encryption"]
      lifecycle_rules = [
        {
          id                                 = "phi-retention"
          noncurrent_version_expiration_days = 2555 # 7 years — HIPAA
        },
      ]
    }

    "mediconnect-consultation-recordings" = {
      versioning        = true
      sse_algorithm     = "aws:kms"
      kms_master_key_id = module.kms_us.key_arns["mediconnect-phi-encryption"]
      lifecycle_rules = [
        {
          id                                 = "phi-retention"
          noncurrent_version_expiration_days = 2555 # 7 years — HIPAA
          transitions = [
            { days = 90,  storage_class = "STANDARD_IA" },
            { days = 365, storage_class = "GLACIER" },
          ]
        },
      ]
    }

    "mediconnect-media-assets" = {
      versioning        = true
      block_public_acls       = false
      ignore_public_acls      = false
      block_public_policy     = false
      restrict_public_buckets = false
      cors_rules = [
        {
          allowed_methods = ["GET", "PUT", "POST", "DELETE"]
          expose_headers  = ["ETag"]
          max_age_seconds = 3000
        },
      ]
    }
  }
}
