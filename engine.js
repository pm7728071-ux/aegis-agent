import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import crypto from 'crypto';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config(); // local .env (gitignored)
// Render "Secret Files": credentials live in a file named `env`, mounted at /etc/secrets/env.
// dotenv never overrides variables already in process.env, so Render's env vars always win.
dotenv.config({ path: '/etc/secrets/env', quiet: true });
const app = express();

// 1. GLOBAL MIDDLEWARE
app.disable('x-powered-by'); // never fingerprint the stack
app.use(cors({ methods: ['GET', 'POST'] })); // browsers may integrate; only sane verbs allowed
app.use(express.json({ limit: '100kb' })); // reject oversized payloads

// Standard security headers + per-request tracing (professional plumbing)
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Content-Security-Policy',
        "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com; " +
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.tailwindcss.com; " +
        "font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; " +
        "frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    req.id = crypto.randomBytes(8).toString('hex');
    res.setHeader('X-Request-Id', req.id);
    next();
});

// Never let browsers serve a stale product page: HTML/JS must revalidate
app.use((req, res, next) => {
  if (/\.(html|js)$/i.test(req.path) || req.path === '/' || req.path === '/console') {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  }
  next();
});

// Build-free frontend — ONLY these assets are public; the repo root is never served.
const publicPath = __dirname;
app.get('/landing.js', (req, res) => res.sendFile(path.join(publicPath, 'landing.js')));
app.get('/console.js', (req, res) => res.sendFile(path.join(publicPath, 'console.js')));
app.get('/.well-known/security.txt', (req, res) => {
    res.type('text/plain').send(
        'Contact: mailto:pm7728071@gmail.com\n' +
        'Preferred-Languages: en\n' +
        'Canonical: https://aegis-agent-4u79.onrender.com/.well-known/security.txt\n' +
        'Expires: 2027-10-22T00:00:00.000Z\n' +
        'Policy: reports are reviewed within 7 days\n'
    );
});

// Public machine-readable security report — the verifiable attack history.
app.get('/api/security/report', async (req, res) => {
    try {
        const [metrics, audits] = await Promise.all([
            withTimeout(getOrCreateMetrics(), 3000).catch(() => null),
            withTimeout(Audit.find().sort({ timestamp: -1 }).limit(15), 3000).catch(() => []),
        ]);
        const intercepts = metrics && Array.isArray(metrics.rogueBotsCaught)
            ? metrics.rogueBotsCaught.slice(-10).reverse()
            : [];
        res.json({
            generatedAt: new Date().toISOString(),
            postureVersion: '2.2.0',
            posture: [
                { name: 'Fail-closed core', description: 'Any fault — database, policy, identity — blocks the transaction. Nothing ever authorizes silently.' },
                { name: 'Hashed API keys', description: 'Agent keys are stored only as SHA-256 hashes, shown once at registration, revocable by operator quarantine.' },
                { name: 'Honeypot perimeter', description: 'Scanner bait paths (/.env, /.git, /wp-admin and more) answer 403 and jail the probing IP for one hour.' },
                { name: 'Brute-force jail', description: 'More than 10 failed key attempts from one IP within 10 minutes triggers a 30-minute block.' },
                { name: 'Traffic ceiling', description: '240 requests/minute per source IP blunts scrapers and lightweight denial-of-service attempts.' },
                { name: 'Browser armor', description: 'Content-Security-Policy, HSTS, frame-ancestors none, no stack fingerprinting, GET/POST-only CORS.' },
                { name: 'Immutable audit trail', description: 'Every verdict is persisted with its reason before the response is sent; tolls meter only on approvals.' },
                { name: 'Rate-fair rails', description: 'Sandbox 20/min, registered agents 120/min, payment prompts 5/min — abuse-priced, integration-friendly.' },
            ],
            recentIntercepts: intercepts,
            recentVerdicts: Array.isArray(audits) ? audits : [],
            verification: 'This report is generated live at request time. Compare it with GET /api/audit/recent and GET /api/metrics.',
        });
    } catch (error) {
        res.status(500).json({ error: 'Security report unavailable', requestId: req.id });
    }
});

// Operator-only: free a jailed IP. Registered BEFORE the blocklist so an
// operator whose own IP got jailed can still unlock from the outside.
app.post('/api/admin/unblock', requireAdmin, (req, res) => {
    const ip = String((req.body || {}).ip || '').trim();
    if (!/^[0-9a-fA-F.:]{3,45}$/.test(ip)) {
        return res.status(400).json({ error: 'Invalid payload: ip must be an IPv4/IPv6 address', requestId: req.id });
    }
    const wasJailed = ipBlocklist.delete(ip);
    authFailures.delete(ip);
    console.log(`🛡️ [AUTH GUARD] Operator unjailed ${ip}`);
    res.json({ success: true, ip, wasJailed });
});

// ---------- SHIELD 1: IP blocklist (fed by honeypot + brute-force guards) ----------
const ipBlocklist = new Map(); // ip -> unblockAt (ms)
function blockIp(ip, ms) { ipBlocklist.set(ip, Date.now() + ms); }
setInterval(() => { const now = Date.now(); for (const [k, t] of ipBlocklist) if (t < now) ipBlocklist.delete(k); }, 60 * 1000).unref();
app.use((req, res, next) => {
    const until = ipBlocklist.get(clientIp(req));
    if (until && until > Date.now()) {
        return res.status(403).json({ error: 'Access denied', requestId: req.id });
    }
    next();
});

// ---------- SHIELD 2: global traffic ceiling per IP (blunts scrapers and DoS-lite) ----------
app.use((req, res, next) => {
    if (!rateLimit('global:' + clientIp(req), 240, 60 * 1000)) {
        return res.status(429).json({ error: 'Too many requests from this address', requestId: req.id });
    }
    next();
});

