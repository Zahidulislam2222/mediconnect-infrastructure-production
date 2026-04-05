# ── GCP Pub/Sub Topics ─────────────────────────────────────────────────────

resource "google_pubsub_topic" "iot_health_sync" {
  name    = "iot-health-sync"
  project = var.gcp_project_id

  labels = {
    project     = "mediconnect"
    environment = "prod"
    managed_by  = "terraform"
  }
}

resource "google_pubsub_topic" "video_call_analytics" {
  name    = "video-call-analytics"
  project = var.gcp_project_id

  labels = {
    project     = "mediconnect"
    environment = "prod"
    managed_by  = "terraform"
  }
}

# ── GCP Healthcare API ────────────────────────────────────────────────────

resource "google_healthcare_dataset" "main" {
  name     = "mediconnect-main"
  location = "us-east1"
  project  = var.gcp_project_id
}

resource "google_healthcare_dicom_store" "xray_archive" {
  name    = "xray-archive"
  dataset = google_healthcare_dataset.main.id
}

# Finding #2: EU Healthcare API for GDPR compliance
resource "google_healthcare_dataset" "eu" {
  name     = "mediconnect-eu"
  location = "europe-west3"
  project  = var.gcp_project_id
}

resource "google_healthcare_dicom_store" "xray_archive_eu" {
  name    = "xray-archive"
  dataset = google_healthcare_dataset.eu.id
}

# ── GCP Cloud Storage Buckets ─────────────────────────────────────────────

resource "google_storage_bucket" "cloudbuild" {
  name     = "mediconnect-analytics_cloudbuild"
  location = "US"
  project  = var.gcp_project_id

  labels = {
    project     = "mediconnect"
    environment = "prod"
    managed_by  = "terraform"
  }

  lifecycle {
    ignore_changes = [lifecycle_rule]
  }
}

resource "google_storage_bucket" "medical_images" {
  name     = "mediconnect-medical-images"
  location = "US"
  project  = var.gcp_project_id

  labels = {
    project     = "mediconnect"
    environment = "prod"
    managed_by  = "terraform"
  }

  lifecycle {
    ignore_changes = [lifecycle_rule]
  }
}

# ── GCP Artifact Registry ─────────────────────────────────────────────────

# ── GCP Artifact Registry (requires billing) ──────────────────────────────

resource "google_artifact_registry_repository" "mediconnect_repo" {
  count         = var.gcp_billing_enabled ? 1 : 0
  repository_id = "mediconnect-repo"
  location      = "us-central1"
  format        = "DOCKER"
  project       = var.gcp_project_id

  labels = {
    project     = "mediconnect"
    environment = "prod"
    managed_by  = "terraform"
  }
}

# ── GCP Secret Manager (requires billing) ─────────────────────────────────
# Note: These store AWS credentials — Phase 2 finding #1 recommends
# migrating to Workload Identity Federation instead

resource "google_secret_manager_secret" "aws_access_key_id" {
  count     = var.gcp_billing_enabled ? 1 : 0
  secret_id = "aws_access_key_id"
  project   = var.gcp_project_id

  replication {
    auto {}
  }

  labels = {
    project     = "mediconnect"
    environment = "prod"
    managed_by  = "terraform"
  }
}

resource "google_secret_manager_secret" "aws_secret_access_key" {
  count     = var.gcp_billing_enabled ? 1 : 0
  secret_id = "aws_secret_access_key"
  project   = var.gcp_project_id

  replication {
    auto {}
  }

  labels = {
    project     = "mediconnect"
    environment = "prod"
    managed_by  = "terraform"
  }
}
