resource "aws_kms_key" "keys" {
  for_each = var.keys

  description              = each.value.description
  key_usage                = each.value.key_usage
  customer_master_key_spec = each.value.key_spec
  enable_key_rotation      = each.value.key_usage == "ENCRYPT_DECRYPT" ? each.value.enable_key_rotation : false
  deletion_window_in_days  = each.value.deletion_window_days
  is_enabled               = true
  tags                     = each.value.tags

  lifecycle {
    ignore_changes = [
      bypass_policy_lockout_safety_check,
      deletion_window_in_days, # write-only attribute, not read back on import
    ]
  }
}

resource "aws_kms_alias" "keys" {
  for_each = var.keys

  name          = "alias/${each.key}"
  target_key_id = aws_kms_key.keys[each.key].key_id
}
