# Disaster Recovery Runbook

## Recovery Objectives

| Metric | Target | Current |
|--------|--------|---------|
| RPO (Recovery Point Objective) | < 1 hour | DynamoDB continuous backups, S3 versioning |
| RTO (Recovery Time Objective) | < 30 minutes | Cloud Run auto-scaling, multi-region failover |

## Architecture: Multi-Region Active-Active

```
Primary: AWS us-east-1 (US) + eu-central-1 (EU)
├── Compute: GCP Cloud Run (primary) → AWS EKS / Azure AKS (backup)
├── Database: DynamoDB (regional tables)
├── Storage: S3 (regional buckets)
├── Auth: Cognito (regional user pools)
├── Analytics: BigQuery (regional datasets)
└── CDN: Firebase Hosting (global)
```

## Failover Scenarios

### Scenario 1: Single Service Failure
**Detection**: Health check failure on `/health` or `/ready` endpoint
**Automatic Response**:
- Cloud Run restarts container (min-instances: 0, max: 1)
- Frontend API layer retries with 5s timeout, then fails over to backup URL
- K8s liveness/readiness probes restart pod (if K8s deployed)

**Manual Steps**: None required — fully automated

### Scenario 2: Cloud Run Region Outage
**Detection**: All services in region return 5xx or timeout
**Automatic Response**:
- Frontend `api.ts` failover: primary (5s timeout) → backup (15s timeout)
- Backup URLs point to separate Cloud Run deployment or K8s cluster
- Lambda failover-proxy routes WebSocket events to backup

**Manual Steps**:
1. Verify backup is receiving traffic (check Cloud Run metrics)
2. Update DNS if needed (Firebase hosting rewrite)
3. Monitor backup for capacity issues

### Scenario 3: DynamoDB Region Failure
**Detection**: AWS Service Health Dashboard + application 503 errors
**Response**:
- DynamoDB Global Tables provide cross-region replication (if configured)
- If not global tables: read-only mode until region recovers
- BigQuery analytics continue independently

**Manual Steps**:
1. Enable Global Table failover (if not automatic)
2. Notify affected users of potential data lag
3. Validate data consistency after recovery

### Scenario 4: Complete AWS Outage
**Detection**: All AWS services unavailable
**Response**:
- Azure AKS cluster activated (K8s deployment)
- GCP remains operational for compute
- Cognito unavailable → auth fails → graceful degradation

**Manual Steps**:
1. Activate Azure AKS deployments
2. Update frontend service URLs to Azure endpoints
3. Deploy temporary auth solution or wait for AWS recovery

### Scenario 5: Data Breach
**Detection**: breach-detection.ts / breach_detection.py automated alerts
**Response**:
1. Automated SNS alert sent to security team
2. Rotate affected KMS keys
3. Revoke compromised Cognito tokens (AdminGlobalSignOut)
4. Assess breach scope via audit logs
5. GDPR Art 33: notify supervisory authority within 72 hours (EU users)
6. HIPAA: notify affected individuals within 60 days

## Recovery Procedures

### Database Recovery
```bash
# Restore DynamoDB table from point-in-time backup
aws dynamodb restore-table-to-point-in-time \
  --source-table-name mediconnect-patients \
  --target-table-name mediconnect-patients-restored \
  --restore-date-time "2024-01-15T00:00:00Z"
```

### S3 Recovery
```bash
# List and restore S3 object versions
aws s3api list-object-versions --bucket mediconnect-patient-data-us
# Restore specific version
aws s3api get-object --bucket mediconnect-patient-data-us \
  --key "patient/123/scan.dcm" --version-id "abc123" restored-scan.dcm
```

### Service Recovery
```bash
# Redeploy all services to Cloud Run
./deploy_cloudrun_all.sh

# Or deploy to K8s
kubectl apply -f backend_v2/k8s/
```

## Communication Plan

| Stakeholder | Channel | Timeline |
|-------------|---------|----------|
| Engineering | Slack #incident | Immediate |
| Management | Email | Within 1 hour |
| Affected Users | In-app notification | Within 4 hours |
| Supervisory Authority | Official notice | Within 72 hours (GDPR) |
| All Users | Status page | Continuous updates |

## Testing Schedule

- **Monthly**: Automated failover test script (validates primary→backup for all services)
- **Quarterly**: Full DR drill (simulate region outage, measure RTO/RPO)
- **Annually**: Complete DR plan review and update
