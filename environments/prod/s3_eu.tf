module "s3_eu" {
  source = "../../modules/aws/s3"

  providers = {
    aws = aws.eu
  }

  buckets = {
    "mediconnect-consultation-recordings-eu" = {
      versioning        = true
      sse_algorithm     = "aws:kms"
      kms_master_key_id = module.kms_eu.key_arns["mediconnect-phi-encryption-eu"]
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

    "mediconnect-doctor-data-eu" = {
      versioning        = true
      sse_algorithm     = "aws:kms"
      kms_master_key_id = module.kms_eu.key_arns["mediconnect-phi-encryption-eu"]
      lifecycle_rules = [
        {
          id                                 = "phi-retention"
          noncurrent_version_expiration_days = 2555 # 7 years — HIPAA
        },
      ]
    }

    "mediconnect-ehr-records-eu" = {
      versioning        = true
      sse_algorithm     = "aws:kms"
      kms_master_key_id = module.kms_eu.key_arns["mediconnect-phi-encryption-eu"]
      lifecycle_rules = [
        {
          id                                 = "phi-retention"
          noncurrent_version_expiration_days = 2555 # 7 years — HIPAA/CLIA
        },
      ]
    }

    "mediconnect-medical-images-eu" = {
      versioning        = true
      sse_algorithm     = "aws:kms"
      kms_master_key_id = module.kms_eu.key_arns["mediconnect-phi-encryption-eu"]
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

    "mediconnect-patient-data-eu" = {
      versioning        = true
      sse_algorithm     = "aws:kms"
      kms_master_key_id = module.kms_eu.key_arns["mediconnect-phi-encryption-eu"]
      lifecycle_rules = [
        {
          id                                 = "phi-retention"
          noncurrent_version_expiration_days = 2555 # 7 years — HIPAA
        },
      ]
    }

    "mediconnect-prescriptions-eu" = {
      versioning        = true
      sse_algorithm     = "aws:kms"
      kms_master_key_id = module.kms_eu.key_arns["mediconnect-phi-encryption-eu"]
      lifecycle_rules = [
        {
          id                                 = "phi-retention"
          noncurrent_version_expiration_days = 2555 # 7 years — HIPAA/DEA
        },
      ]
    }
  }
}
