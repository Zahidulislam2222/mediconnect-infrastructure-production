resource "aws_ssm_parameter" "azure_cosmos_endpoint" {
  name  = "/mediconnect/prod/azure/cosmos/endpoint"
  type  = "String"
  value = var.azure_cosmos_endpoint
}

resource "aws_ssm_parameter" "azure_cosmos_key" {
  name  = "/mediconnect/prod/azure/cosmos/primary_key"
  type  = "SecureString"
  value = var.azure_cosmos_key
}
