# Intended configuration only. Apply remains a manual owner operation after release review.
resource "aws_iam_role_policy" "ws_ticket_us" {
  provider = aws.us
  name     = "consume-connection-tickets"
  role     = aws_iam_role.roles["mediconnect-ws-authorizer-role-5u712lso"].name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = ["dynamodb:DeleteItem"]
      Resource  = module.dynamodb_us.table_arns["mediconnect-chat-connections"]
      Condition = { "ForAllValues:StringLike" = { "dynamodb:LeadingKeys" = ["ticket#*"] } }
    }]
  })
}

resource "aws_iam_role_policy" "ws_ticket_eu" {
  provider = aws.eu
  name     = "consume-connection-tickets"
  role     = aws_iam_role.roles["mediconnect-ws-authorizer-role-62a577ny"].name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = ["dynamodb:DeleteItem"]
      Resource  = module.dynamodb_eu.table_arns["mediconnect-chat-connections"]
      Condition = { "ForAllValues:StringLike" = { "dynamodb:LeadingKeys" = ["ticket#*"] } }
    }]
  })
}
