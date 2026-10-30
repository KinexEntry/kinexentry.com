/*!
 * helper-widget.js — animated in-app help assistant (brand-neutral engine)
 * Zero dependencies. Works as a plain <script> (window.HelperWidget) or ES import.
 * All branding, persona, character art and answers come from the config object.
 *
 *   HelperWidget.mount(config) -> controller { open(), close(), say(text,{pose,audio}), setState(s), destroy() }
 *
 * Character states: idle | waving | talking | thinking | success | sorry
 * Character types:
 *   { type:'sprites', poses:{ idle, waving, talking, talkClosed, thinking, success, sorry } }   // PNG/WebP per pose
 *   { type:'svg', markup:'<svg ...>', css:'...' }  or  { type:'svg', markupUrl, cssUrl }   // rig; engine sets class hw-s-<state> (+ hw-mouth-open while speaking)
 * Answer modes:
 *   'scripted'  -> config.scripted = [{ match:[...keywords], text, audio?, pose? }], config.fallback
 *   'endpoint'  -> POST config.endpoint.chatUrl (SSE stream), optional config.endpoint.ttsUrl for voice
 */
(function (root) {
  'use strict';
  var STATES = ['idle', 'waving', 'talking', 'thinking', 'success', 'sorry'];
  var reduceMotion = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  // tiny markdown: **bold**, line breaks, numbered/bulleted lines, links
  function md(s) {
    return esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/\[(.+?)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+|tel:[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/\n/g, '<br>');
  }
  function uid() { return 'hw-' + Math.random().toString(36).slice(2, 10); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  var CSS = [
    '.hw-root{--hw-primary:#333;--hw-accent:#f60;--hw-ink:#111;--hw-bg:#fff;--hw-soft:#f4f4f4;--hw-font:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;position:fixed;z-index:2147483000;bottom:16px;right:16px;font-family:var(--hw-font);color:var(--hw-ink)}',
    '.hw-root.hw-left{right:auto;left:16px}',
    '.hw-root.hw-contained{position:absolute}',
    '.hw-launch{display:flex;align-items:center;gap:8px;border:0;cursor:pointer;background:var(--hw-primary);color:#fff;border-radius:999px;padding:6px 16px 6px 6px;box-shadow:0 6px 20px rgba(0,0,0,.25);font:600 15px var(--hw-font);transition:transform .2s}',
    '.hw-launch:hover{transform:translateY(-2px)}.hw-launch img{width:44px;height:44px;border-radius:50%;background:#fff;object-fit:cover}',
    '.hw-open .hw-launch{display:none}',
    '.hw-wrap{position:absolute;bottom:0;right:0;width:min(380px,calc(100vw - 32px));display:none;flex-direction:column;align-items:flex-end}',
    '.hw-left .hw-wrap{right:auto;left:0;align-items:flex-start}',
    '.hw-open .hw-wrap{display:flex}',
    '.hw-panel{width:100%;background:var(--hw-bg);border-radius:18px;box-shadow:0 12px 40px rgba(0,0,0,.28);overflow:hidden;display:flex;flex-direction:column;max-height:min(520px,calc(100vh - 220px));transform-origin:bottom right;animation:hw-pop .35s cubic-bezier(.2,1.4,.4,1)}',
    '.hw-head{display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--hw-primary);color:#fff}',
    '.hw-head b{font-size:15px}.hw-head small{display:block;opacity:.8;font-size:12px}',
    '.hw-head .hw-sp{flex:1}.hw-ib{background:rgba(255,255,255,.15);border:0;color:#fff;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:16px;line-height:32px;padding:0}',
    '.hw-ib:hover{background:rgba(255,255,255,.3)}',
    '.hw-log{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px;background:var(--hw-soft);min-height:140px}',
    '.hw-msg{max-width:85%;padding:9px 12px;border-radius:14px;font-size:14px;line-height:1.4;white-space:normal;word-wrap:break-word}',
    '.hw-bot{align-self:flex-start;background:#fff;border:1px solid rgba(0,0,0,.08);border-bottom-left-radius:4px}',
    '.hw-me{align-self:flex-end;background:var(--hw-primary);color:#fff;border-bottom-right-radius:4px}',
    '.hw-bot a{color:var(--hw-accent);font-weight:600}',
    '.hw-dots span{display:inline-block;width:7px;height:7px;margin:0 2px;border-radius:50%;background:var(--hw-accent);animation:hw-dot 1s infinite}',
    '.hw-dots span:nth-child(2){animation-delay:.15s}.hw-dots span:nth-child(3){animation-delay:.3s}',
    '.hw-chips{display:flex;flex-wrap:wrap;gap:6px;padding:8px 12px 0;background:var(--hw-bg)}',
    '.hw-chip{border:1.5px solid var(--hw-primary);background:#fff;color:var(--hw-primary);border-radius:999px;padding:5px 10px;font:600 12.5px var(--hw-font);cursor:pointer}',
    '.hw-chip:hover{background:var(--hw-primary);color:#fff}',
    '.hw-form{display:flex;gap:8px;padding:10px 12px;background:var(--hw-bg)}',
    '.hw-form input{flex:1;border:1.5px solid rgba(0,0,0,.15);border-radius:999px;padding:9px 14px;font:14px var(--hw-font);outline:none}',
    '.hw-form input:focus{border-color:var(--hw-accent)}',
    '.hw-form button{border:0;background:var(--hw-accent);color:#fff;border-radius:999px;padding:0 16px;font:700 14px var(--hw-font);cursor:pointer}',
    '.hw-foot{padding:0 12px 10px;background:var(--hw-bg);font-size:12px;text-align:center}',
    '.hw-foot button{background:none;border:0;color:var(--hw-primary);text-decoration:underline;cursor:pointer;font:600 12px var(--hw-font)}',
    '.hw-stage{width:150px;height:150px;margin:0 6px -14px 0;position:relative;z-index:2;pointer-events:none;transform-origin:bottom center;animation:hw-rise .55s cubic-bezier(.2,1.5,.4,1)}',
    '.hw-left .hw-stage{margin:0 0 -14px 6px}',
    '.hw-stage img,.hw-stage svg{width:100%;height:100%;display:block}',
    '.hw-stage.hw-type-sprites{animation:hw-rise .55s cubic-bezier(.2,1.5,.4,1),hw-bob 3.2s ease-in-out .6s infinite}',
    '.hw-stage.hw-type-sprites.hw-s-talking{animation:hw-rise .55s cubic-bezier(.2,1.5,.4,1),hw-talkbob .5s ease-in-out infinite}',
    '.hw-stage.hw-type-sprites.hw-s-success{animation:hw-hop .5s ease-out 2}',
    '.hw-stage.hw-type-sprites.hw-s-sorry{animation:hw-tilt 1.6s ease-in-out infinite}',
    '.hw-stage.hw-type-sprites.hw-s-thinking{animation:hw-sway 1.8s ease-in-out infinite}',
    '.hw-stage.hw-type-sprites.hw-s-waving{animation:hw-rise .55s cubic-bezier(.2,1.5,.4,1),hw-wigl .6s ease-in-out .5s 2}',
    '@keyframes hw-pop{from{transform:scale(.6);opacity:0}to{transform:scale(1);opacity:1}}',
    '@keyframes hw-rise{from{transform:translateY(80px) scale(.4);opacity:0}to{transform:none;opacity:1}}',
    '@keyframes hw-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}',
    '@keyframes hw-talkbob{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-2px) rotate(-1deg)}}',
    '@keyframes hw-hop{0%,100%{transform:translateY(0)}40%{transform:translateY(-14px) scale(1.04)}}',
    '@keyframes hw-tilt{0%,100%{transform:rotate(0)}50%{transform:rotate(-4deg)}}',
    '@keyframes hw-sway{0%,100%{transform:rotate(0)}50%{transform:rotate(2.5deg)}}',
    '@keyframes hw-wigl{0%,100%{transform:rotate(0)}25%{transform:rotate(-3deg)}75%{transform:rotate(3deg)}}',
    '@keyframes hw-dot{0%,80%,100%{opacity:.25;transform:translateY(0)}40%{opacity:1;transform:translateY(-3px)}}',
    '@media (prefers-reduced-motion:reduce){.hw-root *{animation:none!important;transition:none!important}}',
    '.hw-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}'
  ].join('\n');

  function mount(cfg) {
    cfg = cfg || {};
    var brand = cfg.brand || {}, persona = cfg.persona || {}, ch = cfg.character || {};
    var storeKey = 'hw-muted-' + (persona.name || 'helper');
    var muted = cfg.startMuted != null ? !!cfg.startMuted : false;
    try { var m = localStorage.getItem(storeKey); if (m != null) muted = m === '1'; } catch (e) {}
    var sessionId = uid(), history = [], state = 'idle', flapTimer = null, audio = null, busy = false, poseTimer = null;

    if (!document.getElementById('hw-style')) { var st = el('style'); st.id = 'hw-style'; st.textContent = CSS; document.head.appendChild(st); }
    if (ch.css) { var st2 = el('style'); st2.textContent = ch.css; document.head.appendChild(st2); }

    var rootEl = el('div', 'hw-root' + (cfg.position === 'left' ? ' hw-left' : '') + (cfg.container ? ' hw-contained' : ''));
    var vars = { '--hw-primary': brand.primary, '--hw-accent': brand.accent, '--hw-ink': brand.ink, '--hw-bg': brand.bg, '--hw-soft': brand.soft, '--hw-font': brand.font };
    Object.keys(vars).forEach(function (k) { if (vars[k]) rootEl.style.setProperty(k, vars[k]); });

    var launch = el('button', 'hw-launch', (persona.avatar ? '<img alt="" src="' + persona.avatar + '">' : '') + '<span>' + esc(cfg.launcherLabel || 'Help') + '</span>');
    launch.setAttribute('aria-label', 'Open help with ' + (persona.name || 'assistant'));
    var wrap = el('div', 'hw-wrap');
    var stage = el('div', 'hw-stage hw-type-' + (ch.type || 'sprites'));
    stage.setAttribute('aria-hidden', 'true');
    var img = null;
    if (ch.type === 'svg') {
      if (ch.markup) stage.innerHTML = ch.markup;
      else if (ch.markupUrl) fetch(ch.markupUrl).then(function (r) { return r.text(); }).then(function (t) {
        var base = ch.markupUrl.replace(/[^\/]*$/, ''); // resolve relative <image href="layers/..."> against the rig folder
        stage.innerHTML = t.replace(/href="(?!https?:|data:|\/|#)([^"]+)"/g, 'href="' + base + '$1"'); setState(state); });
      if (!ch.css && ch.cssUrl && !document.querySelector('link[data-hw-rig="' + ch.cssUrl + '"]')) { var lk = el('link'); lk.rel = 'stylesheet'; lk.href = ch.cssUrl; lk.setAttribute('data-hw-rig', ch.cssUrl); document.head.appendChild(lk); }
    } else { img = el('img'); img.alt = ''; stage.appendChild(img); }
    var panel = el('div', 'hw-panel'); panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', (persona.name || 'Help') + ' help chat');
    var head = el('div', 'hw-head', '<div><b>' + esc(persona.name || 'Help') + '</b><small>' + esc(persona.title || '') + '</small></div><div class="hw-sp"></div>');
    var muteBtn = el('button', 'hw-ib'); var closeBtn = el('button', 'hw-ib', '&#x2715;'); closeBtn.setAttribute('aria-label', 'Close help');
    head.appendChild(muteBtn); head.appendChild(closeBtn);
    var log = el('div', 'hw-log'); log.setAttribute('aria-live', 'polite');
    var chips = el('div', 'hw-chips');
    var form = el('form', 'hw-form', '<input type="text" maxlength="500" placeholder="' + esc(cfg.placeholder || 'Type your question…') + '" aria-label="Your question"><button type="submit">Send</button>');
    var input = form.querySelector('input');
    var foot = el('div', 'hw-foot'); var humanBtn = el('button', null, esc((cfg.escalation && cfg.escalation.label) || 'Talk to a person')); foot.appendChild(humanBtn);
    panel.appendChild(head); panel.appendChild(log); panel.appendChild(chips); panel.appendChild(form); panel.appendChild(foot);
    wrap.appendChild(stage); wrap.appendChild(panel);
    rootEl.appendChild(launch); rootEl.appendChild(wrap);
    (cfg.container || document.body).appendChild(rootEl);

    function renderMute() { muteBtn.innerHTML = muted ? '&#x1F507;' : '&#x1F50A;'; muteBtn.setAttribute('aria-label', muted ? 'Turn voice on' : 'Turn voice off'); muteBtn.title = muted ? 'Voice off' : 'Voice on'; }
    renderMute();

    // ---------- character ----------
    function setState(s) {
      if (STATES.indexOf(s) < 0) s = 'idle';
      state = s;
      STATES.forEach(function (x) { stage.classList.remove('hw-s-' + x); });
      stage.classList.add('hw-s-' + s);
      var svg = stage.firstElementChild; if (ch.type === 'svg' && svg) { STATES.forEach(function (x) { svg.classList.remove('hw-s-' + x); }); svg.classList.add('hw-s-' + s); }
      if (img) img.src = ch.poses[s] || ch.poses.idle;
      if (s === 'talking') startFlap(); else stopFlap();
      if (cfg.onState) cfg.onState(s);
    }
    function mouth(open) {
      if (img) img.src = open ? ch.poses.talking : (ch.poses.talkClosed || ch.poses.idle);
      var svg = stage.firstElementChild; if (ch.type === 'svg' && svg) svg.classList.toggle('hw-mouth-open', open);
    }
    function startFlap() {
      stopFlap(); var open = false;
      (function tick() { open = !open; mouth(open); flapTimer = setTimeout(tick, open ? 90 + Math.random() * 90 : 70 + Math.random() * 110); })();
    }
    function stopFlap() { clearTimeout(flapTimer); flapTimer = null; mouth(false); }
    function holdPose(s, ms) { clearTimeout(poseTimer); setState(s); if (ms) poseTimer = setTimeout(function () { if (state === s) setState('idle'); }, ms); }

    // ---------- audio ----------
    function stopAudio() { if (audio) { try { audio.pause(); } catch (e) {} audio = null; } }
    function playAudio(src) {
      stopAudio(); if (muted || !src) return Promise.resolve(false);
      return new Promise(function (resolve) {
        audio = new Audio(src); var a = audio;
        a.onended = function () { resolve(true); }; a.onerror = function () { resolve(false); };
        var p = a.play(); if (p && p.catch) p.catch(function () { resolve(false); });
      });
    }

    // ---------- messages ----------
    function addMsg(who, html) { var m = el('div', 'hw-msg ' + (who === 'me' ? 'hw-me' : 'hw-bot'), html); log.appendChild(m); log.scrollTop = log.scrollHeight; return m; }
    function typing() { return addMsg('bot', '<span class="hw-dots"><span></span><span></span><span></span></span>'); }
    async function typeOut(node, text, cps) {
      if (reduceMotion) { node.innerHTML = md(text); return; }
      var shown = ''; var step = Math.max(1, Math.round(text.length / 120));
      for (var i = 0; i < text.length; i += step) { shown = text.slice(0, i + step); node.innerHTML = md(shown); log.scrollTop = log.scrollHeight; await sleep(1000 / (cps || 55) * step); }
      node.innerHTML = md(text);
    }
    // say(): bot speaks text with talk animation (+ optional audio); ends in pose
    async function say(text, opt) {
      opt = opt || {}; holdPose('talking');
      var node = addMsg('bot', '');
      var audioP = playAudio(opt.audio);
      await typeOut(node, text, opt.cps);
      await audioP; // keep mouth moving while the clip is still playing
      holdPose(opt.pose || 'idle', opt.pose && opt.pose !== 'idle' ? 2200 : 0);
      if (cfg.onMessage) cfg.onMessage({ role: 'assistant', text: text });
      history.push({ role: 'assistant', content: text });
    }

    function setChips(list) {
      chips.innerHTML = '';
      (list || []).forEach(function (q) { var b = el('button', 'hw-chip', esc(q)); b.type = 'button'; b.onclick = function () { ask(q); }; chips.appendChild(b); });
    }

    // ---------- answering ----------
    function scriptedAnswer(q) {
      var t = q.toLowerCase(), best = null, score = 0;
      (cfg.scripted || []).forEach(function (a) { var s = 0; a.match.forEach(function (k) { if (t.indexOf(k) >= 0) s += k.length; }); if (s > score) { score = s; best = a; } });
      return best || cfg.fallback || { text: "Sorry, I'm not sure about that one.", pose: 'sorry' };
    }
    async function endpointAnswer(q) {
      var ep = cfg.endpoint; var dots = typing(); holdPose('thinking');
      var res;
      try {
        res = await fetch(ep.chatUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' }, credentials: ep.credentials || 'include',
          body: JSON.stringify({ sessionId: sessionId, message: q, history: history.slice(-12), context: (cfg.getContext && cfg.getContext()) || {} }) });
        if (!res.ok || !res.body) throw new Error('HTTP ' + (res && res.status));
      } catch (e) { dots.remove(); return say((cfg.errorText || "I'm having trouble connecting right now."), { pose: 'sorry' }); }
      dots.remove(); var node = addMsg('bot', ''); holdPose('talking');
      var reader = res.body.getReader(), dec = new TextDecoder(), buf = '', text = '', meta = {};
      while (true) {
        var r = await reader.read(); if (r.done) break; buf += dec.decode(r.value, { stream: true });
        var parts = buf.split('\n\n'); buf = parts.pop();
        parts.forEach(function (p) { var line = p.replace(/^data:\s?/, '').trim(); if (!line) return; try { var ev = JSON.parse(line); if (ev.delta) { text += ev.delta; node.innerHTML = md(text); log.scrollTop = log.scrollHeight; } if (ev.done) meta = ev; } catch (e) {} });
      }
      history.push({ role: 'assistant', content: text });
      if (ep.ttsUrl && !muted && text) {
        try { var tr = await fetch(ep.ttsUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: ep.credentials || 'include', body: JSON.stringify({ sessionId: sessionId, text: text }) });
          if (tr.ok) { var url = URL.createObjectURL(await tr.blob()); await playAudio(url); URL.revokeObjectURL(url); } } catch (e) {}
      }
      holdPose(meta.pose || 'idle', 2200);
      if (meta.escalate) showEscalation();
      if (meta.suggestions) setChips(meta.suggestions);
    }
    async function ask(q) {
      q = String(q || '').trim(); if (!q || busy) return; busy = true; stopAudio();
      addMsg('me', esc(q)); history.push({ role: 'user', content: q }); if (cfg.onMessage) cfg.onMessage({ role: 'user', text: q });
      try {
        if (cfg.mode === 'endpoint' && cfg.endpoint) await endpointAnswer(q);
        else { var a = scriptedAnswer(q); var d = typing(); holdPose('thinking'); await sleep(reduceMotion ? 150 : 900 + Math.random() * 500); d.remove(); await say(a.text, a); if (a.escalate) showEscalation(); if (a.chips) setChips(a.chips); }
      } finally { busy = false; }
    }
    function showEscalation() {
      var e = cfg.escalation || {}; if (cfg.onEscalate) cfg.onEscalate({ sessionId: sessionId, history: history.slice() });
      say(e.text || 'Let me get you to a person.', { pose: 'idle', audio: e.audio });
    }

    // ---------- open/close ----------
    var opened = false;
    async function open() {
      rootEl.classList.add('hw-open'); stage.style.animation = 'none'; void stage.offsetWidth; stage.style.animation = '';
      if (!opened) { opened = true; holdPose('waving'); await sleep(reduceMotion ? 0 : 1100); setChips(cfg.quickReplies); var g = cfg.greeting || {}; await say(g.text || 'Hi! How can I help?', { audio: g.audio, pose: 'idle' }); }
      else holdPose('waving', 1200);
      input.focus();
    }
    function close() { stopAudio(); stopFlap(); rootEl.classList.remove('hw-open'); launch.focus(); }
    launch.onclick = open; closeBtn.onclick = close;
    muteBtn.onclick = function () { muted = !muted; if (muted) stopAudio(); try { localStorage.setItem(storeKey, muted ? '1' : '0'); } catch (e) {} renderMute(); };
    humanBtn.onclick = function () { showEscalation(); };
    form.onsubmit = function (e) { e.preventDefault(); var v = input.value; input.value = ''; ask(v); };
    rootEl.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    setState('idle');

    return { open: open, close: close, ask: ask, say: say, setState: setState, setMuted: function (m) { muted = !!m; renderMute(); }, destroy: function () { stopAudio(); stopFlap(); rootEl.remove(); } };
  }

  var api = { mount: mount, version: '0.1.0' };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.HelperWidget = api;
})(typeof window !== 'undefined' ? window : this);
