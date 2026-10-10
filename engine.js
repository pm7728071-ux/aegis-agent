const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = 3000;

app.use(express.json());
const DB_FILE = path.join(__dirname, 'database.json');
const TOLL_RATE_USD = 0.002; 
const KSH_EXCHANGE_RATE = 129.50;

const BLACKLISTED_CRYPTO_WALLETS = [
    "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
    "0x71C7656EC7ab88b098defB751B7401B5f6d8976F"
];

// High-Speed Memory Storage to Track Agent Request Frequencies
const agentRequestHistory = {};

if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ 
        config: { maxAmountLimitKES: 1300 }, 
        metrics: { totalTransactionsAudited: 0, totalRevenueUSD: 0 },
        logs: []
    }, null, 2));
}

function readDB() { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
function writeDB(data) { fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2)); }

app.post('/api/verify-transaction', (req, res) => {
    const { agentId, amount, currency, cryptoWallet } = req.body;
    const db = readDB();
    let auditResult = {};
    let amountInKES = currency === "USD" ? amount * KSH_EXCHANGE_RATE : amount;

    console.log(`[AegisAgent Engine] Intercepting request from: ${agentId}`);

    // CIRCUIT BREAKER ALGORITHM (Rate Limiting Filter)
    const now = Date.now();
    if (!agentRequestHistory[agentId]) {
        agentRequestHistory[agentId] = [];
    }

    // Filter out requests older than 5 seconds
    agentRequestHistory[agentId] = agentRequestHistory[agentId].filter(timestamp => now - timestamp < 5000);
    
    // Add current request timestamp to history log
    agentRequestHistory[agentId].push(now);

    // CRITICAL TRIGGER: If agent triggers more than 3 requests in 5 seconds, trip the breaker!
    if (agentRequestHistory[agentId].length > 3) {
        auditResult = {
            agentId, requestedAmount: amount, currency, amountInKES: Math.round(amountInKES),
            status: "BLOCKED", timestamp: new Date().toLocaleTimeString(),
            reason: "CRITICAL BREAKER TRIPPED: Agent activity spiking exponentially! High-frequency loop attack frozen for system protection."
        };
    }
    // CHECK 2: Fraudulent Crypto Wallet Detection
    else if (cryptoWallet && BLACKLISTED_CRYPTO_WALLETS.includes(cryptoWallet)) {
        auditResult = {
            agentId, requestedAmount: amount, currency, amountInKES: Math.round(amountInKES),
            status: "BLOCKED", timestamp: new Date().toLocaleTimeString(),
            reason: `CRITICAL BLOCK: Malicious Web3 Crypto Wallet Detected (${cryptoWallet.substring(0,6)}...)!`
        };
    } 
    // CHECK 3: Financial Threshold Guardrail
    else if (amountInKES > db.config.maxAmountLimitKES) {
        auditResult = {
            agentId, requestedAmount: amount, currency, amountInKES: Math.round(amountInKES),
            status: "BLOCKED", timestamp: new Date().toLocaleTimeString(),
            reason: `Violation: Request of ${Math.round(amountInKES)} KES breaches ceiling of ${db.config.maxAmountLimitKES} KES.`
        };
    } 
    // APPROVED PARAMETERS
    else {
        auditResult = {
            agentId, requestedAmount: amount, currency, amountInKES: Math.round(amountInKES),
            status: "APPROVED", timestamp: new Date().toLocaleTimeString(),
            reason: "Transaction scales safely within authorized system thresholds."
        };
    }

    auditResult.tollFeeUSD = TOLL_RATE_USD;
    db.metrics.totalTransactionsAudited += 1;
    db.metrics.totalRevenueUSD += TOLL_RATE_USD;
    db.logs.unshift(auditResult);
    writeDB(db);
    res.json(auditResult);
});

app.get('/api/metrics', (_req, res) => {
    const db = readDB();
    const revUSD = db.metrics.totalRevenueUSD;
    res.json({ totalTransactionsAudited: db.metrics.totalTransactionsAudited, totalRevenueUSD: revUSD.toFixed(4), totalRevenueKSH: (revUSD * KSH_EXCHANGE_RATE).toFixed(2) });
});
app.get('/api/config', (_req, res) => res.json(readDB().config));
app.get('/api/logs', (_req, res) => res.json(readDB().logs));
app.post('/api/config', (req, res) => {
    const db = readDB();
    db.config.maxAmountLimitKES = Number(req.body.maxAmountLimitKES);
    writeDB(db);
    res.json({ success: true, updatedConfig: db.config });
});

