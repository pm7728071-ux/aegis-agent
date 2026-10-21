# AEGIS//AGENT SDK

Current dashboard (preview, not yet published): https://id-preview--5e418230-5342-41e8-a5ff-758e8eff2d25.lovable.app

Audit endpoint: https://id-preview--5e418230-5342-41e8-a5ff-758e8eff2d25.lovable.app/api/audit

Public mock threat radar: https://id-preview--5e418230-5342-41e8-a5ff-758e8eff2d25.lovable.app/radar

## Quick start

```javascript
const AegisClient = require('./aegis-sdk.js');
const agent = new AegisClient('AlphaBot');
agent.auditTransaction(150, 'KES').then(console.log);
```

Audits approve or block KES and USD transactions against policy limits. Network failures block by default. The M-Pesa Settle Link is a simulation at 0.50 KES per audit; no real payment bridge or funds transfer is enabled. The radar uses mock traffic.

Run `node test-aegis.js` for a non-mutating invalid-payload endpoint check. After publication, replace the preview origin in the SDK, test script and this document with the verified published origin. Legacy API route shapes remain unchanged.
