# ── GCP Cloud Run Services (14 — 7 backend services × 2 regions) ──────────

locals {
  cloudrun_services = {
    # US services (us-central1)
    "patient-service-us-backup"        = { region = "us-central1",   port = 8081, memory = "256Mi" }
    "doctor-service-us-backup"         = { region = "us-central1",   port = 8082, memory = "256Mi" }
    "booking-service-us-backup"        = { region = "us-central1",   port = 8083, memory = "256Mi" }
    "communication-service-us-backup"  = { region = "us-central1",   port = 8084, memory = "256Mi" }
    "admin-service-us-backup"          = { region = "us-central1",   port = 8085, memory = "512Mi" }
    "staff-service-us-backup"          = { region = "us-central1",   port = 8086, memory = "256Mi" }
    "dicom-service-us-backup"          = { region = "us-central1",   port = 8005, memory = "512Mi" }
    # EU services (europe-west3)
    "patient-service-eu-backup"        = { region = "europe-west3",  port = 8081, memory = "256Mi" }
    "doctor-service-eu-backup"         = { region = "europe-west3",  port = 8082, memory = "256Mi" }
    "booking-service-eu-backup"        = { region = "europe-west3",  port = 8083, memory = "256Mi" }
    "communication-service-eu-backup"  = { region = "europe-west3",  port = 8084, memory = "256Mi" }
    "admin-service-eu-backup"          = { region = "europe-west3",  port = 8085, memory = "512Mi" }
    "staff-service-eu-backup"          = { region = "europe-west3",  port = 8086, memory = "256Mi" }
    "dicom-service-eu-backup"          = { region = "europe-west3",  port = 8005, memory = "512Mi" }
  }
}

resource "google_cloud_run_service" "services" {
  for_each = local.cloudrun_services

  name     = each.key
  location = each.value.region
  project  = var.gcp_project_id

  template {
    spec {
      container_concurrency = 80
      service_account_name  = google_service_account.data_logger.email

      containers {
        # Image managed by CI/CD — ignore changes to avoid drift on every deploy
        image = "us-central1-docker.pkg.dev/${var.gcp_project_id}/mediconnect-repo/${replace(each.key, "-us-backup", "")}:latest"

        ports {
          container_port = each.value.port
        }

        resources {
          limits = {
            memory = each.value.memory
            cpu    = "1"
          }
        }
      }
    }

    metadata {
      annotations = {
        "autoscaling.knative.dev/maxScale" = "1"
        "run.googleapis.com/client-name"   = "terraform"
      }
    }
  }

  traffic {
    percent       = 100
    latest_revision = true
  }

  lifecycle {
    # CI/CD updates the image tag on every deploy — ignore to prevent drift
    ignore_changes = [
      template[0].spec[0].containers[0].image,
      template[0].metadata[0].annotations["client.knative.dev/user-image"],
      template[0].metadata[0].annotations["run.googleapis.com/client-name"],
      template[0].metadata[0].annotations["run.googleapis.com/client-version"],
      template[0].metadata[0].annotations["run.googleapis.com/sandbox"],
    ]
  }
}
