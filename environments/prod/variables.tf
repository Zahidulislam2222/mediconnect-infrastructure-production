variable "aws_region" {
  description = "AWS Region"
  type        = string
  default     = "us-east-1"
}

variable "gcp_project_id" {
  description = "GCP Project ID"
  type        = string
}

variable "gcp_region" {
  description = "GCP Region"
  type        = string
  default     = "us-central1"
}

variable "azure_subscription_id" {
  description = "Azure Subscription ID"
  type        = string
}

variable "azure_location" {
  description = "The Azure Region for resources"
  type        = string
  default     = "westus"
}