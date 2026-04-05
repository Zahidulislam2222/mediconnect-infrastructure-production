data "aws_region" "current" {}

# ── User Pool ───────────────────────────────────────────────────────────

resource "aws_cognito_user_pool" "pool" {
  name                     = var.user_pool_name
  mfa_configuration        = var.mfa_configuration
  deletion_protection      = var.deletion_protection
  auto_verified_attributes = var.auto_verified_attributes
  username_attributes      = var.username_attributes

  password_policy {
    minimum_length                   = var.password_policy.minimum_length
    require_uppercase                = var.password_policy.require_uppercase
    require_lowercase                = var.password_policy.require_lowercase
    require_numbers                  = var.password_policy.require_numbers
    require_symbols                  = var.password_policy.require_symbols
    temporary_password_validity_days = var.password_policy.temporary_password_validity_days
  }

  software_token_mfa_configuration {
    enabled = true
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
    recovery_mechanism {
      name     = "verified_phone_number"
      priority = 2
    }
  }

  verification_message_template {
    default_email_option = "CONFIRM_WITH_CODE"
  }

  dynamic "schema" {
    for_each = var.custom_attributes
    content {
      name                = schema.value.name
      attribute_data_type = schema.value.type
      mutable             = schema.value.mutable
      required            = false

      dynamic "string_attribute_constraints" {
        for_each = schema.value.type == "String" ? [1] : []
        content {
          min_length = schema.value.min_length
          max_length = schema.value.max_length
        }
      }
    }
  }

  device_configuration {
    challenge_required_on_new_device      = var.device_challenge_required
    device_only_remembered_on_user_prompt = var.device_remembered_on_prompt
  }

  dynamic "lambda_config" {
    for_each = var.lambda_post_confirmation_arn != null ? [1] : []
    content {
      post_confirmation = var.lambda_post_confirmation_arn
    }
  }

  tags = var.tags

  lifecycle {
    ignore_changes = [
      schema,
    ]
  }
}

# ── App Clients ─────────────────────────────────────────────────────────

resource "aws_cognito_user_pool_client" "clients" {
  for_each = var.clients

  name         = each.key
  user_pool_id = aws_cognito_user_pool.pool.id

  explicit_auth_flows                  = each.value.explicit_auth_flows
  allowed_oauth_flows                  = each.value.allowed_oauth_flows
  allowed_oauth_scopes                 = each.value.allowed_oauth_scopes
  supported_identity_providers         = each.value.supported_identity_providers
  callback_urls                        = each.value.callback_urls
  generate_secret                      = each.value.generate_secret
  allowed_oauth_flows_user_pool_client = each.value.allowed_oauth_flows_user_pool_client

  token_validity_units {
    access_token  = each.value.token_validity_units.access_token
    id_token      = each.value.token_validity_units.id_token
    refresh_token = each.value.token_validity_units.refresh_token
  }

  lifecycle {
    ignore_changes = [
      generate_secret,
    ]
  }
}

# ── Identity Pool ───────────────────────────────────────────────────────

resource "aws_cognito_identity_pool" "pool" {
  count = var.identity_pool_name != null ? 1 : 0

  identity_pool_name               = var.identity_pool_name
  allow_unauthenticated_identities = var.identity_pool_allow_unauthenticated
  allow_classic_flow               = false

  dynamic "cognito_identity_providers" {
    for_each = var.identity_pool_client_ids
    content {
      client_id               = aws_cognito_user_pool_client.clients[cognito_identity_providers.value].id
      provider_name           = "cognito-idp.${data.aws_region.current.name}.amazonaws.com/${aws_cognito_user_pool.pool.id}"
      server_side_token_check = false
    }
  }

  lifecycle {
    ignore_changes = [
      cognito_identity_providers,
    ]
  }
}
