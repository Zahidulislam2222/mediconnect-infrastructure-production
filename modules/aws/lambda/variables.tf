variable "functions" {
  description = "Map of Lambda function configurations"
  type = map(object({
    handler     = optional(string, "index.handler")
    runtime     = optional(string, "nodejs22.x")
    memory_size = optional(number, 128)
    timeout     = optional(number, 3)
    role_arn    = string

    environment_variables = optional(map(string), {})
    tags                  = optional(map(string), {})
  }))
}
