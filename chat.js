/*
 * Enter an event here — the chat in the corner of kinexentry.com.
 *
 * A script, not an AI: every line it says is written here. It asks the event
 * number and the contestant ID, shows the contestant's cards and one tile per
 * event, asks the days only where the event allows a choice, asks about
 * buddying, reads the entry back with every warning the app would show, and
 * enters them through the same routes the app uses. The pass the API hands
 * back is good for twenty minutes and for this one event.
 */
(function () {
  // The live API; a copy of the site opened on this computer talks to the API running here.
  var API = /^(localhost|127.0.0.1)$/.test(location.hostname) ? "http://localhost:8787" : "https://api.kinexentry.com";
  var open = document.getElementById("kchat-open");
  var panel = document.getElementById("kchat-panel");
  var closeBtn = document.getElementById("kchat-close");
  var log = document.getElementById("kchat-log");
  var form = document.getElementById("kchat-form");
  var input = document.getElementById("kchat-input");
  if (!open || !panel || !log || !form || !input) return;

  var S = {};          // everything known about this entry
  var onText = null;   // what the next typed reply means
  var started = false;

  // ── drawing ──
  function say(text, extra) {
    var d = document.createElement("div"); d.className = "kchat-msg bot"; d.textContent = text;
    (extra || []).forEach(function (x) { var s = document.createElement("span"); s.className = x.tone; s.textContent = x.text; d.appendChild(s); });
    log.appendChild(d); scrollDown(); return d;
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
  function scrollDown() { log.scrollTop = log.scrollHeight; }
  // On a phone the panel is the whole screen. When the keyboard opens, the
  // visual viewport shrinks; size the panel to it so the header, the messages
  // and the text field all stay on screen instead of the top sliding off.
  var vv = window.visualViewport;
  var pageY = 0; // where the page was scrolled when the chat opened, so closing puts it back
  function fitPanel() {
    if (panel.hidden) return;
    if (window.innerWidth > 640 || !vv) { panel.style.height = ""; panel.style.top = ""; return; }
    panel.style.height = Math.round(vv.height) + "px";
    panel.style.top = Math.round(vv.offsetTop) + "px";
    scrollDown();
  }
  if (vv) { vv.addEventListener("resize", fitPanel); vv.addEventListener("scroll", fitPanel); }
  window.addEventListener("resize", fitPanel);
  function expectText(placeholder, fn) { onText = fn; input.placeholder = placeholder; input.disabled = false; input.focus(); }
  function noText() { onText = null; input.placeholder = "Tap an option above"; }

  // ── words ──
  var usd = function (c) { return "$" + (c / 100).toFixed(2).replace(/\.00$/, ""); };
  function when(iso, tz) { try { return new Date(iso).toLocaleString("en-US", { timeZone: tz || "America/Chicago", weekday: "long", hour: "numeric", minute: "2-digit" }); } catch (e) { return new Date(iso).toLocaleString("en-US", { weekday: "long", hour: "numeric", minute: "2-digit" }); } }
  function dayWord(iso, tz) { try { return new Date(iso).toLocaleString("en-US", { timeZone: tz || "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); } catch (e) { return iso; } }
  function dates(a, b) {
    var f = function (s) { var d = new Date(s + "T12:00:00"); return d.toLocaleString("en-US", { month: "short", day: "numeric" }); };
    return a === b ? f(a) : f(a) + " – " + f(b);
  }
  function perfName(p) { return p.name + (p.isSlack && !/slack/i.test(p.name) ? " (slack)" : "") + " · " + dayWord(p.startsAt, S.rodeo && S.rodeo.timezone); }

  // ── the API ──
  function call(path, body, pass) {
    return fetch(API + path, { method: body ? "POST" : "GET", headers: Object.assign({ "content-type": "application/json" }, pass ? { authorization: "Bearer " + pass } : {}), body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { return { ok: r.ok, status: r.status, body: b }; }); });
  }
  function trouble(b, fallback) { return (b && (b.message || (b.rejections && b.rejections[0] && b.rejections[0].message))) || fallback; }

  // ── the conversation ──
  function start() {
    if (started) return; started = true;
    say("Hi. Enter an event here.\nWhat's the event number? It's on the listing and in the app.");
    askEvent();
  }
  function askEvent() {
    expectText("Event number, like 1007", function (t) {
      var n = t.replace(/[^\d]/g, "");
      if (!n) { say("The event number is digits, like 1007."); return; }
      call("/v1/chat/event", { eventNumber: n }).then(function (r) {
        if (!r.ok) { say(trouble(r.body, "I could not find that event.")); return; }
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
    });
  }
  function askId() {
    expectText("Your contestant ID", function (t) {
      var n = t.replace(/[^\d]/g, "");
      if (!n) { say("Your contestant ID is a number. It is under Profile in the Kinex Entry app."); return; }
      call("/v1/chat/identify", { rodeoId: S.rodeo.id, contestantNumber: n }).then(function (r) {
        if (!r.ok) { say(trouble(r.body, "I could not find that contestant.")); return; }
        Object.assign(S, r.body);
        var cards = S.cards.length ? S.cards.map(function (k) { return "• " + k.association + (k.number ? " " + k.number : " (no card)") + " · " + (k.checked ? "checked" : "pending check"); }).join("\n") : "• none on file";
        var runs = S.classes.map(function (k) { return "• " + k.name + " · " + usd(k.entryFeeCents) + " entry" + (k.addedMoneyCents ? " · " + usd(k.addedMoneyCents) + " added" : ""); }).join("\n");
        say("Thanks, " + S.contestant.firstName + ".\nCards on your account:\n" + cards + "\n\nThis event runs:\n" + runs);
        if (!S.classes.length) { say("Nothing is open to enter at this event yet."); askEvent(); return; }
        noText();
        tiles(S.classes.map(function (k) { return { label: "Click Here To Enter " + k.name, onPick: function () { echo("Enter " + k.name); S.klass = k; S.prefs = []; S.placement = "any"; S.buddyCode = null; S.sameDay = false; S.horseId = null; S.partner = null; S.position = null; askHorse(); } }; }));
      });
    });
  }
  function askHorse() {
    var d = S.klass.discipline;
    if (!d.requiresHorse || !S.horses.length) { askPartner(); return; }
    say("Which horse?");
    var row = chips(S.horses.map(function (h) { return { label: h.name, onPick: function (b, r) { finish(r); b.classList.add("on"); echo(h.name); S.horseId = h.id; askPartner(); } }; }).concat([{ label: "No horse", onPick: function (b, r) { finish(r); echo("No horse"); S.horseId = null; askPartner(); } }]));
  }
  function askPartner() {
    if (S.klass.discipline.kind !== "team") { askDays(); return; }
    say("Team roping. What's your partner's contestant ID?");
    expectText("Partner's contestant ID", function (t) {
      var n = t.replace(/[^\d]/g, "");
      if (!n) { say("Their contestant ID is a number."); return; }
      call("/v1/chat/lookup", { contestantNumber: n }, S.pass).then(function (r) {
        if (!r.ok) { say(trouble(r.body, "I could not find that partner.")); return; }
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
    say("Which day? Tap them in the order you'd prefer, then Done.");
    noText();
    var picked = [];
    var row = chips(perfs.map(function (p) {
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
      S.buddyCode = code; S.sameDay = false; noText(); review();
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
    call("/v1/entries/preview", entryBody(), S.pass).then(function (r) {
      if (!r.ok) { say(trouble(r.body, "I could not check that entry."), [{ tone: "bad", text: "Try again, or enter in the Kinex Entry app." }]); return; }
      var p = r.body;
      if (!p.eligible) {
        say("This entry cannot be made:", p.rejections.map(function (x) { return { tone: "bad", text: "✕ " + x.message }; }));
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
      else lines.push(S.prefs.map(function (id, i) { var x = perfs.filter(function (q) { return q.id === id; })[0]; return ["1st", "2nd", "3rd"][i] || (i + 1) + "th"; }).map(function (o, i) { var x = perfs.filter(function (q) { return q.id === S.prefs[i]; })[0]; return o + " " + (x ? x.name : ""); }).join(", ") + ({ slack_or_out: ", slack or out", performance_or_out: ", performance or out", any: ", anything works" }[S.placement] || ""));
      if (S.partner) lines.push("With " + S.partner.name + " (you are the " + S.position + ")");
      if (S.horseId) lines.push("Horse: " + S.horses.filter(function (h) { return h.id === S.horseId; })[0].name);
      lines.push(S.buddyCode ? "Buddy " + S.buddyCode : S.sameDay ? "Your events on the same day" : "No buddy");
      var warns = [];
      if (p.hold && p.hold.message) warns.push({ tone: "warn", text: "⚠ " + p.hold.message });
      S.cards.filter(function (k) { return !k.checked && k.number; }).forEach(function (k) { warns.push({ tone: "warn", text: "⚠ Your " + k.association + " card is still being checked by Kinex Entry." }); });
      var total = p.fees && typeof p.fees.totalCents === "number" ? p.fees.totalCents : null;
      var pay = S.rodeo.feePayment === "online" ? "Pay in the Kinex Entry app under My Entries." : S.rodeo.feePayment === "either" ? "Pay in the app under My Entries, or at the event." : "Entry fees are paid at the event.";
      var extras = [{ tone: "good", text: lines.join("\n") }].concat(warns).concat([{ tone: "warn", text: (total !== null ? "Fees: " + usd(total) + ". " : "") + pay }]);
      say("Here is your entry:", extras);
      noText();
      chips([
        { label: "Confirm entry", onPick: function (b, r2) { finish(r2); echo("Confirm entry"); confirmEntry(); } },
        { label: "Cancel", onPick: function (b, r2) { finish(r2); echo("Cancel"); say("Nothing entered."); another(); } },
      ]);
    });
  }
  function confirmEntry() {
    call("/v1/entries", entryBody(), S.pass).then(function (r) {
      if (!r.ok) { say(trouble(r.body, "That did not go through."), [{ tone: "bad", text: "Nothing was entered. Try again, or enter in the Kinex Entry app." }]); another(); return; }
      var e = r.body.entry;
      say("You're entered.", [{ tone: "good", text: "Confirmation " + (e.confirmationCode || "") }, { tone: "", text: "\nI emailed the details to " + S.contestant.emailHint + ". The draw shows under My Entries in the app once the office posts it." }]);
      another();
    });
  }
  function another() {
    say("Enter another event?");
    chips([
      { label: "Another event at " + S.rodeo.name, onPick: function (b, r) { finish(r); echo("Another event here"); noText(); tiles(S.classes.map(function (k) { return { label: "Click Here To Enter " + k.name, onPick: function () { echo("Enter " + k.name); S.klass = k; S.prefs = []; S.placement = "any"; S.buddyCode = null; S.sameDay = false; S.horseId = null; S.partner = null; S.position = null; askHorse(); } }; })); } },
      { label: "A different event", onPick: function (b, r) { finish(r); restart(); } },
      { label: "Done", onPick: function (b, r) { finish(r); say("Good luck out there."); noText(); input.disabled = true; } },
    ]);
  }
  function restart() { S = {}; say("What's the event number?"); askEvent(); }

  // ── wiring ──
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var t = input.value.trim(); if (!t || !onText) return;
    input.value = ""; echo(t); onText(t);
  });
  open.addEventListener("click", function () { panel.hidden = false; open.setAttribute("aria-expanded", "true"); open.hidden = true; pageY = window.scrollY; document.body.classList.add("kchat-open"); document.body.style.top = -pageY + "px"; start(); fitPanel(); input.focus(); });
  closeBtn.addEventListener("click", function () { panel.hidden = true; open.hidden = false; open.setAttribute("aria-expanded", "false"); document.body.classList.remove("kchat-open"); document.body.style.top = ""; panel.style.height = ""; panel.style.top = ""; window.scrollTo(0, pageY); });
})();
