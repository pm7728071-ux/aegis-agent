# Aegis//Agent SDK (JavaScript) 🛡️🤖

The official Developer Connection Kit to secure and audit autonomous machine transactions in under **2 milliseconds**. Route, verify, and settle AI agent financial traffic through a compliant proxy tier backed by live **Crypto & M-Pesa** transaction gateways.

📊 **Live Dashboard Monitoring:** [Aegis//Agent Dashboard](https://aegis-agent-4u79.onrender.com)

---

## Features
- **Multi-Bot Scope Filter Core:** Seamlessly segregate traffic across independent agent profiles.
- **Dual Currency Toll Engines:** Native accounting processing for both **KES** and **USD** transaction fields.
- **Failsafe Security Proxy:** Real-time transaction validation layer protecting downstream payment rails from runaway automated bot logic.

## Quick Start Installation

For now, simply drop the connection client file into your local project environment:

```javascript
const AegisClient = require('./index.js');

// 1. Initialize your autonomous agent profile
const agent = new AegisClient('AlphaBot');

// 2. Intercept and audit an automated transaction payload
(async () => {
    const assessment = await agent.auditTransaction(150, "KES", "2547XXXXXXXX");
    console.log("Aegis Security Verdict:", assessment);
})();
```
