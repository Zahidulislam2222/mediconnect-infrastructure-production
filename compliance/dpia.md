# Data Protection Impact Assessment (DPIA)
## GDPR Articles 35-36

### 1. Processing Description

| Aspect | Details |
|--------|---------|
| Controller | Healthcare providers using MediConnect |
| Processor | MediConnect platform |
| Data Subjects | Patients, healthcare practitioners |
| Processing Purpose | Healthcare delivery, appointment management, clinical records, prescriptions, billing |
| Legal Basis | Art 6(1)(b) contractual necessity, Art 9(2)(h) healthcare provision |

### 2. Personal Data Categories

| Category | Data Elements | Sensitivity | Retention |
|----------|--------------|-------------|-----------|
| Identity | Name, email, phone, DOB, address | Personal | Until account deletion |
| Health Records | Diagnoses (ICD-10), lab results (LOINC), medications (RxNorm), vitals | Special Category (Art 9) | Per clinical retention requirements |
| Medical Images | DICOM scans, X-rays, MRIs | Special Category | Per clinical retention requirements |
| Financial | Payment methods, transaction history | Personal | 7 years (tax/audit) |
| Behavioral | Login times, feature usage, symptom checker queries | Personal | Pseudonymized in analytics |
| Communications | Chat messages, video consultation metadata | Special Category | Until account deletion |

### 3. Necessity and Proportionality

| Principle | Implementation |
|-----------|---------------|
| Data Minimization (Art 5(1)(c)) | JWT tokens contain minimal claims; encrypted storage uses only essential fields |
| Purpose Limitation (Art 5(1)(b)) | Service-specific IAM roles prevent cross-purpose data access |
| Storage Limitation (Art 5(1)(e)) | Audit logs: 7-year TTL; chat connections: 2-hour TTL; booking locks: 10-min TTL |
| Accuracy (Art 5(1)(d)) | Patient/doctor profiles editable; FHIR resources versioned |

### 4. Risk Assessment

| Risk | Likelihood | Impact | Mitigation | Residual Risk |
|------|-----------|--------|-----------|---------------|
| Unauthorized PHI access | Low | High | KMS encryption, Cognito auth, role guards, audit logging | Low |
| Data breach via API | Low | Critical | Rate limiting, input validation (Zod), CORS whitelist, CSP headers | Low |
| Cross-region data leak | Low | High | Region-based DynamoDB/S3 routing, x-user-region header enforcement | Low |
| Re-identification from analytics | Very Low | Medium | SHA-256 + HIPAA_SALT pseudonymization, BigQuery DML DELETE on erasure | Very Low |
| Insider threat | Low | High | Admin audit logging, breach detection (50 ops/5min), emergency access tracking | Low |
| Subprocessor data exposure | Low | High | BAA/DPA with AWS/GCP/Azure, encryption at rest/transit | Low |

### 5. Data Subject Rights Implementation

| Right | Implementation | Endpoint |
|-------|---------------|---------|
| Access (Art 15) | GDPR data export with FHIR Bundle format | POST /patients/:id/gdpr/export |
| Rectification (Art 16) | Profile update endpoints | PUT /patients/:id |
| Erasure (Art 17) | 27-table cascade + S3 versioned cleanup + BigQuery DML DELETE + Cognito deletion | DELETE /patients/:id/gdpr/delete-profile |
| Portability (Art 20) | FHIR $export (NDJSON) + GDPR export (JSON) | POST /fhir/$export |
| Restriction (Art 18) | Account suspension by admin | POST /api/v1/admin/users/patients/:id/suspend |
| Object (Art 21) | Consent ledger with granular consent tracking | POST /patients/consent |

### 6. Consultation Requirement (Art 36)

This DPIA has been prepared for review by the organization's Data Protection Officer (DPO).
No prior consultation with the supervisory authority is required at this time as residual
risks have been mitigated to acceptable levels through technical and organizational measures.

### 7. Review Schedule

This DPIA must be reviewed:
- Annually as part of compliance audit cycle
- When processing operations change materially
- When new data categories are introduced
- After any data breach incident
