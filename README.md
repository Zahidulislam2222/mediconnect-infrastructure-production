# MediConnect — healthcare services and platform engineering

MediConnect connects patient, practitioner, clinic staff and administrator workflows across a React website, regional APIs, editorial content and an AI knowledge service. This repository owns the backend and the platform documentation.

**Public website:** https://mediconnect.zahidul-islam.com · **Maintainer:** [Zahidul Islam](https://github.com/Zahidulislam2222) · **Documentation reviewed:** 2026-10-13

## Current delivery

The public website and its CMS-backed article journeys are deployed. Scoped doctor and booking application revisions have been verified in both configured regions. Clinical service activation, patient-data deployment, identity-provider journeys, payment-provider acceptance and operational recovery have additional release gates. The public website explains which services are currently unavailable.

The knowledge service has reviewed document-processing and isolated local-model runtime implementations. Local authentication, workspace isolation, request privacy and container-replacement checks pass; live models, retrieval quality and operational acceptance are tracked separately. See [release status](docs/RELEASE-STATUS.md) for the evidence boundary.

## Repository responsibilities

| Area | Responsibility |
|---|---|
| `backend_v2/` | Five Node.js/TypeScript workspaces: patient, doctor, booking, communication and staff services; shared configuration, authentication, regional, encryption and audit utilities |
| Python services | Administration and DICOM processing; framework and entry points belong to each service's configuration |
| Infrastructure definitions | Terraform, deployment definitions, regional resources and migration verification |
| `docs/` | Architecture, API/configuration contracts, law/privacy, security, reliability, operations and roadmap |
| `architecture/` | Capacity planning and engineering decisions |

## Read the platform documentation

| Topic | Document |
|---|---|
| Start here and release status | [Documentation index](docs/README.md), [current releases and acceptance](docs/RELEASE-STATUS.md) |
| Development and configuration | [Getting started](docs/GETTING-STARTED.md), [API and regional contracts](docs/API-CONTRACTS.md) |
| System design | [Architecture](docs/ARCHITECTURE.md) |
| Future 1M+ simultaneous users | [Scalability](docs/SCALABILITY.md), [capacity contract](architecture/CAPACITY-AND-RELIABILITY.md) |
| Availability and recovery | [Reliability and SLOs](docs/RELIABILITY.md), [operations](docs/OPERATIONS.md) |
| Security and supply chain | [Security architecture](docs/SECURITY-ARCHITECTURE.md), [security reporting](SECURITY.md) |
| US/EU requirements and patient rights | [Law and compliance](docs/COMPLIANCE-AND-LAW.md), [privacy and data](docs/PRIVACY-AND-DATA.md) |
| Knowledge and clinical AI | [AI governance](docs/AI-GOVERNANCE.md) |
| Inclusive access | [Accessibility](docs/ACCESSIBILITY.md) |
| Delivery and growth | [Roadmap](docs/ROADMAP.md), [engineering review](REVIEWER-GUIDE.md) |

## Local development

Use the supported Node version, lockfiles and environment templates documented in [getting started](docs/GETTING-STARTED.md). Configure local dependencies and test credentials before running service commands.

```bash
cd backend_v2
npm ci
npm test
npm run lint
npm run typecheck:federation
npm run typecheck:cognito
npm run build --workspaces --if-present
```

From the infrastructure root, run `bash verify_app_vs_iac.sh`. Infrastructure/state work also requires `bash verify_migration.sh` and a reviewed native cloud inventory. Configuration comes from typed settings and documented environment variables; a client-supplied role or region never replaces server authorization.

## Release and operation

Changes are developed locally, checked against live drift, independently reviewed and released as immutable application artifacts. The operator verifies every deployed file/image and the actual user flow, retains rollback material and records open gates. Cloud deployment workflows require a deliberate manual dispatch and cost acknowledgement; a Git push does not authorize cloud provisioning.

The future scale objective is **1,000,000+ concurrent users**. Critical-journey availability objectives are **99.9% at launch** and **99.95% at scale**, with defined measurement windows, error budgets and recovery drills. The roadmap specifies the measurements and operating changes required to reach these objectives.

## Related repositories

- [Website and clients](https://github.com/Zahidulislam2222/mediconnect-hub)
- [Editorial CMS](https://github.com/Zahidulislam2222/mediconnect-cms)
- [AI knowledge service](https://github.com/Zahidulislam2222/mediconnect-rag)

The earlier development checkout is retained separately as historical reference. This backend repository owns current production source.

## Support, contribution and licensing

General support: **muhammadzahidulislam2222@gmail.com**. Do not include health records, passwords, payment details or other sensitive information. Security reports follow [SECURITY.md](SECURITY.md).

[Contributing](CONTRIBUTING.md) · [Code of conduct](CODE_OF_CONDUCT.md) · [MIT license](LICENSE) · [Third-party notices](THIRD-PARTY-NOTICES.md)

Software documentation does not establish an operating entity's legal approval or clinical authorization. Service activation requires the applicable organizational, contractual, security and clinical acceptance described in the platform documents.
