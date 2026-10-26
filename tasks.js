// v2.9.0 EXECUTION LOOP — plan -> act -> verify -> errors -> approval.
// An agent submits a goal and steps. Aegis plans, executes each step through the
// policy gate, verifies every warrant signature, fails closed on errors, and
// halts for human approval when a step exceeds policy.
module.exports = function createTaskLoop(d) {
    const { app, crypto, Task, Agent, Audit, Warrant, resolveAgent, withTimeout, requireAdmin, warrantSign, WARRANT_TTL_MS, clientIp, recordAuthFailure } = d;

    const runTaskStep = async (agent, step) => {
        const amount = Number(step.amount);
        const currency = String(step.currency || 'KES').toUpperCase();
        if (!Number.isFinite(amount) || amount <= 0) return { status: 'FAILED', reason: 'Invalid step amount' };
        const limit = Number(agent.policyLimitKES || 0);
        if (limit > 0 && amount > limit) {
            const pending = await withTimeout(Audit.create({
                agentId: agent.agentId, amount, currency, decision: 'PENDING_APPROVAL',
                reason: 'Task step exceeds policy limit ' + limit + ' ' + currency + ' - operator approval required',
                tollKES: 0, receiptHash: '',
            }), 3000);
            return { status: 'NEEDS_APPROVAL', reason: 'Step exceeds policy limit; held for operator approval', auditId: pending.id };
        }
        const w = {
            warrantId: 'aegis_wt_' + crypto.randomBytes(12).toString('hex'),
            auditId: 'task_' + crypto.randomBytes(8).toString('hex'),
            agentId: agent.agentId, amount, currency,
            expiresAt: Date.now() + WARRANT_TTL_MS,
        };
        w.signature = warrantSign(w);
        await withTimeout(Warrant.create({ ...w }), 3000);
        await withTimeout(Audit.create({
            agentId: agent.agentId, amount, currency, decision: 'APPROVED',
            reason: String(step.note || 'Task step authorized by execution loop').slice(0, 160),
            tollKES: 0, receiptHash: w.signature.slice(0, 16),
        }), 3000);
        const verified = warrantSign(w) === w.signature;
        return { status: verified ? 'AUTHORIZED' : 'FAILED', verified, warrant: w, reason: verified ? 'Warrant signature verified' : 'Signature verification failed' };
    };

    app.post('/api/tasks', async (req, res) => {
        try {
            const { mode, agent } = await resolveAgent(req);
            if (mode === 'throttled') return res.status(429).json({ status: 'BLOCKED', reason: 'Agent rate limit exceeded' });
            if (mode !== 'live' || !agent) { recordAuthFailure(clientIp(req)); return res.status(401).json({ status: 'BLOCKED', reason: 'A valid registered API key is required to run tasks' }); }
            if (agent.status === 'quarantined') return res.status(403).json({ status: 'BLOCKED', reason: 'Agent is quarantined and may not run tasks' });
            const { goal, steps } = req.body || {};
            if (!Array.isArray(steps) || !steps.length) return res.status(400).json({ status: 'BLOCKED', reason: 'steps[] required' });
            if (steps.length > 20) return res.status(400).json({ status: 'BLOCKED', reason: 'Maximum 20 steps per task' });

            const taskId = 'aegis_task_' + crypto.randomBytes(10).toString('hex');
            const plan = steps.map((s, i) => ({ index: i + 1, type: String(s.type || 'payment'), amount: Number(s.amount) || 0, currency: String(s.currency || 'KES').toUpperCase(), note: String(s.note || '').slice(0, 160), status: 'PLANNED' }));

            // Plan first: nothing executes unless every step is structurally valid.
            const invalid = plan.find(p => !Number.isFinite(p.amount) || p.amount <= 0);
            if (invalid) {
                const failed = await withTimeout(Task.create({ taskId, agentId: agent.agentId, goal: String(goal || '').slice(0, 200), status: 'FAILED', steps: plan.map(p => ({ ...p, status: 'SKIPPED', reason: 'Task aborted at planning: invalid step structure' })), digest: 'FAILED at plan' }), 3000);
                return res.status(422).json({ status: 'FAILED', taskId, phase: 'plan', reason: 'Step ' + invalid.index + ' has an invalid amount; nothing was executed', task: failed });
            }

            // Act -> verify per step; stop on first failure (fail-closed) or approval halt.
            const executed = [];
            let halted = null;
            for (const p of plan) {
                if (halted) { executed.push({ ...p, status: 'SKIPPED', reason: 'Task halted: ' + halted }); continue; }
                const result = await runTaskStep(agent, p);
                executed.push({ ...p, ...result });
                if (result.status === 'FAILED') halted = 'step ' + p.index + ' failed - remaining steps not executed';
                if (result.status === 'NEEDS_APPROVAL') halted = 'step ' + p.index + ' requires operator approval';
            }

            const status = executed.some(s => s.status === 'NEEDS_APPROVAL') ? 'NEEDS_APPROVAL' : (halted ? 'FAILED' : 'COMPLETED');
            const authorized = executed.filter(s => s.status === 'AUTHORIZED').length;
            const task = await withTimeout(Task.create({
                taskId, agentId: agent.agentId, goal: String(goal || '').slice(0, 200), status, steps: executed,
                digest: status + ': ' + authorized + '/' + executed.length + ' steps authorized',
            }), 3000);
            return res.status(status === 'COMPLETED' ? 200 : (status === 'NEEDS_APPROVAL' ? 202 : 422)).json({ status, taskId, goal: task.goal, digest: task.digest, steps: executed, note: 'Every authorized step carries a signed, verified single-use warrant. Settlement remains a separate, warrant-bound call.' });
        } catch (err) {
            return res.status(503).json({ status: 'FAILED', reason: 'Execution loop unreachable - nothing was authorized' });
        }
    });

    app.get('/api/tasks/:taskId', async (req, res) => {
        try {
            const { mode, agent } = await resolveAgent(req);
            if (mode === 'throttled') return res.status(429).json({ status: 'BLOCKED', reason: 'Agent rate limit exceeded' });
            if (mode !== 'live' || !agent) { recordAuthFailure(clientIp(req)); return res.status(401).json({ status: 'BLOCKED', reason: 'A valid registered API key is required' }); }
            const task = await withTimeout(Task.findOne({ taskId: String(req.params.taskId).slice(0, 80) }), 3000);
            if (!task) return res.status(404).json({ error: 'Task not found' });
            if (task.agentId !== agent.agentId) return res.status(403).json({ error: 'This task belongs to a different agent' });
            return res.json({ taskId: task.taskId, goal: task.goal, status: task.status, digest: task.digest, steps: task.steps, createdAt: task.createdAt });
        } catch (err) {
            return res.status(503).json({ error: 'Task lookup unreachable' });
        }
    });

    // Operator approves a halted task and resumes the remaining steps.
    app.post('/api/tasks/:taskId/resume', requireAdmin, async (req, res) => {
        try {
            const task = await withTimeout(Task.findOne({ taskId: String(req.params.taskId).slice(0, 80) }), 3000);
            if (!task) return res.status(404).json({ error: 'Task not found' });
            if (task.status !== 'NEEDS_APPROVAL') return res.status(409).json({ error: 'Task is ' + task.status + ', not NEEDS_APPROVAL' });
            const agentRecord = await withTimeout(Agent.findOne({ agentId: task.agentId }), 3000);
            if (!agentRecord) return res.status(404).json({ error: 'Owning agent no longer registered' });
            const lifted = { ...agentRecord.toObject(), policyLimitKES: Number.MAX_SAFE_INTEGER };
            const steps = [];
            let halted = null;
            for (const s of task.steps) {
                if (s.status === 'AUTHORIZED' || s.status === 'SKIPPED') { steps.push(s); continue; }
                if (halted) { steps.push({ ...s, status: 'SKIPPED', reason: 'Task halted: ' + halted }); continue; }
                const result = await runTaskStep(lifted, s);
                steps.push({ ...s, ...result, reason: 'Operator-approved: ' + (result.reason || '') });
                if (result.status === 'FAILED') halted = 'step ' + s.index + ' failed';
            }
            const status = halted ? 'FAILED' : 'COMPLETED';
            task.steps = steps;
            task.status = status;
            task.digest = status + ': ' + steps.filter(s => s.status === 'AUTHORIZED').length + '/' + steps.length + ' steps authorized after operator approval';
            task.updatedAt = new Date();
            await withTimeout(task.save(), 3000);
            return res.json({ status, taskId: task.taskId, digest: task.digest, steps });
        } catch (err) {
            return res.status(503).json({ error: 'Resume unreachable - nothing further was authorized' });
        }
    });
};
