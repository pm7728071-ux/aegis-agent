import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();
const app = express();

// 1. GLOBAL MIDDLEWARE
app.use(cors());
app.use(express.json());

// Build-free frontend: index.html + app.js are served straight from the root
const publicPath = __dirname;
app.use(express.static(publicPath));

// Fallback to serve the main HTML file for the app frontend
// (API GETs must fall through to their routes — the original version
// silently hung every GET /api/* request by omitting next())
app.get('*', (req, res, next) => {
  if (!req.url.startsWith('/api')) {
    res.sendFile(path.join(publicPath, 'index.html'));
  } else {
    next();
  }
});

// 2. MONGOOSE CLOUD DATABASE PIPELINE
const MONGO_URI = process.env.MONGO_URI;

mongoose.connect(MONGO_URI)
  .then(() => console.log('🚀 [SECURE LAYER] Aegis Core Cluster Connected to MongoDB Cloud!'))
  .catch(err => console.error('❌ Database Initialization Fault:', err.message));

// 3. TELEMETRY STORAGE STRUCTURE (SCHEMA)
const MetricSchema = new mongoose.Schema({
    id: { type: String, default: "global_metrics" },
    totalTasksAudited: { type: Number, default: 0 },
    totalRevenueKSH: { type: Number, default: 0 },
    sovereignYieldUSD: { type: Number, default: 0 },
    rogueBotsCaught: { type: Array, default: [] }
});

const Metric = mongoose.model('Metric', MetricSchema);

// 3b. POLICY & AUDIT TRAIL STRUCTURES
const PolicySchema = new mongoose.Schema({
    id: { type: String, default: "global_policy" },
    maxAmountLimitKES: { type: Number, default: Number(process.env.POLICY_MAX_TX_KES) || 50000 },
    approvalThresholdKES: { type: Number, default: Number(process.env.POLICY_APPROVAL_THRESHOLD_KES) || 20000 },
    auditTollKES: { type: Number, default: 0.50 },
    fxRateKESPerUSD: { type: Number, default: Number(process.env.FX_RATE_KES_PER_USD) || 130 },
});

const Policy = mongoose.model('Policy', PolicySchema);

const AuditSchema = new mongoose.Schema({
    agentId: { type: String, required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'KES' },
    decision: { type: String, enum: ['APPROVED', 'BLOCKED'], required: true },
    reason: { type: String, default: '' },
    tollKES: { type: Number, default: 0 },
    timestamp: { type: Date, default: Date.now },
});

const Audit = mongoose.model('Audit', AuditSchema);

async function getOrCreateMetrics() {
    let metrics = await Metric.findOne({ id: "global_metrics" });
    if (!metrics) {
        metrics = await Metric.create({ id: "global_metrics" });
    }
    return metrics;
}

async function getOrCreatePolicy() {
    let policy = await Policy.findOne({ id: "global_policy" });
    if (!policy) {
        policy = await Policy.create({ id: "global_policy" });
    }
    return policy;
}

// Defensive timeout — buffered Mongoose ops must never hang the gateway.
// Security philosophy: on fault, block fast rather than wait.
const withTimeout = (promise, ms = 3000) =>
    Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('gateway-timeout')), ms))]);

// 4. API ROUTE PATHS (Placed first so Express hits these endpoints before static files)

app.get('/api/metrics', async (req, res) => {
    try {
        const metrics = await getOrCreateMetrics();
        res.json(metrics);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch cloud analytics cluster data" });
    }
});

app.get('/api/config', async (req, res) => {
    try {
        const policy = await withTimeout(getOrCreatePolicy(), 3000);
        res.json({
            status: "ACTIVE",
            gateway: "Aegis Secure Proxy v1.0.2",
            environment: "Production/Cloud Cluster Sync Operational",
            firewallRulesLoaded: true,
            policy: {
                maxAmountLimitKES: policy.maxAmountLimitKES,
                approvalThresholdKES: policy.approvalThresholdKES,
                auditTollKES: policy.auditTollKES,
                fxRateKESPerUSD: policy.fxRateKESPerUSD,
            },
        });
    } catch (error) {
        // Degraded mode: report env-default policy so consoles still render
        res.json({
            status: "ACTIVE",
            gateway: "Aegis Secure Proxy v1.0.2",
            environment: "Production/Cloud Cluster Sync Operational",
            firewallRulesLoaded: true,
            policy: {
                maxAmountLimitKES: Number(process.env.POLICY_MAX_TX_KES) || 50000,
                approvalThresholdKES: Number(process.env.POLICY_APPROVAL_THRESHOLD_KES) || 20000,
                auditTollKES: 0.50,
                fxRateKESPerUSD: Number(process.env.FX_RATE_KES_PER_USD) || 130,
            },
        });
    }
});

