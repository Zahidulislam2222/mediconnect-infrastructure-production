# MediConnect infrastructure showcase status

This repository preserves a substantial healthcare-platform implementation for technical review.
It is not a claim that every represented cloud service is currently provisioned.

## Retained engineering evidence

- Terraform modules and production-environment definitions across AWS, GCP and Azure.
- Kubernetes deployments, service accounts, ingress, network isolation, monitoring and alerting.
- A multi-stage GitHub Actions pipeline covering tests, security checks, container builds,
  staging, smoke tests, production promotion, rollback and cloud failover.
- Seven backend service boundaries, regional data routing, encryption, auditing, FHIR/clinical
  integration, eventing and AI-provider failover.
- Database and secret-retrieval integration code, including historical services that used managed
  database and secret-management resources.

## Current operating mode

The owner intentionally removed costly cloud resources. The retained definitions are therefore
`SHOWCASE_REFERENCE` unless a dated native-provider inventory proves otherwise.

The cloud deployment workflow is disabled in GitHub. Its source is preserved, but automatic push
deployment has been removed, GCP/AKS/EKS/Lambda targets default off, and a deliberate manual cost
acknowledgement is required before its job chain can run.

Do not run Terraform apply/destroy/import, Kubernetes apply, or a cloud deployment from this
repository merely to demonstrate the code. Static review, validation, plan review, tests and local
non-billed demonstrations are the safe evidence path.

## What a reviewer can verify without provisioning

1. Read the Terraform modules and environment composition.
2. Inspect the Kubernetes security, routing, observability and service definitions.
3. Inspect the complete disabled CI/CD workflow and its historical run design.
4. Run local tests, type checks, linters, security scanners and configuration validation.
5. Review dated evidence in `migration-status.yaml` and source coverage in
   `resource-registry.yaml`, keeping historical results separate from current live state.

Cloud resource existence, compliance certification, high availability, failover and recovery
objectives require fresh operational evidence and must not be inferred from source code alone.
