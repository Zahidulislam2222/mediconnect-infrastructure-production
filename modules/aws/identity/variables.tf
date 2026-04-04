variable "azure_cosmos_endpoint" {
  description = "Azure Cosmos DB endpoint"
  type        = string
}

variable "azure_cosmos_key" {
  description = "Azure Cosmos DB primary key"
  type        = string
  sensitive   = true
}
