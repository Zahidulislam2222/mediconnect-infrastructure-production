# Optional CMS workload identity. Actual values belong in private deployment inputs.
# Keep access-key creation outside Terraform so its secret never enters state.
variable "cms_media_identity" {
  description = "Optional bucket-scoped CMS identity; null preserves existing infrastructure."
  type = object({
    user_name   = string
    policy_name = string
    path        = string
    bucket_name = string
  })
  default = null

  validation {
    condition = var.cms_media_identity == null ? true : alltrue([
      can(regex("^[A-Za-z0-9_+=,.@-]{1,64}$", var.cms_media_identity.user_name)),
      can(regex("^[A-Za-z0-9_+=,.@-]{1,128}$", var.cms_media_identity.policy_name)),
      can(regex("^/([A-Za-z0-9_-]+/)*$", var.cms_media_identity.path)),
      length(var.cms_media_identity.path) <= 512,
      can(regex("^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$", var.cms_media_identity.bucket_name)),
    ])
    error_message = "CMS identity requires valid IAM names/path and an existing DNS-safe media bucket."
  }
}

locals {
  cms_media_identities = var.cms_media_identity == null ? {} : { cms = var.cms_media_identity }
}

data "aws_partition" "cms_media" {}

resource "aws_iam_user" "cms_media" {
  for_each = local.cms_media_identities

  name          = each.value.user_name
  path          = each.value.path
  force_destroy = false
}

data "aws_iam_policy_document" "cms_media" {
  for_each = local.cms_media_identities

  statement {
    sid     = "DenyInsecureMediaAccess"
    effect  = "Deny"
    actions = ["s3:*"]
    resources = [
      "arn:${data.aws_partition.cms_media.partition}:s3:::${each.value.bucket_name}",
      "arn:${data.aws_partition.cms_media.partition}:s3:::${each.value.bucket_name}/*",
    ]
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }

  statement {
    sid = "MediaBucketMetadata"
    actions = [
      "s3:GetBucketLocation",
      "s3:ListBucket",
      "s3:ListBucketMultipartUploads",
    ]
    resources = ["arn:${data.aws_partition.cms_media.partition}:s3:::${each.value.bucket_name}"]
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["true"]
    }
  }

  statement {
    sid = "MediaObjects"
    actions = [
      "s3:GetObject",
      "s3:GetObjectVersion",
      "s3:PutObject",
      "s3:DeleteObject",
      "s3:AbortMultipartUpload",
      "s3:ListMultipartUploadParts",
    ]
    resources = ["arn:${data.aws_partition.cms_media.partition}:s3:::${each.value.bucket_name}/*"]
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["true"]
    }
  }
}

resource "aws_iam_user_policy" "cms_media" {
  for_each = local.cms_media_identities

  name   = each.value.policy_name
  user   = aws_iam_user.cms_media[each.key].name
  policy = data.aws_iam_policy_document.cms_media[each.key].json
}

output "cms_media_runtime_user_arn" {
  description = "Optional CMS bucket-scoped workload user; contains no credential."
  value       = try(aws_iam_user.cms_media["cms"].arn, null)
}
