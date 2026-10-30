# AEGIS Swarm Core

## What it is

AEGIS Swarm Core is a zero-inference-cost, cloud-hosted repository audit workflow. GitHub Actions runs it on pushes to `main`, pull requests targeting `main`, manual dispatch, and a six-hour schedule. It uses the standard GitHub-hosted runner and the repository's existing Node toolchain; it does not require your computer to stay online.

## Specialist roles

- **SENTINEL** — high-confidence exposed-secret pattern checks, dynamic-code-execution indicators, and production dependency audit.
- **FORGE** — package-script and maintainability checks.
- **ATLAS** — JavaScript syntax checks and the existing action-guard policy tests.
- **NEXUS** — repository structure and large-module indicators.
- **ORACLE** — project documentation completeness checks.
- **COMMANDER** — aggregates findings and assigns an overall triage status.

## Cost and model honesty

Version 1 makes no external LLM/API calls and has no paid model dependency. These are deterministic specialist automation agents, not six independent frontier-language-model instances. This is intentional: it gives the public repository a usable, repeatable baseline without API keys or recurring inference charges. It does not claim to perform live competitor research or understand arbitrary code like a senior engineer.

A later model-backed version must use a separately evaluated inference provider or self-hosted compute. Always verify its current pricing, usage limits, data handling and availability before enabling it; do not put API keys in repository files.

## Reports

Each run uploads `swarm-report.md` and `swarm-report.json` as a GitHub Actions artifact for 14 days. Open the repository's **Actions → AEGIS Swarm → latest run → Artifacts** to inspect the report.

## Safety boundaries

- Workflow permissions are read-only for repository contents.
- Checkout credentials are not persisted.
- No production secrets or customer database are provided to agents.
- Agents do not write source files, commit, push, open/merge PRs, or deploy.
- Findings are triage signals and require human verification.
- The workflow runs on GitHub-hosted ephemeral runners; it is scheduled monitoring, not a continuously resident process. Scheduled starts may be delayed by GitHub.
- A green run does not prove AEGIS is secure. The scanner has false negatives and false positives.

## Local run

```bash
npm ci
npm run test:swarm
node swarm/run.mjs
```
