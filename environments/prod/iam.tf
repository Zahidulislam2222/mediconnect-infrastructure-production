# IAM roles — active services only (legacy Lambda roles removed)
# Trust policies are stored in iam_policies/*.json
# Inline/managed policies are ignored for Phase 1 (import-only)

locals {
  # Custom / path roles (manually created) — active services
  iam_custom_roles = {
    "mediconnect-admin-role"        = { path = "/" }
    "mediconnect-azure-role-us"     = { path = "/" }
    "mediconnect-booking-role"      = { path = "/" }
    "mediconnect-comm-role"         = { path = "/" }
    "mediconnect-dicom-role"        = { path = "/" }
    "mediconnect-doctor-role"       = { path = "/" }
    "mediconnect-eks-pod-role"      = { path = "/" }
    "mediconnect-lambda-shared-role" = { path = "/" }
    "mediconnect-migration-role"    = { path = "/" }
    "mediconnect-patient-role"      = { path = "/" }
    "mediconnect-staff-role"        = { path = "/" }
    "MediconnectBillingRole"        = { path = "/" }
    "MediconnectBuildRole"          = { path = "/" }
    "MediconnectLambdaRole"         = { path = "/" }
    "MediconnectPipelineRole"       = { path = "/" }
    "MediconnectReplicationRole"    = { path = "/" }
  }

  # /service-role/ path roles — active Lambda functions only
  iam_service_roles = {
    "mediconnect-auto-group-eu-role-ewcj2kcy"      = { path = "/service-role/" }
    "mediconnect-auto-group-us-role-msj8mvre"       = { path = "/service-role/" }
    "mediconnect-cleanup-recordings-role-g9twqdgq"  = { path = "/service-role/" }
    "mediconnect-cleanup-recordings-role-i088yo9g"  = { path = "/service-role/" }
    "mediconnect-failover-proxy-role-enf1d6hy"      = { path = "/service-role/" }
    "mediconnect-failover-proxy-role-jehbuy9v"      = { path = "/service-role/" }
    "mediconnect-ws-authorizer-role-5u712lso"       = { path = "/service-role/" }
    "mediconnect-ws-authorizer-role-62a577ny"       = { path = "/service-role/" }
    "MediconnectAnalyticsRole"                      = { path = "/service-role/" }
  }

  iam_all_roles = merge(local.iam_custom_roles, local.iam_service_roles)
}

resource "aws_iam_role" "roles" {
  for_each = local.iam_all_roles

  name               = each.key
  path               = each.value.path
  assume_role_policy = file("${path.module}/iam_policies/${each.key}.json")

  lifecycle {
    ignore_changes = [
      inline_policy,
      permissions_boundary,
      tags,
      description,
    ]
  }
}