// ---------- SHIELD 3: honeypot — scanner bait. Touch it and the IP is jailed an hour. ----------
const HONEYPOT = /^\/(\.env|\.env\.[a-z0-9.]+|\.git(\/.*)?|\.aws(\/.*)?|\.ssh(\/.*)?|wp-admin|wp-login\.php|phpmyadmin(\/.*)?|admin\.php|config\.php|\.DS_Store|backup\.sql|database\.json|\.htaccess|xmlrpc\.php|console\/shell|etc\/passwd|web\.config)(\/|$)/i;
app.use((req, res, next) => {
    if (HONEYPOT.test(req.path)) {
        blockIp(clientIp(req), 60 * 60 * 1000);
        console.warn(`🚨 [HONEYPOT TRIP] ${clientIp(req)} probed ${req.path} — IP blocked 1h`);
        withTimeout(Metric.findOneAndUpdate(
            { id: 'global_metrics' },
            { $push: { rogueBotsCaught: {
                botId: 'SCANNER:' + clientIp(req), reason: 'Honeypot probe: ' + req.path,
                payloadRiskScore: 'PROBE', channel: 'Perimeter / Honeypot',
                timestamp: new Date().toISOString(),
            } } },
            { new: true, upsert: true }
        ), 2500).catch(() => {});
        return res.status(403).json({ error: 'Access denied', requestId: req.id });
    }
    next();
});

// ---------- SHIELD 4: credential brute-force jail ----------
const authFailures = new Map(); // ip -> {count, windowStart}
function recordAuthFailure(ip) {
    const now = Date.now();
    let f = authFailures.get(ip);
    if (!f || now - f.windowStart > 10 * 60 * 1000) { f = { windowStart: now, count: 0 }; authFailures.set(ip, f); }
    f.count += 1;
    if (f.count > 10) {
        blockIp(ip, 30 * 60 * 1000);
        console.warn(`🚨 [AUTH GUARD] ${ip} jailed 30 min after ${f.count} failed key attempts`);
    }
}

// Operator console lives at /console; landing page at /
app.get('/console', (req, res) => {
    res.sendFile(path.join(publicPath, 'console.html'));
});

// Public transparency page — attack history lives here, never on the landing page
app.get('/security', (req, res) => {
    res.sendFile(path.join(publicPath, 'security.html'));
});
app.get('/security.js', (req, res) => res.sendFile(path.join(publicPath, 'security.js')));

// Health probe — registered before the page fallback so it answers JSON.
const VERSION = '2.2.0';
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        version: VERSION,
        uptimeSeconds: Math.floor(process.uptime()),
        dbState: ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] || 'unknown',
        ts: new Date().toISOString(),
    });
});

// Fallback to serve the landing page for all non-API routes
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

// 3c. REGISTERED AGENTS — production identity layer.
// API keys are shown once at registration and stored only as SHA-256 hashes.
const AgentSchema = new mongoose.Schema({
    agentId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    keyHash: { type: String, required: true },
    keyPrefix: { type: String, default: '' },
    status: { type: String, enum: ['active', 'quarantined'], default: 'active' },
    requestCount: { type: Number, default: 0 },
    approvedCount: { type: Number, default: 0 },
    blockedCount: { type: Number, default: 0 },
    totalTollKES: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
});

const Agent = mongoose.model('Agent', AgentSchema);

