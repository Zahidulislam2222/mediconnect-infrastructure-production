variable "user_pool_name" {
  description = "Name of the Cognito user pool"
  type        = string
}

variable "mfa_configuration" {
  description = "MFA configuration (OFF, ON, OPTIONAL)"
  type        = string
  default     = "ON"
}

variable "deletion_protection" {
  description = "Deletion protection (ACTIVE or INACTIVE)"
  type        = string
  default     = "ACTIVE"
}

variable "auto_verified_attributes" {
  description = "Attributes to auto-verify"
  type        = list(string)
  default     = ["email"]
}

variable "username_attributes" {
  description = "Attributes used as username"
  type        = list(string)
  default     = ["email"]
}

variable "password_policy" {
  description = "Password policy configuration"
  type = object({
    minimum_length                   = optional(number, 8)
    require_uppercase                = optional(bool, true)
    require_lowercase                = optional(bool, true)
    require_numbers                  = optional(bool, true)
    require_symbols                  = optional(bool, true)
    temporary_password_validity_days = optional(number, 7)
  })
  default = {}
}

variable "custom_attributes" {
  description = "Custom schema attributes"
  type = list(object({
    name      = string
    type      = optional(string, "String")
    mutable   = optional(bool, false)
    min_length = optional(number)
    max_length = optional(number)
  }))
  default = []
}

variable "device_challenge_required" {
  description = "Whether to challenge on new device"
  type        = bool
  default     = true
}

variable "device_remembered_on_prompt" {
  description = "Whether device is only remembered on user prompt"
  type        = bool
  default     = false
}

variable "lambda_post_confirmation_arn" {
  description = "ARN of Lambda function for PostConfirmation trigger"
  type        = string
  default     = null
}

variable "clients" {
  description = "Map of app client configurations"
  type = map(object({
    explicit_auth_flows          = optional(list(string), ["ALLOW_REFRESH_TOKEN_AUTH", "ALLOW_USER_AUTH", "ALLOW_USER_SRP_AUTH"])
    allowed_oauth_flows          = optional(list(string), ["code"])
    allowed_oauth_scopes         = optional(list(string), ["email", "openid", "phone"])
    supported_identity_providers = optional(list(string), ["COGNITO"])
    callback_urls                = optional(list(string), [])
    generate_secret              = optional(bool, false)
    allowed_oauth_flows_user_pool_client = optional(bool, true)
    token_validity_units = optional(object({
      access_token  = optional(string, "minutes")
      id_token      = optional(string, "minutes")
      refresh_token = optional(string, "days")
    }), {})
  }))
  default = {}
}

variable "identity_pool_name" {
  description = "Name of the Cognito identity pool"
  type        = string
  default     = null
}

variable "identity_pool_allow_unauthenticated" {
  description = "Allow unauthenticated identities"
  type        = bool
  default     = false
}

variable "identity_pool_client_ids" {
  description = "List of client name keys (from var.clients) to associate with the identity pool"
  type        = list(string)
  default     = []
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}
