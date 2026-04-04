terraform {
  backend "s3" {
    bucket         = "mediconnect-terraform-state-950110266426"
    key            = "prod/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "mediconnect-terraform-locks"
    encrypt        = true
  }
}
