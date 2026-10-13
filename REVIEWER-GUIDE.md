# MediConnect reviewer guide

Reviewed 2026-10-13. Start with the [platform documentation index](docs/README.md) and [release acceptance ledger](docs/RELEASE-STATUS.md).

The website, CMS, regional backend and knowledge service have independent repositories and release evidence. A scoped deployment or passing source test does not establish end-to-end service activation. The public website is available at [mediconnect.zahidul-islam.com](https://mediconnect.zahidul-islam.com); account, payment and clinical activation remain separate acceptance boundaries.

## Read the evidence consistently

| Term | Meaning |
|---|---|
| Source implemented | Behavior exists in the identified revision |
| Locally verified | Named gates/flows passed in the recorded local configuration |
| Published | Exact remote Git revision was verified |
| Deployed and verified | Active artifact parity and specified real target flows passed |
| Historical | Prior evidence retained; recheck before treating it as current |
| Open / unavailable | Required acceptance is missing or failed |
| Future target | Architecture or objective awaiting representative implementation and measurement |

## Suggested review order

1. [Release status and phase boundaries](docs/RELEASE-STATUS.md).
2. [Architecture](docs/ARCHITECTURE.md), [setup/configuration](docs/GETTING-STARTED.md) and [API contracts](docs/API-CONTRACTS.md).
3. [Security](docs/SECURITY-ARCHITECTURE.md), [privacy](docs/PRIVACY-AND-DATA.md), [law](docs/COMPLIANCE-AND-LAW.md) and [AI governance](docs/AI-GOVERNANCE.md).
4. [Operations/recovery](docs/OPERATIONS.md), [reliability](docs/RELIABILITY.md), [future 1M+ scale](docs/SCALABILITY.md) and [roadmap](docs/ROADMAP.md).
5. [Accessibility](docs/ACCESSIBILITY.md), affected repository scripts and scoped test/release evidence.

The 1M+ simultaneous-user objective and 99.9%/99.95% critical-service objectives are future acceptance targets. No sustained capacity, achieved uptime, clinical approval or legal certification is inferred from these documents. Private recovery and incident records are deliberately excluded from public repositories.
