# Aegis — Market Research & Product-Market Fit (2026-10-24)

Research-driven feature plan based on a scan of global agent-payments trends
and the Kenyan fintech landscape.

## What the market is telling us

**Global (the window is now):**
- Visa, Mastercard and Ant International are jointly building a **"Know Your Agent"**
  framework so payment networks can verify AI agents *before* they spend.
- Mastercard's Agent Pay registers and tokenizes agents and sells **"Verifiable Intent"**
  (proving what a user authorized). Aegis's signed single-use warrants are verifiable
  intent — open and free.
- Analysts project AI agents orchestrating **$3–5 trillion** in consumer commerce at scale;
  138M payments have already flowed through agent rails in 2026.
- The loudest enterprise asks: **idempotency** (no duplicate charges from retries),
  **disputes/reversals** for agent transactions, **spend visibility**, and
  **approval-before-payment** workflows.

**Kenya (home advantage):**
- CBK is formalizing a licensing regime (National Payment Systems Act amendments) and a
  single interoperable QR standard — compliance pressure favors a control *layer* like
  Aegis that sits beside licensed PSPs rather than becoming one.
- M-Pesa dominates; Daraja is the developer rail. Reversals and disputes are a daily
  cultural reality in Kenyan mobile money — the reversal warrant maps directly onto it.
- Kenya's policy conversation is "ethical AI in payments" + "independent evaluation
  systems" — Aegis's public test suite and transparency wall ARE that story.

## Features shipped in response (v2.8.0 — all tested in CASE 9)

| Market need | Aegis feature |
|---|---|
| Know Your Agent (Visa/MC) | Public `GET /api/agents/verify/:agentId` registry: registration, status, reputation — no key material |
| Verifiable Intent (Mastercard) | Signed single-use payment warrants (existing) + now signed reversal warrants |
| Approval-before-payment | `requireApproval: true` holds transactions as PENDING_APPROVAL; operator `/api/transactions/approve` / `deny` |
| Duplicate-charge protection | `x-idempotency-key`: replays return the original verdict, never a second transaction |
| Disputes & chargebacks | `POST /api/payments/reversal` — only SETTLED transactions, single-use, fully audited |
| Spend visibility | `GET /api/agents/me/analytics` — totals, 24h window, top denial reasons |
| Developer adoption (KE) | Official Python SDK (`aegis_sdk.py`) + JS SDK, fail-closed by design |

## Positioning

> Aegis is the open, fail-closed policy gate for agents that move money on M-Pesa:
> everything the card networks are building for agents — identity, verifiable intent,
> approvals, reversals — as a free API any Kenyan or global developer can call in
> five minutes.

Competitive frame:
- **Mastercard Agent Pay / Visa KYA**: closed network programs for big issuers; Aegis is
  the open equivalent any solo developer can integrate today.
- **Agentcard / agent-card products**: hold the *money* (card vaults); Aegis holds the
  *policy* — complementary, not competing.
- **Chargeback SaaS (Triple, TFSF)**: charge per dispute at scale; Aegis prevents the
  dispute before settlement — reversal included.

## Market value model (for production)

- **Revenue model**: the existing micro-toll (KES 0.50 per audited task today).
  At production scale: toll tiers instead of flat pricing — free ≤1k verdicts/month,
  then volume-toll + SLA tiers. Kenyan developers get the free tier permanently.
- **Value anchor**: one prevented runaway-agent incident pays for a year of tolls.
  M-Pesa reversal handling and dispute evidence (signed receipts) is the wedge that
  Kenyan PSPs and SMEs feel daily.
- **TAM sketch**: agent-orchestrated commerce $3–5T (global analyst range) → even a
  rounding-error share of KE agent transactions at KES 0.50/verdict is a real business;
  the near-term beachhead is Kenyan devs building M-Pesa agents (the Daraja community)
  before production Go-Live.
- **Moat for the next years**: the 60-day evidence program (docs/ROADMAP.md) — published
  baselines, reproducible suites, and public transparency — builds the trust that
  closed competitors cannot fake.

## Next market steps (post-production Go-Live)
1. Publish the CASE 9 market-fit demo end-to-end (register → approve → settle → reverse).
2. Pitch the KYA registry to Kenyan PSPs as their agent-onboarding check.
3. Track: verdicts/week, registered agents, reversal rate, approval-queue latency.
