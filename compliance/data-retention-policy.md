# Data Retention Policy

> ⚠️ *Status note 2026-09-24: this is a design draft, not an adopted policy. Correction: HIPAA §164.530(j)(2) requires **6 years** retention of HIPAA-required documentation (policies, procedures, required records of actions). It does not set a medical-record retention period; that comes from state or national law. Rows citing “HIPAA §164.530(j)” for 7 years are marked below. Current guidance: [docs/PRIVACY-AND-DATA.md](../docs/PRIVACY-AND-DATA.md).*

## Retention Schedule

| Data Category | Retention Period | Legal Basis | Deletion Method |
|--------------|-----------------|-------------|-----------------|
| Patient profiles | Until account deletion + 30 days | GDPR Art 17, HIPAA | DynamoDB TTL (30d after deletion) |
| Doctor profiles | Until account deletion + 90 days | HIPAA, professional records | DynamoDB TTL |
| Appointments | 7 years from date | HIPAA §164.530(j) | DynamoDB TTL ⚠️ *basis corrected: state law / operator policy* |
| Prescriptions | 7 years from date | HIPAA, DEA regulations | DynamoDB TTL ⚠️ *Reviewed 2026-09-24: HIPAA sets no medical-record retention period and the federal DEA baseline is generally 2 years (21 CFR 1304.04); 7 years is a policy choice. State law decides. See [PRIVACY-AND-DATA.md](../docs/PRIVACY-AND-DATA.md).* |
| Lab orders/results | 7 years from date | HIPAA, CLIA | DynamoDB TTL ⚠️ *Reviewed 2026-09-24: CLIA generally requires at least 2 years for test records, longer for some (for example pathology reports, 10 years; 42 CFR 493.1105); 7 years is a policy choice.* |
| Medical images (DICOM) | 7 years minimum | HIPAA, ACR guidelines | S3 lifecycle policy |
| Audit logs | 7 years | HIPAA §164.530(j), SOC 2 | DynamoDB TTL (25567 days) ⚠️ *HIPAA minimum is 6 years; 7 is an operator choice* |
| Chat messages | Until patient account deletion | GDPR Art 17 | GDPR erasure cascade |
| Video session metadata | Until patient account deletion | GDPR Art 17 | GDPR erasure cascade |
| Consent ledger | Permanent (immutable) | GDPR Art 7(1), HIPAA | Never deleted (legal requirement) ⚠️ *Reviewed 2026-09-24: "never deleted" conflicts with GDPR storage limitation (Art. 5(1)(e)); keep consent records only as long as needed to prove consent. See [PRIVACY-AND-DATA.md](../docs/PRIVACY-AND-DATA.md).* |
| Billing transactions | 7 years | Tax law, HIPAA | DynamoDB TTL |
| Analytics (BigQuery) | 3 years (rolling) | Internal analytics | BigQuery partition expiry |
| Rate limit counters | 15 minutes | Operational | Redis TTL / in-memory cleanup |
| Booking locks | 10 minutes | Operational | DynamoDB TTL |
| Chat connections | 2 hours | Operational | DynamoDB TTL |
| Emergency access records | 7 years | HIPAA audit | DynamoDB TTL |

## GDPR Erasure Cascade

When a patient exercises their right to erasure (Art 17):

### Stores Deleted
27 DynamoDB tables, 7 S3 bucket families, BigQuery DML DELETE across 4 datasets

### Stores Retained (Legal Basis)
- Audit logs — HIPAA 7-year requirement (§164.530(j)) ⚠️ *Correction: §164.530(j) is a 6-year documentation rule.*
- Consent ledger — Legal obligation (GDPR Art 7(1) proof of consent)
- Anonymized appointment records — Legitimate interest (aggregate analytics)

### Process
1. Patient record marked DELETED with 30-day TTL
2. Related records anonymized or deleted across all tables
3. S3 objects deleted (including all versions)
4. BigQuery patient data deleted via DML
5. Cognito user account deleted
6. Confirmation email sent to last known address
7. PATIENT_DELETED event published to event bus

## Data Classification

| Level | Examples | Controls |
|-------|---------|---------|
| **Critical (PHI)** | Patient name, DOB, diagnosis, medications, medical images | KMS encryption, audit logging, minimum necessary access |
| **Sensitive** | Email, phone, insurance info, billing data | Encrypted storage, role-based access |
| **Internal** | Doctor profiles, appointment metadata, system logs | Access controls, no public exposure |
| **Public** | Knowledge base articles, service health status | No special controls |

## Review and Updates

This policy is reviewed:
- Annually as part of compliance audit
- When regulatory requirements change
- When new data stores are added
- After any data incident
