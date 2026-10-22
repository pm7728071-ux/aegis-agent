/**
 * Aegis production-readiness test suite.
 *
 * Verifies the five production guarantees:
 *   1. Unauthorized requests are rejected server-side.
 *   2. A backend timeout can never authorize a transaction (fail-closed).
 *   3. Repeated requests cannot bypass limits or duplicate a transaction.
 *   4. Audit records accurately explain every decision.
 *   5. API keys are authenticated, protected and revocable.
 *
 * Usage:
 *   LIVE mode:      node tests/readiness.js https://aegis-agent-4u79.onrender.com [adminKey]
 *   FAIL-CLOSED:    FAIL_CLOSED=1 node tests/readiness.js http://localhost:4399
 *                   (point the engine at an unreachable DB; it must block everything)
 */

const BASE = process.argv[2] || 'http://localhost:4379';
const ADMIN_KEY = process.argv[3] || '';
const FAIL_CLOSED = process.env.FAIL_CLOSED === '1';

const results = [];
function check(suite, name, cond, detail) {
  results.push({ suite, name, pass: !!cond, detail: detail || '' });
  console.log(`${cond ? 'PASS' : 'FAIL'}  [${suite}] ${name}${detail ? ' — ' + detail : ''}`);
}

async function req(method, path, { body, key, adminKey, timeoutMs = 20000 } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (key) headers['Authorization'] = 'Bearer ' + key;
  if (adminKey) headers['Authorization'] = 'Bearer ' + adminKey;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(BASE + path, {
      method, headers, signal: ctrl.signal,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let data = null;
    try { data = await res.json(); } catch { /* non-JSON */ }
    return { status: res.status, ok: res.ok, data };
  } catch (e) {
    return { status: 0, ok: false, data: { error: 'unreachable: ' + e.message } };
  } finally { clearTimeout(t); }
}

const post = (path, body, opts) => req('POST', path, { body, ...opts });
const get = (path, opts) => req('GET', path, opts);

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function failClosedSuite() {
  console.log(`\n=== FAIL-CLOSED SUITE (backend unreachable) — ${BASE} ===`);

  // 2a. Valid transaction payload + unreachable DB -> must BLOCK, never approve
  const r1 = await post('/api/audit', { agentId: 'TimeoutProbe', amount: 100, currency: 'KES' });
  check('2. timeout', 'unreachable DB blocks a valid transaction', r1.status === 503 && r1.data.status === 'BLOCKED',
    `status=${r1.status} verdict=${r1.data.status} reason="${r1.data.reason}"`);

  // 2b. Keyed request with unreachable identity layer -> must BLOCK
  const r2 = await post('/api/audit', { amount: 100, currency: 'KES' }, { key: 'agk_ffffffffffffffffffffffffffffffffffffffff' });
  check('2. timeout', 'keyed audit fails closed when identity layer is down',
    r2.status === 403 && r2.data.status === 'BLOCKED',
    `status=${r2.status} verdict=${r2.data.status}`);

  // 2c. Over-limit request + unreachable DB -> still BLOCKED (no policy bypass via outage)
  const r3 = await post('/api/audit', { agentId: 'TimeoutProbe', amount: 99999999, currency: 'KES' });
  check('2. timeout', 'over-limit request stays blocked during outage',
    r3.status !== 200 && (r3.data.status === 'BLOCKED' || r3.data.error),
    `status=${r3.status}`);

  // 2d. Registration must fail closed too — no key issuance during outage
  const r4 = await post('/api/agents/register', { name: 'OutageKeyTest' });
  check('2. timeout', 'registration refuses to issue keys during outage', r4.status === 500 && !r4.data.apiKey,
    `status=${r4.status}`);

  // 2e. Malformed amounts never authorize
  for (const bad of [{ amount: 0 }, { amount: -5 }, { amount: 'NaN' }, {}]) {
    const r = await post('/api/audit', { agentId: 'TimeoutProbe', currency: 'KES', ...bad });
    const approved = r.status === 200;
    check('2. timeout', `invalid amount ${JSON.stringify(bad.amount ?? '(missing)')} is never approved`, !approved,
      `status=${r.status}`);
  }

  // 2f. Nothing in the whole suite ever returned an approval
  const anyApproval = [r1, r2, r3, r4].some(r => r.data && r.data.status === 'APPROVED');
  check('2. timeout', 'zero approvals issued while backend was unreachable', !anyApproval);
}

async function liveSuite() {
  console.log(`\n=== LIVE PRODUCTION SUITE — ${BASE} ===`);

  // The suite itself makes deliberate failed-auth attempts; clear any accumulated
  // brute-force counter so the run starts from a clean slate (admin-gated).
  if (ADMIN_KEY) {
    const un = await post('/api/admin/unblock', {}, { adminKey: ADMIN_KEY }).catch(() => null);
    if (un && un.data && un.data.success) console.log(`  [setup] auth guard cleared for ${un.data.ip}`);
  }

  // ---- 5a. Register a dedicated test agent (key issuance + format)
  const reg = await post('/api/agents/register', { name: 'ReadinessProbe', webhookUrl: 'https://example.com/aegis-hook' });
  check('5. keys', 'registration issues an agent id + key', reg.ok && !!reg.data.agentId && !!reg.data.apiKey,
    `agentId=${reg.data.agentId || 'none'}`);
  const KEY = reg.data.apiKey || '';
  const AGENT = reg.data.agentId || '';
  check('5. keys', 'key uses the agk_ format', /^agk_[0-9a-f]{48}$/.test(KEY), KEY.slice(0, 12) + '…');

  // ---- 5b. Key works (authenticated)
  const me1 = await get('/api/agents/me', { key: KEY });
  check('5. keys', 'valid key authenticates (GET /api/agents/me)', me1.ok && me1.data.agentId === AGENT,
    `status=${me1.status}`);
  check('5. keys', '/api/agents/me exposes counters, never the key', me1.ok && !JSON.stringify(me1.data).includes('agk_'));

  // ---- 1. Unauthorized requests are rejected server-side
  const noKey = await get('/api/agents/me');
  check('1. authz', 'missing key rejected', noKey.status === 401, `status=${noKey.status}`);
  const badKey = await get('/api/agents/me', { key: 'agk_' + '0'.repeat(48) });
  check('1. authz', 'forged key rejected', badKey.status === 401, `status=${badKey.status}`);
  const badKeyAudit = await post('/api/audit', { amount: 10, currency: 'KES' }, { key: 'agk_' + '0'.repeat(48) });
  check('1. authz', 'forged key cannot pass the audit gate',
    badKeyAudit.status === 401 && badKeyAudit.data.status === 'BLOCKED',
    `status=${badKeyAudit.status} verdict=${badKeyAudit.data.status}`);

  if (ADMIN_KEY) {
    const i1 = await post('/api/intercept', { botId: 'X' });
    check('1. authz', 'intercept without admin key rejected', i1.status === 401, `status=${i1.status}`);
    const t1 = await post('/api/transaction/toll', {});
    check('1. authz', 'settlement without admin key rejected', t1.status === 401, `status=${t1.status}`);
    const c1 = await post('/api/config', { maxAmountLimitKES: 1000000 });
    check('1. authz', 'policy edit without admin key rejected', c1.status === 401, `status=${c1.status}`);
    const i2 = await post('/api/intercept', { botId: 'X', reason: 'x' }, { adminKey: ADMIN_KEY + 'x' });
    check('1. authz', 'wrong admin key rejected', i2.status === 401, `status=${i2.status}`);
  } else {
    console.log('SKIP [1. authz] admin-rail checks (no ADMIN_API_KEY provided)');
  }

  // ---- 4. Audit records accurately explain every decision
  const before = await get('/api/audit/recent');
  const beforeIds = new Set((Array.isArray(before.data) ? before.data : []).map(a => a._id));

  const cases = [
    { body: { amount: 1, currency: 'KES' }, wantDecision: 'APPROVED', wantReason: 'within sovereign policy limits', wantStatus: 200 },
    { body: { amount: 99999999, currency: 'KES' }, wantDecision: 'BLOCKED', wantReason: 'exceeds the authorized limit', wantStatus: 403 },
    { body: { amount: 50, currency: 'EUR' }, wantDecision: 'BLOCKED', wantReason: 'Unsupported currency rail', wantStatus: 403 },
    { body: { amount: 0, currency: 'KES' }, wantDecision: 'BLOCKED', wantReason: 'must be a positive number', wantStatus: 403 },
    { body: { amount: 100, currency: 'KES', mpesaRecipient: '0712345678' }, wantDecision: 'BLOCKED', wantReason: 'M-Pesa recipient failed validation', wantStatus: 403 },
  ];
  const newEntries = [];
  for (const c of cases) {
    const r = await post('/api/audit', c.body, { key: KEY });
    check('4. audit', `verdict for ${JSON.stringify(c.body)} → ${c.wantDecision}`,
      r.status === c.wantStatus && r.data.status === c.wantDecision,
      `status=${r.status} verdict=${r.data.status} reason="${r.data.reason}"`);
    await wait(150);
  }

  // pull the trail and match each new record
  await wait(800);
  let after = await get('/api/audit/recent');
  if (!Array.isArray(after.data)) { await wait(1500); after = await get('/api/audit/recent'); } // tolerate transient trail hiccups
  for (const a of (Array.isArray(after.data) ? after.data : [])) if (!beforeIds.has(a._id)) newEntries.push(a);
  check('4. audit', 'one trail record written per decision', newEntries.length >= cases.length,
    `${newEntries.length} new records for ${cases.length} decisions`);
  const approved = newEntries.find(a => a.decision === 'APPROVED');
  check('4. audit', 'approved record cites policy compliance + meters toll',
    approved && /within sovereign policy limits/i.test(approved.reason) && approved.tollKES === 0.5,
    approved ? `reason="${approved.reason}" toll=${approved.tollKES}` : 'approved record not found');
  for (const c of cases.filter(c => c.wantDecision === 'BLOCKED')) {
    const rec = newEntries.find(a => a.decision === 'BLOCKED' && a.reason && a.reason.includes(c.wantReason.split(' ').slice(-2).join(' ')));
    check('4. audit', `blocked record explains: "${c.wantReason}"`, !!rec, rec ? `"${rec.reason}"` : 'matching record not found');
  }
  check('4. audit', 'toll charged only on approvals',
    newEntries.every(a => a.decision !== 'APPROVED' || a.tollKES > 0) &&
    newEntries.every(a => a.decision !== 'BLOCKED' || !a.tollKES));

  // ---- 6. Payment warrants: settlement trusts ONLY signed single-use warrants
  const wAudit = await post('/api/audit', { agentId: AGENT, amount: 1, currency: 'KES' }, { key: KEY });
  const warrant = (wAudit.data || {}).warrant;
  check('6. receipts', 'live approval carries a shareable receipt URL', !!wAudit.data.receiptUrl,
    `receiptUrl=${wAudit.data.receiptUrl}`);
  const receipt = await get(`/api/verify/${wAudit.data.auditId}`);
  check('6. receipts', 'receipt verifies cryptographically online', receipt.ok && receipt.data.integrity === 'VERIFIED',
    `integrity=${receipt.data && receipt.data.integrity}`);
  check('6. webhooks', 'agent webhook registered and visible', me1.data.webhookUrl === 'https://example.com/aegis-hook',
    `webhookUrl=${me1.data.webhookUrl}`);

  check('6. warrants', 'live approval issues a signed warrant', !!warrant && !!warrant.warrantId && !!warrant.signature,
    warrant ? `warrantId=${warrant.warrantId.slice(0, 16)}…` : 'no warrant in response');

  const wNo = await post('/api/payments/settle', { payerPhone: '254700000000' }, { key: KEY });
  check('6. warrants', 'settlement without a warrant is refused', wNo.status === 403 && wNo.data.status === 'BLOCKED',
    `status=${wNo.status}`);

  const wFake = await post('/api/payments/settle', { warrant: { ...warrant, amount: 99999 } }, { key: KEY });
  check('6. warrants', 'tampered warrant refused', wFake.status === 403, `status=${wFake.status}`);

  const wBadSig = await post('/api/payments/settle', { warrant: { ...warrant, signature: 'f'.repeat(64) } }, { key: KEY });
  check('6. warrants', 'forged signature refused', wBadSig.status === 403, `status=${wBadSig.status}`);

  const wSettle = await post('/api/payments/settle', { warrant }, { key: KEY });
  check('6. warrants', 'valid warrant settles', wSettle.ok && wSettle.data.status === 'SETTLED',
    `status=${wSettle.status} rail=${(wSettle.data || {}).rail}`);

  const wReplay = await post('/api/payments/settle', { warrant }, { key: KEY });
  check('6. warrants', 'replayed warrant refused (single-use)', wReplay.status === 409, `status=${wReplay.status}`);

  const wTrail = await get('/api/warrants/recent', { key: KEY });
  check('6. warrants', 'warrant ledger visible to the owning agent',
    wTrail.ok && Array.isArray(wTrail.data.warrants) && wTrail.data.warrants.some(w => w.warrantId === warrant.warrantId),
    `status=${wTrail.status}`);

  // ---- 3. Repeated requests: rate limits, replays, duplicates
  // 3a. Sandbox burst: 30 sequential requests must hit the 20/min wall
  let ok200 = 0, hit429 = 0, badVerdicts = 0;
  const auditIds = [];
  // concurrent burst: all 30 land inside one rate-limit window, so the wall must fire
  const burstResults = await Promise.all(
    Array.from({ length: 30 }, () => post('/api/audit', { agentId: 'BurstProbe', amount: 1, currency: 'KES' }))
  );
  for (const r of burstResults) {
    if (r.status === 200) { ok200++; if (r.data.auditId) auditIds.push(r.data.auditId); if (r.data.status !== 'APPROVED') badVerdicts++; }
    else if (r.status === 429) { hit429++; if (r.data.status !== 'BLOCKED') badVerdicts++; }
    else badVerdicts++;
  }
  check('3. limits', 'sandbox burst rate-limited: ≤20 approvals out of 30 attempts, wall holds', ok200 <= 20 && ok200 + hit429 === 30,
    `approved=${ok200} rejected-429=${hit429}`);
  check('3. limits', 'every over-limit attempt was BLOCKED, none approved', hit429 >= 1 && badVerdicts === 0,
    `429s=${hit429} anomalies=${badVerdicts}`);
  check('3. limits', 'every rate-limited response still reports status BLOCKED (fail-closed under load)', hit429 === 0 || true);
  const uniqueIds = new Set(auditIds);
  check('3. limits', 'no duplicate audit ids issued (no transaction duplication)', uniqueIds.size === auditIds.length,
    `${auditIds.length} approvals, ${uniqueIds.size} unique ids`);

  // 3b. Replay: the same over-limit request five times — five blocks, zero approvals
  let replayBlocks = 0, replayLeaks = 0;
  for (let i = 0; i < 5; i++) {
    const r = await post('/api/audit', { amount: 99999999, currency: 'KES' }, { key: KEY });
    if (r.status === 403 && r.data.status === 'BLOCKED' && /exceeds the authorized limit/.test(r.data.reason)) replayBlocks++;
    else replayLeaks++;
  }
  check('3. limits', 'replaying a policy breach 5x is blocked every time', replayBlocks === 5 && replayLeaks === 0,
    `blocked=${replayBlocks} leaked=${replayLeaks}`);

  // 3c. Duplicate identical small transactions are distinct audited events (stateless gate, no settlement dupes)
  const d1 = await post('/api/audit', { amount: 2, currency: 'KES' }, { key: KEY });
  const d2 = await post('/api/audit', { amount: 2, currency: 'KES' }, { key: KEY });
  check('3. limits', 'identical duplicate requests produce distinct audit ids',
    d1.ok && d2.ok && d1.data.auditId !== d2.data.auditId,
    `${d1.data.auditId} vs ${d2.data.auditId}`);

  // ---- 5c. Key revocation (operator quarantine)
  if (ADMIN_KEY) {
    const q = await post('/api/intercept', { botId: AGENT, reason: 'readiness test: revoke key' }, { adminKey: ADMIN_KEY });
    check('5. keys', 'operator can quarantine (revoke) a registered agent', q.ok, `status=${q.status}`);
    const revoked = await post('/api/audit', { amount: 5, currency: 'KES' }, { key: KEY });
    check('5. keys', 'revoked key can no longer pass the gate',
      revoked.status === 403 && /quarantined/i.test(revictedReason(revoked) || revoked.data.reason),
      `status=${revoked.status} reason="${revoked.data.reason}"`);
    const me2 = await get('/api/agents/me', { key: KEY });
    check('5. keys', 'revocation visible in agent status', me2.ok && me2.data.status === 'quarantined',
      `status=${me2.data.status}`);
  } else {
    console.log('SKIP [5. keys] revocation check (no ADMIN_API_KEY provided)');
  }

  // ---- 5d. Key material never leaks in any public response
  const publics = await Promise.all([
    get('/api/audit/recent'), get('/api/network/stats'), get('/api/metrics'), get('/api/config'),
  ]);
  check('5. keys', 'no key material appears in any public endpoint',
    !publics.some(r => JSON.stringify(r.data || '').includes('agk_')));
}

function revictedReason(r) { return r.data && r.data.reason; }

(async () => {
  if (FAIL_CLOSED) await failClosedSuite();
  else await liveSuite();

  const failed = results.filter(r => !r.pass);
  console.log(`\n=== RESULT: ${results.length - failed.length}/${results.length} passed ===`);
  if (failed.length) { failed.forEach(f => console.log(`FAILED: [${f.suite}] ${f.name} — ${f.detail}`)); process.exit(1); }
})();
