resource "aws_s3_bucket" "buckets" {
  for_each = var.buckets
  bucket   = each.key
  tags     = each.value.tags

  lifecycle {
    prevent_destroy = false
  }
}

resource "aws_s3_bucket_versioning" "buckets" {
  for_each = var.buckets
  bucket   = aws_s3_bucket.buckets[each.key].id

  versioning_configuration {
    status = each.value.versioning ? "Enabled" : "Suspended"
  }

  # ignore_changes removed in Phase 2 to enable versioning hardening
}

resource "aws_s3_bucket_server_side_encryption_configuration" "buckets" {
  for_each = var.buckets
  bucket   = aws_s3_bucket.buckets[each.key].id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = each.value.sse_algorithm
      kms_master_key_id = each.value.kms_master_key_id
    }
    bucket_key_enabled = each.value.bucket_key_enabled
  }
}

resource "aws_s3_bucket_public_access_block" "buckets" {
  for_each = var.buckets
  bucket   = aws_s3_bucket.buckets[each.key].id

  block_public_acls       = each.value.block_public_acls
  ignore_public_acls      = each.value.ignore_public_acls
  block_public_policy     = each.value.block_public_policy
  restrict_public_buckets = each.value.restrict_public_buckets
}

# Only create CORS config for buckets that have CORS rules
resource "aws_s3_bucket_cors_configuration" "buckets" {
  for_each = {
    for name, config in var.buckets : name => config
    if length(config.cors_rules) > 0
  }
  bucket = aws_s3_bucket.buckets[each.key].id

  dynamic "cors_rule" {
    for_each = each.value.cors_rules
    content {
      allowed_headers = cors_rule.value.allowed_headers
      allowed_methods = cors_rule.value.allowed_methods
      allowed_origins = cors_rule.value.allowed_origins
      expose_headers  = cors_rule.value.expose_headers
      max_age_seconds = cors_rule.value.max_age_seconds > 0 ? cors_rule.value.max_age_seconds : null
    }
  }
}

# Only create lifecycle config for buckets that have lifecycle rules
resource "aws_s3_bucket_lifecycle_configuration" "buckets" {
  for_each = {
    for name, config in var.buckets : name => config
    if length(config.lifecycle_rules) > 0
  }
  bucket = aws_s3_bucket.buckets[each.key].id

  dynamic "rule" {
    for_each = each.value.lifecycle_rules
    content {
      id     = rule.value.id
      status = rule.value.enabled ? "Enabled" : "Disabled"

      # Use 'and' only when both prefix and tags are present;
      # otherwise use simple prefix or empty filter
      dynamic "filter" {
        for_each = length(rule.value.tags) > 0 ? [1] : []
        content {
          and {
            prefix = rule.value.prefix != null ? rule.value.prefix : ""
            tags   = rule.value.tags
          }
        }
      }
      dynamic "filter" {
        for_each = length(rule.value.tags) == 0 ? [1] : []
        content {
          prefix = rule.value.prefix != null ? rule.value.prefix : ""
        }
      }

      dynamic "expiration" {
        for_each = rule.value.expiration_days != null ? [1] : []
        content {
          days = rule.value.expiration_days
        }
      }

      dynamic "noncurrent_version_expiration" {
        for_each = rule.value.noncurrent_version_expiration_days != null ? [1] : []
        content {
          noncurrent_days = rule.value.noncurrent_version_expiration_days
        }
      }

      dynamic "transition" {
        for_each = rule.value.transitions
        content {
          days          = transition.value.days
          storage_class = transition.value.storage_class
        }
      }
    }
  }
}
