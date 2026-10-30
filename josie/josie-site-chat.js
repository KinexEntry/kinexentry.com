/*
 * Josie on kinexentry.com: replaces the "Enter an event here" bubble (chat.js?v=20261008c).
 *
 * A port of chat.js, not a rewrite. The whole entry flow below (event number → contestant ID → cards and event
 * tiles → horse → partner → days → placement → buddy → read-back with every warning → confirm) is the same
 * code calling the SAME routes on the SAME API with the SAME 20-minute single-event pass:
 *   POST /v1/chat/event · POST /v1/chat/identify (returns the pass) · POST /v1/chat/lookup (Bearer pass)
 *   POST /v1/entries/preview (Bearer pass) · POST /v1/entries (Bearer pass)
 * What's new: Josie's face and lines, a start menu ("Enter an event" / "Get help" / "Rule book question", the last only
 * once an association is known), seasonal hat, and voice that is OFF by default with tap-to-hear on every line.
 *
 * Config (optional, set before this file loads):
 *   window.JOSIE_SITE = {
 *     api:       'https://api.kinexentry.com',  // default: same rule as chat.js (localhost → http://localhost:8787)
 *     assetBase: '/josie/',                    // where poses/, audio/ live
 *     chatUrl:   null,                         // '/api/help/chat' once the help endpoint is live; null = scripted FAQ
 *     ttsUrl:    null,                         // '/api/help/tts' once live; null = only pre-rendered clips can be heard
 *     rulesUrl:  null,                         // '/api/rules/ask' once live; null = no "Rule book question" option
 *     hat:       'auto'                        // 'auto' | 'felt' | 'straw'
 *   }
 * Needs josie-hat-season.js first (seasonal hat). If window.KINEX_HELPER_CONFIG (widget/kinexentry-helper.config.js)
 * is loaded, "Get help" uses its scripted answers until chatUrl is set.
 * Pronunciation: spoken text goes through forTts() ("Kinex" → "Kuh-nex", KUH-nex). Display text never changes.
 */
