# API, authorization and regional contracts

Reviewed 2026-10-13. This is a contract guide to the retained service source, not an assertion that every route is enabled live. Service route/schema files are authoritative; [release status](RELEASE-STATUS.md) identifies accepted scopes.

## Service routing

The web client routes through `src/lib/api.ts`, obtains its current session from the authentication SDK and reads endpoints/region/limits from typed configuration. It does not store raw bearer tokens in local storage.

| Route family | Owning service |
|---|---|
| `/patients`, `/me`, `/vitals`, `/allergies`, `/immunizations`, `/care-plans`, patient FHIR/privacy flows | Patient, with specialized route selection checked in the API boundary |
| `/doctors`, `/ehr`, `/prescriptions`, `/pharmacy`, `/relationships`, `/terminology`, `/lab`, `/referrals` | Doctor |
| `/appointments`, `/billing`, `/subscriptions`, `/prior-auth`, `/eligibility` | Booking |
| `/chat`, `/video`, `/ai`, `/chatbot` | Communication |
| `/shifts`, `/tasks`, `/announcements`, `/directory` | Staff |
| `/api/v1/admin` | Administration |
| Imaging and upload-processing routes | Explicit configured service contract; file type/path cannot select arbitrary hosts |

Endpoint prefixes can overlap. Preserve the order and specialized rules in the client router; do not reimplement selection in components.

## Authentication and authorization

- Verify JWT signature, issuer, audience, expiry and required claim shape at the server.
- Derive allowed roles from validated identity and server policy. Public enrollment cannot grant privileged roles.
- Check resource ownership or a verified care relationship for every protected resource.
- Require the configured per-session MFA/step-up evidence for sensitive operations; the presence of a selected MFA preference is insufficient.
- Recheck authorization on HTTP, uploads and real-time channels. A frontend route guard is only a navigation control.
- Emergency access must be time-limited, reasoned, authorized and audited.

## Regional context

The client supplies `x-user-region` from its configured/account context. The backend validates it against trusted account/resource and service-region policy. It must not treat a freely edited header as permission to access another regional store.

Regional endpoints, issuer/audience settings, database/bucket/key names and fallback policy have one typed configuration owner. Failover must preserve the authorized data region. Missing claims, mismatched regions and unapproved fallback destinations fail closed before data access.

## Validation, errors and cancellation

Validate bodies, query/path values, identifiers, file metadata, pagination and response size. Return bounded public errors without stack traces, tokens, provider payloads or patient data. Distinguish invalid input, unauthenticated, forbidden, conflict, rate-limited and unavailable states using the owning service's schema.

Client cancellation is checked before authentication and again before dispatch. An already-aborted operation must not send a write. A timeout or lost reply does not prove that a write failed; reconcile through the server's idempotency/status contract before repeating it.

## Mutations and external events

| Operation | Required behavior |
|---|---|
| Appointment/payment/refill creation | Stable operation identity, atomic conflict handling and server-confirmed status |
| Duplicate or concurrent requests | Same logical result; no second booking, charge or entitlement |
| Webhook | Signature verification over the required raw input, validated event identity and replay-safe processing |
| Late or reordered events | State-transition rules preserve the correct final status |
| Refund/cancellation | Ownership, current ledger/provider state, idempotency and explicit reconciliation |
| Notification/event worker | Bounded retries, deduplication, recorded terminal failure and recovery path |

These are acceptance requirements. Provider sandbox execution and recovery evidence are tracked separately from local handler tests.

## Uploads and imaging

Authorize the intended object and purpose before issuing bounded upload access. Validate size, content type and file structure; scan files before release to readers. Bind object keys to the authorized subject/region and reject path traversal and arbitrary remote URLs. Large media belongs on the approved object/media path rather than unbounded API buffering.

DICOM de-identification, metadata handling and malware scanning each need their own acceptance. Removing a filename or a subset of tags does not establish complete de-identification.

## Real-time and consultation access

Use short-lived authorized connection/join grants. Validate origin, role, ownership and regional context at connection and action boundaries. Revoke access when membership or session authority changes; bound messages, queues and connection lifetime. Do not put bearer tokens or health content in URLs or shared logs.

## Public CMS and knowledge access

Public CMS requests do not carry account authorization/cookies. Validate CMS origin, redirect behavior and upload paths before loading media. Preserve explicit unavailable states for missing legacy assets.

Medical and codebase knowledge use different authentication and storage. No guest token may bypass workspace access. Actual wrong-key, wrong-password and cross-workspace token tests must pass before and during container replacement, with no private request content in logs.

## Contract verification

Exercise authorized and denied flows through real HTTP/CLI/UI boundaries using controlled data. Cover malformed/oversized inputs, current-session MFA, wrong role/owner/region, cancellation, duplicates, lost replies, reordered events, unavailable providers and recovery. Record the exact source/configuration and separate local results from provider/live acceptance.
