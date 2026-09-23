# Operations runbook

Last reviewed: 2026-09-24

## 1. Environments

| Environment | Where | Status |
|---|---|---|
| Local development | Developer machine; synthetic data only | CURRENT |
| Public showcase | Operator VPS, Docker Compose (Nginx) behind Caddy, <https://mediconnect.zahidul-islam.com> | CURRENT |
| Staging | Kubernetes namespace or Cloud Run services from Terraform | RETAINED, not running |
| Production | Regional cells ([SCALABILITY.md](SCALABILITY.md)) | PLANNED |
| Retired Firebase Hosting (`askme-82f72.web.app`) | Historical frontend host | Retired; workflow kept disabled for reference |

## 2. Change rules

1. **Local first.** Every change is made and tested locally, then deployed. The live server is never edited by hand.
2. **Check drift before deploying.** Compare the live files with the local release (hashes). If live is ahead, stop and reconcile first.
3. **Prove parity after deploying.** Re-hash every deployed file and confirm local equals live.
4. **Keep the previous release** on the server for instant rollback.
5. **Paid actions need explicit approval.** Cloud deployment workflows require manual dispatch and a typed cost acknowledgement. Nothing provisions paid resources on a push.
6. **Infrastructure changes** go through `terraform plan` review. `apply`, `destroy` and `import` are run manually by the owner after review.

## 3. Deploying the static showcase

Full steps: [mediconnect-hub/deploy/shared-vps/README.md](https://github.com/Zahidulislam2222/mediconnect-hub/blob/main/deploy/shared-vps/README.md).
In short: run the tests, type check and lint; build with `node deploy/shared-vps/build-showcase.mjs`;
validate the container locally; upload a versioned release; switch; verify HTTPS and browser checks;
then confirm hash parity.

## 4. CI/CD workflows

| Repository | Workflow | Trigger | Effect |
|---|---|---|---|
| all | `security.yml` | Push to default branch, pull requests | Secret, SAST and Python security scans. No deployment. |
| mediconnect-hub | `frontend-deploy.yml` | **Manual only.** Automatic push and pull-request triggers are disabled and kept as comments. | Build and quality checks. Its Firebase deploy jobs are retired. |
| mediconnect-hub | `native-ios.yml` | Manual or `verify/native-ios/**` branches | macOS build and tests on public-repository runners |
| infrastructure-production | `deploy.yml` | Manual with typed cost acknowledgement; cloud targets default off | Multi-cloud build and deploy (RETAINED) |

## 5. Monitoring and on-call (PLANNED for production)

- SLO dashboards and burn-rate alerts per journey ([RELIABILITY.md](RELIABILITY.md)).
- Paging for SEV-1 and SEV-2 only; everything else goes to a ticket queue.
- Weekly review of error budgets, capacity headroom, security findings and cost.
- Quarterly restore drills and failure-injection game days.

## 6. Access management

- Least privilege; named accounts only; MFA everywhere.
- Production data access is time-limited, justified and audited (break-glass).
- Leavers lose access the same day; keys and tokens they used are rotated.
- Credentials live in the secret store and the operator's private credential register, never in Git.
