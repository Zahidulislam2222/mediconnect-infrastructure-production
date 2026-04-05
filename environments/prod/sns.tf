module "sns_us" {
  source = "../../modules/aws/sns"

  providers = {
    aws = aws.us
  }

  topics = {
    "mediconnect-appointments"         = {}
    "mediconnect-high-risk-alerts"     = {}
    "mediconnect-ops-alerts"           = { display_name = "MediAlert", kms_master_key_id = "alias/aws/sns" }
    "mediconnect-pharmacy-alerts"      = {}
    "mediconnect-prescription-alerts"  = {}
    "billing-alert"                    = {}
  }
}

module "sns_eu" {
  source = "../../modules/aws/sns"

  providers = {
    aws = aws.eu
  }

  topics = {
    "mediconnect-appointments-eu"        = {}
    "mediconnect-high-risk-alerts-eu"    = {}
    "mediconnect-ops-alerts-eu"          = { display_name = "MediAlert-EU", kms_master_key_id = "alias/aws/sns" }
    "mediconnect-pharmacy-alerts-eu"     = {}
    "mediconnect-prescription-alerts-eu" = {}
    "billing-alert-eu"                   = {}
  }
}
