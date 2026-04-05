output "bucket_arns" {
  description = "Map of bucket name to ARN"
  value       = { for name, bucket in aws_s3_bucket.buckets : name => bucket.arn }
}

output "bucket_ids" {
  description = "Map of bucket name to ID"
  value       = { for name, bucket in aws_s3_bucket.buckets : name => bucket.id }
}

output "bucket_domain_names" {
  description = "Map of bucket name to regional domain name"
  value       = { for name, bucket in aws_s3_bucket.buckets : name => bucket.bucket_regional_domain_name }
}
