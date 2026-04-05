# ── GCP BigQuery Datasets + Tables ─────────────────────────────────────────

# --- Datasets (6) ---

resource "google_bigquery_dataset" "mediconnect_analytics" {
  dataset_id = "mediconnect_analytics"
  project    = var.gcp_project_id
  location   = "US"

  labels = {
    project     = "mediconnect"
    environment = "prod"
    managed_by  = "terraform"
  }
}

resource "google_bigquery_dataset" "mediconnect_analytics_eu" {
  dataset_id = "mediconnect_analytics_eu"
  project    = var.gcp_project_id
  location   = "EU"

  labels = {
    project     = "mediconnect"
    environment = "prod"
    managed_by  = "terraform"
  }
}

resource "google_bigquery_dataset" "mediconnect_ai" {
  dataset_id = "mediconnect_ai"
  project    = var.gcp_project_id
  location   = "US"

  labels = {
    project     = "mediconnect"
    environment = "prod"
    managed_by  = "terraform"
  }
}

resource "google_bigquery_dataset" "mediconnect_ai_eu" {
  dataset_id = "mediconnect_ai_eu"
  project    = var.gcp_project_id
  location   = "EU"

  labels = {
    project     = "mediconnect"
    environment = "prod"
    managed_by  = "terraform"
  }
}

resource "google_bigquery_dataset" "iot" {
  dataset_id = "iot"
  project    = var.gcp_project_id
  location   = "US"

  labels = {
    project     = "mediconnect"
    environment = "prod"
    managed_by  = "terraform"
  }
}

resource "google_bigquery_dataset" "iot_eu" {
  dataset_id = "iot_eu"
  project    = var.gcp_project_id
  location   = "EU"

  labels = {
    project     = "mediconnect"
    environment = "prod"
    managed_by  = "terraform"
  }
}

# --- Tables (9) ---

# mediconnect_analytics (US): appointments_stream, doctor_onboarding_logs
resource "google_bigquery_table" "analytics_appointments_stream" {
  dataset_id          = google_bigquery_dataset.mediconnect_analytics.dataset_id
  table_id            = "appointments_stream"
  project             = var.gcp_project_id
  deletion_protection = false

  lifecycle {
    ignore_changes = [schema] # Schema managed by application
  }
}

resource "google_bigquery_table" "analytics_doctor_onboarding_logs" {
  dataset_id          = google_bigquery_dataset.mediconnect_analytics.dataset_id
  table_id            = "doctor_onboarding_logs"
  project             = var.gcp_project_id
  deletion_protection = false

  lifecycle {
    ignore_changes = [schema]
  }
}

# mediconnect_analytics_eu: analytics_revenue, appointments_stream, doctor_onboarding_logs
resource "google_bigquery_table" "analytics_eu_revenue" {
  dataset_id          = google_bigquery_dataset.mediconnect_analytics_eu.dataset_id
  table_id            = "analytics_revenue"
  project             = var.gcp_project_id
  deletion_protection = false

  lifecycle {
    ignore_changes = [schema]
  }
}

resource "google_bigquery_table" "analytics_eu_appointments_stream" {
  dataset_id          = google_bigquery_dataset.mediconnect_analytics_eu.dataset_id
  table_id            = "appointments_stream"
  project             = var.gcp_project_id
  deletion_protection = false

  lifecycle {
    ignore_changes = [schema]
  }
}

resource "google_bigquery_table" "analytics_eu_doctor_onboarding_logs" {
  dataset_id          = google_bigquery_dataset.mediconnect_analytics_eu.dataset_id
  table_id            = "doctor_onboarding_logs"
  project             = var.gcp_project_id
  deletion_protection = false

  lifecycle {
    ignore_changes = [schema]
  }
}

# iot (US): vitals_raw
resource "google_bigquery_table" "iot_vitals_raw" {
  dataset_id          = google_bigquery_dataset.iot.dataset_id
  table_id            = "vitals_raw"
  project             = var.gcp_project_id
  deletion_protection = false

  lifecycle {
    ignore_changes = [schema]
  }
}

# iot_eu: vitals_raw
resource "google_bigquery_table" "iot_eu_vitals_raw" {
  dataset_id          = google_bigquery_dataset.iot_eu.dataset_id
  table_id            = "vitals_raw"
  project             = var.gcp_project_id
  deletion_protection = false

  lifecycle {
    ignore_changes = [schema]
  }
}

# mediconnect_ai (US): symptom_logs
resource "google_bigquery_table" "ai_symptom_logs" {
  dataset_id          = google_bigquery_dataset.mediconnect_ai.dataset_id
  table_id            = "symptom_logs"
  project             = var.gcp_project_id
  deletion_protection = false

  lifecycle {
    ignore_changes = [schema]
  }
}

# mediconnect_ai_eu: symptom_logs
resource "google_bigquery_table" "ai_eu_symptom_logs" {
  dataset_id          = google_bigquery_dataset.mediconnect_ai_eu.dataset_id
  table_id            = "symptom_logs"
  project             = var.gcp_project_id
  deletion_protection = false

  lifecycle {
    ignore_changes = [schema]
  }
}
