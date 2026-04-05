output "topic_arns" {
  description = "Map of topic name to ARN"
  value       = { for name, topic in aws_sns_topic.topics : name => topic.arn }
}
