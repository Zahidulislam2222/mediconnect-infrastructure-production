
terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.0"
    }
  }
}

locals {
  default_tags = {
    Project     = "MediConnect"
    Environment = "prod"
    ManagedBy   = "Terraform"
  }
}

provider "aws" {
  region = var.aws_region
  default_tags { tags = local.default_tags }
}

provider "aws" {
  alias  = "us"
  region = "us-east-1"
  default_tags { tags = local.default_tags }
}

provider "aws" {
  alias  = "eu"
  region = "eu-central-1"
  default_tags { tags = local.default_tags }
}

provider "aws" {
  alias  = "us_west"
  region = "us-west-2"
  default_tags { tags = local.default_tags }
}

provider "google" {
  project     = var.gcp_project_id
  region      = var.gcp_region
  credentials = file("gcp_key.json")
}

provider "azurerm" {
  features {}
  subscription_id = var.azure_subscription_id
}
