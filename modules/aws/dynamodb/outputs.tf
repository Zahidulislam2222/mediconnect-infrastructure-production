output "table_arns" {
  description = "Map of table name to ARN"
  value       = { for name, table in aws_dynamodb_table.tables : name => table.arn }
}

output "table_names" {
  description = "Map of table key to table name"
  value       = { for name, table in aws_dynamodb_table.tables : name => table.name }
}
