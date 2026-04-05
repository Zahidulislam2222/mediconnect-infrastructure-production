output "key_arns" {
  description = "Map of alias name to key ARN"
  value       = { for name, key in aws_kms_key.keys : name => key.arn }
}

output "key_ids" {
  description = "Map of alias name to key ID"
  value       = { for name, key in aws_kms_key.keys : name => key.key_id }
}
