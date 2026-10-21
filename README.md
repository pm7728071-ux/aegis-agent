# AEGIS//AGENT SDK

Live gateway & security console: https://aegis-agent-4u79.onrender.com

Audit endpoint: POST https://aegis-agent-4u79.onrender.com/api/audit
(the gateway root also accepts POST — this is what the SDK sends)

Payload: `{"agentId":"AlphaBot","amount":150,"currency":"KES","mpesaRecipient":"254712345678"}`

Verdict: `{"status":"APPROVED"|"BLOCKED","reason":"..."}` — policy limits, currency
and M-Pesa recipients are validated, verdicts persist to the audit trail, and
any gateway fault blocks the transaction by default. Policy limits live in the
`policy` object on `/api/config` and can be tightened via POST `/api/config`
with `{"maxAmountLimitKES": 7500}`.

## Quick start

```javascript
const AegisClient = require('./aegis-sdk.js');
const agent = new AegisClient('AlphaBot');
agent.auditTransaction(150, 'KES').then(console.log);
```

Audits approve or block KES and USD transactions against policy limits. Network failures block by default. The M-Pesa Settle Link is a simulation at 0.50 KES per audit; no real payment bridge or funds transfer is enabled. The radar uses mock traffic.

Run `node test-aegis.js` for a non-mutating invalid-payload endpoint check. After publication, replace the preview origin in the SDK, test script and this document with the verified published origin. Legacy API route shapes remain unchanged.
