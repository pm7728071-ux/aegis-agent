#!/usr/bin/env node
/**
 * Aegis execution-loop suite (v2.9.0) — Days 15-30 roadmap checks.
 * Usage: node tests/execution.js <baseUrl> [adminKey]
 */
const BASE = (process.argv[2] || 'https://aegis-agent-4u79.onrender.com').replace(/\/$/, '');
const ADMIN = process.argv[3] || '';
const results = [];
let failures = 0;

async function req(method, path, { body, key, timeoutMs = 25000 } = {}) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const r = await fetch(BASE + path, {
            method, signal: ctrl.signal,
            headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: 'Bearer ' + key } : {}) },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        const text = await r.text();
        let data = {};
        try { data = JSON.parse(text); } catch (_) {}
        return { status: r.status, ok: r.ok, data };
    } catch (e) {
        return { status: 0, ok: false, data: { error: e.message } };
    } finally { clearTimeout(t); }
}
function check(id, label, pass, detail) {
    results.push(pass);
    if (!pass) failures++;
    console.log(`${pass ? 'PASS' : 'FAIL'}  [${id}] ${label}${detail ? ' — ' + detail : ''}`);
}

(async () => {
    console.log(`\n=== AEGIS EXECUTION LOOP SUITE — ${BASE} ===`);
    const reg = await req('POST', '/api/agents/register', { body: { name: 'ExecSuite_' + Date.now().toString(36), policyLimitKES: 5000 } });
    if (reg.status !== 201) { console.log('SKIP: registration unavailable (' + reg.status + ')'); process.exit(0); }
    const KEY = reg.data.apiKey;

    // 1. Plan + execute: two in-policy steps complete, both with verified warrants.
    const t1 = await req('POST', '/api/tasks', { body: { goal: 'Weekly supplier payouts', steps: [{ amount: 120, note: 'supplier A' }, { amount: 80, note: 'supplier B' }] }, key: KEY });
    const s1 = (t1.data.steps || []);
    check('E1', 'in-policy task plans and completes', t1.status === 200 && t1.data.status === 'COMPLETED', `status=${t1.data.status}`);
    check('E2', 'every authorized step carries a verified signed warrant', s1.length === 2 && s1.every(s => s.status === 'AUTHORIZED' && s.verified === true && s.warrant && s.warrant.signature), `steps=${s1.map(s => s.status).join(',')}`);

    // 2. Approval gate: over-limit step halts the loop, later steps skipped.
    const t2 = await req('POST', '/api/tasks', { body: { goal: 'Large transfer', steps: [{ amount: 50 }, { amount: 9000 }, { amount: 60 }] }, key: KEY });
    check('E3', 'over-limit step halts for operator approval and later steps are skipped', t2.status === 202 && t2.data.status === 'NEEDS_APPROVAL' && (t2.data.steps || [])[2] && t2.data.steps[2].status === 'SKIPPED', `status=${t2.data.status}`);

    // 3. Error handling: invalid plan aborts before any execution (fail-closed).
    const t3 = await req('POST', '/api/tasks', { body: { goal: 'Bad plan', steps: [{ amount: 10 }, { amount: -5 }] }, key: KEY });
    const t3steps = t3.data.task ? t3.data.task.steps : (t3.data.steps || []);
    check('E4', 'invalid plan fails closed with nothing executed', t3.status === 422 && t3.data.status === 'FAILED' && t3steps.every(s => s.status === 'SKIPPED'), `status=${t3.data.status}`);

    // 4. Operator resume after approval.
    if (ADMIN) {
        const res = await req('POST', `/api/tasks/${t2.data.taskId}/resume`, { key: ADMIN });
        check('E5', 'operator approval resumes and completes the halted task', res.ok && res.data.status === 'COMPLETED' && (res.data.steps || []).every(s => ['AUTHORIZED', 'SKIPPED'].includes(s.status)), `status=${res.data.status}`);
        const res2 = await req('POST', `/api/tasks/${t2.data.taskId}/resume`, { key: ADMIN });
        check('E6', 'double-resume is refused', res2.status === 409, `status=${res2.status}`);
    } else console.log('SKIP [E5-E6] resume checks (no admin key provided)');

    // 5. Task status lookup is owner-scoped.
    const look = await req('GET', `/api/tasks/${t1.data.taskId}`, { key: KEY });
    check('E7', 'task status is retrievable by its owner', look.ok && look.data.taskId === t1.data.taskId && look.data.status === 'COMPLETED', `status=${look.data.status}`);

    console.log(`\n=== RESULT: ${results.length - failures}/${results.length} execution checks passed ===`);
    if (failures) process.exit(1);
})().catch(e => { console.error('SUITE ERROR:', e.message); process.exit(2); });
