# Confirmation hook release

The handler enrolls only explicitly configured patient and doctor clients. Doctor
membership does not bypass the separate server-side clinical approval checks.
Administrator and staff membership requires trusted operator provisioning.
Unknown signup clients and malformed events fail closed. Password confirmation
preserves existing roles. Assignment errors propagate with a fixed message;
the handler does not log events, usernames or provider errors.

All settings are required and validated by `settings.mjs`:

| Variable | Owner |
| --- | --- |
| `AWS_REGION` | Lambda runtime; do not override the reserved variable |
| `COGNITO_USER_POOL_ID` | Existing regional user pool |
| `COGNITO_CLIENT_ID_PATIENT` | Existing regional patient app client |
| `COGNITO_CLIENT_ID_DOCTOR` | Existing regional doctor app client |
| `COGNITO_POST_CONFIRMATION_MAX_ATTEMPTS` | Explicit SDK retry policy; safe example `1` |

The legacy region-suffixed and `DOCTOR_CLIENT_ID` variables are not fallback
configuration. Stage the canonical settings before replacing the code. Preserve
unrelated existing environment values; do not replace an unseen environment map.

The generic Lambda deployment workflow deliberately excludes this hook. Native
pool metadata identifies separate regional auto-group functions, whereas the
generic job previously targeted a different function name. Use the privately
reviewed inventory and revision identifiers for owner-run changes. No new
function, role, pool, client, permission or trigger association is required.

Before release, preserve both current source packages and runtime/configuration
recovery data, compare them with local source, run `npm run test:cognito`,
`npm run typecheck:cognito`, and the full backend gates, and obtain fresh review.
Package `index.mjs`, `settings.mjs` and `package.json` at the archive root. Include
the reviewed SDK dependency tree for a self-contained release. AWS also supplies
SDK v3 in supported Node runtimes, but its minor version varies by runtime and
region; a source-only archive relies on that provider dependency and does not
establish invocation compatibility. The existing functions report Node.js 24.

Owner-run deployment must check current code hash and revision against the saved
baseline, merge canonical settings without exposing values, wait for configuration
readiness, update the existing function using revision protection, and confirm
every packaged source hash. Then exercise real regional signup and password
recovery with approved synthetic accounts and verify only the intended groups.
Retain the original code and configuration for rollback; restoring code alone
does not restore replaced configuration. Local tests do not establish live MFA,
session claims, existing-account review or full privacy acceptance.

References: [AWS ZIP packaging](https://docs.aws.amazon.com/lambda/latest/dg/nodejs-package.html),
[Node runtimes and SDK versions](https://docs.aws.amazon.com/lambda/latest/dg/lambda-nodejs.html),
and [Cognito confirmation events](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-lambda-post-confirmation.html).
