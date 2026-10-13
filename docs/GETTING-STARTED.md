# Development and configuration

Reviewed 2026-10-13. Start with [release status](RELEASE-STATUS.md) and the instructions in the repository you are changing.

## Repository map

| Repository | Role |
|---|---|
| [mediconnect-hub](https://github.com/Zahidulislam2222/mediconnect-hub) | React/TypeScript website, Capacitor archive and native client source |
| [mediconnect-infrastructure-production](https://github.com/Zahidulislam2222/mediconnect-infrastructure-production) | Current backend, infrastructure definitions and shared platform documentation |
| [mediconnect-cms](https://github.com/Zahidulislam2222/mediconnect-cms) | Strapi editorial service and migrations |
| [mediconnect-rag](https://github.com/Zahidulislam2222/mediconnect-rag) | Knowledge processing, isolated local-model runtime and operations tooling |

The repositories have independent lockfiles, branches and release evidence. The older development implementation is a historical source reference; it does not replace current production authority.

## Tooling

Use each package's `engines`, Dockerfile and lockfile as the version authority. The reviewed Node backend packaging uses Node 22; the CMS package declares its supported Node range. Python dependency files and immutable container references own Python/SDK versions. Native build tooling follows `native/README.md`; a web build does not establish a native device result.

Install from lockfiles. Do not run dependency upgrades as part of setup or assume a globally installed compiler checks every TypeScript project.

## Environment setup

1. Copy the applicable `.env.example` into an ignored local environment file.
2. Populate approved local service endpoints, identity settings and test-only credentials.
3. Validate the typed configuration and available local dependencies before starting a service.
4. Keep real credentials in the operator's approved secret store and private recovery register.

| Configuration family | Owner |
|---|---|
| Frontend endpoints, identity, feature switches, deadlines and release settings | Typed frontend configuration, environment templates and release settings |
| Backend providers, regional resources, authorization/claim settings and operational limits | Shared typed backend settings and service environment templates |
| CMS database, upload provider, proxy/host controls and bootstrap secrets | Typed CMS runtime settings and environment template |
| Isolated knowledge images, models, ports, resource/queue/time limits and workspace authentication | `deploy/selfhost/.env.example`, private deployment environment and runtime validation |
| Optional document parser/provider limits | `ragAnything/settings.py`, `processor.json` and documented environment overrides |
| Product text, prompts, theme and policy content | Maintained JSON/templates loaded by the owning application |

Never put private keys in Vite variables or native bundles: client configuration is public. Empty or invalid provider settings must leave the corresponding feature unavailable.

## Frontend checks

From `mediconnect-hub`:

```bash
npm ci
npm run dev
npm run test
npm run typecheck
npm run lint
npm run verify:config
npm run test:e2e
npm run build
```

`typecheck` explicitly checks application, build, browser-test and connected-release projects. The root solution configuration alone does not establish application type safety. A public-only release uses `npm run build:public` and the release configuration described in the frontend deployment README.

## Node backend checks

From `backend_v2`:

```bash
npm ci
npm test
npm run lint
npm run typecheck:cognito
npm run typecheck:federation
npm run build --workspaces --if-present
```

Individual workspaces own their additional scripts. Tests use controlled local inputs/transports; real payment, messaging, cloud or model calls need the corresponding data/cost approval.

From the infrastructure root, read the migration status and resource registry, run `bash verify_app_vs_iac.sh`, and preserve its full result. Infrastructure/state changes also require `bash verify_migration.sh`, native cloud inventory and a reviewed plan. Terraform apply/destroy/import and cloud resource changes are operator actions.

## CMS checks

From `mediconnect-cms`:

```bash
npm ci
npm run test
npm run typecheck:migration
npm run typecheck:runtime
npm run build
npm run dev
```

Run production `start` only with the approved runtime/database/upload configuration. The package's `deploy` command is not a generic local setup step. Check public/editor permissions, database/upload mounts and source/live parity before a live release.

To compile the CMS admin UI without runtime secrets, use its maintained `node scripts/container-build.cjs` wrapper. Build-only placeholders stay scoped to the compiler child process and must never be used to start the service.

## Knowledge service checks

Read the RAG repository README and `deploy/selfhost/README.md` before starting containers. The historical broad operations stack and the isolated application release are separate projects; never operate one through the other's Compose file.

Use the processor's `--plan` mode to validate approved input without provider execution. Real ingestion/search, public model downloads and actual model calls are distinct operations. Verify provider eligibility, source permissions, workspace isolation and the selected deployment configuration first.

## Troubleshooting

| Symptom | First check |
|---|---|
| Feature reports unavailable | Required configuration and release/provider acceptance, before retrying requests |
| Service alive but not ready | Typed settings/bootstrap validation and configured dependencies |
| Authenticated request rejected | Current SDK session, issuer/audience/role/ownership and trusted regional context |
| Public article missing | CMS publication state, public permissions, payload compatibility and approved media origin |
| RAG request enters wrong workspace | Upstream routing identity, separate networks, DNS refresh and workspace key/token tests |
| Build passes but live behavior differs | Exact artifact/image/configuration hashes and the active release reference |

Sanitize diagnostics before sharing. Never paste environment files, access tokens, patient documents or raw production logs into an issue.
