const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

// 1. GLOBAL MIDDLEWARE
app.use(cors()); 
app.use(express.json()); 

// 2. MONGOOSE CLOUD DATABASE PIPELINE
const MONGO_URI = process.env.MONGO_URI;

mongoose.connect(MONGO_URI)
  .then(() => console.log('🚀 [SECURE LAYER] Aegis Core Cluster Connected to MongoDB Cloud!'))
  .catch(err => console.error('❌ Database Initialization Fault:', err));

// 3. TELEMETRY STORAGE STRUCTURE (SCHEMA)
const MetricSchema = new mongoose.Schema({
    id: { type: String, default: "global_metrics" },
    totalTasksAudited: { type: Number, default: 0 },
    totalRevenueKSH: { type: Number, default: 0 },
    sovereignYieldUSD: { type: Number, default: 0 },
    rogueBotsCaught: { type: Array, default: [] } 
});

const Metric = mongoose.model('Metric', MetricSchema);

async function getOrCreateMetrics() {
    let metrics = await Metric.findOne({ id: "global_metrics" });
    if (!metrics) {
        metrics = await Metric.create({ id: "global_metrics" });
    }
    return metrics;
}

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
        res.json({
            status: "ACTIVE",
            gateway: "Aegis Secure Proxy v1.0.2",
            environment: "Production/Cloud Cluster Sync Operational",
            firewallRulesLoaded: true
        });
    } catch (error) {
        res.status(500).json({ error: "Configuration system unreachable" });
    }
});

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
        updateOperations['\$inc'] = { totalTasksAudited: 1 };
        updateOperations['\$push'] = { rogueBotsCaught: newRogueBot };

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
        revenueOperations['\$inc'] = { 
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

// 5. STATIC FILES LAYER (Placed last so it acts as a fallback)
app.use(express.static(path.join(__dirname))); 

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 6. BOOT SERVER INSTANCE
const PORT = process.env.PORT || 4379; 
app.listen(PORT, () => {
    console.log(`🛡️ [SYSTEM OPERATIONAL] Aegis Proxy Security Gateway Deployed on Port: ${PORT}`);
});
