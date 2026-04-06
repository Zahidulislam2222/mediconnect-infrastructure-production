module "sns_us" {
  source = "../../modules/aws/sns"

  providers = {
    aws = aws.us
  }

  topics = {
    "mediconnect-appointments"         = { kms_master_key_id = "alias/aws/sns" }
    "mediconnect-high-risk-alerts"     = { kms_master_key_id = "alias/aws/sns" }
    "mediconnect-ops-alerts"           = { display_name = "MediAlert", kms_master_key_id = "alias/aws/sns" }
    "mediconnect-pharmacy-alerts"      = { kms_master_key_id = "alias/aws/sns" }
    "mediconnect-prescription-alerts"  = { kms_master_key_id = "alias/aws/sns" }
    "billing-alert"                    = { kms_master_key_id = "alias/aws/sns" }
  }
}

module "sns_eu" {
  source = "../../modules/aws/sns"

  providers = {
    aws = aws.eu
  }

  topics = {
    "mediconnect-appointments-eu"        = { kms_master_key_id = "alias/aws/sns" }
    "mediconnect-high-risk-alerts-eu"    = { kms_master_key_id = "alias/aws/sns" }
    "mediconnect-ops-alerts-eu"          = { display_name = "MediAlert-EU", kms_master_key_id = "alias/aws/sns" }
    "mediconnect-pharmacy-alerts-eu"     = { kms_master_key_id = "alias/aws/sns" }
    "mediconnect-prescription-alerts-eu" = { kms_master_key_id = "alias/aws/sns" }
    "billing-alert-eu"                   = { kms_master_key_id = "alias/aws/sns" }
  }
}
