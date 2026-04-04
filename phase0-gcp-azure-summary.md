# Phase 0: GCP & Azure Cloud Discovery Summary

**Date:** 2026-04-05
**Method:** GCP Cloud Asset Inventory + Azure Resource Graph (platform-native, zero-miss)

---

## GCP — Project: mediconnect-analytics (392747507374)

### Resource Inventory

| Resource Type | Count |
|---|---|
| Cloud Run Services | 14 |
| Cloud Run Revisions | 648 |
| BigQuery Datasets | 6 |
| BigQuery Tables | 9 |
| Artifact Registry Repos | 1 |
| Artifact Registry Docker Images | 71 |
| Healthcare API Datasets | 1 |
| Healthcare API DICOM Stores | 1 |
| IAM Service Accounts | 2 |
| IAM Service Account Keys | 3 |
| IAM Workload Identity Pools | 2 |
| IAM Workload Identity Pool Providers | 2 |
| Pub/Sub Topics | 2 |
| Secret Manager Secrets | 2 |
| Secret Manager Secret Versions | 10 |
| Cloud Storage Buckets | 2 |
| Logging Buckets | 2 |
| Logging Sinks | 2 |
| Dataplex Entry Groups | 11 |
| Enabled APIs | 35 |
| **Total** | **834** |

### Cloud Run Services (14 — all 7 backend services x 2 regions)

| Service | Region |
|---|---|
| patient-service-us-backup | us-central1 |
| patient-service-eu-backup | europe-west3 |
| doctor-service-us-backup | us-central1 |
| doctor-service-eu-backup | europe-west3 |
| booking-service-us-backup | us-central1 |
| booking-service-eu-backup | europe-west3 |
| communication-service-us-backup | us-central1 |
| communication-service-eu-backup | europe-west3 |
| admin-service-us-backup | us-central1 |
| admin-service-eu-backup | europe-west3 |
| staff-service-us-backup | us-central1 |
| staff-service-eu-backup | europe-west3 |
| dicom-service-us-backup | us-central1 |
| dicom-service-eu-backup | europe-west3 |

### BigQuery Datasets & Tables

| Dataset | Region | Tables |
|---|---|---|
| mediconnect_analytics (US) | US | appointments_stream, symptom_logs, vitals_raw, doctor_onboarding_logs |
| mediconnect_analytics_eu | EU | appointments_stream, analytics_revenue, symptom_logs, vitals_raw, doctor_onboarding_logs |
| mediconnect_ai (US) | US | (no tables found) |
| mediconnect_ai_eu | EU | (no tables found) |
| iot (US) | US | (data from IoT vitals) |
| iot_eu | EU | (data from IoT vitals) |

### Healthcare API

| Resource | Location | Name |
|---|---|---|
| Dataset | us-east1 | mediconnect-main |
| DICOM Store | us-east1 | xray-archive |

### IAM & Cross-Cloud Auth

| Resource | Details |
|---|---|
| Service Account | data-logger@mediconnect-analytics.iam.gserviceaccount.com (3 keys) |
| Service Account | Default compute service account |
| Workload Identity Pool | aws-to-gcp-bridge (AWS → GCP auth, provider: aws-provider) |
| Workload Identity Pool | github-pool (GitHub Actions CI/CD, provider: github-provider) |

### Pub/Sub Topics

| Topic |
|---|
| iot-health-sync |
| video-call-analytics |

### Secret Manager

| Secret | Versions |
|---|---|
| aws_access_key_id | 5 versions |
| aws_secret_access_key | 5 versions |

### Storage Buckets

| Bucket | Purpose |
|---|---|
| mediconnect-analytics_cloudbuild | Cloud Build artifacts |
| mediconnect-medical-images | Medical image storage |

### Artifact Registry

| Repository | Location |
|---|---|
| mediconnect-repo | us-central1 |
| (71 Docker images inside) | |

### Cloud SQL

**None found.** The `sqladmin` API is enabled and Terraform has a Cloud SQL module (db-f1-micro, PostgreSQL), but no instances currently exist. May have been deleted or never created.

### Enabled APIs (35)