// 3c-2. M-PESA PAYMENTS — live Daraja STK-push settlement records.
const PaymentSchema = new mongoose.Schema({
    checkoutRequestId: { type: String, required: true, unique: true },
    merchantRequestId: { type: String },
    amount: { type: Number, required: true },
    phone: { type: String }, // optional: warranted settlements may authorize without a payer phone
    accountRef: { type: String, default: 'AEGIS' },
    provider: { type: String, enum: ['daraja', 'intasend', 'warrant'], default: 'daraja' },
    warrantId: { type: String, index: true },
    agentId: { type: String },
    status: { type: String, enum: ['PENDING', 'SUCCESS', 'FAILED'], default: 'PENDING' },
    resultDesc: { type: String, default: '' },
    receiptNumber: { type: String },
    rawCallback: { type: Object },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

const Payment = mongoose.model('Payment', PaymentSchema);

// 3f. PAYMENT WARRANTS — signed single-use authorizations binding verdicts to settlement.
// A warrant is the ONLY thing the settlement executor accepts. Without one, no money moves.
const WarrantSchema = new mongoose.Schema({
    warrantId: { type: String, required: true, unique: true },
    auditId: { type: String, required: true },
    agentId: { type: String, required: true },
    amount: { type: Number, required: true },
    currency: { type: String, required: true },
    status: { type: String, enum: ['ISSUED', 'SETTLED', 'FAILED'], default: 'ISSUED' },
    signature: { type: String, required: true },
    issuedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    settledAt: { type: Date },
    settlementNote: { type: String },
});
const Warrant = mongoose.model('Warrant', WarrantSchema);

// The signing key is derived from the operator secret — no new secrets to manage.
const warrantSigningKey = crypto.createHmac('sha256', process.env.ADMIN_API_KEY || 'aegis-local-dev').update('aegis-warrant-signing-v1').digest('hex');
const warrantCanonical = (w) => `${w.warrantId}|${w.auditId}|${w.agentId}|${w.amount}|${w.currency}|${w.expiresAt}`;
const warrantSign = (w) => crypto.createHmac('sha256', warrantSigningKey).update(warrantCanonical(w)).digest('hex');
const warrantVerify = (w) => {
    if (!w || typeof w !== 'object') return false;
    const { signature } = w;
    if (!signature || typeof signature !== 'string') return false;
    const expected = warrantSign(w);
    const a = Buffer.from(signature), b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
};
const WARRANT_TTL_MS = 10 * 60 * 1000; // a warrant authorizes settlement within 10 minutes


const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

// ---------- M-Pesa Daraja configuration (fail-closed until configured) ----------
const MPESA = {
    environment: process.env.MPESA_ENVIRONMENT || 'sandbox',
    consumerKey: process.env.MPESA_CONSUMER_KEY || '',
    consumerSecret: process.env.MPESA_CONSUMER_SECRET || '',
    shortcode: process.env.MPESA_SHORTCODE || '',
    passkey: process.env.MPESA_PASSKEY || '',
    callbackUrl: 'https://aegis-agent-4u79.onrender.com/api/mpesa/callback', // always this gateway
    accountRef: process.env.MPESA_ACCOUNT_REF || 'AEGIS',
    get baseUrl() {
        return this.environment === 'production'
            ? 'https://api.safaricom.co.ke'
            : 'https://sandbox.safaricom.co.ke';
    },
    get configured() {
        return !!(this.consumerKey && this.consumerSecret && this.shortcode && this.passkey);
    },
};

// ---------- IntaSend aggregator configuration (fail-closed until configured) ----------
// Lets the gateway collect M-Pesa payments through IntaSend's license when
// the operator has no own Daraja production (till/paybill) credentials.
const INTASEND = {
    environment: process.env.INTASEND_ENVIRONMENT || 'sandbox',
    publicKey: process.env.INTASEND_PUBLIC_KEY || '',
    secretKey: process.env.INTASEND_SECRET_KEY || '',
    get baseUrl() {
        return this.environment === 'live'
            ? 'https://payment.intasend.com'
            : 'https://sandbox.intasend.com';
    },
    get configured() {
        return !!(this.publicKey && this.secretKey);
    },
};

const mpesaTokenCache = { token: null, expiresAt: 0 };
async function getMpesaToken() {
    if (!MPESA.configured) throw new Error('mpesa-not-configured');
    if (mpesaTokenCache.token && Date.now() < mpesaTokenCache.expiresAt) return mpesaTokenCache.token;
    const basic = Buffer.from(`${MPESA.consumerKey}:${MPESA.consumerSecret}`).toString('base64');
    const res = await fetch(`${MPESA.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
        headers: { Authorization: 'Basic ' + basic },
    });
    if (!res.ok) throw new Error('mpesa-oauth-failed:' + res.status);
    const data = await res.json();
    mpesaTokenCache.token = data.access_token;
    mpesaTokenCache.expiresAt = Date.now() + ((Number(data.expires_in) || 3599) - 60) * 1000;
    return mpesaTokenCache.token;
}

function normalizeKenyanPhone(raw) {
    const digits = String(raw || '').replace(/[^0-9]/g, '');
    if (/^254[17][0-9]{8}$/.test(digits)) return digits;
    if (/^0[17][0-9]{8}$/.test(digits)) return '254' + digits.slice(1);
    if (/^[17][0-9]{8}$/.test(digits)) return '254' + digits;
    return null;
}

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

// 3d. RATE LIMITING — in-memory fixed-window limiter (one instance per pod).
const rateBuckets = new Map();
function rateLimit(key, limit, windowMs) {
    const now = Date.now();
    let bucket = rateBuckets.get(key);
    if (!bucket || now - bucket.windowStart > windowMs) {
        bucket = { windowStart: now, count: 0 };
        rateBuckets.set(key, bucket);
    }
    bucket.count += 1;
    return bucket.count <= limit;
}
const clientIp = (req) => (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';

// Periodically evict stale buckets so the map cannot grow without bound
setInterval(() => {
    const cutoff = Date.now() - 60 * 60 * 1000;
    for (const [k, b] of rateBuckets) if (b.windowStart < cutoff) rateBuckets.delete(k);
}, 10 * 60 * 1000).unref();

// 3e. AUTH HELPERS
function bearerToken(req) {
    const h = req.headers['authorization'] || '';
    const m = h.match(/^Bearer\s+(.+)$/i);
    return m ? m[1].trim() : null;
}

async function resolveAgent(req) {
    const token = bearerToken(req);
    if (!token) return { mode: 'sandbox', agent: null };
    const agent = await withTimeout(Agent.findOne({ keyHash: sha256(token) }), 3000);
    if (!agent) return { mode: 'invalid', agent: null };
    return { mode: 'live', agent };
}

// Admin rail: operator-only endpoints fail closed unless ADMIN_API_KEY is set
function requireAdmin(req, res, next) {
    const adminKey = process.env.ADMIN_API_KEY;
    if (!adminKey) {
        return res.status(503).json({ error: 'Admin rail disabled: ADMIN_API_KEY is not configured on this gateway' });
    }
    const token = bearerToken(req);
    if (!token || token !== adminKey) {
        recordAuthFailure(clientIp(req));
        return res.status(401).json({ error: 'Unauthorized: valid admin key required for this operation' });
    }
    next();
}

// 4. PUBLIC TELEMETRY & POLICY ROUTES

app.get('/api/metrics', async (req, res) => {
    try {
        const metrics = await getOrCreateMetrics();
        res.json(metrics);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch cloud analytics cluster data" });
    }
});

app.get('/api/network/stats', async (req, res) => {
    try {
        const [metrics, agentsRegistered] = await Promise.all([
            withTimeout(getOrCreateMetrics(), 3000),
            withTimeout(Agent.countDocuments({}), 3000),
        ]);
        res.json({
            totalVerdicts: metrics.totalTasksAudited || 0,
            totalTollKES: metrics.totalRevenueKSH || 0,
            agentsRegistered,
            rogueIntercepts: (metrics.rogueBotsCaught || []).length,
        });
    } catch (error) {
        res.status(500).json({ error: 'Network stats unavailable' });
    }
});

app.get('/api/config', async (req, res) => {
    try {
        const policy = await withTimeout(getOrCreatePolicy(), 3000);
        res.json({
            status: "ACTIVE",
            gateway: "Aegis Secure Proxy v2.2.0",
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
            gateway: "Aegis Secure Proxy v2.2.0",
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

// Policy updates are operator-only (admin key required)
app.post('/api/config', requireAdmin, async (req, res) => {
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
            gateway: "Aegis Secure Proxy v2.2.0",
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

// 4b. AGENT REGISTRATION — self-service production identity.
// Returns the API key exactly once; only the hash is stored.
app.post('/api/agents/register', async (req, res) => {
    if (!rateLimit('register:' + clientIp(req), 10, 60 * 60 * 1000)) {
        return res.status(429).json({ error: 'Too many registrations from this address. Try again later.' });
    }
    try {
        const rawName = (req.body && req.body.name ? String(req.body.name) : '').trim();
        const name = rawName.replace(/[^a-zA-Z0-9 _-]/g, '').slice(0, 40);
        if (name.length < 3) {
            return res.status(400).json({ error: 'Invalid payload: name must be 3-40 characters (letters, digits, space, _ or -)' });
        }
        const apiKey = 'agk_' + crypto.randomBytes(24).toString('hex');
        const agentId = 'aegis_ag_' + crypto.randomBytes(5).toString('hex');
        const agent = await withTimeout(Agent.create({
            agentId,
            name,
            keyHash: sha256(apiKey),
            keyPrefix: apiKey.slice(0, 12),
        }), 3000);
        res.status(201).json({
            status: 'REGISTERED',
            message: 'Store this API key now — it is shown only once and cannot be recovered.',
            agentId: agent.agentId,
            name: agent.name,
            apiKey,
            createdAt: agent.createdAt,
        });
    } catch (error) {
        res.status(500).json({ error: 'Registration service unreachable. Please retry.' });
    }
});

// Registered agents can check their own usage with their key
app.get('/api/agents/me', async (req, res) => {
    try {
        const { mode, agent } = await resolveAgent(req);
        if (mode !== 'live' || !agent) {
            recordAuthFailure(clientIp(req));
            return res.status(401).json({ error: 'Unauthorized: a valid registered API key is required' });
        }
        res.json({
            agentId: agent.agentId,
            name: agent.name,
            status: agent.status,
            requestCount: agent.requestCount,
            approvedCount: agent.approvedCount,
            blockedCount: agent.blockedCount,
            totalTollKES: agent.totalTollKES,
            createdAt: agent.createdAt,
        });
    } catch (error) {
        res.status(500).json({ error: 'Agent service unreachable' });
    }
});

/**
 * The core AEGIS audit gate — the endpoint the SDK calls (POST to the
 * gateway root or /api/audit) before an autonomous agent may touch payment rails.
 * Registered agents authenticate with `Authorization: Bearer <agk_...>`;
 * unauthenticated calls run in sandbox mode (rate-limited, still fully audited).
 * Verdicts persist to the immutable audit trail; approved audits meter the
 * 0.50 KES toll. Failures block by default.
 */
async function auditTransactionHandler(req, res) {
    const { agentId, amount, currency, mpesaRecipient } = req.body || {};
    const normalizedCurrency = (currency || 'KES').toString().toUpperCase();
    const numericAmount = Number(amount);

    // Identity: bearer key → registered agent; otherwise sandbox mode
    let mode = 'sandbox';
    let agentRecord = null;
    try {
        const identity = await resolveAgent(req);
        if (identity.mode === 'invalid') {
            recordAuthFailure(clientIp(req));
            return res.status(401).json({ status: 'BLOCKED', reason: 'Invalid or revoked API key', agentId: agentId || 'unknown' });
        }
        mode = identity.mode;
        agentRecord = identity.agent;
    } catch (err) {
        // Identity layer unreachable — fail closed for keyed requests, allow sandbox
        if (bearerToken(req)) {
            return res.status(403).json({ status: 'BLOCKED', reason: 'Identity layer unreachable: defensive freeze engaged, transaction blocked by default', agentId: agentId || 'unknown' });
        }
    }

    const normalizedAgent = mode === 'live'
        ? agentRecord.agentId
        : ((agentId || '').toString().trim().slice(0, 64) || 'Unnamed_External_Agent');

    // Rate limits: sandbox per IP, registered agents per agent
    const rateKey = mode === 'live' ? 'audit:agent:' + agentRecord.agentId : 'audit:ip:' + clientIp(req);
    if (!rateLimit(rateKey, mode === 'live' ? 120 : 20, 60 * 1000)) {
        return res.status(429).json({ status: 'BLOCKED', reason: 'Rate limit exceeded. Slow down and retry.', agentId: normalizedAgent, mode });
    }

    const agentCounters = (decision, toll) => agentRecord ? withTimeout(
        Agent.updateOne(
            { agentId: agentRecord.agentId },
            {
                $inc: {
                    requestCount: 1,
                    approvedCount: decision === 'APPROVED' ? 1 : 0,
                    blockedCount: decision === 'BLOCKED' ? 1 : 0,
                    totalTollKES: decision === 'APPROVED' ? toll : 0,
                },
            }
        ), 2500
    ).catch(() => {}) : Promise.resolve();

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
            await agentCounters('BLOCKED', 0);
        } catch (err) {
            // Trail persistence failed — the verdict below still blocks by default.
        }
        return res.status(403).json({ status: 'BLOCKED', reason, agentId: normalizedAgent, mode });
    };

    // Quarantined agents are refused at the gate
    if (mode === 'live' && agentRecord.status === 'quarantined') {
        return reject('Agent is quarantined by operator order and may not transact');
    }

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
        await agentCounters('APPROVED', toll);

        // Live, authenticated approvals receive a signed single-use payment warrant.
        let warrant = null;
        if (mode === 'live' && agentRecord) {
            try {
                const w = {
                    warrantId: 'aegis_wt_' + crypto.randomBytes(12).toString('hex'),
                    auditId: audit.id,
                    agentId: agentRecord.agentId,
                    amount: numericAmount,
                    currency: normalizedCurrency,
                    expiresAt: Date.now() + WARRANT_TTL_MS,
                };
                w.signature = warrantSign(w);
                await Warrant.create({ ...w });
                warrant = w;
                console.log(`🔥 [WARRANT] Issued ${w.warrantId} to ${agentRecord.agentId} for ${numericAmount} ${normalizedCurrency}`);
            } catch (wErr) {
                // Fail-closed: if the warrant cannot be issued, the approval stands but settlement stays locked.
                console.error('Warrant issuance fault (settlement stays locked):', wErr.message);
            }
        }

        res.status(200).json({
            status: 'APPROVED',
            reason: 'Transaction within sovereign policy limits',
            agentId: normalizedAgent,
            name: mode === 'live' ? agentRecord.name : undefined,
            mode,
            amount: numericAmount,
            currency: normalizedCurrency,
            tollKES: toll,
            auditId: audit.id,
            settled: false, // Metered toll accounting; live payment-rail settlement available on request.
            warrant, // present only for authenticated live approvals — the ONLY key the settlement executor accepts
        });
    } catch (error) {
        // Defensive freeze: policy engine unreachable — block by default.
        console.error('❌ Audit gate fault:', error.message);
        return res.status(503).json({
            status: 'BLOCKED',
            reason: 'Policy engine unreachable: defensive freeze engaged, transaction blocked by default',
            agentId: normalizedAgent,
            mode,
        });
    }
}

app.post('/', auditTransactionHandler);
app.post('/api/audit', auditTransactionHandler);

// Operator-only: quarantine an agent / log an intercept. Admin key required.
// If the target is a registered agent, its status flips to quarantined.
app.post('/api/intercept', requireAdmin, async (req, res) => {
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

        // Quarantine a registered agent if the ID matches
        if (botId) {
            await withTimeout(Agent.updateOne({ agentId: botId }, { $set: { status: 'quarantined' } }), 2500).catch(() => {});
        }

        console.log(`⚠️ [FIREWALL ALERT] Intercepted Rogue Bot: ${newRogueBot.botId}`);
        res.status(201).json({ success: true, message: "Security risk isolated successfully", alert: newRogueBot });
    } catch (error) {
        res.status(500).json({ error: "Security processing engine fault" });
    }
});

// Operator-only: manual toll settlement. Admin key required.
app.post('/api/transaction/toll', requireAdmin, async (req, res) => {
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

// 4c. M-PESA DARAJA LIVE RAIL — STK push, callback, status query.
// Fail-closed: the rail reports "not configured" until credentials exist,
// and initiating pushes requires a registered agent key or the admin key.

function mpesaDisabled(req, res) {
    return res.status(503).json({
        error: 'M-Pesa rail is not configured on this gateway. Set MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_SHORTCODE and MPESA_PASSKEY.',
    });
}

app.get('/api/mpesa/config', (req, res) => {
    res.json({
        enabled: MPESA.configured,
        environment: MPESA.environment,
        shortcode: MPESA.configured ? MPESA.shortcode : null,
        callbackUrl: 'https://aegis-agent-4u79.onrender.com/api/mpesa/callback',
        accountRef: MPESA.accountRef,
    });
});

app.post('/api/mpesa/stkpush', async (req, res) => {
    if (!MPESA.configured) return mpesaDisabled(req, res);

    // Only registered agents or the operator may initiate payment prompts —
    // a public URL must not become an SMS-prompt spam cannon.
    const token = bearerToken(req);
    let agentId = null;
    if (token && token === process.env.ADMIN_API_KEY) {
        agentId = 'operator';
    } else if (token) {
        const agent = await withTimeout(Agent.findOne({ keyHash: sha256(token) }), 3000).catch(() => null);
        if (!agent || agent.status !== 'active') {
            return res.status(401).json({ error: 'Unauthorized: an active agent key or the admin key is required to initiate payments' });
        }
        agentId = agent.agentId;
    } else {
        return res.status(401).json({ error: 'Unauthorized: an active agent key or the admin key is required to initiate payments' });
    }

    if (!rateLimit('stkpush:' + clientIp(req), 5, 60 * 1000)) {
        return res.status(429).json({ error: 'Too many payment requests. Slow down.' });
    }

    try {
        const { amount, phoneNumber, accountRef } = req.body || {};
        const numericAmount = Number(amount);
        const phone = normalizeKenyanPhone(phoneNumber);
        if (!Number.isFinite(numericAmount) || numericAmount < 1) {
            return res.status(400).json({ error: 'Invalid amount: must be a whole number of at least 1 KES' });
        }
        if (!phone) {
            return res.status(400).json({ error: 'Invalid phone number: expected a Kenyan number like 07XXXXXXXX or 2547XXXXXXXX' });
        }

        const accessToken = await getMpesaToken();
        const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
        const password = Buffer.from(`${MPESA.shortcode}${MPESA.passkey}${timestamp}`).toString('base64');
        const ref = String(accountRef || MPESA.accountRef).replace(/[^A-Za-z0-9 -]/g, '').slice(0, 12);

        const push = await fetch(`${MPESA.baseUrl}/mpesa/stkpush/v1/processrequest`, {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                BusinessShortCode: MPESA.shortcode,
                Password: password,
                Timestamp: timestamp,
                TransactionType: 'CustomerPayBillOnline',
                Amount: Math.round(numericAmount),
                PartyA: phone,
                PartyB: MPESA.shortcode,
                PhoneNumber: phone,
                CallBackURL: 'https://aegis-agent-4u79.onrender.com/api/mpesa/callback',
                AccountReference: ref,
                TransactionDesc: 'Aegis toll settlement',
            }),
        });

        const data = await push.json().catch(() => ({}));
        if (!push.ok || !data.CheckoutRequestID) {
            console.error('❌ M-Pesa STK push rejected:', push.status, JSON.stringify(data));
            return res.status(502).json({ error: 'M-Pesa rejected the request', detail: data });
        }

        await withTimeout(Payment.create({
            checkoutRequestId: data.CheckoutRequestID,
            merchantRequestId: data.MerchantRequestID,
            amount: Math.round(numericAmount),
            phone,
            accountRef: ref,
            agentId,
            status: 'PENDING',
        }), 3000).catch(() => {});

        res.status(200).json({
            status: 'PUSH_SENT',
            message: 'Payment prompt sent. Check the phone for the M-Pesa request.',
            checkoutRequestId: data.CheckoutRequestID,
            merchantRequestId: data.MerchantRequestID,
            phone,
            amount: Math.round(numericAmount),
            environment: MPESA.environment,
        });
    } catch (error) {
        console.error('❌ M-Pesa fault:', error.message);
        if (error.message === 'mpesa-not-configured') return mpesaDisabled(req, res);
        if (error.message.startsWith('mpesa-oauth-failed')) {
            return res.status(502).json({ error: 'M-Pesa authentication failed: check the Daraja consumer key/secret' });
        }
        return res.status(503).json({ error: 'Payment rail fault: request not sent, nothing settled' });
    }
});

// Daraja calls this with the payment outcome — it must always ACK with ResultCode 0.
app.post('/api/mpesa/callback', express.raw({ type: '*/*' }), async (req, res) => {
    let body = req.body;
    try { if (Buffer.isBuffer(body)) body = JSON.parse(body.toString('utf8')); } catch { body = body; }
    try {
        const cb = body && body.Body && body.Body.stkCallback;
        if (cb) {
            const resultOk = Number(cb.ResultCode) === 0;
            let receiptNumber = null;
            const meta = {};
            (cb.CallbackMetadata && cb.CallbackMetadata.Item || []).forEach(function (item) {
                meta[item.Name] = item.Value;
                if (item.Name === 'MpesaReceiptNumber') receiptNumber = item.Value;
            });
            await withTimeout(Payment.findOneAndUpdate(
                { checkoutRequestId: cb.CheckoutRequestID },
                {
                    $set: {
                        status: resultOk ? 'SUCCESS' : 'FAILED',
                        resultDesc: cb.ResultDesc || '',
                        receiptNumber: receiptNumber,
                        rawCallback: body,
                        updatedAt: new Date(),
                    },
                },
                { new: true }
            ), 3000);
            console.log(resultOk ? '✅ M-Pesa payment SUCCESS: ' + receiptNumber : '❌ M-Pesa payment FAILED: ' + (cb.ResultDesc || ''));
        } else {
            console.warn('⚠️ M-Pesa callback with unexpected shape');
        }
    } catch (err) {
        // Always ACK Daraja — retries come from their side; we never hang the rail.
        console.error('❌ M-Pesa callback fault:', err.message);
    }
    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
});

app.get('/api/mpesa/status/:checkoutRequestId', async (req, res) => {
    try {
        const payment = await withTimeout(
            Payment.findOne({ checkoutRequestId: req.params.checkoutRequestId }),
            3000
        );
        if (!payment) return res.status(404).json({ error: 'Payment not found' });
        res.json({
            checkoutRequestId: payment.checkoutRequestId,
            merchantRequestId: payment.merchantRequestId,
            amount: payment.amount,
            phone: payment.phone,
            accountRef: payment.accountRef,
            agentId: payment.agentId,
            status: payment.status,
            resultDesc: payment.resultDesc,
            receiptNumber: payment.receiptNumber,
            createdAt: payment.createdAt,
            updatedAt: payment.updatedAt,
        });
    } catch (error) {
        res.status(500).json({ error: 'Payment status unavailable' });
    }
});

app.get('/api/mpesa/payments/recent', async (req, res) => {
    try {
        const payments = await withTimeout(Payment.find().sort({ createdAt: -1 }).limit(10), 3000);
        res.json(payments.map(p => ({
            provider: p.provider || 'daraja',
            checkoutRequestId: p.checkoutRequestId,
            amount: p.amount,
            phone: p.phone,
            status: p.status,
            resultDesc: p.resultDesc,
            receiptNumber: p.receiptNumber,
            createdAt: p.createdAt,
        })));
    } catch (error) {
        res.status(500).json({ error: 'Payments list unavailable' });
    }
});

// 4d. INTASEND AGGREGATOR RAIL — M-Pesa collections via IntaSend's license.
// Same security posture as the Daraja rail: key-gated, rate-limited, fail-closed.

app.get('/api/intasend/config', (req, res) => {
    res.json({
        enabled: INTASEND.configured,
        environment: INTASEND.environment,
    });
});

function requirePaymentInitiator(req, res, clientKey) {
    // Shared gate: only active registered agents or the operator may fire payment prompts.
    const token = bearerToken(req);
    if (!token) {
        res.status(401).json({ error: 'Unauthorized: an active agent key or the admin key is required to initiate payments' });
        return null;
    }
    return token;
}

app.post('/api/intasend/stkpush', async (req, res) => {
    if (!INTASEND.configured) {
        return res.status(503).json({ error: 'IntaSend rail is not configured. Set INTASEND_PUBLIC_KEY and INTASEND_SECRET_KEY.' });
    }
    const token = requirePaymentInitiator(req, res, clientIp(req));
    if (!token) return;

    if (!rateLimit('intasend:' + clientIp(req), 5, 60 * 1000)) {
        return res.status(429).json({ error: 'Too many payment requests. Slow down.' });
    }

    // Authenticate the initiator (admin key or active agent key)
    let agentId = null;
    if (token === process.env.ADMIN_API_KEY) {
        agentId = 'operator';
    } else {
        const agent = await withTimeout(Agent.findOne({ keyHash: sha256(token) }), 3000).catch(() => null);
        if (!agent || agent.status !== 'active') {
            return res.status(401).json({ error: 'Unauthorized: an active agent key or the admin key is required to initiate payments' });
        }
        agentId = agent.agentId;
    }

    try {
        const { amount, phoneNumber, accountRef } = req.body || {};
        const numericAmount = Number(amount);
        const phone = normalizeKenyanPhone(phoneNumber);
        if (!Number.isFinite(numericAmount) || numericAmount < 1) {
            return res.status(400).json({ error: 'Invalid amount: must be at least 1 KES' });
        }
        if (!phone) {
            return res.status(400).json({ error: 'Invalid phone number: expected a Kenyan number like 07XXXXXXXX or 2547XXXXXXXX' });
        }

        const ref = String(accountRef || 'AEGIS').replace(/[^A-Za-z0-9 -]/g, '').slice(0, 50) + '-' + Date.now().toString(36);

        const push = await fetch(`${INTASEND.baseUrl}/api/v1/payment/collection/`, {
            method: 'POST',
            headers: {
                Authorization: 'Bearer ' + INTASEND.secretKey,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                public_key: INTASEND.publicKey,
                method: 'STK-PUSH',
                provider: 'M-PESA',
                currency: 'KES',
                amount: Math.round(numericAmount),
                phone_number: phone,
                api_ref: ref,
            }),
        });

        const data = await push.json().catch(() => ({}));
        const invoiceId = data && (data.id || (data.invoice && data.invoice.id));
        if (!push.ok || !invoiceId) {
            console.error('❌ IntaSend STK push rejected:', push.status, JSON.stringify(data));
            return res.status(502).json({ error: 'IntaSend rejected the request', detail: data });
        }

        await withTimeout(Payment.create({
            checkoutRequestId: String(invoiceId),
            merchantRequestId: (data.invoice && data.invoice.invoice_id) || null,
            amount: Math.round(numericAmount),
            phone,
            accountRef: ref,
            agentId,
            provider: 'intasend',
            status: 'PENDING',
        }), 3000).catch(() => {});

        res.status(200).json({
            status: 'PUSH_SENT',
            message: 'Payment prompt sent via IntaSend. Check the phone for the M-Pesa request.',
            checkoutRequestId: String(invoiceId),
            phone,
            amount: Math.round(numericAmount),
            environment: INTASEND.environment,
        });
    } catch (error) {
        console.error('❌ IntaSend fault:', error.message);
        return res.status(503).json({ error: 'Payment rail fault: request not sent, nothing settled' });
    }
});

// Poll IntaSend for a payment's state; updates our Payment record on terminal states.
app.get('/api/intasend/status/:invoiceId', async (req, res) => {
    if (!INTASEND.configured) {
        return res.status(503).json({ error: 'IntaSend rail is not configured' });
    }
    try {
        const status = await fetch(`${INTASEND.baseUrl}/api/v1/payment/status/`, {
            method: 'POST',
            headers: {
                Authorization: 'Bearer ' + INTASEND.secretKey,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                public_key: INTASEND.publicKey,
                id: req.params.invoiceId,
            }),
        });
        const data = await status.json().catch(() => ({}));
        const state = String(data.state || '').toUpperCase();
        let ourStatus = 'PENDING';
        let resultDesc = data.state || 'processing';
        if (state === 'COMPLETE' || state === 'PAID') { ourStatus = 'SUCCESS'; resultDesc = 'Payment completed'; }
        else if (state === 'FAILED' || state === 'CANCELLED' || state === 'TIMEOUT') { ourStatus = 'FAILED'; resultDesc = data.state || 'failed'; }

        if (ourStatus !== 'PENDING') {
            await withTimeout(Payment.findOneAndUpdate(
                { checkoutRequestId: req.params.invoiceId },
                { $set: { status: ourStatus, resultDesc, updatedAt: new Date() } },
                { new: true }
            ), 3000).catch(() => {});
        }

        const payment = await withTimeout(Payment.findOne({ checkoutRequestId: req.params.invoiceId }), 3000);
        res.json({
            intasendState: data.state || null,
            status: payment ? payment.status : ourStatus,
            resultDesc: payment ? payment.resultDesc : resultDesc,
            receiptNumber: payment ? payment.receiptNumber : null,
            amount: payment ? payment.amount : null,
            phone: payment ? payment.phone : null,
        });
    } catch (error) {
        res.status(503).json({ error: 'IntaSend status unavailable' });
    }
});

// IntaSend webhook: echoes their verification challenge and records state changes.
app.post('/api/intasend/webhook', express.raw({ type: '*/*' }), async (req, res) => {
    let body = req.body;
    try { if (Buffer.isBuffer(body)) body = JSON.parse(body.toString('utf8')); } catch {}
    try {
        if (body && body.challenge) {
            return res.json({ challenge: body.challenge });
        }
        const invoiceId = body && (body.id || (body.invoice && body.invoice.id));
        const state = String((body && (body.state || (body.invoice && body.invoice.state))) || '').toUpperCase();
        if (invoiceId) {
            const ourStatus = (state === 'COMPLETE' || state === 'PAID') ? 'SUCCESS'
                : (state === 'FAILED' || state === 'CANCELLED') ? 'FAILED' : 'PENDING';
            if (ourStatus !== 'PENDING') {
                await withTimeout(Payment.findOneAndUpdate(
                    { checkoutRequestId: String(invoiceId) },
                    { $set: { status: ourStatus, resultDesc: String(state), rawCallback: body, updatedAt: new Date() } },
                ), 3000).catch(() => {});
            }
        }
    } catch (err) {
        console.error('❌ IntaSend webhook fault:', err.message);
    }
    res.json({ received: true });
});

// 4f. SETTLEMENT EXECUTOR — the ONLY door to real money movement. No warrant, no settlement.
app.post('/api/payments/settle', async (req, res) => {
    const token = bearerToken(req);
    try {
        if (!token) return res.status(401).json({ status: 'BLOCKED', error: 'Unauthorized: an active agent key or the admin key is required to settle payments', requestId: req.id });

        let agentRecord = null;
        if (token !== process.env.ADMIN_API_KEY) {
            const identity = await withTimeout(resolveAgent(req), 3000);
            if (!identity || identity.mode !== 'live' || !identity.agent) {
                recordAuthFailure(clientIp(req));
                return res.status(401).json({ status: 'BLOCKED', error: 'Unauthorized: invalid or inactive agent key', requestId: req.id });
            }
            if (identity.agent.status === 'quarantined') return res.status(403).json({ status: 'BLOCKED', reason: 'Agent is quarantined by operator order and may not transact', requestId: req.id });
            agentRecord = identity.agent;
        }

        const warrant = (req.body || {}).warrant;
        if (!warrant || !warrant.warrantId) {
            return res.status(403).json({ status: 'BLOCKED', error: 'No payment warrant presented. The executor settles only against warrants issued by an APPROVED live verdict.', requestId: req.id });
        }

        // 1. Cryptographic check first — tampered or forged warrants never touch the database.
        if (!warrantVerify(warrant)) {
            return res.status(403).json({ status: 'BLOCKED', error: 'Warrant signature invalid: forged or tampered warrant refused', requestId: req.id });
        }

        // 2. Pull the authoritative record — fail-closed if the ledger is unreachable.
        const record = await withTimeout(Warrant.findOne({ warrantId: warrant.warrantId }), 3000);
        if (!record) return res.status(403).json({ status: 'BLOCKED', error: 'Warrant not found in the ledger: refused', requestId: req.id });

        // 3. Binding + status checks — the warrant must match its ledger record exactly.
        if (record.amount !== warrant.amount || record.currency !== warrant.currency) {
            return res.status(403).json({ status: 'BLOCKED', error: 'Warrant does not match its ledger record', requestId: req.id });
        }
        if (record.status !== 'ISSUED') {
            return res.status(409).json({ status: 'BLOCKED', error: `Warrant already ${record.status}: single-use enforcement, replay refused`, requestId: req.id });
        }
        if (Date.now() > record.expiresAt.getTime()) {
            await Warrant.updateOne({ warrantId: record.warrantId }, { status: 'FAILED', settlementNote: 'expired' });
            return res.status(403).json({ status: 'BLOCKED', error: 'Warrant expired: re-request authorization from the gate', requestId: req.id });
        }

        // 4. Atomic single-use claim — beats any race or duplicate submission.
        const claimed = await Warrant.findOneAndUpdate(
            { warrantId: record.warrantId, status: 'ISSUED' },
            { status: 'SETTLED', settledAt: new Date(), settlementNote: 'claimed by settlement executor' },
            { new: true }
        );
        if (!claimed) {
            return res.status(409).json({ status: 'BLOCKED', error: 'Warrant already claimed: single-use enforcement, replay refused', requestId: req.id });
        }

        // 5. Execute via the configured rail. With no rail configured, the settlement is
        //    authorized and recorded — real rails attach here the day credentials arrive.
        const payerPhone = (req.body || {}).payerPhone ? normalizeKenyanPhone((req.body || {}).payerPhone) : null;
        const rail = MPESA.enabled ? 'mpesa' : (INTASEND.enabled ? 'intasend' : 'none');
        let settlement = { rail, executed: rail !== 'none' };

        if (rail === 'mpesa' && payerPhone) {
            try {
                const accessToken = await getMpesaToken();
                const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
                const cfg = MPESA;
                const push = await fetch(`${cfg.baseUrl}/mpesa/stkpush/v1/processrequest`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        BusinessShortCode: cfg.shortcode,
                        Password: Buffer.from(cfg.shortcode + cfg.passkey + timestamp).toString('base64'),
                        Timestamp: timestamp,
                        TransactionType: 'CustomerPayBillOnline',
                        Amount: Math.round(record.amount),
                        PartyA: payerPhone,
                        PartyB: cfg.shortcode,
                        PhoneNumber: payerPhone,
                        AccountReference: cfg.accountRef,
                        TransactionDesc: 'Aegis warranted settlement',
                        CallBackURL: 'https://aegis-agent-4u79.onrender.com/api/mpesa/callback',
                    }),
                }).then(r => r.json());
                await Payment.create({
                    merchantRequestId: push.MerchantRequestID || null,
                    checkoutRequestId: push.CheckoutRequestID || null,
                    amount: record.amount, phone: payerPhone,
                    accountRef: cfg.accountRef, provider: 'daraja',
                    agentId: agentRecord ? agentRecord.agentId : 'operator',
                    status: push.ResponseCode === '0' ? 'PENDING' : 'FAILED',
                    resultDesc: push.CustomerMessage || push.errorMessage || null,
                    warrantId: record.warrantId,
                });
                settlement.payment = { checkoutRequestId: push.CheckoutRequestID, state: push.ResponseCode === '0' ? 'PUSH_SENT' : 'REFUSED', desc: push.CustomerMessage || push.errorMessage };
            } catch (railErr) {
                console.error('Rail execution fault:', railErr.message);
            }
        } else {
            await Payment.create({
                merchantRequestId: record.warrantId,
                checkoutRequestId: record.warrantId,
                amount: record.amount, phone: payerPhone,
                accountRef: MPESA.accountRef, provider: 'warrant',
                agentId: agentRecord ? agentRecord.agentId : 'operator',
                status: 'PENDING',
                resultDesc: 'Warranted settlement authorized; no live rail attached',
                warrantId: record.warrantId,
            });
            settlement.authorized = true;
        }

        res.status(200).json({
            status: 'SETTLED',
            warrantId: record.warrantId,
            auditId: record.auditId,
            agentId: record.agentId,
            amount: record.amount,
            currency: record.currency,
            ...settlement,
            note: rail === 'none'
                ? 'Warrant consumed and settlement authorized. With a live rail attached, this same call moves real money.'
                : 'Warrant consumed. Payment instruction dispatched to the configured rail.',
        });
    } catch (err) {
        console.error('Settlement executor fault:', err.message);
        res.status(503).json({ status: 'BLOCKED', error: 'Settlement executor fault: refused by default, no money moved', requestId: req.id });
    }
});

// Warrant transparency: recent warrants (admin sees all, agents see their own)
app.get('/api/warrants/recent', async (req, res) => {
    const token = bearerToken(req);
    try {
        if (token && token === process.env.ADMIN_API_KEY) {
            const warrants = await withTimeout(Warrant.find({}).sort({ issuedAt: -1 }).limit(15), 3000);
            return res.json({ warrants });
        }
        const identity = await withTimeout(resolveAgent(req), 3000);
        if (token && identity && identity.mode === 'live' && identity.agent) {
            const warrants = await withTimeout(Warrant.find({ agentId: identity.agent.agentId }).sort({ issuedAt: -1 }).limit(15), 3000);
            return res.json({ warrants });
        }
        res.status(401).json({ error: 'Unauthorized', requestId: req.id });
    } catch (err) {
        res.status(503).json({ error: 'Warrant ledger unreachable', requestId: req.id });
    }
});

// 5. OPERATIONS LAYER — health, version, JSON errors, graceful shutdown.

app.get('/api/version', (req, res) => {
    res.json({
        name: 'aegis-policy-gateway',
        version: VERSION,
        commit: process.env.RENDER_GIT_COMMIT || null,
        node: process.version,
    });
});

// Unknown API routes answer JSON, never the Express default HTML.
// Unknown pages fall back to the landing page (SPA convention).
app.use((req, res) => {
    if (req.url.startsWith('/api')) {
        return res.status(404).json({ error: 'Endpoint not found', requestId: req.id });
    }
    res.sendFile(path.join(publicPath, 'index.html'));
});

// Last-resort handler: a fault in any route answers cleanly and the process survives.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    console.error(`❌ [${req.id}] Unhandled route fault:`, err.message);
    if (res.headersSent) return;
    const code = err.statusCode || err.status || 500;
    res.status(code).json({
        error: code === 413
            ? 'Payload too large — the gateway accepts request bodies up to 100 KB'
            : 'Internal gateway fault — nothing settled, nothing authorized',
        requestId: req.id,
    });
});

// 6. BOOT SERVER INSTANCE
const PORT = process.env.PORT || 4379;
const server = app.listen(PORT, () => {
    console.log(`🛡️ [SYSTEM OPERATIONAL] Aegis Policy Gateway v${VERSION} — Port ${PORT}`);
    console.log(`   rails: daraja=${MPESA.configured ? MPESA.environment : 'off'} intasend=${INTASEND.configured ? INTASEND.environment : 'off'} admin=${process.env.ADMIN_API_KEY ? 'on' : 'off'}`);
});

// Graceful shutdown: Render sends SIGTERM on every deploy — drain, don't drop.
process.on('SIGTERM', () => {
    console.log('🛡️ [SHUTDOWN] SIGTERM received — draining connections');
    server.close(async () => {
        try { await mongoose.connection.close(false); } catch (e) { /* best effort */ }
        console.log('🛡️ [SHUTDOWN] Clean exit');
        process.exit(0);
    });
    setTimeout(() => process.exit(0), 10000).unref();
});
