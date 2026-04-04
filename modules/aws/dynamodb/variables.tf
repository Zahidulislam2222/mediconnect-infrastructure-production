variable "tables" {
  description = "Map of DynamoDB table configurations"
  type = map(object({
    hash_key       = string
    hash_key_type  = optional(string, "S")
    range_key      = optional(string)
    range_key_type = optional(string, "S")

    billing_mode          = optional(string, "PAY_PER_REQUEST")
    deletion_protection   = optional(bool, false)
    point_in_time_recovery = optional(bool, false)

    stream_enabled   = optional(bool, false)
    stream_view_type = optional(string)

    ttl_enabled       = optional(bool, false)
    ttl_attribute     = optional(string, "ttl")

    tags = optional(map(string), {})

    global_secondary_indexes = optional(list(object({
      name               = string
      hash_key           = string
      hash_key_type      = optional(string, "S")
      range_key          = optional(string)
      range_key_type     = optional(string, "S")
      projection_type    = optional(string, "ALL")
      non_key_attributes = optional(list(string))
    })), [])
  }))
}
