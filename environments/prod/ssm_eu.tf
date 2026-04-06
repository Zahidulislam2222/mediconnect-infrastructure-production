# SSM Parameters in eu-central-1 (mirrors US params for multi-region services)

locals {
  ssm_eu_string_params = {
    "/mediconnect/prod/cognito/user_pool_id"    = "us-east-1_fUsIfc7kL"
    "/mediconnect/prod/cognito/user_pool_id_eu" = "eu-central-1_5Fc7eFLB5"
    "/mediconnect/prod/db/doctor_table"          = "mediconnect-doctors"
    "/mediconnect/prod/db/patient_table"         = "mediconnect-patients"
    "/mediconnect/prod/google/client_id"         = "392747507374-nrsie004dh2ubkl771ntu68k0iolvo7p.apps.googleusercontent.com"
    "/mediconnect/prod/mqtt/endpoint"            = "mqtts://a1wt74615ncz8o-ats.iot.us-east-1.amazonaws.com"
    "/mediconnect/prod/s3/doctor_identity_bucket" = "mediconnect-doctor-data"
    "/mediconnect/prod/s3/patient_identity_bucket" = "mediconnect-patient-data"
    "/mediconnect/prod/sns/topic_arn_eu"          = "arn:aws:sns:eu-central-1:950110266426:mediconnect-high-risk-alerts-eu"
    "/mediconnect/prod/sns/topic_arn_us"          = "arn:aws:sns:us-east-1:950110266426:mediconnect-high-risk-alerts"
  }

  ssm_eu_secure_params = toset([
    "/mediconnect/prod/azure/cosmos/endpoint",
    "/mediconnect/prod/azure/cosmos/primary_key",
    "/mediconnect/prod/cleanup/secret",
    "/mediconnect/prod/cognito/client_id_doctor",
    "/mediconnect/prod/cognito/client_id_eu_doctor",
    "/mediconnect/prod/cognito/client_id_eu_patient",
    "/mediconnect/prod/cognito/client_id_patient",
    "/mediconnect/prod/google/client_secret",
    "/mediconnect/prod/kms/signing_key_id",
    "/mediconnect/prod/stripe/secret_key",
    "/mediconnect/stripe/keys",
    "/mediconnect/stripe/webhook_secret",
    "/mediconnect/prod/stripe/plus_price_id",
    "/mediconnect/prod/stripe/premium_price_id",
    "/mediconnect/prod/stripe/connect_webhook_secret",
  ])
}

resource "aws_ssm_parameter" "eu_string" {
  provider = aws.eu
  for_each = local.ssm_eu_string_params

  name  = each.key
  type  = "String"
  value = each.value

  lifecycle {
    ignore_changes = [value]
  }
}

resource "aws_ssm_parameter" "eu_secure" {
  provider = aws.eu
  for_each = local.ssm_eu_secure_params

  name   = each.value
  type   = "SecureString"
  key_id = "alias/aws/ssm"
  value  = "IMPORTED_BY_TERRAFORM"

  lifecycle {
    ignore_changes = [value]
  }
}
