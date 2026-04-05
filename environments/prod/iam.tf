# IAM roles — 45 total
# Trust policies are stored in iam_policies/*.json
# Inline/managed policies are ignored for Phase 1 (import-only)

locals {
  # Custom / path roles (manually created)
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

  # /service-role/ path roles (auto-created by AWS services)
  iam_service_roles = {
    "mediconnect-auto-group-eu-role-ewcj2kcy"      = { path = "/service-role/" }
    "mediconnect-auto-group-us-role-msj8mvre"       = { path = "/service-role/" }
    "mediconnect-billing-service-role-rfaptbgu"     = { path = "/service-role/" }
    "mediconnect-book-appointment-role-q8q3s008"    = { path = "/service-role/" }
    "mediconnect-cancel-appointment-role-43pkwks2"  = { path = "/service-role/" }
    "mediconnect-cleanup-recordings-role-g9twqdgq"  = { path = "/service-role/" }
    "mediconnect-cleanup-recordings-role-i088yo9g"  = { path = "/service-role/" }
    "mediconnect-cleanup-service-role-6p3uo83y"     = { path = "/service-role/" }
    "mediconnect-create-doctor-role-7vu5yt62"       = { path = "/service-role/" }
    "mediconnect-create-patient-role-a2tin7y6"      = { path = "/service-role/" }
    "mediconnect-ehr-service-role-qu55gdhw"         = { path = "/service-role/" }
    "mediconnect-failover-proxy-role-enf1d6hy"      = { path = "/service-role/" }
    "mediconnect-failover-proxy-role-jehbuy9v"      = { path = "/service-role/" }
    "mediconnect-file-sharing-service-role-yv0v6kc2" = { path = "/service-role/" }
    "mediconnect-get-appointments-role-8f7rs7ve"    = { path = "/service-role/" }
    "mediconnect-get-doctors-role-bgepsu8i"         = { path = "/service-role/" }
    "mediconnect-get-patients-role-4p2aska2"        = { path = "/service-role/" }
    "mediconnect-get-vitals-role-vttgimn7"          = { path = "/service-role/" }
    "mediconnect-graph-service-role-50gdzyo0"       = { path = "/service-role/" }
    "mediconnect-imaging-service-role-genwi8el"     = { path = "/service-role/" }
    "mediconnect-iot-gcp-sync-role-benw9tph"        = { path = "/service-role/" }
    "mediconnect-prescription-service-role-5pr8s84o" = { path = "/service-role/" }
    "mediconnect-stream-to-bigquery-role-rht3ozce"  = { path = "/service-role/" }
    "mediconnect-symptom-checker-role-hmvxvqh5"     = { path = "/service-role/" }
    "mediconnect-update-schedule-role-ul1us2xa"     = { path = "/service-role/" }
    "mediconnect-websocket-handler-role-ibksgcey"   = { path = "/service-role/" }
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
