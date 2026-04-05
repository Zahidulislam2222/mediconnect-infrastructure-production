variable "roles" {
  description = "Map of IAM role name to configuration"
  type = map(object({
    path               = optional(string, "/")
    assume_role_policy = string # JSON-encoded trust policy
    description        = optional(string, "")
    tags               = optional(map(string), {})
  }))
}
