variable "keys" {
  description = "Map of KMS key alias name to configuration"
  type = map(object({
    description          = optional(string, "")
    key_usage            = optional(string, "SIGN_VERIFY")
    key_spec             = optional(string, "RSA_2048")
    enable_key_rotation  = optional(bool, false)
    deletion_window_days = optional(number, 30)
    tags                 = optional(map(string), {})
  }))
}
