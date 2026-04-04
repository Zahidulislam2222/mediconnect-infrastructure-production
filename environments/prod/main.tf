data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

module "azure_data" {
  source              = "../../modules/azure/data"
  subscription_id     = var.azure_subscription_id
  resource_group_name = "mediconnect-rg"
  location            = var.azure_location
}

module "aws_identity" {
  source                = "../../modules/aws/identity"
  azure_cosmos_endpoint = module.azure_data.endpoint
  azure_cosmos_key      = module.azure_data.primary_key
}

module "migration_job" {
  source     = "../../modules/aws/migration_job"
  aws_region = var.aws_region
  
  # REPLACE "module.aws_network..." WITH THIS:
  vpc_id     = data.aws_vpc.default.id
  subnet_ids = data.aws_subnets.default.ids
}

# Output the ECR URL so we know where to push the docker image
output "migration_repo_url" {
  value = module.migration_job.migration_repo_url
}
