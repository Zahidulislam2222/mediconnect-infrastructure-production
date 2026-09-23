# Privacy and data flow

Last reviewed: 2026-09-24 · Legal context: [COMPLIANCE-AND-LAW.md](COMPLIANCE-AND-LAW.md)

The public showcase at <https://mediconnect.zahidul-islam.com> collects **no** personal or health
data. It has no sign-in, no forms that submit anywhere and only fictional example records. This
document describes how the full platform is designed to handle data once it runs as a real service.

## 1. Data categories

| Category | Examples | Sensitivity | Storage protection |
|---|---|---|---|
| Health data (PHI / GDPR special category) | Diagnoses, prescriptions, lab results, images, vitals, consultation notes, symptom-checker input | Highest | Field-level KMS envelope encryption, audit on every access |
| Identity | Name, date of birth, email, phone, address, ID verification images | High | Encrypted at rest, role-restricted |
| Communications | Chat messages, video session metadata | High | Encrypted at rest; recordings only with consent |
| Payment | Stripe customer and payment references (no card numbers) | Medium | Card data never touches MediConnect servers |
| Operational | Logs, metrics, rate-limit counters | Low (masked) | Personal data masked before writing |
| Analytics | Pseudonymised events (salted hash IDs) | Low | Separate dataset, deleted on erasure |
| Public content | Articles, FAQs, doctor public profiles | Public | — |

## 2. Where data lives

| Region | Users | Data stores (design) |
|---|---|---|
| United States | US patients and clinicians | AWS `us-east-1` (DynamoDB, S3, KMS, Cognito) |
| European Union | EU patients and clinicians | AWS `eu-central-1` (DynamoDB, S3, KMS, Cognito) |

Region is chosen at registration and taken from the validated account context on every request.
Services never read EU health data from a US region or the other way round.

## 3. Data flow (design)

```text
Patient device ─TLS─► Regional API ─► validation ─► auth + ownership check ─► encrypt health fields ─► regional database
                                                                  └─► audit event (append-only)
                                                                  └─► event queue ─► notifications / analytics (pseudonymised)
```

## 4. Retention (design defaults, operator to confirm per jurisdiction)

| Data | Default retention | Basis |
|---|---|---|
| Clinical records, prescriptions, lab results, images | Per **state or national medical-record law** (commonly 6–10 years for adults, longer for minors) | State/national law. HIPAA itself does not set a medical-record retention period. |
| HIPAA-required documentation (policies, risk analyses, required records of actions) | 6 years from creation or last effective date | 45 CFR §164.530(j)(2) |
| Audit log | At least 6 years | HIPAA documentation duties, security investigations |
| Consent ledger | For as long as needed to prove consent, then archived | GDPR Art. 7(1) |
| Payment and tax records | Per tax law (commonly 7 years) | Tax law |
| Chat and video metadata | Until account deletion, unless part of the clinical record | Data minimisation |
| Operational logs | 30–90 days | Security operations |
| Rate-limit counters, booking locks | Minutes | Operational |

The earlier [data-retention-policy.md](../compliance/data-retention-policy.md) is preserved with
correction notes where it attributed a 7-year medical-record rule to HIPAA.

## 5. Patient rights (design)

| Right | How | Where implemented |
|---|---|---|
| Access and portability | Download a FHIR Bundle (JSON) of own data; bulk FHIR export | patient-service |
| Rectification | Edit profile; clinical corrections through the treating clinician | patient-service, doctor-service |
| Erasure | Request deletion with a grace period, then cascade across stores; records the law requires to keep are retained and restricted | patient-service |
| Consent | Granular, purpose-based, withdrawable, append-only record | patient-service, web consent UI |
| Restriction and objection | Account restriction by admin; opt-outs per purpose | admin-service |

Requests are answered within one month (GDPR) or the applicable US timeline, after identity verification.

## 6. Subprocessors (design; to be contracted before real data)

| Subprocessor | Purpose | Health data? | Contract needed |
|---|---|---|---|
| Amazon Web Services | Hosting, database, storage, keys, identity, video (Chime SDK), AI (Bedrock) | Yes | BAA + DPA |
| Google Cloud | Scale-to-zero compute, pseudonymised analytics, AI fallback | Pseudonymised or none by design | BAA + DPA |
| Microsoft Azure | Retained backup compute definitions | Only if re-enabled | BAA + DPA |
| Stripe | Payments and subscriptions | No | DPA; PCI handled by Stripe |
| Cloudflare | DNS, TLS and proxy in front of the public site | No (public static content only) | DPA before any personal data passes through it |
| Operator VPS | Static showcase today; the CMS and knowledge service are designed to be self-hosted here but are **not deployed** | Not today | Hosting DPA if health data is ever placed there |
| Language-model provider for the knowledge service | Answers from public knowledge base | Must not receive health data unless under BAA/DPA | Provider terms review |

## 7. Privacy by design rules

1. Collect only what a feature needs. No health data in analytics, URLs, logs or third-party scripts.
2. No advertising trackers or tracking pixels on any authenticated or health-related page.
3. The AI assistant must not receive identifiable health data unless the provider is under a signed BAA/DPA.
4. Test data is synthetic. Production exports never enter a repository.
