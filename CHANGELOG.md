# Changelog

All notable changes to the Aegis Policy Gateway are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/); versions follow semantic versioning.

## [2.7.0] — 2026-10-22

### Added
- Key rotation: POST /api/agents/rotate (live-key auth) issues a new key shown once; the old key dies instantly. 3 rotations/hour/key.
- Per-agent policies: registration accepts policyLimitKES, always capped at the global ceiling; keyed verdicts enforce the agent's limit ("Agent policy breach") and /api/agents/me reports it.
- Per-agent rate limiting: 60 requests/min per key across audit, settle, dashboard and ledger endpoints (429 with BLOCKED status on the transaction gate).
- Key environment tagging: agents are born tagged sandbox or production (from MPESA env) so test keys never masquerade as production credentials.

### Fixed
- Inverted throttle check: fresh keys were throttled on their first request (caught by the security suite, CASE 8).

### Changed
- Security suite extended with CASE 8 (key security, 12 checks) — now 37/37.

## [2.8.0] — 2026-10-24

### Added — market-fit release (docs/MARKET.md)
- Idempotency keys: `x-idempotency-key` on the gate — replays return the original verdict (`idempotentReplay: true`), never a duplicate transaction (24h cache).
- Know-Your-Agent public registry: `GET /api/agents/verify/:agentId` — registration, status, environment, reputation; zero key material.
- Human-in-the-loop approvals: `requireApproval: true` holds a transaction as PENDING_APPROVAL (202); operator `POST /api/transactions/approve` / `deny` (double-approval refused, approval issues a signed warrant).
- Reversible settlements: `POST /api/payments/reversal` — signed single-use reversal warrant, only SETTLED originals, replay refused (409), fully audited (decision REVERSED).
- Agent analytics: `GET /api/agents/me/analytics` — totals, last-24h, top denial reasons.
- Official Python SDK (`aegis_sdk.py`) with offline unit tests (`tests/test_aegis_sdk.py`).
- Market research & product-market-fit document (docs/MARKET.md).

### Changed
- Security suite extended with CASE 9 (market-fit features) — 13 new checks.

### Added
- `tests/security.js`: dedicated automated security suite covering the 7-case security spec — policy ALLOW/DENY, key auth denial, fail-closed under total DB outage (self-spawned chaos instance with unreachable DB), single-use warrant settlement (duplicate transactions impossible), rate-limit/IP-jail triggering with operator unblock, and audit-trail accuracy verification for every decision. 25/25 passing against production.

## [2.6.0] — 2026-10-22

### Added
- Multi-page site: /docs (how it works + full API reference moved off the home page), /help, /feedback, plus nav across all pages
- Help line: developers report issues/crashes at /help — every report lands in the operator console inbox with optional reply-to contact; 48-hour response SLA
- Feature board: developers propose features at /feedback; latest requests shown publicly (messages only, contact info never exposed)
- Operator console: help-line inbox with status workflow (new → reviewed → done)
- Feedback API: POST /api/feedback, GET /api/feedback/recent (public, feature-only), GET /api/admin/feedback + PATCH /api/admin/feedback/:id (operator)

## [2.5.0] — 2026-10-22

### Added
- Signed receipts: every verdict is hashed (HMAC-SHA256) at decision time
- Shareable proof pages: `/verify/:auditId` renders a tamper-evident receipt for any decision; `/api/verify/:auditId` verifies programmatically
- Every APPROVED response now carries `receiptUrl`
- Agent webhooks: register a `webhookUrl` and every verdict fires a signed `verdict.created` event (`X-Aegis-Signature`) to it

## [2.4.0] — 2026-10-22

### Added
- Payment warrants: every APPROVED live verdict now carries a signed, single-use warrant (HMAC-SHA256, 10-minute TTL) binding the verdict to settlement
- Settlement executor `POST /api/payments/settle` — the only door to money movement: no warrant, forged signature, tampered amount, replayed token, or expired warrant all refused
- Atomic single-use claim prevents double-settlement races; every settlement records its authorizing warrant
- `GET /api/warrants/recent` — warrant ledger (admin sees all, agents see their own)

### Fixed
- Graceful shutdown crashed on every deploy (mongoose 8 removed `close()` callbacks) — deploys now drain cleanly

## [2.3.0] — 2026-10-22

### Changed
- Landing page shows only clean product numbers (verdicts, agents, tolls, policy ceiling) — attack counts never appear on the front page
- Landing activity feed shows approved transactions only

### Added
- Security & Transparency page at `/security`: defense-layer summary, threat radar of stopped probes, full verdict history
- Machine-readable live security report at `GET /api/security/report` (JSON) — the verifiable attack record

## [2.2.0] — 2026-10-22

### Security
- Repo-root static serving removed: only `landing.js` and `console.js` are public assets — source files (`engine.js`, configs, data files) are no longer downloadable
- Honeypot perimeter: scanner bait paths (`/.env`, `/.git`, `/wp-admin`, `/phpmyadmin`, …) answer 403 and jail the probing IP for one hour, logged to the threat radar
- Credential brute-force jail: >10 failed key attempts per IP in 10 minutes blocks the IP for 30 minutes (audit gate, agent keys, admin rail)
- Global traffic ceiling: 240 requests/minute per IP blunts scrapers and lightweight DoS
- Content-Security-Policy, HSTS, and Permissions-Policy headers on every response; `x-powered-by` fingerprint removed
- CORS restricted to GET/POST
- User-supplied agent IDs capped at 64 characters
- `/.well-known/security.txt` published for vulnerability reports

## [2.1.0] — 2026-10-22

### Added
- Operations layer: `GET /health` (uptime, DB state), `GET /api/version` (version, commit, runtime)
- Per-request tracing via `X-Request-Id` response headers, included in error bodies
- Graceful shutdown on SIGTERM — connections drain cleanly on every deploy
- JSON 404 for unknown API routes; unhandled faults return a clean 500 and never crash the process
- IntaSend aggregator rail (dormant, fail-closed until configured) for M-Pesa collections without owning a till
- M-Pesa Daraja rail: OAuth token cache, STK push, callback handling, payment records, status query
- Production-readiness test suite (`tests/readiness.js`): 42 checks across authz, fail-closed, rate limits, audit accuracy, key lifecycle

### Changed
- Security headers on all responses (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`)
- Request bodies limited to 100 KB
- Cache policy: all pages/scripts served `no-store, no-cache, must-revalidate, proxy-revalidate`

## [2.0.0] — 2026-10-21

### Added
- Product landing page with live telemetry, playground, and API reference
- Self-service agent registration: `agk_` API keys stored as SHA-256 hashes, shown once
- Live/sandbox audit modes with per-agent attribution and usage counters (`GET /api/agents/me`)
- Rate limiting: sandbox 20/min per IP, agents 120/min, registrations 10/hour
- Operator console at `/console`; admin-key-gated intercept, settlement, and policy rail
- Immutable audit trail with per-decision explanations

### Security
- Fixed leaked database credentials in public Git history (purged + rotated + verified)
- Leaked OpenAI key revoked with confirmed zero misuse
- Fail-closed philosophy end to end: any fault blocks, nothing ever authorizes silently

## [1.0.0] — 2026-10-21

### Added
- Aegis policy audit gate: transaction vetting against live policy limits, KES/USD rails
- MongoDB persistence: metrics, policy, audit records
- Boot-time gateway banner and status console
