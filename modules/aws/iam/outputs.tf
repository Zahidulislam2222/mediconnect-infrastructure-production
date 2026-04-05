output "role_arns" {
  description = "Map of role name to ARN"
  value       = { for name, role in aws_iam_role.roles : name => role.arn }
}

output "role_names" {
  description = "Map of role key to name"
  value       = { for name, role in aws_iam_role.roles : name => role.name }
}