app.get('/', (_req, res) => {
    const db = readDB();
    res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8"><title>AegisAgent Dashboard</title>
        <style>
            body { font-family: system-ui, sans-serif; background-color: #0f172a; color: #f8fafc; padding: 40px; margin: 0; }
            .container { max-width: 950px; margin: 0 auto; }
            header { display: flex; justify-content: space-between; border-bottom: 2px solid #1e293b; padding-bottom: 20px; margin-bottom: 30px; }
            h1 { color: #38bdf8; margin: 0; font-size: 26px; }
            .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 30px; }
            .card { background: #1e293b; border-radius: 12px; padding: 24px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.3); }
            .val { font-size: 32px; font-weight: bold; color: #38bdf8; margin-top: 8px; font-family: monospace; }
            input { background: #0f172a; border: 1px solid #334155; border-radius: 6px; color: #fff; padding: 12px; font-size: 16px; width: 160px; margin-right: 12px; }
            button { background: #0284c7; border: none; color: white; padding: 12px 24px; font-weight: 600; border-radius: 6px; cursor: pointer; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            th { text-align: left; background: #334155; padding: 12px; color: #cbd5e1; }
            td { padding: 12px; border-bottom: 1px solid #334155; font-size: 14px; }
            .status-APPROVED { color: #4ade80; font-weight: bold; }
            .status-BLOCKED { color: #f87171; font-weight: bold; background: rgba(248,113,113,0.1); padding: 4px 8px; border-radius: 4px; }
        </style>
    </head>
    <body>
        <div class="container">
            <header><h1>AEGIS//AGENT — SYSTEM CORE MONITOR</h1></header>
            <div class="grid">
                <div class="card"><div>Audited Bot Requests</div><div class="val" id="countVal">0</div></div>
                <div class="card"><div>Toll Revenue (USD)</div><div class="val" id="revUSDVal">$0.0000</div></div>
                <div class="card"><div>Yield (Kenyan Shilling)</div><div class="val" style="color:#4ade80;" id="revKSHVal">KSh 0.00</div></div>
            </div>
            <div class="card" style="margin-bottom:30px;">
                <h2>Dynamic Guardrail Configuration</h2>
                <input type="number" id="limitInput" value="\${db.config.maxAmountLimitKES}">
                <button onclick="updateConfig()">Update System Rules</button>
            </div>
            <div class="card">
                <h2>Real-Time Intercept Logs</h2>
                <table>
                    <thead><tr><th>Timestamp</th><th>Agent Identifier</th><th>Payload Value</th><th>Status Flag</th><th>Engine Verdict Notes</th></tr></thead>
                    <tbody id="logBody"><tr><td colspan="5" style="text-align:center;">Awaiting network traffic...</td></tr></tbody>
                </table>
            </div>
        </div>
        <script>
            function updateConfig() {
                const limit = document.getElementById('limitInput').value;
                fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ maxAmountLimitKES: limit }) }).then(() => alert('System parameters locked!'));
            }
            function refresh() {
                fetch('/api/metrics').then(res => res.json()).then(m => {
                    document.getElementById('countVal').innerText = m.totalTransactionsAudited;
                    document.getElementById('revUSDVal').innerText = '$' + m.totalRevenueUSD;
                    document.getElementById('revKSHVal').innerText = 'KSh ' + m.totalRevenueKSH;
                });
                fetch('/api/logs').then(res => res.json()).then(logs => {
                    const tbody = document.getElementById('logBody');
                    if(logs.length === 0) return;
                    tbody.innerHTML = logs.map(log => \`
                        <tr>
                            <td>\${log.timestamp}</td>
                            <td style="color:#38bdf8; font-family:monospace;">\${log.agentId}</td>
                            <td>\${log.requestedAmount} \${log.currency} (\${log.amountInKES} KES)</td>
                            <td><span class="status-\${log.status}">\${log.status}</span></td>
                            <td style="color:#94a3b8; font-size:13px;">\${log.reason}</td>
                        </tr>
                    \`).join('');
                });
            }
            setInterval(refresh, 2000); refresh();
        </script>
    </body>
    </html>
    `);
});

app.listen(PORT, () => console.log('\n[AegisAgent Phase-1 Protected Engine Online]\n👉 View Dashboard at: http://localhost:3000'));
