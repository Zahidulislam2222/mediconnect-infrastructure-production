# Backend configuration and contract verification

A standalone backend checkout owns its configuration audit. It does not require a
frontend repository to exist next to it.

From `backend_v2/`, run:

```bash
npm run test:config
npm run test:config:cli
npm test
npm run typecheck --workspaces --if-present
npm run lint
npm run build --workspaces --if-present
```

The root test command includes workspace tests plus regional authentication,
PHI failure, clinical-access, pharmacy and other HTTP contract checks. The retained
manual deployment workflow runs that root command before building images.

To audit both repositories, explicitly provide the client checkout:

```bash
node scripts/verify_config_boundary.mjs --frontend-root /path/to/client-checkout
```

Default output identifies backend coverage and says the frontend audit was not
requested. An explicitly supplied client must exist and pass its own checks;
missing configuration or direct frontend environment reads remain failures.
Unknown, incomplete or empty scope arguments fail.

| Contract | Source owner | Verification boundary |
|---|---|---|
| Required settings and operational limits | `shared/settings.ts`, documented in `.env.example` | Configuration audit plus service startup tests |
| Authenticated jurisdiction | `shared/region-context.ts` and service auth middleware | Regional HTTP tests; caller headers cannot replace verified identity |
| Regional AWS clients | `shared/aws-config.ts` | Validated jurisdiction selects configured regional clients |
| Browser CORS and CSP | `shared/api-browser-policy.ts` | Explicit configured origins and browser-policy tests |
| Booking cancellation startup prerequisites | `booking-service/src/index.ts` | Required cancellation settings validated before listening |
| Resource references | Root resource registry and Terraform | `verify_app_vs_iac.sh`; source coverage does not establish live existence |

The CLI regression suite invokes the real audit with independent synthetic
checkouts. It covers standalone scope, explicit client paths with spaces, missing
backend/client documentation, direct client environment access and invalid scope
arguments. The fixtures contain fake values only.

This audit retains the existing fallback, environment-documentation, obvious
secret and forbidden-resource checks. It does not establish that every runtime
literal has been centralized, that historical credentials are safe, or that
deployed configuration matches the example file.

Before a runtime release, recover immutable serving-image/source evidence,
reconcile local/live drift, validate actual startup configuration and obtain any
required owner infrastructure and cost approvals. Metadata marked Ready, mutable
image tags and a successful historical CI run do not satisfy source parity.
