# Security policy

## Reporting a vulnerability

Please report security problems **privately**. Do not open a public issue, pull request or discussion.

- Use GitHub private vulnerability reporting: [report a vulnerability](https://github.com/Zahidulislam2222/mediconnect-infrastructure-production/security/advisories/new)
  (Security tab → "Report a vulnerability").
- Include what is affected, the steps to reproduce it and the impact. Do not include real personal or health data.
- If you find an exposed credential, report where it is, but **do not post or use the value**.

We aim to acknowledge reports within 5 business days and to agree a fix and disclosure timeline with you.
This is a community open-source project: there is no bug bounty.

## Scope

In scope: code and configuration in this repository and the public showcase at
<https://mediconnect.zahidul-islam.com>.
Out of scope: denial-of-service testing, social engineering, physical attacks, and third-party
services (report those to the vendor).

Please test only against your own local deployment. Do not access, change or delete data that isn't yours.

## Supported versions

Only the latest commit on the default branch is supported.

## How this project stays secure

See the platform [security architecture](https://github.com/Zahidulislam2222/mediconnect-infrastructure-production/blob/main/docs/SECURITY-ARCHITECTURE.md). Every push and pull
request runs secret scanning (Gitleaks, current files and full history), static analysis (Semgrep)
and Python security checks (Bandit).
