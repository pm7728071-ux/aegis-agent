/* Sovereign Policy Grid — AEGIS Security Console (build-free frontend) */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var fmtKES = function (n) { return new Intl.NumberFormat('en-KE', { maximumFractionDigits: 2 }).format(n || 0); };
  var fmtUSD = function (n) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n || 0); };
  var pop = function (el, text) { el.textContent = text; el.classList.remove('animate-countPop'); void el.offsetWidth; el.classList.add('animate-countPop'); };

  var flashTimer = null;
  function showFlash(tone, text) {
    var f = $('flash');
    f.textContent = text;
    f.className = 'rounded-lg px-4 py-3 font-mono text-sm animate-slideIn ' +
      (tone === 'accent'
        ? 'border border-accent-500/40 bg-accent-500/10 text-accent-400'
        : 'border border-danger-500/40 bg-danger-500/10 text-danger-400');
    clearTimeout(flashTimer);
    flashTimer = setTimeout(function () { f.className = 'hidden'; }, 4500);
  }

  function renderVerdict(v) {
    var box = $('verdict');
    var approved = v && v.status === 'APPROVED';
    box.className = 'rounded-xl border p-4 animate-slideIn ' +
      (approved
        ? 'border-accent-500/50 bg-accent-500/10 shadow-glow'
        : 'border-danger-500/50 bg-danger-500/10 shadow-dangerGlow');
    $('verdictTitle').textContent = approved ? '✔ VERDICT: APPROVED' : '✖ VERDICT: BLOCKED';
    $('verdictTitle').className = 'font-mono text-sm font-semibold ' + (approved ? 'text-accent-400' : 'text-danger-400');
    $('verdictReason').textContent = (v && v.reason) || 'No reason supplied by the gateway.';
    $('verdictMeta').textContent =
      v && v.tollKES != null && v.auditId ? 'Toll ' + v.tollKES + ' KES · audit ' + v.auditId : '';
  }

  function renderRadar(metrics) {
    var bots = ((metrics && metrics.rogueBotsCaught) || []).slice().reverse().slice(0, 12);
    var list = $('radarList');
    list.innerHTML = '';
    $('radarCount').textContent = bots.length ? bots.length + ' recent intercept' + (bots.length > 1 ? 's' : '') : 'no rogue traffic';
    if (!bots.length) {
      var quiet = document.createElement('li');
      quiet.className = 'px-5 py-8 text-center font-mono text-sm text-slate-500';
      quiet.textContent = 'Perimeter quiet. No rogue agents detected.';
      list.appendChild(quiet);
      return;
    }
    bots.forEach(function (b) {
      var li = document.createElement('li');
      li.className = 'flex items-center justify-between gap-4 px-5 py-3 animate-slideIn';
      var left = document.createElement('div');
      left.className = 'min-w-0';
      var id = document.createElement('p');
      id.className = 'truncate font-mono text-sm text-danger-400';
      id.textContent = b.botId || 'unknown';
      var reason = document.createElement('p');
      reason.className = 'truncate text-xs text-slate-500';
      reason.textContent = b.reason || '';
      left.appendChild(id); left.appendChild(reason);
      var right = document.createElement('div');
      right.className = 'shrink-0 text-right';
      var score = document.createElement('p');
      score.className = 'font-mono text-[10px] text-slate-400';
      score.textContent = b.payloadRiskScore || '';
      var ts = document.createElement('p');
      ts.className = 'font-mono text-[10px] text-slate-600';
      ts.textContent = b.timestamp ? new Date(b.timestamp).toLocaleTimeString() : '';
      right.appendChild(score); right.appendChild(ts);
      li.appendChild(left); li.appendChild(right);
      list.appendChild(li);
    });
  }

  function renderTrail(audits) {
    var list = $('trailList');
    list.innerHTML = '';
    if (!audits || !audits.length) {
      var empty = document.createElement('li');
      empty.className = 'px-5 py-6 text-center font-mono text-sm text-slate-500';
      empty.textContent = 'No transactions audited yet. Send one through the gate.';
      list.appendChild(empty);
      return;
    }
    audits.forEach(function (a) {
      var li = document.createElement('li');
      li.className = 'flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 animate-slideIn';
      var badge = document.createElement('span');
      var approved = a.decision === 'APPROVED';
      badge.className = 'rounded px-2 py-0.5 font-mono text-[10px] font-semibold ' +
        (approved ? 'bg-accent-500/15 text-accent-400' : 'bg-danger-500/15 text-danger-400');
      badge.textContent = a.decision || '';
      var amt = document.createElement('span');
      amt.className = 'font-mono text-sm text-slate-200';
      amt.textContent = a.amount + ' ' + a.currency;
      var agent = document.createElement('span');
      agent.className = 'font-mono text-xs text-slate-500';
      agent.textContent = a.agentId || '';
      var ts = document.createElement('span');
      ts.className = 'ml-auto font-mono text-[10px] text-slate-600';
      ts.textContent = a.timestamp ? new Date(a.timestamp).toLocaleString() : '';
      li.appendChild(badge); li.appendChild(amt); li.appendChild(agent); li.appendChild(ts);
      list.appendChild(li);
    });
  }

  function render(metrics, config, audits) {
    var live = !!config;
    $('statusDot').className = 'h-2 w-2 rounded-full ' + (live ? 'bg-accent-400 animate-pulseDot' : 'bg-danger-400');
    $('statusText').textContent = live ? config.gateway : 'LINK DOWN';
    $('errorBanner').className = live
      ? 'hidden'
      : 'rounded-lg border border-danger-500/40 bg-danger-500/10 px-4 py-3 font-mono text-sm text-danger-400 shadow-dangerGlow';
    if (!live) $('errorBanner').textContent = 'Cloud telemetry link interrupted — retrying…';
    pop($('tileTasks'), fmtKES(metrics && metrics.totalTasksAudited));
    pop($('tileRevenue'), fmtKES(metrics && metrics.totalRevenueKSH));
    pop($('tileYield'), fmtUSD(metrics && metrics.sovereignYieldUSD));
    pop($('tilePolicy'), config && config.policy ? fmtKES(config.policy.maxAmountLimitKES) + ' KES' : '····');
    $('footer').textContent = (config && config.environment) || 'environment sync pending';
    renderRadar(metrics);
    renderTrail(audits);
  }

  function refresh() {
    Promise.all([
      fetch('/api/metrics').then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); }).catch(function () { return null; }),
      fetch('/api/config').then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); }).catch(function () { return null; }),
      fetch('/api/audit/recent').then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); }).catch(function () { return []; }),
    ]).then(function (data) {
      render(data[0], data[1], Array.isArray(data[2]) ? data[2] : []);
    });
  }

  function post(url, body) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(function (res) {
      return res.json().then(function (data) { return { ok: res.ok, data: data }; });
    });
  }

  $('auditForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var amount = Number($('auditAmount').value);
    var body = {
      agentId: $('auditAgent').value.trim() || undefined,
      amount: amount,
      currency: $('auditCurrency').value || 'KES',
    };
    post('/api/audit', body).then(function (r) {
      renderVerdict(r.data);
      if (r.ok) {
        $('auditForm').reset();
        showFlash('accent', 'Audit APPROVED — toll ' + r.data.tollKES + ' KES recorded.');
      } else {
        showFlash('danger', (r.data && r.data.reason) || 'Audit BLOCKED by sovereign policy.');
      }
      refresh();
    }).catch(function () {
      renderVerdict({ status: 'BLOCKED', reason: 'Gateway unreachable — defensive freeze.' });
    });
  });

  $('interceptForm').addEventListener('submit', function (e) {
    e.preventDefault();
    post('/api/intercept', {
      botId: $('interceptBot').value.trim() || undefined,
      reason: $('interceptReason').value.trim() || undefined,
    }).then(function (r) {
      if (r.ok) {
        showFlash('danger', 'Rogue agent ' + ($('interceptBot').value.trim() || 'auto-id') + ' quarantined.');
        $('interceptForm').reset();
      } else {
        showFlash('danger', 'Firewall intercept failed — engine unreachable.');
      }
      refresh();
    }).catch(function () { showFlash('danger', 'Firewall intercept failed — engine unreachable.'); });
  });

  $('tollForm').addEventListener('submit', function (e) {
    e.preventDefault();
    post('/api/transaction/toll', {
      amountKSH: Number($('tollAmount').value) || undefined,
      yieldUSD: Number($('tollYield').value) || undefined,
    }).then(function (r) {
      if (r.ok) {
        showFlash('accent', 'Settlement recorded. Sovereign yield accrued.');
        $('tollForm').reset();
      } else {
        showFlash('danger', 'Settlement layer timeout — retry.');
      }
      refresh();
    }).catch(function () { showFlash('danger', 'Settlement layer timeout — retry.'); });
  });

  refresh();
  setInterval(refresh, 5000);
})();
