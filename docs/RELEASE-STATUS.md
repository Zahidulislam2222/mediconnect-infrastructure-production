# Release status and acceptance

Reviewed 2026-10-13. This record describes delivery evidence, not an uptime report or clinical approval.

## Current releases

| Component | Verified delivery | Required remaining acceptance |
|---|---|---|
| Public website | Reviewed source [`99981db`](https://github.com/Zahidulislam2222/mediconnect-hub/commit/99981db57f3ba53fb2fe0ac2361f5ce40fc45741), remote SHA verified; deployed artifact has 43 matching local/live files | Edge analytics/privacy acceptance remains open; account, payment and clinical services remain unavailable on this public release |
| Website verification | 676 unit tests, 77 browser cases, explicit TypeScript projects, lint, configuration checks, build and security gates passed for the reviewed release | Recheck live flows after each subsequent release; warnings and unavailable gates remain separately recorded |
| CMS | Reviewed source [`a441ef7`](https://github.com/Zahidulislam2222/mediconnect-cms/commit/a441ef7ab2998375bf6bb65ea288263be4ace0b4); existing-host deployment verified against 53 source files, with nonroot runtime and durable data/upload mounts | Application-consistent live backup, off-host restore and complete legacy-media recovery remain open |
| Editorial journeys | Five original published articles, all 51 ordered paragraphs, three decoded covers, detail reloads and curated content verified | Two legacy covers remain unavailable; content preservation and complete media recovery are different gates |
| Regional backend | Scoped doctor and booking application revisions verified in both configured regions, with source/image provenance and safe HTTP contracts | Full provider, identity, payment, privacy and clinical journeys are not accepted by these scoped checks |
| Patient data service | Reviewed source [`852812a`](https://github.com/Zahidulislam2222/mediconnect-infrastructure-production/commit/852812a0c3e5b1ebb0796da560ff28ade156a9ac), published; local release image and privacy-related flows verified | Current live patient deployment and native/provider privacy acceptance remain open |
| Document processor | Reviewed source [`f4db116`](https://github.com/Zahidulislam2222/mediconnect-rag/commit/f4db116fe3cdaa876664f57cc25c3cb75c32235e), published; 98 regressions, typing, lint, security and container/lifecycle gates passed | Live processor deployment, approved provider execution and ingestion/retrieval acceptance remain open |
| Local-model knowledge runtime | Reviewed source [`254cc53`](https://github.com/Zahidulislam2222/mediconnect-rag/commit/254cc5333b9c9b2e57b74561a6c4708af86d02a3), published; actual local authentication, six request-privacy cases, 54 access checks during container recreation, SDK deadlines, nonroot/source/network/budget checks passed | VPS deployment, actual model output/embedding dimensions, grounded retrieval, load, monitoring and consistent restore remain open |
| Native clients | Kotlin/Compose and Swift/SwiftUI source retained with their existing verification records | Remaining native work follows non-mobile acceptance; no store/device acceptance is inferred here |

## Phase acceptance

| Phase | Current status | Exit boundary |
|---|---|---|
| 1 — public website | Historical release contract completed; newer scoped public release verified | Current public route/content/accessibility and deployment checks; broader provider activation belongs to later phases |
| 2 — backend provenance | Historical scoped release contract completed | Source/image/configuration provenance and regional contracts; later operational/provider changes require their own checks |
| 3 — booking, billing and pharmacy | Open | Real sandbox provider, retries/replays/refunds, ownership, notifications and ledger evidence |
| 4 — identity, privacy and clinical data | Open | Provider/native MFA, roles, patient release, secure storage, consent/rights and regional denial flows |
| 5 — CMS and editorial operations | Open | Original content/media, permissions, consistent backup, restore and public integration |
| 6 — knowledge and AI operations | Open | Approved ingestion/search, isolation, grounded/safe responses, provider readiness, monitoring and restore |
| 7 — integrated journeys | Open | Public and authenticated role/region journeys, accessibility, failure states and privacy acceptance |
| 8 — security and recovery | Open | Credential/exposure remediation, least privilege, incident readiness, encrypted off-device recovery and key-custody verification |

## Release evidence contract

Every new release identifies source and configuration, records a drift baseline, exercises the changed real flow, passes the affected gates and independent review, verifies the exact remote Git SHA, and proves active artifact parity. A partial acceptance stays scoped to the tested component and configuration.

The public legal/contact pages use the approved MediConnect name, support contact and intended US/EU scope. Full operating identity, required agreements, clinical responsibilities and jurisdiction-specific approvals remain service-activation requirements. See [law](COMPLIANCE-AND-LAW.md), [privacy](PRIVACY-AND-DATA.md) and [operations](OPERATIONS.md).