(function () {
  var CFG = window.JOSIE_SITE || {};
  var API = CFG.api || (/^(localhost|127.0.0.1)$/.test(location.hostname) ? "http://localhost:8787" : "https://api.kinexentry.com");
  var BASE = CFG.assetBase || "/josie/";
  var HELP = window.KINEX_HELPER_CONFIG || null;
  var open = document.getElementById("kchat-open");
  var panel = document.getElementById("kchat-panel");
  var closeBtn = document.getElementById("kchat-close");
  var log = document.getElementById("kchat-log");
  var form = document.getElementById("kchat-form");
  var input = document.getElementById("kchat-input");
  var voiceBtn = document.getElementById("kchat-voice");
  var menuBtn = document.getElementById("kchat-menu");
  var face = document.getElementById("kchat-face");
  if (!open || !panel || !log || !form || !input) return;

  var S = {};          // everything known about this entry (same object as chat.js)
  var onText = null;   // what the next typed reply means
  var started = false;
  var sessionId = "js-" + Math.random().toString(36).slice(2, 10);
  var helpHistory = [];

  // ── Josie: hat, face, poses ──
  var hat = (typeof resolveJosieHat === "function") ? resolveJosieHat(window.JOSIE_HAT_OVERRIDE || CFG.hat || "auto") : (CFG.hat === "straw" ? "straw" : "felt");
  function pose(name) { return BASE + "poses/" + hat + "/" + name + ".png"; }
  var avatar = BASE + "poses/" + hat + "/avatar_96.png";
  document.querySelectorAll("[data-josie-avatar]").forEach(function (img) { img.src = avatar; });
  panel.setAttribute("data-hat", hat);
  var flapTimer = null, holdTimer = null;
  function setPose(name) { if (face) face.src = pose(name); }
  function flap(ms) {
    if (!face) return;
    clearInterval(flapTimer); clearTimeout(holdTimer);
    var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setPose("talking"); holdTimer = setTimeout(function () { setPose("idle"); }, ms); return; }
    var o = false; flapTimer = setInterval(function () { o = !o; setPose(o ? "talking" : "talk_closed"); }, 140);
    holdTimer = setTimeout(stopFlap, ms);
  }
  function stopFlap(end) { clearInterval(flapTimer); flapTimer = null; setPose(end || "idle"); }
  function hold(name, ms) { clearInterval(flapTimer); clearTimeout(holdTimer); setPose(name); holdTimer = setTimeout(function () { setPose("idle"); }, ms || 2200); }

  // ── voice: off by default, tap 🔊 on any line to hear it; header toggle reads new lines aloud ──
  var VOICE_KEY = "josie-site-voice";
  var voiceOn = false; try { voiceOn = localStorage.getItem(VOICE_KEY) === "1"; } catch (e) {}
  var audio = null, audioUrl = null;
  function renderVoice() {
    if (!voiceBtn) return;
    voiceBtn.textContent = voiceOn ? "🔊" : "🔇";
    voiceBtn.setAttribute("aria-pressed", voiceOn ? "true" : "false");
    voiceBtn.setAttribute("aria-label", voiceOn ? "Josie reads new messages aloud. Tap to mute" : "Voice is off. Tap to have Josie read new messages aloud");
    voiceBtn.title = voiceOn ? "Voice on" : "Voice off";
  }
  function forTts(t) {   // keep in sync with server/pronunciation.ts
    return t.replace(/\bkinex\s*entry\.com\b/gi, "Kuh-nex Entry dot com").replace(/\bkinex(?=entry\b)/gi, "Kuh-nex ").replace(/\bkinex\b/gi, "Kuh-nex");
  }
  function stopAudio() { if (audio) { audio.pause(); audio = null; } if (audioUrl) { URL.revokeObjectURL(audioUrl); audioUrl = null; } stopFlap(); log.querySelectorAll(".kchat-hear.playing").forEach(function (b) { b.classList.remove("playing"); }); }
  function speakText(el) { var c = el.cloneNode(true); c.querySelectorAll(".kchat-hear, .kchat-cites").forEach(function (x) { x.remove(); }); return c.textContent.replace(/[✕⚠•]/g, "").replace(/\s+/g, " ").trim(); }
  function play(el, btn) {
    stopAudio();
    var clip = el.getAttribute("data-clip");
    var go = function (src) {
      audio = new Audio(src); if (btn) btn.classList.add("playing");
      audio.onplaying = function () { flap((audio.duration || 4) * 1000); };
      audio.onended = audio.onerror = function () { stopAudio(); };
      return audio.play().catch(function () { stopAudio(); });
    };
    if (clip) return go(BASE + clip);
    if (!CFG.ttsUrl) return Promise.resolve();
    return fetch(CFG.ttsUrl, { method: "POST", headers: { "content-type": "application/json" }, credentials: "include", body: JSON.stringify({ sessionId: sessionId, text: forTts(speakText(el)) }) })
      .then(function (r) { if (!r.ok) throw new Error("tts " + r.status); return r.blob(); })
      .then(function (b) { audioUrl = URL.createObjectURL(b); return go(audioUrl); })
      .catch(function () { stopAudio(); });
  }
  function addHear(d) {
    if (!d.getAttribute("data-clip") && !CFG.ttsUrl) return;
    var b = document.createElement("button"); b.type = "button"; b.className = "kchat-hear"; b.textContent = "🔊";
    b.setAttribute("aria-label", "Hear Josie say this"); b.title = "Hear it";
    b.addEventListener("click", function () { if (b.classList.contains("playing")) { stopAudio(); return; } play(d, b); });
    d.appendChild(b);
  }

  // ── drawing (chat.js + Josie's avatar on her lines) ──
  function row(d) { var r = document.createElement("div"); r.className = "kchat-row bot"; var a = document.createElement("img"); a.className = "kchat-av"; a.src = avatar; a.alt = ""; r.appendChild(a); r.appendChild(d); log.appendChild(r); return r; }
  function say(text, extra, opts) {
    var d = document.createElement("div"); d.className = "kchat-msg bot"; d.textContent = text;
    (extra || []).forEach(function (x) { var s = document.createElement("span"); s.className = x.tone; s.textContent = x.text; d.appendChild(s); });
    if (opts && opts.clip) d.setAttribute("data-clip", opts.clip);
    row(d); addHear(d); scrollDown();
    flap(Math.min(2600, 500 + text.length * 18));
    if (opts && opts.pose) setTimeout(function () { hold(opts.pose); }, Math.min(2600, 500 + text.length * 18));
    if (voiceOn && !(opts && opts.quiet)) play(d, d.querySelector(".kchat-hear"));
    return d;
  }
  function echo(text) { var d = document.createElement("div"); d.className = "kchat-msg user"; d.textContent = text; log.appendChild(d); scrollDown(); }
  function chips(items) {
    var row = document.createElement("div"); row.className = "kchat-chips";
    items.forEach(function (it) {
      var b = document.createElement("button"); b.type = "button"; b.className = "kchat-chip"; b.textContent = it.label;
      b.addEventListener("click", function () { if (row.dataset.done) return; it.onPick(b, row); });
      row.appendChild(b);
    });
    log.appendChild(row); scrollDown(); return row;
  }
  function tiles(items) {
    items.forEach(function (it) {
      var b = document.createElement("button"); b.type = "button"; b.className = "kchat-tile"; b.textContent = it.label;
      b.addEventListener("click", function () { if (b.disabled) return; lockTiles(); it.onPick(); });
      log.appendChild(b);
    });
    scrollDown();
  }
  function lockTiles() { log.querySelectorAll(".kchat-tile").forEach(function (t) { t.disabled = true; }); }
  function finish(row) { row.dataset.done = "1"; row.querySelectorAll("button").forEach(function (b) { b.disabled = true; }); }
  function finishAll() { log.querySelectorAll(".kchat-chips:not([data-done])").forEach(finish); lockTiles(); }
  function scrollDown() { log.scrollTop = log.scrollHeight; }
  // On a phone the panel is the whole screen. When the keyboard opens, the visual viewport shrinks; size the panel
  // to it so the header, the messages and the text field all stay on screen (unchanged from chat.js).
  var vv = window.visualViewport;
  var pageY = 0;
  function fitPanel() {
    if (panel.hidden) return;
    if (window.innerWidth > 640 || !vv) { panel.style.height = ""; panel.style.top = ""; return; }
    panel.style.height = Math.round(vv.height) + "px";
    panel.style.top = Math.round(vv.offsetTop) + "px";
    scrollDown();
  }
  if (vv) { vv.addEventListener("resize", fitPanel); vv.addEventListener("scroll", fitPanel); }
  window.addEventListener("resize", fitPanel);
  function expectText(placeholder, fn) { onText = fn; input.placeholder = placeholder; input.disabled = false; if (window.innerWidth > 640) input.focus(); }
  function noText() { onText = null; input.placeholder = "Tap an option above"; }
  function thinking() { var d = document.createElement("div"); d.className = "kchat-msg bot kchat-typing"; d.innerHTML = "<i></i><i></i><i></i>"; d.setAttribute("aria-label", "Josie is typing"); var r = row(d); scrollDown(); clearInterval(flapTimer); setPose("thinking"); return { remove: function () { r.remove(); setPose("idle"); } }; }

  // ── words (unchanged) ──
  var usd = function (c) { return "$" + (c / 100).toFixed(2).replace(/\.00$/, ""); };
  function dayWord(iso, tz) { try { return new Date(iso).toLocaleString("en-US", { timeZone: tz || "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); } catch (e) { return iso; } }
  function dates(a, b) {
    var f = function (s) { var d = new Date(s + "T12:00:00"); return d.toLocaleString("en-US", { month: "short", day: "numeric" }); };
    return a === b ? f(a) : f(a) + " – " + f(b);
  }
  function perfName(p) { return p.name + (p.isSlack && !/slack/i.test(p.name) ? " (slack)" : "") + " · " + dayWord(p.startsAt, S.rodeo && S.rodeo.timezone); }

  // ── the API (unchanged: same routes, same Bearer pass) ──
  function call(path, body, pass) {
    return fetch(API + path, { method: body ? "POST" : "GET", headers: Object.assign({ "content-type": "application/json" }, pass ? { authorization: "Bearer " + pass } : {}), body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { return { ok: r.ok, status: r.status, body: b }; }); })
      .catch(function () { return { ok: false, status: 0, body: { message: "I can't reach Kinex Entry right now. Check your signal and try again, or enter in the app." } }; });
  }
  function trouble(b, fallback) { return (b && (b.message || (b.rejections && b.rejections[0] && b.rejections[0].message))) || fallback; }
  function passGone(r) { return r.status === 401 || r.status === 403; }
  // Server-sent events reader for /api/help/chat and /api/rules/ask (API_CONTRACT.md).
  function stream(url, body, pass, onDelta) {
    return fetch(url, { method: "POST", credentials: "include", headers: Object.assign({ "content-type": "application/json" }, pass ? { authorization: "Bearer " + pass } : {}), body: JSON.stringify(body) }).then(function (r) {
      if (!r.ok || !r.body) return r.json().catch(function () { return {}; }).then(function (b) { return { error: true, status: r.status, body: b }; });
      var rd = r.body.getReader(), dec = new TextDecoder(), buf = "", fin = {};
      function pump() {
        return rd.read().then(function (x) {
          if (x.done) return fin;
          buf += dec.decode(x.value, { stream: true });
          var lines = buf.split("\n"); buf = lines.pop();
          lines.forEach(function (l) { if (l.indexOf("data:") !== 0) return; try { var j = JSON.parse(l.slice(5)); if (j.delta) onDelta(j.delta); if (j.done) fin = j; } catch (e) {} });
          return pump();
        });
      }
      return pump();
    });
  }

  // ── Josie's menu ──
  function association() {   // known once the event is looked up AND the contestant has a pass for it
    var a = S.rodeo && (S.rodeo.association || S.rodeo.associationName);
    if (!a || !S.pass || !CFG.rulesUrl) return null;
    if (typeof a === "string") a = { name: a };
    return a.hasRuleBook === false ? null : a;
  }
  function menu(lead) {
    finishAll(); noText();
    if (lead) say(lead);
    var items = [
      { label: "Enter an event", onPick: function (b, r) { finish(r); echo("Enter an event"); if (S.rodeo && S.pass) { say("Want another event at " + S.rodeo.name + ", or a different one?"); chips([{ label: "Another event at " + S.rodeo.name, onPick: function (b2, r2) { finish(r2); echo("Another event here"); eventTiles(); } }, { label: "A different event", onPick: function (b2, r2) { finish(r2); restart(); } }]); } else restart(true); } },
      { label: "Get help", onPick: function (b, r) { finish(r); echo("Get help"); startHelp(); } },
    ];
    var a = association();
    if (a) items.push({ label: "Rule book question", onPick: function (b, r) { finish(r); echo("Rule book question"); startRules(); } });
    chips(items);
    // Typing digits jumps straight to the entry flow, like the old bubble; anything else goes to help.
    expectText(a ? "Event number, or ask me something" : "Event number, or ask me something", function (t) {
      if (/^\s*#?\d{2,7}\s*$/.test(t)) { finishAll(); lookupEvent(t); } else { finishAll(); helpAnswer(t); }
    });
  }

  // ── the conversation ──
  function start() {
    if (started) return; started = true;
    say("Howdy! I'm Josie, your Kinex Entry helper. I can enter you in an event any time of day, or help you with the app.", null, { clip: "audio/greeting.mp3" });
    menu("What can I do for you? If you've got the event number, just type it.");
  }
  function restart(first) { S = {}; say(first ? "Let's get you entered. What's the event number? It's on the listing and in the app." : "What's the event number?"); askEvent(); }
  function askEvent() { expectText("Event number, like 1007", lookupEvent); }
  function lookupEvent(t) {
      var n = t.replace(/[^\d]/g, "");
      if (!n) { say("The event number is just digits, like 1007."); askEvent(); return; }
      var dots = thinking();
      call("/v1/chat/event", { eventNumber: n }).then(function (r) {
        dots.remove();
        if (!r.ok) { say(trouble(r.body, "I couldn't find that event."), null, { pose: "sorry" }); askEvent(); return; }
        var ev = r.body.rodeo, books = r.body.books;
        S = { rodeo: ev, books: books };
        var where = [ev.venue, [ev.city, ev.state].filter(Boolean).join(", ")].filter(Boolean).join(", ");
        var booksLine = books.state === "open" ? "Books are open" + (ev.booksCloseAt ? " and close " + dayWord(ev.booksCloseAt, ev.timezone) : "") + "."
          : books.state === "upcoming" ? "Books open " + (ev.booksOpenAt ? dayWord(ev.booksOpenAt, ev.timezone) : "later") + ". You can enter once they open."
          : books.state === "closed" ? "Books are closed for this event." : "This event's books are not scheduled yet.";
        say("#" + ev.eventNumber + " · " + ev.name + "\n" + where + " · " + dates(ev.startsOn, ev.endsOn) + "\n" + booksLine + (books.state === "open" ? "\n\nWhat's your contestant ID?" : ""));
        if (books.state !== "open") { say("Try another event number, or check back when the books open."); askEvent(); return; }
        askId();
      });
  }
  function askId() {
    expectText("Your contestant ID", function (t) {
      var n = t.replace(/[^\d]/g, "");
      if (!n) { say("Your contestant ID is a number. It's under Profile in the Kinex Entry app."); return; }
      var dots = thinking();
      call("/v1/chat/identify", { rodeoId: S.rodeo.id, contestantNumber: n }).then(function (r) {
        dots.remove();
        if (!r.ok) { say(trouble(r.body, "I couldn't find that contestant."), null, { pose: "sorry" }); return; }
        Object.assign(S, r.body);   // includes the 20-minute pass for this one event
        var cards = S.cards.length ? S.cards.map(function (k) { return "• " + k.association + (k.number ? " " + k.number : " (no card)") + " · " + (k.checked ? "checked" : "pending check"); }).join("\n") : "• none on file";
        var runs = S.classes.map(function (k) { return "• " + k.name + " · " + usd(k.entryFeeCents) + " entry" + (k.addedMoneyCents ? " · " + usd(k.addedMoneyCents) + " added" : ""); }).join("\n");
        say("Thanks, " + S.contestant.firstName + ".\nCards on your account:\n" + cards + "\n\nThis event runs:\n" + runs);
        if (!S.classes.length) { say("Nothing is open to enter at this event yet."); askEvent(); return; }
        var a = association();
        if (a) say("Tap an event to enter. Got a question about the " + a.name + " rules? Tap ☰ any time and pick Rule book question.", null, { quiet: true });
        eventTiles();
      });
    });
  }
  function eventTiles() { noText(); tiles(S.classes.map(function (k) { return { label: "Click Here To Enter " + k.name, onPick: function () { echo("Enter " + k.name); S.klass = k; S.prefs = []; S.placement = "any"; S.buddyCode = null; S.sameDay = false; S.horseId = null; S.partner = null; S.position = null; askHorse(); } }; })); }
  function askHorse() {
    var d = S.klass.discipline;
    if (!d.requiresHorse || !S.horses.length) { askPartner(); return; }
    say("Which horse are you riding?");
    chips(S.horses.map(function (h) { return { label: h.name, onPick: function (b, r) { finish(r); b.classList.add("on"); echo(h.name); S.horseId = h.id; askPartner(); } }; }).concat([{ label: "No horse", onPick: function (b, r) { finish(r); echo("No horse"); S.horseId = null; askPartner(); } }]));
  }
  function askPartner() {
    if (S.klass.discipline.kind !== "team") { askDays(); return; }
    say("Team roping. What's your partner's contestant ID?");
    expectText("Partner's contestant ID", function (t) {
      var n = t.replace(/[^\d]/g, "");
      if (!n) { say("Their contestant ID is a number."); return; }
      call("/v1/chat/lookup", { contestantNumber: n }, S.pass).then(function (r) {
        if (!r.ok) { if (passGone(r)) return expired(); say(trouble(r.body, "I couldn't find that partner.")); return; }
        S.partner = r.body.partner;
        say("Roping with " + S.partner.name + (S.partner.hometown ? ", " + S.partner.hometown : "") + ". Which end are you?");
        noText();
        chips([
          { label: "Header", onPick: function (b, r) { finish(r); echo("Header"); S.position = "header"; askDays(); } },
          { label: "Heeler", onPick: function (b, r) { finish(r); echo("Heeler"); S.position = "heeler"; askDays(); } },
        ]);
      });
    });
  }
  function askDays() {
    var perfs = S.performances;
    if (S.rodeo.mustEnterAllPerformances) {
      var numbered = perfs.filter(function (p) { return !p.isSlack; });
      var list = (numbered.length ? numbered : perfs).map(function (p) { return perfName(p); }).join(" and ");
      say("This event requires competing in every performance.", [{ tone: "warn", text: "⚠ Entering means " + list + ". You will be in the draw for each one." }]);
      S.prefs = (numbered.length ? numbered : perfs).map(function (p) { return p.id; });
      S.placement = "any";
      askBuddy();
      return;
    }
    if (perfs.length <= 1) { S.prefs = perfs.map(function (p) { return p.id; }); S.placement = "any"; askBuddy(); return; }
    say("Which day? Tap them in the order you'd like them, then Done.");
    noText();
    var picked = [];
    chips(perfs.map(function (p) {
      return { label: perfName(p), onPick: function (b) {
        if (picked.indexOf(p.id) >= 0) return;
        picked.push(p.id); b.classList.add("on"); b.textContent = picked.length + ". " + perfName(p);
      } };
    }).concat([{ label: "Done", onPick: function (b, r) {
      if (!picked.length) { say("Tap at least one day first."); return; }
      finish(r); S.prefs = picked.slice();
      echo(picked.map(function (id, i) { var p = perfs.filter(function (x) { return x.id === id; })[0]; return (i + 1) + ". " + perfName(p); }).join("\n"));
      askPlacement();
    } }]));
  }
  function askPlacement() {
    say("If none of those is open by the time the draw is run:");
    chips([
      { label: "Slack or out", onPick: function (b, r) { finish(r); echo("Slack or out"); S.placement = "slack_or_out"; askBuddy(); } },
      { label: "Performance or out", onPick: function (b, r) { finish(r); echo("Performance or out"); S.placement = "performance_or_out"; askBuddy(); } },
      { label: "Anything works", onPick: function (b, r) { finish(r); echo("Anything works"); S.placement = "any"; askBuddy(); } },
    ]);
  }
  function askBuddy() {
    say("Buddying?\nType a buddy code to run with someone, or tap an option.");
    chips([
      { label: "Run my events the same day", onPick: function (b, r) { finish(r); echo("Run my events the same day"); S.sameDay = true; S.buddyCode = null; noText(); review(); } },
      { label: "No buddy", onPick: function (b, r) { finish(r); echo("No buddy"); S.buddyCode = null; S.sameDay = false; noText(); review(); } },
    ]);
    expectText("Buddy code, or tap an option", function (t) {
      var code = t.trim().toUpperCase();
      if (code.length < 4 || code.length > 12) { say("A buddy code is 4 to 12 letters or numbers. Share the same code with your buddy."); return; }
      finishAll(); S.buddyCode = code; S.sameDay = false; noText(); review();
    });
  }
  function entryBody() {
    return {
      classId: S.klass.id, horseId: S.horseId, preferences: S.prefs, placement: S.placement,
      buddyCode: S.buddyCode, sameDay: S.sameDay,
      partnerUserId: S.partner ? S.partner.userId : null, position: S.partner ? S.position : null,
    };
  }
  function review() {
    var dots = thinking();
    call("/v1/entries/preview", entryBody(), S.pass).then(function (r) {
      dots.remove();
      if (!r.ok) { if (passGone(r)) return expired(); say(trouble(r.body, "I couldn't check that entry."), [{ tone: "bad", text: "Try again, or enter in the Kinex Entry app." }], { pose: "sorry" }); return; }
      var p = r.body;
      if (!p.eligible) {
        say("This entry can't be made:", p.rejections.map(function (x) { return { tone: "bad", text: "✕ " + x.message }; }), { pose: "sorry" });
        say("Change something and try again, or enter a different event.");
        chips([
          { label: "Try " + S.klass.name + " again", onPick: function (b, r2) { finish(r2); echo("Try again"); S.prefs = []; S.placement = "any"; S.buddyCode = null; S.sameDay = false; S.horseId = null; S.partner = null; S.position = null; askHorse(); } },
          { label: "Another event", onPick: function (b, r2) { finish(r2); restart(); } },
        ]);
        return;
      }
      S.preview = p;
      var perfs = S.performances;
      var lines = [S.klass.name + " at " + S.rodeo.name];
      if (S.rodeo.mustEnterAllPerformances) lines.push("Every performance (required)");
      else lines.push(S.prefs.map(function (id, i) { return ["1st", "2nd", "3rd"][i] || (i + 1) + "th"; }).map(function (o, i) { var x = perfs.filter(function (q) { return q.id === S.prefs[i]; })[0]; return o + " " + (x ? x.name : ""); }).join(", ") + ({ slack_or_out: ", slack or out", performance_or_out: ", performance or out", any: ", anything works" }[S.placement] || ""));
      if (S.partner) lines.push("With " + S.partner.name + " (you are the " + S.position + ")");
      if (S.horseId) lines.push("Horse: " + S.horses.filter(function (h) { return h.id === S.horseId; })[0].name);
      lines.push(S.buddyCode ? "Buddy " + S.buddyCode : S.sameDay ? "Your events on the same day" : "No buddy");
      var warns = [];
      if (p.hold && p.hold.message) warns.push({ tone: "warn", text: "⚠ " + p.hold.message });
      S.cards.filter(function (k) { return !k.checked && k.number; }).forEach(function (k) { warns.push({ tone: "warn", text: "⚠ Your " + k.association + " card is still being checked by Kinex Entry." }); });
      var total = p.fees && typeof p.fees.totalCents === "number" ? p.fees.totalCents : null;
      var pay = S.rodeo.feePayment === "online" ? "Pay in the Kinex Entry app under My Entries." : S.rodeo.feePayment === "either" ? "Pay in the app under My Entries, or at the event." : "Entry fees are paid at the event.";
      var extras = [{ tone: "good", text: lines.join("\n") }].concat(warns).concat([{ tone: "warn", text: (total !== null ? "Fees: " + usd(total) + ". " : "") + pay }]);
      say("Here's your entry. Look it over:", extras);
      noText();
      chips([
        { label: "Confirm entry", onPick: function (b, r2) { finish(r2); echo("Confirm entry"); confirmEntry(); } },
        { label: "Cancel", onPick: function (b, r2) { finish(r2); echo("Cancel"); say("No problem. Nothing was entered."); another(); } },
      ]);
    });
  }
  function confirmEntry() {
    var dots = thinking();
    call("/v1/entries", entryBody(), S.pass).then(function (r) {
      dots.remove();
      if (!r.ok) { if (passGone(r)) return expired(); say(trouble(r.body, "That didn't go through."), [{ tone: "bad", text: "Nothing was entered. Try again, or enter in the Kinex Entry app." }], { pose: "sorry" }); another(); return; }
      var e = r.body.entry;
      say("You're entered!", [{ tone: "good", text: "Confirmation " + (e.confirmationCode || "") }, { tone: "", text: "\nI emailed the details to " + S.contestant.emailHint + ". The draw shows under My Entries in the app once the office posts it." }], { pose: "success" });
      another();
    });
  }
  function another() {
    say("Enter another event?");
    var items = [
      { label: "Another event at " + S.rodeo.name, onPick: function (b, r) { finish(r); echo("Another event here"); eventTiles(); } },
      { label: "A different event", onPick: function (b, r) { finish(r); restart(); } },
    ];
    if (association()) items.push({ label: "Rule book question", onPick: function (b, r) { finish(r); echo("Rule book question"); startRules(); } });
    items.push({ label: "Done", onPick: function (b, r) { finish(r); say("Good luck out there!", null, { pose: "waving" }); noText(); } });
    chips(items);
  }
  function expired() {   // the pass is good for twenty minutes and one event; same rule as before, Josie just says it kindly
    S.pass = null;
    say("Your entry session timed out (it lasts 20 minutes, for one event). Nothing was entered. Let's start that one again.", null, { pose: "sorry" });
    var n = S.rodeo && S.rodeo.eventNumber; S = {};
    if (n) lookupEvent(String(n)); else askEvent();
  }

  // ── Get help ──
  function startHelp() {
    say("Sure thing. What's going on? Tell me in a few words, or tap one.");
    var q = (HELP && HELP.quickReplies) || ["My payment didn't go through", "I can't sign in", "Where are my results?"];
    chips(q.slice(0, 4).map(function (t) { return { label: t, onPick: function (b, r) { finish(r); echo(t); helpAnswer(t); } }; }));
    expectText("Ask Josie about the app", function (t) { finishAll(); helpAnswer(t); });
  }
  function scripted(q) {
    var t = q.toLowerCase(), best = null, score = 0;
    ((HELP && HELP.scripted) || []).forEach(function (a) { var s = 0; a.match.forEach(function (k) { if (t.indexOf(k) >= 0) s += k.length; }); if (s > score) { score = s; best = a; } });
    return best || (HELP && HELP.fallback) || { text: "Shoot, I'm not sure about that one, and I'd rather not guess. Email info@kinexentry.com or call (479) 510-4138 and the team will help.", pose: "sorry" };
  }
  function plain(md) { return md.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\[(.+?)\]\((.+?)\)/g, "$1"); }
  function afterHelp(a) {
    if (a && a.escalate) say(plain((HELP && HELP.escalation && HELP.escalation.text) || "Email info@kinexentry.com or call (479) 510-4138."), null, { quiet: true });
    var items = [{ label: "Ask something else", onPick: function (b, r) { finish(r); echo("Ask something else"); startHelp(); } },
                 { label: "Enter an event", onPick: function (b, r) { finish(r); echo("Enter an event"); if (S.rodeo && S.pass) eventTiles(); else restart(true); } }];
    if (association()) items.push({ label: "Rule book question", onPick: function (b, r) { finish(r); echo("Rule book question"); startRules(); } });
    items.push({ label: "Talk to a person", onPick: function (b, r) { finish(r); echo("Talk to a person"); say(plain((HELP && HELP.escalation && HELP.escalation.text) || "Email info@kinexentry.com or call (479) 510-4138.")); afterHelp(); } });
    chips(items);
    expectText("Ask Josie about the app", function (t) { finishAll(); helpAnswer(t); });
  }
  function helpAnswer(q) {
    noText();
    var dots = thinking();
    if (!CFG.chatUrl) {
      setTimeout(function () { dots.remove(); var a = scripted(q); say(plain(a.text), null, { pose: a.pose, clip: a.audio || null }); afterHelp(a); }, 700);
      return;
    }
    var d = null, txt = "";
    stream(CFG.chatUrl, { sessionId: sessionId, message: q.slice(0, 500), history: helpHistory.slice(-12), context: { screen: "website" } }, null, function (delta) {
      if (!d) { dots.remove(); d = document.createElement("div"); d.className = "kchat-msg bot"; row(d); }
      txt += delta; d.textContent = plain(txt); scrollDown(); flap(600);
    }).then(function (fin) {
      if (fin && fin.error) { dots.remove(); var a = scripted(q); say(plain(a.text), null, { pose: a.pose }); afterHelp(a); return; }
      if (!d) { dots.remove(); d = say("Sorry, I lost my train of thought. Try that again?", null, { pose: "sorry" }); }
      else { addHear(d); if (voiceOn) play(d, d.querySelector(".kchat-hear")); hold(fin.pose || "idle"); }
      helpHistory.push({ role: "user", content: q }, { role: "assistant", content: txt });
      afterHelp(fin);
    }).catch(function () { dots.remove(); var a = scripted(q); say(plain(a.text), null, { pose: a.pose }); afterHelp(a); });
  }

  // ── Rule book question: this event's association's own book only (strict scope, decided Oct 30, 2026) ──
  function startRules() {
    var a = association();
    if (!a) { menu("I need to know which association first. Look up your event and contestant ID, then I can answer from that association's rule book."); return; }
    say("Ask me anything in the " + a.name + " rule book. I'll answer from that book only, every part of your question, and tell you the rule and page.");
    expectText("Your rule question", rulesAnswer);
  }
  function rulesAnswer(q) {
    var a = association(); if (!a) { startRules(); return; }
    noText();
    var dots = thinking(), d = null, txt = "";
    // No association id is sent: the server resolves it from the pass (this event's association). There is no field
    // for a second, parent or national book, and the server would ignore one.
    stream(CFG.rulesUrl, { question: q.slice(0, 1000), sessionId: sessionId, rodeoId: S.rodeo.id }, S.pass, function (delta) {
      if (!d) { dots.remove(); d = document.createElement("div"); d.className = "kchat-msg bot"; row(d); }
      txt += delta; d.textContent = plain(txt); scrollDown(); flap(600);
    }).then(function (fin) {
      if (fin && fin.error) { dots.remove(); if (passGone(fin)) return expired(); say(trouble(fin.body, "I couldn't reach the rule book just now. Try again in a minute."), null, { pose: "sorry" }); rulesMore(); return; }
      if (!d) { dots.remove(); d = say("I couldn't find that in the " + a.name + " rule book. Check with the association office.", null, { pose: "sorry" }); }
      else {
        if (fin.citations && fin.citations.length) {
          var c = document.createElement("span"); c.className = "kchat-cites";
          fin.citations.forEach(function (x) { var s = document.createElement("span"); s.className = "kchat-cite"; s.textContent = x.label + (x.page ? " · p. " + x.page : "") + (x.version ? " · " + x.version : ""); c.appendChild(s); });
          d.appendChild(c);
        }
        addHear(d); if (voiceOn) play(d, d.querySelector(".kchat-hear"));   // reads the entire answer
        hold(fin.refused ? "sorry" : (fin.pose || "success"));
      }
      rulesMore();
    }).catch(function () { dots.remove(); say("I couldn't reach the rule book just now. Try again in a minute.", null, { pose: "sorry" }); rulesMore(); });
  }
  function rulesMore() {
    chips([
      { label: "Another rule question", onPick: function (b, r) { finish(r); echo("Another rule question"); startRules(); } },
      { label: "Enter an event", onPick: function (b, r) { finish(r); echo("Enter an event"); eventTiles(); } },
      { label: "Get help", onPick: function (b, r) { finish(r); echo("Get help"); startHelp(); } },
    ]);
    expectText("Another rule question", function (t) { finishAll(); rulesAnswer(t); });
  }

  // ── wiring (chat.js behavior kept: page position saved, body locked on phones, panel fitted to the keyboard) ──
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var t = input.value.trim(); if (!t || !onText) return;
    input.value = ""; echo(t); onText(t);
  });
  function openPanel() { panel.hidden = false; open.setAttribute("aria-expanded", "true"); open.hidden = true; pageY = window.scrollY; document.body.classList.add("kchat-open"); document.body.style.top = -pageY + "px"; start(); fitPanel(); if (window.innerWidth > 640) input.focus(); }
  function closePanel() { stopAudio(); panel.hidden = true; open.hidden = false; open.setAttribute("aria-expanded", "false"); document.body.classList.remove("kchat-open"); document.body.style.top = ""; panel.style.height = ""; panel.style.top = ""; window.scrollTo(0, pageY); open.focus(); }
  open.addEventListener("click", openPanel);
  closeBtn.addEventListener("click", closePanel);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !panel.hidden) closePanel(); });
  if (voiceBtn) { renderVoice(); voiceBtn.addEventListener("click", function () { voiceOn = !voiceOn; try { localStorage.setItem(VOICE_KEY, voiceOn ? "1" : "0"); } catch (e) {} if (!voiceOn) stopAudio(); renderVoice(); }); }
  if (menuBtn) menuBtn.addEventListener("click", function () { if (!started) return; stopAudio(); menu("Here's what I can do:"); });
  setPose("idle");
  window.JosieSite = { open: openPanel, close: closePanel, hat: hat };
})();
