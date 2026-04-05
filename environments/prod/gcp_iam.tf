# ── GCP IAM: Service Accounts + Workload Identity ─────────────────────────

# --- Service Accounts (1 custom + 1 default compute) ---

# Custom service account for Cloud Run + data logging
resource "google_service_account" "data_logger" {
  account_id   = "data-logger"
  display_name = "data-logger"
  project      = var.gcp_project_id
}

# Default compute SA is auto-managed by Google — not imported

# --- Workload Identity Pools + Providers ---

# GitHub Actions → GCP (CI/CD deploys)
resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "github-pool"
  display_name              = "GitHub Actions Pool"
  project                   = var.gcp_project_id
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-provider"
  display_name                       = "GitHub Actions Provider"
  project                            = var.gcp_project_id

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.actor"      = "assertion.actor"
    "attribute.repository" = "assertion.repository"
  }

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }

  lifecycle {
    ignore_changes = [attribute_mapping, oidc]
  }
}

# AWS → GCP (cross-cloud auth bridge)
resource "google_iam_workload_identity_pool" "aws_bridge" {
  workload_identity_pool_id = "aws-to-gcp-bridge"
  display_name              = "aws-to-gcp-bridge"
  project                   = var.gcp_project_id
}

resource "google_iam_workload_identity_pool_provider" "aws" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.aws_bridge.workload_identity_pool_id
  workload_identity_pool_provider_id = "aws-provider"
  display_name                       = "aws-provider"
  project                            = var.gcp_project_id

  aws {
    account_id = "950110266426"
  }

  lifecycle {
    ignore_changes = [aws, attribute_mapping]
  }
}
