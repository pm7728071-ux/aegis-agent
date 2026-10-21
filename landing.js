/* Aegis — landing page logic (build-free frontend) */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var fmtNum = function (n) { return new Intl.NumberFormat('en-KE', { maximumFractionDigits: 2 }).format(n || 0); };
  var pop = function (el, text) { el.textContent = text; el.classList.remove('animate-countPop'); void el.offsetWidth; el.classList.add('animate-countPop'); };

  function getJSON(url) {
    return fetch(url).then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); }).catch(function () { return null; });
  }

  function postJSON(url, body, headers) {
    var h = { 'Content-Type': 'application/json' };
    if (headers) Object.keys(headers).forEach(function (k) { h[k] = headers[k]; });
    return fetch(url, { method: 'POST', headers: h, body: JSON.stringify(body) })
      .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data, status: res.status }; }); })
      .catch(function () { return { ok: false, data: { error: 'Gateway unreachable — defensive freeze.' } }; });
  }

  function refreshStats() {
    Promise.all([getJSON('/api/network/stats'), getJSON('/api/config'), getJSON('/api/audit/recent')]).then(function (r) {
      var stats = r[0], config = r[1], audits = Array.isArray(r[2]) ? r[2] : [];

      var live = !!config;
      $('statusDot').className = 'h-2 w-2 rounded-full ' + (live ? 'bg-accent-400 animate-pulseDot' : 'bg-danger-400');
      $('statusText').textContent = live ? 'GATE LIVE' : 'GATE DOWN';

      if (stats) {
        pop($('statVerdicts'), fmtNum(stats.totalVerdicts));
        pop($('statAgents'), fmtNum(stats.agentsRegistered));
        pop($('statTolls'), fmtNum(stats.totalTollKES));
        pop($('statIntercepts'), fmtNum(stats.rogueIntercepts));
      }

      var list = $('trailList');
      list.textContent = '';
      if (!audits.length) {
        var empty = document.createElement('li');
        empty.className = 'px-5 py-4 text-xs text-slate-500';
        empty.textContent = 'No verdicts yet. Send the first one through the playground.';
        list.appendChild(empty);
        return;
      }
      audits.slice(0, 8).forEach(function (a) {
        var li = document.createElement('li');
        li.className = 'flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 animate-slideIn';
        var approved = a.decision === 'APPROVED';
        var badge = document.createElement('span');
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
    });
  }

  function renderPlayVerdict(v) {
    var box = $('playVerdict');
    box.classList.remove('hidden');
    var approved = v && v.status === 'APPROVED';
    box.className = approved
      ? 'rounded-xl border border-accent-500/50 bg-accent-500/10 p-6 animate-slideIn'
      : 'rounded-xl border border-danger-500/50 bg-danger-500/10 p-6 animate-slideIn';
    $('playVerdictTitle').textContent = approved ? '✔ VERDICT: APPROVED' : '✖ VERDICT: BLOCKED';
    $('playVerdictTitle').className = 'font-mono text-sm font-semibold ' + (approved ? 'text-accent-400' : 'text-danger-400');
    $('playVerdictReason').textContent = (v && v.reason) || 'No reason supplied by the gateway.';
    $('playVerdictMeta').textContent =
      v && v.auditId ? ('Recorded to the immutable trail · audit ' + v.auditId + (v.mode ? ' · mode ' + v.mode : '')) : '';
  }

  $('playForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    postJSON('/api/audit', {
      agentId: $('playAgent').value.trim() || undefined,
      amount: Number($('playAmount').value),
      currency: $('playCurrency').value || 'KES',
    }).then(function (r) {
      renderPlayVerdict(r.data);
      if (r.ok) $('playForm').reset();
      refreshStats();
    }).finally(function () { btn.disabled = false; });
  });

  $('registerForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    postJSON('/api/agents/register', { name: $('registerName').value.trim() }).then(function (r) {
      if (r.ok && r.data.apiKey) {
        var box = $('keyResult');
        box.classList.remove('hidden');
        $('agentIdOut').textContent = r.data.agentId;
        $('apiKeyOut').textContent = r.data.apiKey;
      } else {
        var box2 = $('keyResult');
        box2.classList.remove('hidden');
        box2.className = 'rounded-xl border border-danger-500/50 bg-danger-500/10 p-6 animate-slideIn';
        $('agentIdOut').textContent = (r.data && r.data.error) || 'Registration failed — try again.';
        $('apiKeyOut').textContent = '';
      }
      refreshStats();
    }).finally(function () { btn.disabled = false; });
  });

  document.querySelectorAll('[data-copy]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var text = $(btn.getAttribute('data-copy')).textContent;
      if (navigator.clipboard && text) {
        navigator.clipboard.writeText(text).then(function () {
          var old = btn.textContent;
          btn.textContent = 'Copied';
          setTimeout(function () { btn.textContent = old; }, 1200);
        });
      }
    });
  });

  refreshStats();
  setInterval(refreshStats, 15000);
})();
