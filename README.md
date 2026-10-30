# Aegis — The Policy Gate for Autonomous Agents

Every transaction an autonomous agent attempts is checked against a live
policy limit **before** it touches payment rails, and the verdict is written
to an immutable audit trail. If the gate is unreachable, it **blocks by
default** — money never passes silently.

**Live gateway:** https://aegis-agent-4u79.onrender.com

- `/` — product page: live network stats, playground, self-service API key
- `/console` — operator console (intercept + settlement, admin-key protected)

## Use it (60 seconds)

```bash
# 1. Register an agent — key shown exactly once
curl -X POST https://aegis-agent-4u79.onrender.com/api/agents/register \
  -H 'Content-Type: application/json' -d '{"name": "MyAgent"}'

# 2. Gate every transaction — act only on APPROVED
curl -X POST https://aegis-agent-4u79.onrender.com/api/audit \
  -H "Authorization: Bearer agk_YOUR_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"amount": 4500, "currency": "KES"}'
```

Sandbox calls (no key) are welcome — rate-limited to 20/min per IP and fully
audited. Registered agents: 120/min, per-agent attribution and usage counters
via `GET /api/agents/me`.

## Endpoints

| Endpoint | Auth | Purpose |
|---|---|---|
| `POST /api/agents/register` | none | Issue agent ID + API key (stored as SHA-256 hash) |
| `POST /api/audit` | bearer (optional) | The financial transaction gate — APPROVED / BLOCKED |
| `POST /api/guard/action` | registered agent bearer required | Deterministic action policy gate for connected agent applications; requires `X-Idempotency-Key`; unknown actions block; consequential actions return `PENDING_APPROVAL` |
| `GET /api/agents/me` | bearer | Agent usage counters |
| `GET /api/audit/recent` | none | Last 15 verdicts (immutable trail) |
| `GET /api/network/stats` | none | Public telemetry |
| `GET /api/config` | none | Live policy limits |
| `POST /api/config`, `POST /api/intercept`, `POST /api/transaction/toll` | admin key | Operator rail (fail-closed) |

## Connected-agent action guard

This endpoint is covered by the repository's Node CI workflow and focused policy tests. A passing unit test validates the static action map only; staging checks are still required to verify registered-agent authentication, MongoDB persistence, index creation, and idempotent replay behavior.

Registered agents can call `POST /api/guard/action` with `{ "action": "crm.external_commitment", "resourceRef": "opaque-reference" }` and a unique `X-Idempotency-Key`. The gate stores a durable verdict before responding. Unknown action names are blocked; supported consequential actions return `PENDING_APPROVAL`; only explicitly safe actions in the fixed policy are approved. The resource reference is stored as a hash, not raw CRM/customer data. This endpoint is a policy decision and audit layer; it does not itself send messages, book viewings, sign leases, or move money. The integrating application must enforce the verdict and keep its own human-approval workflow.

A copy-paste Node.js integration walkthrough, including fail-closed client handling and verdict meanings, is available in [docs/INTEGRATION.md](docs/INTEGRATION.md).

To remove only generated local audit reports and Python bytecode caches, run `npm run clean`. This does not remove source files, dependencies, environment files, or user data.

## Security model

- **Fail-closed:** any database or policy fault → verdict is BLOCKED, fast.
- **Keys are hashed:** only SHA-256 hashes are stored; keys are shown once.
- **Rate limits:** sandbox 20/min per IP; registration 10/hour per IP; live agents 120/min.
- **Admin rail:** intercept / settlement / policy edits require `ADMIN_API_KEY` (set in the host env).

## Environment variables

- `MONGO_URI` — MongoDB Atlas connection string (required)
- `ADMIN_API_KEY` — operator key for the admin rail
- `POLICY_MAX_TX_KES` (default 50000), `POLICY_APPROVAL_THRESHOLD_KES` (20000), `FX_RATE_KES_PER_USD` (130)

## Operations

| Signal | Endpoint |
|---|---|
| Health (uptime, DB state) | `GET /health` |
| Version + commit | `GET /api/version` |
| Request tracing | `X-Request-Id` on every response |
| Unknown API routes | JSON 404 with `requestId` |
| Deploys | Graceful SIGTERM drain — no dropped connections |

Every request carries an `X-Request-Id`; unhandled faults return a clean JSON 500 and never
crash the process. See [CHANGELOG.md](CHANGELOG.md) for release history.

## Run locally

```bash
npm install
echo "MONGO_URI=mongodb+srv://..." > .env
node engine.js
```

Build-free by design: the frontend is static `index.html` + `landing.js` +
`console.html` + `console.js`, served by the same Express process.


## Independent AI reasoning layer

An optional three-role model review (security, architecture, adversarial review) is available through separate OpenAI-compatible HTTPS endpoints. Each role requires a distinct endpoint/model pair and its own GitHub Actions secrets. It is disabled until configured, runs from trusted `main` code, and cannot execute actions or override the deterministic policy gate. See [docs/SWARM.md](docs/SWARM.md) for configuration, evidence redaction and safety limits.
