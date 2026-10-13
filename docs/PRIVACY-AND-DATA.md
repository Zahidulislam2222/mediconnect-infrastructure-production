# Privacy and data lifecycle

Reviewed 2026-10-13. [Release status](RELEASE-STATUS.md) defines the accepted public scope. This is the platform data-handling specification; the operator's public privacy notice must reflect the services actually activated.

## Data boundaries

| Data class | Permitted destination | Required controls |
|---|---|---|
| Published health articles and approved public knowledge | Public CMS delivery and public knowledge workspace | Editorial approval, provenance/review dates, licensed media, no patient identifiers |
| Account and workforce identity | Approved identity service and regional account services | SDK-managed sessions, least privilege, MFA where required, minimal claims and access lifecycle |
| Patient records, messages, prescriptions and consultation metadata | Authorized regional clinical services | Purpose/role/ownership checks, encryption, controlled exports, audit and retention |
| Payment information | Approved payment processor; backend retains necessary references/status | Keep card secrets out of platform logs/storage; verify processor contracts and signed webhooks |
| AI prompts, retrieved passages and output | Approved knowledge/model boundary only | Classify before submission, minimize, workspace isolation, configured retention, no unauthorized training reuse |
| Security and reliability telemetry | Approved regional monitoring destination | Field allowlist, pseudonymous correlation, bounded retention; no credentials, bodies or patient narratives |
| Recovery material | Approved encrypted private backup destination | Separate key custody, least privilege, integrity manifest and tested restoration |

The CMS holds public editorial material, not patient records. Medical and codebase knowledge use separate workspaces, credentials, storage and networks. Codebase knowledge must not contain keys, private infrastructure detail or patient information. A local model does not remove the need for authorized purposes and access controls.

## Collection and processing

Collect only fields needed for a declared purpose. Record the lawful basis and, for health data, the applicable additional condition. Keep consent version, scope, time and withdrawal state where consent is used. Validate tenant, subject, role and trusted region on the server for every protected operation. Client-provided region or resource identifiers are not authorization.

Do not place health information in URLs, browser analytics, error trackers, issue reports or general support email. Public support should request only the minimum information needed to route the request and provide an approved secure channel when sensitive records are required.

## Storage, transfers and vendors

Maintain a data-flow inventory covering application stores, object storage, media, exports, queues, caches, logs, backups, subprocessors and remote support. Map every destination to an approved region, owner, purpose, retention rule and agreement. Prevent automatic cross-region failover of regulated data unless the legal and technical design explicitly permits it.

Use transport encryption and approved encryption/key management at rest. Browser-side encryption cannot protect a secret that is distributed in the client bundle. Vendor activation requires documented security/privacy review and applicable BAA/DPA/transfer arrangements. Never infer vendor eligibility from a product logo or a successful API request.

## Rights and retention

Before live personal-data processing, approve a schedule per data class and jurisdiction. It must define retention trigger/duration, legal holds, deletion method, backup expiry and accountable owner. Medical-record obligations may constrain erasure; explain the applicable decision to the requester rather than promising unconditional deletion.

Rights handling must verify identity with proportionate checks, locate data across stores/processors, enforce scope, provide accessible responses, log the decision safely and meet applicable deadlines. Exports need ownership checks, encryption/access expiry and integrity verification. Deletion must cover derived indexes, embeddings, caches and downstream processors, with backup handling and legal holds documented. Test the entire flow and processor acknowledgements before claiming completion.

## Cookies and browser requests

Inventory scripts, requests, storage and cookies for each public and authenticated route. Permit only approved essential behavior by default; obtain and honor other choices where required. Test initial navigation, reload, withdrawal and region/device variants. Content security policy is a control, not proof that no injection or attempted tracking occurs.

The current live external-request acceptance remains open because browser responses still produced analytics requests after a host-specific configuration change was reported. Keep that acceptance open until a fresh browser network trace demonstrates the intended policy. See [release status](RELEASE-STATUS.md).

## Verification and ownership

Every release with a data-flow change needs a privacy review, negative authorization tests, request/log inspection, regional checks and an updated inventory/notice. Assign accountable privacy and security owners before service activation. Record requests and incident decisions in access-controlled systems; publish only scrubbed status and lessons.

See [law and activation](COMPLIANCE-AND-LAW.md), [security](SECURITY-ARCHITECTURE.md), [operations](OPERATIONS.md) and [AI governance](AI-GOVERNANCE.md).
