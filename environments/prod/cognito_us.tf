module "cognito_us" {
  source = "../../modules/aws/cognito"

  providers = {
    aws = aws.us
  }

  user_pool_name      = "mediconnect-users-us"
  mfa_configuration   = "ON"
  deletion_protection = "ACTIVE"

  custom_attributes = [
    { name = "user_role", type = "String", mutable = false },
    { name = "fhir_id", type = "String", mutable = false },
  ]

  lambda_post_confirmation_arn = "arn:aws:lambda:us-east-1:950110266426:function:mediconnect-auto-group-us"

  clients = {
    "client-patient-web" = {
      callback_urls = ["https://d84l1y8p4kdic.cloudfront.net"]
    }
    "client-doctor-web" = {
      callback_urls = ["https://d84l1y8p4kdic.cloudfront.net"]
    }
    "client-admin-web" = {
      callback_urls = ["https://d84l1y8p4kdic.cloudfront.net"]
    }
    "client-staff-web" = {
      callback_urls = ["https://d84l1y8p4kdic.cloudfront.net"]
    }
  }

  identity_pool_name       = "MediconnectIdentityPoolUS"
  identity_pool_client_ids = ["client-patient-web", "client-doctor-web"]
}