aiplatform, analyticshub, artifactregistry, bigquery (6 sub-APIs), calendar-json, cloudapis, cloudasset, cloudbuild, cloudtrace, containerregistry, dataform, dataplex, datastore, healthcare, iam, iamcredentials, logging, monitoring, pubsub, run, secretmanager, servicemanagement, serviceusage, sqladmin, sql-component, storage (3 sub-APIs), vision

---

## Azure — Subscription: Azure subscription 1 (827c3b0b-...)

### Resource Inventory

| Resource Type | Count | Name | Location |
|---|---|---|---|
| Cosmos DB Account | 1 | mediconnect-cosmos-db | East US |
| Network Watcher | 1 | NetworkWatcher_eastus | East US (auto-created) |
| Resource Groups | 2 | mediconnect-rg, NetworkWatcherRG | East US |
| **Total** | **4** | | |

### Cosmos DB Details

| Property | Value |
|---|---|
| Name | mediconnect-cosmos-db |
| Kind | GlobalDocumentDB (SQL API) |
| Location | East US only |
| Consistency | Session |
| Auto Failover | true |
| Multi-region writes | false |
| Zone Redundant | false |
| Free Tier | true |
| Public Network Access | Enabled |
| Backup Policy | Periodic |
| Endpoint | https://mediconnect-cosmos-db.documents.azure.com:443/ |
| Databases | **NONE** (account exists but is empty) |

---

## COMPLIANCE FINDINGS

### GCP

| # | Severity | Finding |
|---|---|---|
| 1 | HIGH | **Secret Manager stores AWS credentials** (aws_access_key_id, aws_secret_access_key) — 5 versions each, should use Workload Identity Federation instead |
| 2 | HIGH | **Healthcare API DICOM Store in us-east1 only** — no EU replica for GDPR compliance |
| 3 | MEDIUM | **Cloud SQL module in Terraform but no instance exists** — Terraform state drift |
| 4 | MEDIUM | **648 Cloud Run revisions** — no revision cleanup policy, storage cost growth |
| 5 | MEDIUM | **3 service account keys** — key rotation policy unknown |
| 6 | LOW | **BigQuery AI datasets empty** — mediconnect_ai, mediconnect_ai_eu have no tables |

### Azure

| # | Severity | Finding |
|---|---|---|
| 1 | CRITICAL | **Cosmos DB account is empty** — no databases or containers. Account exists but unused |
| 2 | HIGH | **Single region (East US)** — no geo-replication despite auto-failover being enabled |
| 3 | HIGH | **Public network access enabled** — no private endpoint |
| 4 | MEDIUM | **Free tier** — production should not use free tier (throttling limits) |
| 5 | MEDIUM | **Session consistency** — may be appropriate, but should be verified for healthcare data |
| 6 | MEDIUM | **Periodic backup only** — continuous backup recommended for healthcare |

---

## What Terraform Currently Manages

### GCP
- Cloud SQL instance (db-f1-micro, PostgreSQL) — **but instance doesn't exist in cloud**
- Everything else (Cloud Run, BigQuery, Healthcare API, etc.) = NOT in Terraform

### Azure
- Cosmos DB module exists in Terraform (with known issues: automatic_failover=false, Session consistency)
- **Cloud shows auto-failover=true** — so either someone fixed it manually or Terraform state is stale

---

## Combined Phase 0 Totals (AWS + GCP + Azure)

| Cloud | Indexed | Noise* | Real Resources | Role |
|---|---|---|---|---|
| AWS | 458 | ~0 | **458** | Primary infrastructure |
| GCP | 834 | 777 | **57** | Failover (Cloud Run) + Analytics (BigQuery) |
| Azure | 4 | 0 | **4** | Nearly empty (Cosmos DB account, no data) |
| **Total** | **1,296** | **777** | **519** | |

*GCP noise = 648 Cloud Run revisions (old deploy snapshots), 71 Docker images (build artifacts), 35 enabled API toggles, 22 auto-generated metadata (Dataplex, logging, billing). These are not infrastructure to manage in Terraform.

Raw data files:
- `phase0-gcp-asset-inventory.json` (834 indexed, 57 real)
- `phase0-azure-resource-graph.json` (2 resources)
- `phase0-azure-containers.json` (3 containers)
- `phase0-complete-inventory.md` (AWS, 458 resources)
