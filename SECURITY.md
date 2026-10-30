# Security Policy

## Supported code

Security fixes are applied to the active `main` branch. Older commits and unmaintained branches may not receive security updates.

## Reporting a vulnerability

Please do not publish exploit details, credentials, customer data, or proof-of-concept attacks in a public issue.

Use GitHub's **private vulnerability reporting** for this repository when it is enabled. If that option is unavailable, contact the repository owner through a private channel and ask for a secure reporting route. Include the affected version or commit, the impact you observed, and safe reproduction context. Do not include real customer data or live credentials.

## Response expectations

Reports are reviewed as maintainer capacity allows. No fixed response or remediation time is promised. Do not assume a report is resolved until a maintainer confirms the fix and its release.

## Scope

The policy gate, authentication, authorization, idempotency, audit records, dependency chain, and deployment configuration are in scope. Do not test against real users, live payment rails, or production data without explicit written authorization.
