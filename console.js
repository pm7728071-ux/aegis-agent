/* Aegis — Operator Console (build-free frontend) */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var fmtKES = function (n) { return new Intl.NumberFormat('en-KE', { maximumFractionDigits: 2 }).format(n || 0); };
  var fmtUSD = function (n) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n || 0); };
  var pop = function (el, text) { el.textContent = text; el.classList.remove('animate-countPop'); void el.offsetWidth; el.classList.add('animate-countPop'); };

  var adminKey = '';
  try { adminKey = localStorage.getItem('aegis_admin_key') || ''; } catch (e) {}
  document.addEventListener('DOMContentLoaded', function () {
    var ak = $('adminKey');
    if (ak) {
      ak.value = adminKey;
      ak.addEventListener('input', function () {
        adminKey = ak.value.trim();
        try { localStorage.setItem('aegis_admin_key', adminKey); } catch (e) {}
      });
    }
  });

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

  function post(url, body, auth) {
    var headers = { 'Content-Type': 'application/json' };
    if (auth && adminKey) headers['Authorization'] = 'Bearer ' + adminKey;
    return fetch(url, {
      method: 'POST',
      headers: headers,
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
    }, true).then(function (r) {
      if (r.ok) {
        showFlash('danger', 'Rogue agent ' + ($('interceptBot').value.trim() || 'auto-id') + ' quarantined.');
        $('interceptForm').reset();
      } else {
        showFlash('danger', (r.data && r.data.error) || 'Firewall intercept failed — set your admin key.');
      }
      refresh();
    }).catch(function () { showFlash('danger', 'Firewall intercept failed — engine unreachable.'); });
  });

  $('tollForm').addEventListener('submit', function (e) {
    e.preventDefault();
    post('/api/transaction/toll', {
      amountKSH: Number($('tollAmount').value) || undefined,
      yieldUSD: Number($('tollYield').value) || undefined,
    }, true).then(function (r) {
      if (r.ok) {
        showFlash('accent', 'Settlement recorded. Sovereign yield accrued.');
        $('tollForm').reset();
      } else {
        showFlash('danger', (r.data && r.data.error) || 'Settlement failed — set your admin key.');
      }
      refresh();
    }).catch(function () { showFlash('danger', 'Settlement layer timeout — retry.'); });
  });

  // ----- M-Pesa rail -----
  function refreshMpesa() {
    Promise.all([
      fetch('/api/mpesa/config').then(function (r) { return r.ok ? r.json() : Promise.reject(); }).catch(function () { return null; }),
      fetch('/api/intasend/config').then(function (r) { return r.ok ? r.json() : Promise.reject(); }).catch(function () { return null; }),
    ]).then(function (rs) {
      var d = rs[0], i = rs[1];
      var el = $('mpesaState');
      if (!el) return;
      var dTxt = d && d.enabled ? 'Daraja: ' + d.environment : 'Daraja: off';
      var iTxt = i && i.enabled ? 'IntaSend: ' + i.environment : 'IntaSend: off';
      el.textContent = dTxt + ' · ' + iTxt;
      el.className = 'self-center font-mono text-[10px] ' + ((d && d.enabled) || (i && i.enabled) ? 'text-accent-400' : 'text-slate-500');
      var sel = $('mpesaProvider');
      if (sel) {
        var preferred = (i && i.enabled) ? 'intasend' : ((d && d.enabled) ? 'daraja' : null);
        if (preferred && !sel.dataset.chosen) { sel.value = preferred; }
      }
    });
    fetch('/api/mpesa/payments/recent').then(function (r) { return r.ok ? r.json() : Promise.reject(); }).catch(function () { return []; }).then(function (pays) {
      var list = $('mpesaRecent');
      list.textContent = '';
      (pays || []).slice(0, 5).forEach(function (p) {
        var li = document.createElement('li');
        li.className = 'flex items-center justify-between gap-3 px-1 py-1.5 font-mono text-[10px] animate-slideIn';
        var left = document.createElement('span');
        left.textContent = (p.provider === 'intasend' ? 'IS' : 'DR') + ' · ' + p.amount + ' KES · ' + p.phone;
        var tone = p.status === 'SUCCESS' ? 'text-accent-400' : p.status === 'FAILED' ? 'text-danger-400' : 'text-warn-400';
        left.className = 'text-slate-400 truncate';
        var right = document.createElement('span');
        right.className = tone + ' shrink-0';
        right.textContent = p.status + (p.receiptNumber ? ' · ' + p.receiptNumber : '');
        li.appendChild(left); li.appendChild(right);
        list.appendChild(li);
      });
    });
  }

  $('mpesaForm').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!adminKey) { alert('Enter your Operator Admin Key first (field above).'); return; }
    var btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    var body = {
      amount: Number($('mpesaAmount').value),
      phoneNumber: $('mpesaPhone').value.trim(),
    };
    if ($('mpesaRef').value.trim()) body.accountRef = $('mpesaRef').value.trim();
    var provider = ($('mpesaProvider') && $('mpesaProvider').value) || 'daraja';
    if ($('mpesaProvider')) { $('mpesaProvider').dataset.chosen = '1'; }
    var endpoint = provider === 'intasend' ? '/api/intasend/stkpush' : '/api/mpesa/stkpush';
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + adminKey },
      body: JSON.stringify(body),
    }).then(function (res) { return res.json().then(function (d) { return { ok: res.ok, data: d }; }); })
      .then(function (r) {
        var box = $('mpesaResult');
        box.classList.remove('hidden');
        if (r.ok) {
          box.textContent = 'PROMPT SENT to ' + r.data.phone + ' — ' + r.data.amount + ' KES. Have them enter the PIN.';
          $('mpesaForm').reset();
        } else {
          box.className = 'mt-2 rounded-lg border border-danger-500/40 bg-danger-500/10 px-3 py-2 font-mono text-[11px] text-danger-400';
          box.textContent = (r.data && (r.data.error || r.data.detail && JSON.stringify(r.data.detail))) || 'Push failed';
          setTimeout(function () { box.className = 'hidden rounded-lg border border-accent-500/40 bg-accent-500/10 px-3 py-2 font-mono text-[11px] text-accent-400'; }, 6000);
        }
        refreshMpesa();
      }).finally(function () { btn.disabled = false; });
  });

  refreshMpesa();
  setInterval(refreshMpesa, 10000);
    refresh();
  setInterval(refresh, 5000);
})();
