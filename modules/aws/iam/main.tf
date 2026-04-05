resource "aws_iam_role" "roles" {
  for_each = var.roles

  name               = each.key
  path               = each.value.path
  assume_role_policy = each.value.assume_role_policy
  description        = each.value.description
  tags               = each.value.tags

  lifecycle {
    ignore_changes = [
      inline_policy,
      managed_policy_arns,
    ]
  }
}