// Policy updates from the admin console / test harness
app.post('/api/config', async (req, res) => {
    try {
        const { maxAmountLimitKES } = req.body || {};
        const parsed = Number(maxAmountLimitKES);
        if (!Number.isFinite(parsed) || parsed <= 0) {
            return res.status(400).json({ error: "Invalid payload: maxAmountLimitKES must be a positive number" });
        }
        const policy = await Policy.findOneAndUpdate(
            { id: "global_policy" },
            { maxAmountLimitKES: parsed },
            { new: true, upsert: true }
        );
        res.json({
            status: "ACTIVE",
            gateway: "Aegis Secure Proxy v1.0.2",
            environment: "Production/Cloud Cluster Sync Operational",
            firewallRulesLoaded: true,
            policy: {
                maxAmountLimitKES: policy.maxAmountLimitKES,
                approvalThresholdKES: policy.approvalThresholdKES,
                auditTollKES: policy.auditTollKES,
                fxRateKESPerUSD: policy.fxRateKESPerUSD,
            },
        });
    } catch (error) {
        res.status(500).json({ error: "Configuration system unreachable" });
    }
});

app.get('/api/audit/recent', async (req, res) => {
    try {
        const audits = await withTimeout(Audit.find().sort({ timestamp: -1 }).limit(15), 3000);
        res.json(audits);
    } catch (error) {
        res.status(500).json({ error: "Audit trail unavailable" });
    }
});

/**
 * The core AEGIS audit gate — the endpoint the SDK calls (POST to the
 * gateway root) before an autonomous agent may touch payment rails.
 * Verdicts are persisted to the immutable audit trail; approved audits
 * settle the 0.50 KES simulation toll. Failures block by default.
 */
async function auditTransactionHandler(req, res) {
    const { agentId, amount, currency, mpesaRecipient } = req.body || {};
    const normalizedAgent = (agentId || '').toString().trim() || 'Unnamed_External_Agent';
    const normalizedCurrency = (currency || 'KES').toString().toUpperCase();
    const numericAmount = Number(amount);

    const reject = async (reason, riskScore = 'CRITICAL_90') => {
        try {
            await withTimeout(Audit.create({ agentId: normalizedAgent, amount: numericAmount, currency: normalizedCurrency, decision: 'BLOCKED', reason }), 2500);
            await withTimeout(Metric.findOneAndUpdate(
                { id: 'global_metrics' },
                { $inc: { totalTasksAudited: 1 }, $push: { rogueBotsCaught: {
                    botId: normalizedAgent, reason, payloadRiskScore: riskScore,
                    channel: 'Policy Gate / ' + (mpesaRecipient ? 'M-Pesa outbound' : 'Direct rail'),
                    timestamp: new Date().toISOString(),
                } } },
                { new: true, upsert: true }
            ), 2500);
        } catch (err) {
            // Trail persistence failed — the verdict below still blocks by default.
        }
        return res.status(403).json({ status: 'BLOCKED', reason, agentId: normalizedAgent });
    };

    try {
        if (amount === undefined || amount === null || !Number.isFinite(numericAmount) || numericAmount <= 0) {
            return reject('Invalid transaction payload: amount must be a positive number');
        }
        if (!['KES', 'USD'].includes(normalizedCurrency)) {
            return reject(`Unsupported currency rail: ${normalizedCurrency}. AEGIS clears KES and USD only.`);
        }
        if (mpesaRecipient && !/^254[0-9]{9}$/.test(String(mpesaRecipient))) {
            return reject('M-Pesa recipient failed validation: expected 2547XXXXXXXX');
        }

        const policy = await withTimeout(getOrCreatePolicy(), 3000);
        const limit = normalizedCurrency === 'KES'
            ? policy.maxAmountLimitKES
            : policy.maxAmountLimitKES / policy.fxRateKESPerUSD;

        if (numericAmount > limit) {
            return reject(
                `Sovereign policy breach: ${numericAmount} ${normalizedCurrency} exceeds the authorized limit of ${limit.toFixed(2)} ${normalizedCurrency}`,
                'CRITICAL_98'
            );
        }

        const toll = policy.auditTollKES;
        const yieldUSD = toll / policy.fxRateKESPerUSD;
        const audit = await Audit.create({
            agentId: normalizedAgent, amount: numericAmount, currency: normalizedCurrency,
            decision: 'APPROVED', reason: 'Within sovereign policy limits', tollKES: toll,
        });
        await Metric.findOneAndUpdate(
            { id: 'global_metrics' },
            { $inc: { totalTasksAudited: 1, totalRevenueKSH: toll, sovereignYieldUSD: yieldUSD } },
            { new: true, upsert: true }
        );

        res.status(200).json({
            status: 'APPROVED',
            reason: 'Transaction within sovereign policy limits',
            agentId: normalizedAgent,
            amount: numericAmount,
            currency: normalizedCurrency,
            tollKES: toll,
            auditId: audit.id,
            settled: false, // M-Pesa Settle Link remains a simulation
        });
    } catch (error) {
        // Safety default: any internal fault freezes the transaction
        return res.status(503).json({
            status: 'BLOCKED',
            reason: 'Policy engine unreachable: defensive freeze engaged, transaction blocked by default',
            agentId: normalizedAgent,
        });
    }
}

