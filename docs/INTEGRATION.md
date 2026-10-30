# AEGIS action-guard integration

This guide connects an existing agent or backend to the deterministic AEGIS action policy. It uses the public API and Node.js built-ins only; no paid model provider or SDK is required.

## 1. Register an agent

Register once with `POST /api/agents/register` and store the returned API key in your application's secret manager or environment. The key is shown once. Never commit it to source control or send it to a browser.

## 2. Ask AEGIS before a consequential action

The guard requires all three values:
- A registered agent's bearer API key.
- An `X-Idempotency-Key` that stays the same for retries of the same logical operation.
- An allowlisted action name and an opaque resource reference.

Example request:

```bash
curl -i -X POST https://aegis-agent-4u79.onrender.com/api/guard/action \
  -H "Authorization: Bearer $AEGIS_AGENT_KEY" \
  -H "Content-Type: application/json" \
  -H "X-Idempotency-Key: property-hold-2026-001" \
  -d '{"action":"crm.property.hold","resourceRef":"property-opaque-123"}'
```

A successful safe action returns `200` and `decision: "APPROVED"`. Consequential actions such as `crm.payment.initiate`, `crm.lease.sign`, and `crm.booking.confirm` return `202` and `PENDING_APPROVAL`. Unknown actions are denied with `403`. Missing identity, database faults, and persistence failures do not approve actions.

## 3. Enforce the verdict in your backend

The application that requested the verdict must enforce it. Do not treat a network response, a timeout, a malformed body, or any non-APPROVED verdict as permission.

Node.js 20+ example:

```js
import { randomUUID } from "node:crypto";

const AEGIS_URL = "https://aegis-agent-4u79.onrender.com";
const AEGIS_AGENT_KEY = process.env.AEGIS_AGENT_KEY;

export async function requestActionPermission(action, resourceRef) {
  if (!AEGIS_AGENT_KEY) throw new Error("AEGIS_AGENT_KEY is not configured");

  // Create once per logical operation and reuse this key for retries.
  const idempotencyKey = randomUUID();

  let response;
  try {
    response = await fetch(`${AEGIS_URL}/api/guard/action`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${AEGIS_AGENT_KEY}`,
        "content-type": "application/json",
        "x-idempotency-key": idempotencyKey
      },
      body: JSON.stringify({ action, resourceRef }),
      signal: AbortSignal.timeout(5000)
    });
  } catch {
    throw new Error("AEGIS unavailable; action denied by client");
  }

  let verdict;
  try {
    verdict = await response.json();
  } catch {
    throw new Error("Invalid AEGIS response; action denied by client");
  }

  if (response.status !== 200 || verdict.decision !== "APPROVED") {
    throw new Error(`Action not approved: ${verdict.reason || response.status}`);
  }

  return verdict;
}
```

Only call your own action executor after `requestActionPermission` returns successfully. A pending approval is not an approval. The operator approval process must be completed separately before the application proceeds.

## 4. Verdict reference

| HTTP status | Decision | Client behavior |
|---|---|---|
| 200 | APPROVED | May proceed with the exact action/resource that was checked |
| 202 | PENDING_APPROVAL | Pause; wait for the human approval workflow |
| 400 | BLOCKED | Fix the request; do not retry unchanged |
| 401 / 403 | BLOCKED | Stop; verify agent credentials and policy |
| 409 | BLOCKED | Idempotency key was reused for a different action/resource |
| 429 | — | Back off; retry the same logical operation with the same idempotency key |
| 503 / timeout / invalid response | BLOCKED by client | Fail closed; do not execute |

## 5. Integration safety notes

- Keep the API key on a trusted server, never in frontend JavaScript or a mobile app bundle.
- Use an opaque resource reference. AEGIS stores a hash of it, but do not send names, phone numbers, lease documents, or other personal data.
- Reuse the same idempotency key only for retries of the same action and resource. A different operation needs a new key.
- AEGIS is a policy decision and audit layer. Your backend must still implement the approval queue, enforce verdicts, and protect the action executor.
- This integration guide does not establish that a live integration has been independently penetration-tested. Test in a non-production environment before relying on it for consequential operations.
