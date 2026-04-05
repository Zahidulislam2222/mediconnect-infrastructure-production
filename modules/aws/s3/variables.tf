variable "buckets" {
  description = "Map of S3 bucket configurations"
  type = map(object({
    versioning = optional(bool, false)

    # Server-side encryption
    sse_algorithm      = optional(string, "AES256")
    kms_master_key_id  = optional(string, null)
    bucket_key_enabled = optional(bool, true)

    # Public access block (all true by default — HIPAA safe)
    block_public_acls       = optional(bool, true)
    ignore_public_acls      = optional(bool, true)
    block_public_policy     = optional(bool, true)
    restrict_public_buckets = optional(bool, true)

    # CORS
    cors_rules = optional(list(object({
      allowed_headers = optional(list(string), ["*"])
      allowed_methods = list(string)
      allowed_origins = optional(list(string), ["*"])
      expose_headers  = optional(list(string), [])
      max_age_seconds = optional(number, 0)
    })), [])

    # Lifecycle rules
    lifecycle_rules = optional(list(object({
      id      = string
      enabled = optional(bool, true)
      prefix  = optional(string)
      tags    = optional(map(string), {})

      expiration_days                 = optional(number)
      noncurrent_version_expiration_days = optional(number)

      transitions = optional(list(object({
        days          = number
        storage_class = string
      })), [])
    })), [])

    tags = optional(map(string), {})
  }))
}
