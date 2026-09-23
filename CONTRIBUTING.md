# Contributing to MediConnect

Thank you for helping. MediConnect is healthcare software, so correctness, privacy and security come
before speed.

## Before you start

- Read the [platform documentation](https://github.com/Zahidulislam2222/mediconnect-infrastructure-production/blob/main/docs/README.md), especially
  [security](https://github.com/Zahidulislam2222/mediconnect-infrastructure-production/blob/main/docs/SECURITY-ARCHITECTURE.md) and [privacy](https://github.com/Zahidulislam2222/mediconnect-infrastructure-production/blob/main/docs/PRIVACY-AND-DATA.md).
- For anything larger than a small fix, open an issue first to agree the approach.
- Security problems: **do not open a public issue.** Follow [SECURITY.md](SECURITY.md).

## Ground rules

1. **No real patient data, ever.** Use synthetic data with obviously fake names and values.
2. **No secrets in Git.** Configuration comes from environment variables; `.env.example` holds placeholders only.
3. **No hard-coded configuration.** URLs, regions, model IDs, prices, limits and timeouts belong in configuration.
4. **Every endpoint** needs authentication, an authorisation check and request validation.
5. **Tests first** for bug fixes: add a failing test that reproduces the bug, then fix it.
6. **Do not suppress scanner findings** (Gitleaks, Semgrep, Bandit). Fix them or explain the false positive in the pull request.
7. **Do not add automatic deployments** or anything that can create cloud costs without a manual approval step.

## Checks to run before opening a pull request

```bash
cd backend_v2 && npm install && npm test --workspaces --if-present
bash verify_app_vs_iac.sh
terraform validate   # plan only; never apply without owner review
```

The security workflow (Gitleaks, Semgrep, Bandit) runs on every pull request. New findings in your change must be fixed, never suppressed. Third-party libraries vendored into retired bundles under `legacy_lambdas/` are excluded from scanning (see `.semgrepignore`); all other code is scanned and findings block the change.

## Pull requests

- Keep each pull request to one change, with a clear description of what and why.
- Mention the issue it closes and how you tested it.
- Update documentation when behaviour changes. Use the status labels CURRENT, RETAINED, PLANNED and TARGET honestly.

By contributing, you agree that your contribution is licensed under the [MIT Licence](LICENSE).
