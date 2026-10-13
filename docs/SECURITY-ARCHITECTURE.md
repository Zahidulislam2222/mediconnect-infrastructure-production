# Security architecture and verification

Reviewed 2026-10-13. Controls have scoped verification evidence; no audit certification or absence of vulnerabilities is implied. See [release status](RELEASE-STATUS.md) for remaining activation gates and each repository's `SECURITY.md` for private reporting.

## Trust boundaries and threat model

Treat browsers, native clients, incoming webhooks, uploads, retrieved documents and model output as untrusted. Separate public delivery, identity, regional clinical services, editorial administration, knowledge workspaces and operator access.

| Threat | Required prevention and detection |
|---|---|
| Broken object/tenant/role authorization | Validate current identity and server-side ownership/tenant/role on every protected read/write; test cross-user, cross-role and cross-region denial |
| Credential theft/session abuse | SDK-managed tokens, issuer/audience/signature/expiry checks, MFA policy, short-lived credentials, revocation/recovery drills and rate limits |
| Injection and unsafe input | Schema validation, parameterized queries, bounded parsing, safe file handling, output encoding and no unsafe deserialization |
| Payment/webhook replay | Signature verification on original bytes, bounded timestamp policy, durable event uniqueness and idempotent state transitions |
| Cross-workspace knowledge access | Distinct credentials/storage/networks, fail-closed proxy routing, cross-key/token denial and container-recreation tests |
| Prompt injection or poisoned source | Approved provenance, instruction/data separation, no model authority over access control, retrieval evaluation and human escalation |
| Secret/source/supply-chain exposure | Current-tree and history triage, locked dependencies, immutable images, provenance, layered scans and reviewed changes |
| Resource exhaustion or dependency failure | Positive resource caps, request/queue bounds, cancellation/deadlines, backpressure and isolation |
| Recovery compromise | Encrypted off-device backups, separate key custody, least privilege, integrity checks and isolated restore exercises |

## Application controls

Backend services validate protected requests explicitly; UI route guards are an additional usability boundary. Derive routing from validated regional context. Mutation retries require documented idempotency and failure semantics. Use PII-safe logging and minimal structured audit events. Never include tokens, patient narratives, uploaded documents or raw provider errors in ordinary logs.

Frontend calls use the shared API client and SDK session boundary. Profile data uses the maintained secure-storage boundary. Keep sensitive state out of URL parameters and ordinary browser storage; clear session-derived state on logout/recovery. Native clients must satisfy their own storage, lifecycle and provider tests.

The isolated knowledge runtime uses a nonroot derived image, separate internal workspace networks and storage, workspace authentication, positive configured resource limits, and loopback-only ingress. Model/backend processes have no normal internet egress. Ingress request logs are disabled; the Python logging boundary strips messages, arguments and exception/stack payloads. These controls do not establish that every third-party console write is content-free or authorize processing PHI.

## Configuration and key management

Central typed settings own environment-specific endpoints, model identifiers, versions, deadlines, feature switches and operational limits. Maintained content belongs in validated data/templates. Environment examples contain safe examples only. Do not embed private credentials in client builds or container layers.

Keep current credentials and recovery instructions in the approved private secret/recovery store. Apply least privilege, separate environments and workspace keys, document rotation/expiry, and test revocation without printing values. Treat a confirmed exposed credential as compromised: revoke/rotate at its issuer, update dependencies and recovery records, and verify old access fails. Removing a string from the latest file does not revoke it or remove history.

## Delivery gates

1. Written acceptance criteria and threat/data-flow assessment.
2. Minimal local implementation and regression tests for meaningful failure paths.
3. Tests, explicit type checks, lint, security scans and build; missing gates reported.
4. Real HTTP/UI/CLI behavior with controlled data, including negative authorization and failure states.
5. Independent fresh-context review against the criteria.
6. Exact source/configuration/image identification, pre-deploy drift check and rollback plan.
7. Local/live artifact parity, remote Git SHA, runtime isolation and changed-flow verification.

Security tooling includes Gitleaks, Bandit and Semgrep where applicable, plus dependency/container and infrastructure checks. A tool's configured presence or wrapper exit is not a successful scan: inspect its actual output, scope and findings. Historical exposure triage and upstream vulnerabilities require explicit disposition; do not hide them behind a green latest-diff result.

## Vulnerability and incident response

Report privately using the repository's security policy. Keep exploit details and credentials out of public issues. Triage impact, affected versions/data and containment; preserve restricted evidence; rotate credentials when indicated; verify the fix and add the missing gate. Coordinate notification and disclosure with the responsible operator. Publish a scrubbed advisory when appropriate.

See [operations](OPERATIONS.md), [privacy](PRIVACY-AND-DATA.md) and [roadmap](ROADMAP.md) for recovery and remaining acceptance work.
