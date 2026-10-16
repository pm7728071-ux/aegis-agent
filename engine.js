const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = 3000;

app.use(express.json());

const DB_FILE = path.join(__dirname, 'database.json');
const REGIONAL_TOLL_RATE_KSH = 1.00; 
const KSH_EXCHANGE_RATE = 129.50;

const BLACKLISTED_MPESA_NUMBERS = ["254712345678", "254799999999"];
const multiAgentRequestHistory = {};

function getDefaultDB() {
    return { 
        config: { maxAmountLimitKES: 1300 }, 
        metrics: { totalTransactionsAudited: 0, totalRevenueKSH: 0 },
        logs: []
    };
}

if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(getDefaultDB(), null, 2));
}

function readDB() { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
function writeDB(data) { fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2)); }

app.post('/api/verify-transaction', (req, res) => {
    const { agentId, amount, currency, mpesaRecipient } = req.body;
    const db = readDB();
    let o = {};
    let amountInKES = currency === "USD" ? amount * KSH_EXCHANGE_RATE : amount;
    const activeAgent = agentId || "Unknown_Autonomous_Bot";

    const now = Date.now();
    if (!multiAgentRequestHistory[activeAgent]) multiAgentRequestHistory[activeAgent] = [];
    multiAgentRequestHistory[activeAgent] = multiAgentRequestHistory[activeAgent].filter(t => now - t < 5000);
    multiAgentRequestHistory[activeAgent].push(now);

    if (multiAgentRequestHistory[activeAgent].length > 3) {
        o = { agentId: activeAgent, requestedAmount: amount, currency, amountInKES: Math.round(amountInKES), status: "BLOCKED", timestamp: new Date().toLocaleTimeString(), reason: "CRITICAL CIRCUIT BREAKER: Velocity threshold exceeded! Isolated bot frozen." };
    } else if (mpesaRecipient && BLACKLISTED_MPESA_NUMBERS.includes(mpesaRecipient)) {
        o = { agentId: activeAgent, requestedAmount: amount, currency, amountInKES: Math.round(amountInKES), status: "BLOCKED", timestamp: new Date().toLocaleTimeString(), reason: `M-Pesa Outbound Target (${mpesaRecipient}) matches profile on National Fraud Risk Registry!` };
    } else if (amountInKES > db.config.maxAmountLimitKES) {
        o = { agentId: activeAgent, requestedAmount: amount, currency, amountInKES: Math.round(amountInKES), status: "BLOCKED", timestamp: new Date().toLocaleTimeString(), reason: `Guardrail Ceiling Breach: Request breaches threshold parameter limit of ${db.config.maxAmountLimitKES} KES.` };
    } else {
        o = { agentId: activeAgent, requestedAmount: amount, currency, amountInKES: Math.round(amountInKES), status: "APPROVED", timestamp: new Date().toLocaleTimeString(), reason: "Transaction metrics clear. Data packet scales safely within authorized system bounds." };
    }

    o.tollFeeKSH = REGIONAL_TOLL_RATE_KSH;
    db.metrics.totalTransactionsAudited += 1;
    db.metrics.totalRevenueKSH += REGIONAL_TOLL_RATE_KSH;
    db.logs.unshift(o);
    writeDB(db);
    res.json(o);
});

// NATIVE BACKEND ROUTE TO CLEAN AUDIT MEMORY SAFELY
app.post('/api/reset-logs', (_req, res) => {
    const db = readDB();
    db.logs = []; // Clears the list completely
    writeDB(db);
    res.json({ success: true });
});

app.get('/api/export-csv', (_req, res) => {
    const db = readDB();
    if (db.logs.length === 0) return res.status(400).send("No auditing evidence recorded inside ledger cache yet.");
    const headers = "Timestamp,Agent Identifier,Payload Value,Currency,Converted KES,Status Flag,Notes\n";
    const rows = db.logs.map(l => `"${l.timestamp}","${l.agentId}","${l.requestedAmount}","${l.currency}","${l.amountInKES}","${l.status}","${l.reason}"`).join("\n");
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=AEGIS_MULTI_BOT_AUDIT_${Date.now()}.csv`);
    res.status(200).send(headers + rows);
});

app.get('/api/metrics', (_req, res) => {
    const db = readDB();
    const revKSH = db.metrics.totalRevenueKSH;
    res.json({ totalTransactionsAudited: db.metrics.totalTransactionsAudited, totalRevenueKSH: revKSH.toFixed(2), totalRevenueUSD: (revKSH / KSH_EXCHANGE_RATE).toFixed(4) });
});
app.get('/api/config', (_req, res) => res.json(readDB().config));
app.get('/api/logs', (_req, res) => res.json(readDB().logs));
app.post('/api/config', (req, res) => {
    const db = readDB();
    db.config.maxAmountLimitKES = Number(req.body.maxAmountLimitKES);
    writeDB(db);
    res.json({ success: true });
});

app.get('/', (_req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });

app.listen(PORT, () => console.log('\n=======================================================\n🚀 [AEGISAGENT JUGGERNAUT MASTERPIECE LIVE]\n📊 Architectural Tier: Multi-Bot Scope Filter Core\n💰 Revenue Engine Model: Fixed 1.00 KSh Per Bot Task\n🧹 Memory Flush Engine: Online\n👉 Local Control Room Port Address: http://localhost:3000\n========================================================'));
