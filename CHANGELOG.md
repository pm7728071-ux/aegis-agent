# Changelog

All notable changes to the Aegis Policy Gateway are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/); versions follow semantic versioning.

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
