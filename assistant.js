/* Aegis Guide — on-site assistant widget. Deterministic knowledge engine, zero external calls. */
(function () {
  if (window.__aegisGuide) return; window.__aegisGuide = true;
  var btn = document.createElement('button');
  btn.setAttribute('aria-label', 'Open the Aegis Guide assistant');
  btn.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:9999;width:48px;height:48px;border-radius:50%;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:20px;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center';
  btn.innerHTML = '&#128172;';

  var panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;bottom:78px;right:20px;z-index:9999;width:340px;max-width:calc(100vw - 32px);height:460px;max-height:70vh;border-radius:12px;border:1px solid #334155;background:#0b1220;color:#e2e8f0;display:none;flex-direction:column;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,.5);font-family:ui-sans-serif,system-ui,sans-serif;font-size:13px';
  panel.innerHTML =
    '<div style="padding:10px 14px;border-bottom:1px solid #1e293b;font-weight:600">Aegis Guide <span style="font-weight:400;color:#94a3b8;font-size:11px">instant answers from the docs</span></div>' +
    '<div id="aegis-msgs" style="flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px"></div>' +
    '<div id="aegis-chips" style="padding:4px 12px 8px;display:flex;flex-wrap:wrap;gap:6px"></div>' +
    '<div style="display:flex;border-top:1px solid #1e293b"><input id="aegis-in" placeholder="Ask about Aegis..." style="flex:1;background:transparent;border:0;color:#e2e8f0;padding:10px 12px;outline:none" maxlength="500" aria-label="Your question"><button id="aegis-send" style="background:#1d4ed8;color:#fff;border:0;padding:0 14px;cursor:pointer">Send</button></div>';

  var msgs, chipsEl, input, history = [], open = false;
  function esc(s){ var d=document.createElement('div'); d.textContent=s; return d.innerHTML; }
  function addMsg(text, who){
    var m=document.createElement('div');
    m.style.cssText='padding:8px 11px;border-radius:10px;max-width:88%;line-height:1.45;white-space:normal;word-break:break-word';
    if(who==='user'){ m.style.cssText+=';background:#1e3a8a;align-self:flex-end'; }
    else { m.style.cssText+=';background:#111c30;border:1px solid #1e293b;align-self:flex-start'; }
    m.innerHTML=esc(text).replace(/\n/g,'<br>');
    msgs.appendChild(m); msgs.scrollTop=msgs.scrollHeight;
  }
  function setChips(list){
    chipsEl.innerHTML='';
    (list||[]).forEach(function(c){
      var b=document.createElement('button');
      b.textContent=c; b.style.cssText='background:#111c30;border:1px solid #334155;color:#94a3b8;border-radius:999px;padding:3px 10px;font-size:11px;cursor:pointer';
      b.onclick=function(){ ask(c); };
      chipsEl.appendChild(b);
    });
  }
  function ask(text){
    if(!text) return;
    addMsg(text,'user'); history.push({role:'user',text:text});
    var think=document.createElement('div');
    think.textContent='...'; think.style.cssText='padding:8px 11px;border-radius:10px;background:#111c30;align-self:flex-start;color:#64748b';
    msgs.appendChild(think); msgs.scrollTop=msgs.scrollHeight;
    fetch('/api/assistant',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:text,history:history.slice(-6)})})
      .then(function(r){return r.json()})
      .then(function(d){ think.remove(); addMsg(d.reply||'The guide is briefly unavailable — try again, or use the Help line.','bot'); history.push({role:'assistant',text:d.reply||''}); setChips(d.chips||[]); })
      .catch(function(){ think.remove(); addMsg('Network hiccup — try again in a moment.','bot'); });
  }
  btn.onclick=function(){
    open=!open; panel.style.display=open?'flex':'none';
    if(open && !msgs.children.length){ addMsg('Hi! I can guide you through Aegis — keys, integration, security, pricing, anything on the site.','bot'); setChips(['Get an API key','How it works','Is it secure?','Pricing']); }
  };
  document.body.appendChild(panel); document.body.appendChild(btn);
  msgs=panel.querySelector('#aegis-msgs'); chipsEl=panel.querySelector('#aegis-chips'); input=panel.querySelector('#aegis-in');
  panel.querySelector('#aegis-send').onclick=function(){ var v=input.value.trim(); input.value=''; ask(v); };
  input.addEventListener('keydown',function(e){ if(e.key==='Enter'){ var v=input.value.trim(); input.value=''; ask(v); } });
})();
