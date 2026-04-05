module "kms_us" {
  source = "../../modules/aws/kms"

  providers = {
    aws = aws.us
  }

  keys = {
    "mediconnect-prescription-signer" = {
      key_usage = "SIGN_VERIFY"
      key_spec  = "RSA_2048"
    }

    "mediconnect-phi-encryption" = {
      description         = "Encrypts PHI data at rest in S3 buckets (us-east-1)"
      key_usage           = "ENCRYPT_DECRYPT"
      key_spec            = "SYMMETRIC_DEFAULT"
      enable_key_rotation = true
    }
  }
}

module "kms_eu" {
  source = "../../modules/aws/kms"

  providers = {
    aws = aws.eu
  }

  keys = {
    "mediconnect-prescription-signer-eu" = {
      key_usage = "SIGN_VERIFY"
      key_spec  = "RSA_2048"
    }

    "mediconnect-phi-encryption-eu" = {
      description         = "Encrypts PHI data at rest in S3 buckets (eu-central-1)"
      key_usage           = "ENCRYPT_DECRYPT"
      key_spec            = "SYMMETRIC_DEFAULT"
      enable_key_rotation = true
    }
  }
}