app.post('/', auditTransactionHandler);
app.post('/api/audit', auditTransactionHandler);

app.post('/api/intercept', async (req, res) => {
    try {
        const { botId, reason, ipAddress, payloadRiskScore, channel } = req.body;
        
        const newRogueBot = {
            botId: botId || `BOT-${Math.floor(1000 + Math.random() * 9000)}`,
            reason: reason || "Unauthorized critical security protocol escalation",
            ipAddress: ipAddress || req.headers['x-forwarded-for'] || req.socket.remoteAddress,
            payloadRiskScore: payloadRiskScore || "CRITICAL_98",
            channel: channel || "Web3 / M-Pesa Rails",
            timestamp: new Date().toISOString()
        };

        const updateOperations = {};
        updateOperations['$inc'] = { totalTasksAudited: 1 };
        updateOperations['$push'] = { rogueBotsCaught: newRogueBot };

        const updatedMetrics = await Metric.findOneAndUpdate(
            { id: "global_metrics" },
            updateOperations,
            { new: true, upsert: true }
        );

        console.log(`⚠️ [FIREWALL ALERT] Intercepted Rogue Bot: ${newRogueBot.botId}`);
        res.status(201).json({ success: true, message: "Security risk isolated successfully", alert: newRogueBot });
    } catch (error) {
        res.status(500).json({ error: "Security processing engine fault" });
    }
});

app.post('/api/transaction/toll', async (req, res) => {
    try {
        const { amountKSH, yieldUSD } = req.body;
        
        const revenueOperations = {};
        revenueOperations['$inc'] = { 
            totalTasksAudited: 1,
            totalRevenueKSH: amountKSH || 50.00,
            sovereignYieldUSD: yieldUSD || 0.38
        };

        const updatedMetrics = await Metric.findOneAndUpdate(
            { id: "global_metrics" },
            revenueOperations,
            { new: true, upsert: true }
        );

        res.json({ success: true, currentBalance: updatedMetrics });
    } catch (error) {
        res.status(500).json({ error: "Financial settlement layer connection timeout" });
    }
});

// 5. BOOT SERVER INSTANCE
const PORT = process.env.PORT || 4379;
app.listen(PORT, () => {
    console.log(`🛡️ [SYSTEM OPERATIONAL] Aegis Proxy Security Gateway Deployed on Port: ${PORT}`);
});
