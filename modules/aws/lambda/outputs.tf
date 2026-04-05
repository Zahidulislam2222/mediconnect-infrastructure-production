output "function_arns" {
  description = "Map of function name to ARN"
  value       = { for name, fn in aws_lambda_function.functions : name => fn.arn }
}

output "function_names" {
  description = "Map of function key to function name"
  value       = { for name, fn in aws_lambda_function.functions : name => fn.function_name }
}
