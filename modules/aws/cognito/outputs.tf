output "user_pool_id" {
  description = "The user pool ID"
  value       = aws_cognito_user_pool.pool.id
}

output "user_pool_arn" {
  description = "The user pool ARN"
  value       = aws_cognito_user_pool.pool.arn
}

output "client_ids" {
  description = "Map of client name to client ID"
  value       = { for name, client in aws_cognito_user_pool_client.clients : name => client.id }
}

output "identity_pool_id" {
  description = "The identity pool ID"
  value       = var.identity_pool_name != null ? aws_cognito_identity_pool.pool[0].id : null
}
