# For Phase 1 import: we import existing functions, so the placeholder zip
# is never actually deployed. Terraform just needs a valid filename attribute.

data "archive_file" "placeholder" {
  type        = "zip"
  output_path = "${path.module}/placeholder.zip"

  source {
    content  = "// placeholder — managed by CI/CD"
    filename = "index.mjs"
  }
}

resource "aws_lambda_function" "functions" {
  for_each = var.functions

  function_name = each.key
  handler       = each.value.handler
  runtime       = each.value.runtime
  memory_size   = each.value.memory_size
  timeout       = each.value.timeout
  role          = each.value.role_arn

  filename         = data.archive_file.placeholder.output_path
  source_code_hash = data.archive_file.placeholder.output_base64sha256

  dynamic "environment" {
    for_each = length(each.value.environment_variables) > 0 ? [1] : []
    content {
      variables = each.value.environment_variables
    }
  }

  tags = each.value.tags

  lifecycle {
    ignore_changes = [
      filename,
      source_code_hash,
      layers,
      runtime,
    ]
  }
}
