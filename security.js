/* Aegis — Security & Transparency page (build-free frontend) */
(function () {
  'use strict';

  fetch('/api/security/report')
    .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
    .catch(function () { return null; })
    .then(function (report) {
      if (!report) return;
      document.getElementById('postureVersion').textContent = report.postureVersion || '';

      // Defense layers
      var shields = document.getElementById('shields');
      shields.textContent = '';
      (report.posture || []).forEach(function (s) {
        var card = document.createElement('div');
        card.className = 'rounded-xl border border-ink-700 bg-ink-900/80 p-5 shadow-glow animate-slideIn';
        var name = document.createElement('p');
        name.className = 'font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-primary-300';
        name.textContent = s.name;
        var desc = document.createElement('p');
        desc.className = 'mt-2 text-xs leading-relaxed text-slate-400';
        desc.textContent = s.description;
        card.appendChild(name);
        card.appendChild(desc);
        shields.appendChild(card);
      });

      // Threat radar
      var radar = document.getElementById('radarList');
      var intercepts = report.recentIntercepts || [];
      document.getElementById('radarCount').textContent = intercepts.length
        ? intercepts.length + ' on record' : 'no threats on record';
      radar.textContent = '';
      if (!intercepts.length) {
        var none = document.createElement('li');
        none.className = 'px-5 py-4 text-xs text-slate-500';
        none.textContent = 'Nothing has tripped the perimeter yet.';
        radar.appendChild(none);
      }
      intercepts.slice(0, 10).forEach(function (t) {
        var li = document.createElement('li');
        li.className = 'px-5 py-3 animate-slideIn';
        var top = document.createElement('p');
        top.className = 'font-mono text-xs text-danger-400 truncate';
        top.textContent = t.botId || 'unknown';
        var mid = document.createElement('p');
        mid.className = 'mt-0.5 text-[11px] text-slate-400 truncate';
        mid.textContent = (t.reason || '') + ' · ' + (t.channel || '');
        var ts = document.createElement('p');
        ts.className = 'mt-0.5 font-mono text-[10px] text-slate-600';
        ts.textContent = t.timestamp ? new Date(t.timestamp).toLocaleString() : '';
        li.appendChild(top); li.appendChild(mid); li.appendChild(ts);
        radar.appendChild(li);
      });

      // Verdict history
      var trail = document.getElementById('trailList');
      trail.textContent = '';
      (report.recentVerdicts || []).forEach(function (a) {
        var li = document.createElement('li');
        li.className = 'flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5 animate-slideIn';
        var approved = a.decision === 'APPROVED';
        var badge = document.createElement('span');
        badge.className = 'rounded px-2 py-0.5 font-mono text-[10px] font-semibold ' +
          (approved ? 'bg-accent-500/15 text-accent-400' : 'bg-danger-500/15 text-danger-400');
        badge.textContent = a.decision || '';
        var amt = document.createElement('span');
        amt.className = 'font-mono text-xs text-slate-300';
        amt.textContent = (a.amount || 0) + ' ' + (a.currency || '');
        var agent = document.createElement('span');
        agent.className = 'font-mono text-[10px] text-slate-500 truncate max-w-[10rem]';
        agent.textContent = a.agentId || '';
        var ts = document.createElement('span');
        ts.className = 'ml-auto font-mono text-[10px] text-slate-600';
        ts.textContent = a.timestamp ? new Date(a.timestamp).toLocaleString() : '';
        li.appendChild(badge); li.appendChild(amt); li.appendChild(agent); li.appendChild(ts);
        trail.appendChild(li);
      });
    });

  setInterval(function () { /* page is on-demand by design; report reflects request time */ }, 60000);
})();
