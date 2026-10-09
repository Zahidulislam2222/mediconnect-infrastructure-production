# Proposed application access only; owner authorization is required before apply.
data "aws_caller_identity" "booking_runtime" {}
data "aws_region" "booking_runtime_us" { provider = aws.us }
data "aws_region" "booking_runtime_eu" { provider = aws.eu }

locals {
  booking_runtime_role_name = "mediconnect-booking-role"
  booking_runtime_additional_table_actions = {
    "mediconnect-reminders"          = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:Scan"]
    "mediconnect-eligibility-checks" = ["dynamodb:PutItem", "dynamodb:Query"]
    "mediconnect-prior-auth"         = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:Query"]
    "mediconnect-subscriptions"      = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem"]
    "mediconnect-doctor-payouts"     = ["dynamodb:PutItem", "dynamodb:Scan"]
    "mediconnect-webhook-events"     = ["dynamodb:PutItem", "dynamodb:DeleteItem"]
  }
  booking_runtime_table_arns = {
    for name in keys(local.booking_runtime_additional_table_actions) : name => [
      for region in [data.aws_region.booking_runtime_us.name, data.aws_region.booking_runtime_eu.name] :
      "arn:aws:dynamodb:${region}:${data.aws_caller_identity.booking_runtime.account_id}:table/${name}"
    ]
  }
}

resource "aws_iam_role_policy" "booking_runtime_tables" {
  name = "phase2-booking-regional-table-access"
  role = local.booking_runtime_role_name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = concat(
      [for name, actions in local.booking_runtime_additional_table_actions : {
        Effect   = "Allow"
        Action   = actions
        Resource = local.booking_runtime_table_arns[name]
      }],
      [for name, actions in local.booking_runtime_additional_table_actions : {
        Effect   = "Allow"
        Action   = ["dynamodb:Query"]
        Resource = [for arn in local.booking_runtime_table_arns[name] : "${arn}/index/*"]
      } if contains(actions, "dynamodb:Query")]
    )
  })
}
