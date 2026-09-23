# Security architecture

Last reviewed: 2026-09-24. To report a vulnerability, see [SECURITY.md](../SECURITY.md). Please do
not open a public issue.

## 1. What we protect

| Asset | Why it matters |
|---|---|
| Health data (diagnoses, prescriptions, images, messages, vitals) | Special-category data under GDPR and protected health information under HIPAA; harm if exposed or altered |
| Identity and credentials | Account takeover gives access to health data |
| Payment state | Fraud, double charges |
| Audit log | Needed to prove who accessed what |
| Encryption keys and cloud credentials | Compromise of everything above |
| Clinical integrity | Wrong patient, wrong drug or silently altered records can cause physical harm |

## 2. Threat model (STRIDE summary)

| Threat | Example | Main controls |
|---|---|---|
| Spoofing | Stolen password, forged token | Cognito sign-in with MFA (TOTP or email), token signature verification against the pool's public keys, short token lifetime |
| Tampering | Changing another patient's record, replaying a payment | Server-side role **and** ownership checks on every route, request schema validation, idempotency keys, Stripe webhook signature verification |
| Repudiation | Denying a record access | Append-only audit events (FHIR AuditEvent) with actor, patient, action and time |
| Information disclosure | Cross-patient data leak, EU data in the US, secrets in logs | Regional data routing from validated context, field-level encryption, log masking, no raw tokens in browser storage |
| Denial of service | Request floods, expensive AI calls | Edge rate limiting, per-tier quotas, AI concurrency caps, load shedding |
| Elevation of privilege | Patient reaching doctor or admin APIs | Route guards in the client **and** enforced authorisation on the server; break-glass emergency access is time-limited and audited |

## 3. Controls by layer

| Layer | Control | Status |
|---|---|---|
| Identity | Amazon Cognito regional user pools, MFA options, role groups, session timeout after 15 minutes of inactivity | Implemented in source |
| Authorisation | Per-endpoint role guard plus resource-ownership checks | Implemented; full authenticated route test coverage is open work |
| Input | Zod (Node) and Pydantic (Python) validation | Implemented |
| Encryption in transit | HTTPS on the public site; target is TLS 1.2+ everywhere, HSTS and a strict content-security policy | Partial. Verified on the showcase host: HTTPS through Cloudflare, `X-Frame-Options: DENY`, and a content-security policy limited to `connect-src`, `frame-src`, `form-action`, `object-src` and `base-uri`. **No HSTS header yet**, and the policy has no `default-src` or `script-src` (open work). |
| Encryption at rest | Cloud-managed disk/database encryption plus KMS envelope encryption of health fields | Implemented in source |
| Browser storage | Profile data via Web Crypto AES-GCM wrapper; tokens obtained from the auth SDK, not stored raw | Implemented. Note: a key shipped to the browser does not protect against an attacker with script access; the real protection is server-side. |
| Secrets | Environment variables and cloud secret stores; no secrets in source; `.env.example` holds placeholders only | Enforced by scanners |
| Logging | Personal data masking (email, phone, national IDs, passwords, base64 blobs) before writing | Implemented |
| Breach detection | Rate-based anomaly detection on health-data operations and security events, alerting to the security contact | Implemented in source; not operated live |
| Files | Pre-signed uploads, DICOM de-identification | Implemented; malware scanning PLANNED |
| Network | Kubernetes network policies, namespace isolation, strict CORS allow-list | RETAINED templates |
| Cloud | Keyless CI deployment through OIDC workload identity; GuardDuty and Security Hub definitions | RETAINED |

## 4. Software supply chain

- Every repository runs a **security workflow** on push and pull request: Gitleaks (current files
  and full history), Semgrep and Bandit. Findings fail the build; suppressions are not allowed.
- Local pre-commit hooks run the same scanners before code leaves the developer's machine.
- Dependencies are pinned through lockfiles; container images should be pinned by digest before production (PLANNED).
- Planned: signed build provenance (SLSA-style attestations), software bill of materials (SBOM)
  per release, and Dependabot or Renovate update policy.

## 5. Known open security work (honest list)

| Item | Status |
|---|---|
| History scan: some early commits contain credentials or credential-shaped values that were later removed from the current tree. Each must be confirmed revoked or rotated at the provider. Removing a file does not revoke a key. | Open, operator action |
| Several scanner matches are known false positives (vendored library test vectors, infrastructure identifiers, test fixtures). They are triaged but not suppressed. | Triaged |
| Immutable build provenance for previously deployed backend images | Open |
| Booking and refund idempotency under retries | Open |
| Malware scanning of uploads | Planned |
| Independent penetration test | Planned before any real patient data |
| Branch protection and required reviews on default branches | To configure |
| Add HSTS and a complete content-security policy (`default-src`, `script-src`, `style-src`) to the public host | Open |
| Security CI on the default branches (2026-09-24): **all four repositories pass.** First run: the CMS passed. The frontend failed only its full-history secret scan. The backend's Semgrep and Bandit failed only on third-party libraries vendored into two retired Lambda bundles. The knowledge service's Semgrep flagged one Nginx header setting. Fixes: the Nginx setting was corrected; the vendored library folders are excluded from scanning, while MediConnect's own handler code is still scanned; the frontend's history scan now **reports without blocking**, because its findings are in old commits that cannot be removed without rewriting history | History-scan findings stay open until each old credential is confirmed revoked; then the history scan goes back to blocking |

## 6. Security rules for contributors

1. Never commit secrets, real patient data or production exports. Use obviously fake test values.
2. Every new endpoint needs authentication, an authorisation check and request validation. No exceptions.
3. Health data goes through the shared encryption and audit helpers only.
4. Region comes from the validated request context, never from a hard-coded value.
5. Do not weaken or suppress a scanner finding to make CI pass. Fix it or document why it is a false positive.
