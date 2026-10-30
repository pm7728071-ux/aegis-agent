# AEGIS Swarm Core

## Deterministic and independent model layers

The deterministic specialists remain the baseline and run without model credentials. An optional independent reasoning layer adds three separate model roles:

- **MODEL_SENTINEL** — independent security review.
- **MODEL_ARCHITECT** — reliability, architecture and test-gap review.
- **MODEL_ADVERSARY** — defensive abuse-case and bypass review.

Each role calls a separately configured OpenAI-compatible chat-completions endpoint. A role is considered independent only when its endpoint + model identity is unique. Reusing one model identity for multiple roles is rejected as a duplicate configuration.

## Configure model providers

Add these as GitHub Actions repository secrets (Settings → Secrets and variables → Actions), never as committed files:

| Secret | Purpose |
|---|---|
| `AEGIS_SENTINEL_MODEL_URL` | Full HTTPS chat-completions endpoint |
| `AEGIS_SENTINEL_MODEL_NAME` | Model identifier for security review |
| `AEGIS_SENTINEL_API_KEY` | Provider key |
| `AEGIS_ARCHITECT_MODEL_URL` | Full HTTPS chat-completions endpoint |
| `AEGIS_ARCHITECT_MODEL_NAME` | Different model identifier |
| `AEGIS_ARCHITECT_API_KEY` | Provider key |
| `AEGIS_ADVERSARY_MODEL_URL` | Full HTTPS chat-completions endpoint |
| `AEGIS_ADVERSARY_MODEL_NAME` | Different model identifier |
| `AEGIS_ADVERSARY_API_KEY` | Provider key |

All three endpoint/model pairs must be distinct. Endpoints must use HTTPS, except localhost HTTP for local tests. The adapter uses a standard `/chat/completions`-style JSON request; check your provider's compatibility, model availability, quotas, data handling and current pricing before enabling it. A key is required for remote endpoints.

The model workflow checks out `main` and runs only after a successful CI run on `main`, on its own schedule, or by manual dispatch. It does not run on pull-request code, so model secrets are not intentionally exposed to PR workflows. The model layer remains disabled until valid secrets are configured.

## Evidence and privacy

- Only a bounded selection of tracked text/code files is sent (maximum 30,000 characters).
- Common private-key, token, bearer-token, password/API-key assignment and MongoDB URI patterns are redacted before transmission.
- `.env` files and dependency lockfiles are excluded.
- Redaction is best-effort, not a guarantee. Use only providers whose data-handling terms you have reviewed, and do not point this at repositories containing sensitive code or customer data without approval.
- Provider responses are untrusted suggestions. They are schema-checked and size-limited before entering the report.

## Safety boundaries

- Model agents cannot execute tools, run shell commands, change files, call AEGIS production endpoints, approve transactions, write databases, commit, merge, or deploy.
- Model findings never override the deterministic policy gate.
- A model failure produces a visible review-failed finding; it does not fail open or authorise an action.
- A model's claim is not proof. Verify important findings with tests and human review.
- GitHub Actions uses ephemeral runners. This is scheduled cloud review, not a permanently resident process.

## Reports and local run

The workflow uploads Markdown and JSON reports as artifacts for 14 days. Deterministic tests do not require API keys:

```bash
npm ci
npm test
node swarm/run.mjs
```

Without all three distinct model configurations, the report explicitly identifies deterministic-only or partial model operation.
