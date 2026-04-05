# DR (Disaster Recovery) bucket in us-west-2
# Replication target for mediconnect-audit-logs-950110266426

module "s3_dr" {
  source = "../../modules/aws/s3"

  providers = {
    aws = aws.us_west
  }

  buckets = {
    "mediconnect-audit-logs-950110266426-dr" = {
      versioning         = true
      bucket_key_enabled = false
      lifecycle_rules = [
        {
          id                                 = "audit-log-dr-retention"
          noncurrent_version_expiration_days = 2555 # 7 years — HIPAA §164.530(j)
          transitions = [
            { days = 90,  storage_class = "STANDARD_IA" },
            { days = 365, storage_class = "GLACIER" },
          ]
        },
      ]
    }
  }
}
