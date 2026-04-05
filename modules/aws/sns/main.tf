resource "aws_sns_topic" "topics" {
  for_each = var.topics

  name              = each.key
  display_name      = each.value.display_name
  kms_master_key_id = each.value.kms_master_key_id
  tags              = each.value.tags
}
