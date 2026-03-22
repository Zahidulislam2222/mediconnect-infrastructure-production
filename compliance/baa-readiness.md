# Business Associate Agreement (BAA) Readiness

## HIPAA §164.502(e) — Business Associate Contracts

### Covered Entity Obligations
MediConnect acts as a **Business Associate** processing PHI on behalf of Covered Entities (healthcare providers).

### Technical Safeguards Implemented

| Requirement | Implementation | Status |
|------------|---------------|--------|
| PHI Encryption at Rest | KMS envelope encryption (`encryptPHI`/`decryptPHI`) with `phi:kms:` prefix | IMPLEMENTED |
| PHI Encryption in Transit | TLS 1.2+ enforced via Helmet HSTS, CSP headers | IMPLEMENTED |
| Access Controls | Cognito JWT auth, role-based access (patient/doctor/admin/staff) | IMPLEMENTED |
| Audit Controls | FHIR AuditEvent format, 7-year TTL, immutable DynamoDB logs | IMPLEMENTED |
| Breach Notification | Automated detection (50 PHI ops/5min threshold), 9 security event types, SNS alerting | IMPLEMENTED |
| Minimum Necessary | Per-endpoint rate limiting, role-based data filtering | IMPLEMENTED |
| De-identification | HIPAA Safe Harbor (DICOM PS3.15 Annex E), SHA-256 pseudonymization in analytics | IMPLEMENTED |
| Emergency Access | Break-glass override with 6 reason codes, time-limited (120min max), full audit trail | IMPLEMENTED |
| Session Management | 15-minute inactivity timeout, auto-logout, tab-blur protection | IMPLEMENTED |
| PII Masking in Logs | Winston PII masking (email, SSN, phone, passwords, base64), Python SafeFormatter | IMPLEMENTED |

### Data Stores with PHI

| Store | Encryption | Access Control | Audit Logged |
|-------|-----------|---------------|-------------|
| DynamoDB (27 tables) | AWS managed encryption + KMS field-level | IAM roles per service | Yes (writeAuditLog) |
| S3 (7 bucket families) | AES-256 ServerSideEncryption | IAM + bucket policies | Yes |
| BigQuery Analytics | Google-managed encryption | Service account + WIF | Yes (pseudonymized IDs) |
| Redis (session cache) | In-transit TLS | VPC-internal only | No (ephemeral, no PHI) |

### Subprocessor List

| Subprocessor | Purpose | PHI Access | BAA Required |
|-------------|---------|-----------|-------------|
| AWS | Infrastructure, DynamoDB, S3, KMS, Cognito, Lambda | Yes | Yes (AWS BAA) |
| GCP | BigQuery analytics, Vertex AI (symptom checker), Cloud Run | Pseudonymized only | Yes (GCP BAA) |
| Azure | Backup infrastructure (AKS) | During failover only | Yes (Azure BAA) |
| Stripe | Payment processing | No PHI (billing only) | No (PCI DSS instead) |
| Orthanc (self-hosted) | DICOM PACS | Yes (medical images) | Self-hosted, no BAA needed |

### Incident Response

- **Breach Detection**: Automated via `breach-detection.ts` (Node.js) and `breach_detection.py` (Python)
- **Alert Channel**: SNS → configured email/SMS endpoints
- **Response Time**: Automated detection < 5 minutes, human review SLA per BAA terms
- **72-hour Notification**: GDPR Art 33 compliance (EU users)

### BAA Template Provisions Required

1. Permitted uses and disclosures of PHI
2. Safeguards obligation (technical, administrative, physical)
3. Reporting obligations for unauthorized use/disclosure
4. Subcontractor requirements (flow-down)
5. Individual rights access (supported via FHIR $export)
6. Return/destruction of PHI on termination (supported via GDPR erasure cascade)
7. HHS audit cooperation
8. Breach notification procedures
