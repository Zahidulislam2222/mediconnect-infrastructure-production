variable "topics" {
  description = "Map of SNS topic name to configuration"
  type = map(object({
    display_name      = optional(string, "")
    kms_master_key_id = optional(string, null)
    tags              = optional(map(string), {})
  }))
}
