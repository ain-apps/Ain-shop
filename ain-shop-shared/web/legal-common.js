/* AIN Shop – shared by /privacy, /terms, /contact and (v23) the home screen.
   - For the app's 48 other languages: a short version of the page in the person's own language, above the full English text.
   - "Delete AIN Shop data on this phone": clears what this site saved in this browser (language, list, Buy again history, ZIP code, settings). */
(function (root) {
  var EMAIL = 'ainshop.corrections@mail.tab.bot';
  function block(I, app, keys) {
    var sec = document.createElement('section'); sec.className = 'legalShort'; sec.setAttribute('lang', app); sec.setAttribute('dir', I.dir());
    sec.setAttribute('aria-labelledby', 'legalShortH');
    var h = document.createElement('h2'); h.id = 'legalShortH'; h.textContent = I.t('legalShortH'); sec.appendChild(h);
    var ul = document.createElement('ul');
    keys.forEach(function (k) { var li = document.createElement('li'); li.textContent = I.t(k, { email: EMAIL }); ul.appendChild(li); });
    sec.appendChild(ul); return sec;
  }
  function clearAll() {
    try { localStorage.clear(); } catch (e) {}
    try { sessionStorage.clear(); } catch (e) {}
    try { if (window.caches && caches.keys) caches.keys().then(function (ks) { ks.forEach(function (k) { caches.delete(k); }); }); } catch (e) {}
    try { if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) navigator.serviceWorker.getRegistrations().then(function (rs) { rs.forEach(function (r) { r.unregister(); }); }); } catch (e) {}
  }
  // a button that asks first (v23: a big yes/no box, read by VoiceOver), then deletes and says so on screen and out loud
  function clearButton(I, lang) {
    var wrap = document.createElement('div'); wrap.className = 'clearWrap';
    var b = document.createElement('button'); b.type = 'button'; b.className = 'big alt clearData'; b.setAttribute('lang', lang);
    var msg = document.createElement('p'); msg.className = 'clearMsg'; msg.setAttribute('role', 'status'); msg.setAttribute('lang', lang);
    function tt(k) { var was = I.lang; I.set(lang); var v = I.t(k); if (was) I.set(was); return v; }
    b.textContent = tt('clearBtn');
    b.addEventListener('click', function () { ask({ lang: lang, msg: msg, from: b }); });   // v23: the big yes/no box below (was the phone's small confirm())
    wrap.appendChild(b); wrap.appendChild(msg); return wrap;
  }

  // ---- v23 (Nati, Oct 31: "I tried to delete my account"): AIN Shop has no account. ONE big yes/no box for every way in —
  // the Contact page button, the Settings button (the 🌐 dialog on the home screen), the typed words and the voice words
  // ("delete my data", "delete my account", "מחק את הנתונים שלי"…). Nothing is deleted without a tap on "Yes". ----
  function I18() { return root.BAIN_I18N; }
  function has(lang, k) { var L = I18().LANGS[lang]; return !!(L && L.s[k]); }
  // a v23 string in the person's language when we have it (English + Hebrew), else an existing translated key, else English
  function tl(lang, k, fb) { var I = I18(), was = I.lang; I.set(lang); var v = (!has(lang, k) && fb) ? I.t(fb) : I.t(k); I.set(was); return v; }
  function speak(txt, lang) { try { if (!root.speechSynthesis) return; speechSynthesis.cancel(); var u = new SpeechSynthesisUtterance(txt); var L = I18().LANGS[lang]; u.lang = (L && L.speech) || 'en-US'; speechSynthesis.speak(u); } catch (e) {} }
  function tellScreen(txt) { var A = root.BAIN_APP; if (A) { A.status(txt); A.announce(txt); } }
  var D = null, cur = null;
  function el(tag, cls, id) { var e = document.createElement(tag); if (cls) e.className = cls; if (id) e.id = id; return e; }
  function dlg() {
    if (D) return D;
    D = el('dialog', 'langDlg locDlg clearDlg', 'clearDlg'); D.setAttribute('role', 'alertdialog'); D.setAttribute('aria-modal', 'true');
    D.setAttribute('aria-labelledby', 'clearDlgH'); D.setAttribute('aria-describedby', 'clearDlgNote');
    var h = el('h2', '', 'clearDlgH'); h.tabIndex = -1;
    var note = el('p', 'hint', 'clearDlgNote');
    var yes = el('button', 'big clearYes', 'clearYes'); yes.type = 'button';
    var no = el('button', 'big alt clearNo', 'clearNo'); no.type = 'button';
    var ok = el('button', 'big clearOk', 'clearOk'); ok.type = 'button'; ok.hidden = true;
    var st = el('p', 'clearDlgMsg', 'clearDlgMsg'); st.setAttribute('role', 'status'); st.setAttribute('aria-live', 'assertive');
    var vb = el('button', 'big alt clearVoice', 'clearVoice'); vb.type = 'button'; vb.hidden = true;   // v28: answer the box by voice (outside a call)
    [h, note, st, yes, no, vb, ok].forEach(function (x) { D.appendChild(x); });
    vb.addEventListener('click', function (e) { e.stopPropagation(); listenYesNo(); });
    yes.addEventListener('click', function (e) { e.stopPropagation(); confirmYes(); });
    no.addEventListener('click', function (e) { e.stopPropagation(); cancel(); });
    ok.addEventListener('click', function (e) { e.stopPropagation(); finish(); });
    D.addEventListener('cancel', function (e) { e.preventDefault(); if (cur && cur.done) finish(); else cancel(); });   // Escape / back gesture = No
    document.body.appendChild(D); return D;
  }
  function isOpen() { return !!(D && (D.open || D.getAttribute('data-open') === '1')); }
  function show(d) { if (d.showModal) { try { d.showModal(); } catch (e) { d.setAttribute('open', ''); } } else d.setAttribute('open', ''); d.setAttribute('data-open', '1'); }
  function hide(d) { if (d.close && d.open) { try { d.close(); } catch (e) {} } d.removeAttribute('open'); d.setAttribute('data-open', '0'); }
  // open the yes/no box. o = { lang, msg (a status line to fill), from (the element to give focus back to), reload (home screen: start fresh after) }
  function ask(o) {
    o = o || {}; var I = I18(); var lang = o.lang || I.lang || 'en';
    var d = dlg(); if (isOpen() && cur && !cur.done) { try { d.querySelector('#clearDlgH').focus(); } catch (e) {} return 'open'; }   // already asking (voice + the AI both): one box
    cur = { kind: 'clear', lang: lang, msg: o.msg || null, from: o.from || document.activeElement, reload: !!o.reload, done: false };
    var L = I.LANGS[lang] || I.LANGS.en; d.setAttribute('lang', lang); d.setAttribute('dir', L.dir);
    d.querySelector('#clearDlgH').textContent = tl(lang, 'clearAsk');
    d.querySelector('#clearDlgNote').textContent = has(lang, 'clearNoAcct') ? tl(lang, 'clearNoAcct') : '';
    d.querySelector('#clearDlgNote').hidden = !has(lang, 'clearNoAcct');
    d.querySelector('#clearDlgMsg').textContent = '';
    var y = d.querySelector('#clearYes'), n = d.querySelector('#clearNo'), k = d.querySelector('#clearOk');
    y.textContent = tl(lang, 'clearYes', 'clearBtn'); n.textContent = tl(lang, 'clearNo', 'langClose'); k.textContent = tl(lang, 'clearOkBtn', 'langClose');
    y.hidden = false; n.hidden = false; k.hidden = true; voiceBtn(lang);
    show(d);
    setTimeout(function () { try { d.querySelector('#clearDlgH').focus(); } catch (e) {} }, 30);   // VoiceOver reads the question first
    return 'asked';
  }
  // ---- v28 (Nati, Nov 1: "a fully voice app"): the SAME big yes/no box asks first for every voice / typed command that deletes, buys, pays
  // or submits (go to checkout, subscribe, cancel the subscription, remove from my list, forget history, forget my location).
  // o = { lang, q, yes, no, hint ("Say yes or no."), voice ("Answer by voice"), speakQ (say the question with the phone voice), onYes, onNo, from }.
  // Answered by a tap, by the "Answer by voice" button, or — in a voice call — by saying yes / no (ai.js hands the words to _yes / _no).
  function confirmAsk(o) {
    o = o || {}; var I = I18(); var lang = o.lang || I.lang || 'en';
    var d = dlg(); if (isOpen() && cur && !cur.done) { try { d.querySelector('#clearDlgH').focus(); } catch (e) {} return 'open'; }
    cur = { kind: 'confirm', lang: lang, from: o.from || document.activeElement, done: false, onYes: o.onYes || null, onNo: o.onNo || null, hint: o.hint || '', voice: o.voice || '' };
    var L = I.LANGS[lang] || I.LANGS.en; d.setAttribute('lang', lang); d.setAttribute('dir', L.dir);
    d.querySelector('#clearDlgH').textContent = o.q || '';
    var note = d.querySelector('#clearDlgNote'); note.textContent = o.hint || ''; note.hidden = !o.hint;
    d.querySelector('#clearDlgMsg').textContent = '';
    var y = d.querySelector('#clearYes'), n = d.querySelector('#clearNo'), k = d.querySelector('#clearOk');
    y.textContent = o.yes || 'Yes'; n.textContent = o.no || 'No'; y.hidden = false; n.hidden = false; k.hidden = true; voiceBtn(lang, o.voice);
    show(d);
    setTimeout(function () { try { d.querySelector('#clearDlgH').focus(); } catch (e) {} }, 30);
    if (o.speakQ) speak((o.q || '') + (o.hint ? ' ' + o.hint : ''), lang);
    var A = root.BAIN_APP; if (A) A.status(o.q || '');
    return 'asked';
  }
  function pending() { return !!(isOpen() && cur && !cur.done); }
  // "Answer by voice": one short listen with the phone's own speech recognition (needs the tap, so it is a button), then yes / no
  var REC = null;
  function stopRec() { if (REC) { try { REC.abort(); } catch (e) {} REC = null; } }
  function voiceBtn(lang, label) {
    var b = D && D.querySelector('#clearVoice'); if (!b) return;
    var R = root.SpeechRecognition || root.webkitSpeechRecognition, A = root.BAIN_AI, inCall = !!(A && A.active && A.active());
    b.hidden = !R || inCall;   // in a call the person simply says yes or no
    var V = root.AIN_VCMD; b.textContent = '\uD83C\uDFA4 ' + (label || (V ? V.say('voiceBtn') : 'Answer by voice'));
  }
  function listenYesNo() {
    var R = root.SpeechRecognition || root.webkitSpeechRecognition; if (!R || !cur) return;
    stopRec(); try { if (root.speechSynthesis) speechSynthesis.cancel(); } catch (e) {}
    var r = new R(), L = I18().LANGS[cur.lang]; r.lang = (L && L.speech) || 'en-US'; r.interimResults = false; r.maxAlternatives = 3; REC = r;
    r.onresult = function (e) {
      var alts = e.results[0], V = root.AIN_VCMD, ans = null;
      for (var i = 0; i < alts.length && !ans; i++) ans = V ? V.yesNo(alts[i].transcript) : (/^\s*(yes|yeah|yep|כן)\b/i.test(alts[i].transcript) ? 'yes' : /^\s*(no|nope|לא)\b/i.test(alts[i].transcript) ? 'no' : null);
      REC = null;
      if (ans === 'yes') confirmYes(); else if (ans === 'no') cancel();
      else if (cur) speak(cur.hint || (V ? V.say('sayYesNo') : 'Say yes or no.'), cur.lang);
    };
    r.onerror = function () { REC = null; };
    try { r.start(); } catch (e) { REC = null; }
  }
  function confirmYes() {
    if (!cur || cur.done) return; var lang = cur.lang;
    if (cur.kind === 'confirm') { var c = cur; cur = null; stopRec(); hide(dlg()); try { if (c.from && c.from.focus) c.from.focus(); } catch (e) {} if (c.onYes) c.onYes(); return true; }   // v28
    var A = root.BAIN_AI, inCall = !!(A && A.active && A.active());
    if (inCall) { try { A.stop('user'); } catch (e) {} }   // the voice call ends too: nothing of this visit is kept
    clearAll(); cur.done = true;
    var txt = has(lang, 'clearDoneAll') ? tl(lang, 'clearDoneAll') : tl(lang, 'clearDone');
    var d = dlg(); d.querySelector('#clearDlgH').textContent = txt; d.querySelector('#clearDlgNote').hidden = true;
    d.querySelector('#clearYes').hidden = true; d.querySelector('#clearNo').hidden = true; d.querySelector('#clearOk').hidden = false;
    var st = d.querySelector('#clearDlgMsg'); st.textContent = ''; setTimeout(function () { st.textContent = txt; }, 60);
    if (cur.msg) cur.msg.textContent = txt;
    tellScreen(txt); if (inCall) setTimeout(function () { tellScreen(txt); }, 500);   // after the call's own "off" line
    setTimeout(function () { speak(txt, lang); }, inCall ? 600 : 50);   // out loud, in the phone's own voice (iPhone: after the call let go of the microphone)
    setTimeout(function () { try { d.querySelector('#clearOk').focus(); } catch (e) {} }, 40);
    return true;
  }
  function cancel() {
    if (!cur) return; var lang = cur.lang, from = cur.from; stopRec();
    if (cur.kind === 'confirm') { var c = cur; cur = null; hide(dlg()); try { if (from && from.focus) from.focus(); } catch (e) {} if (c.onNo) c.onNo(); return; }   // v28
    var txt = has(lang, 'clearKept') ? tl(lang, 'clearKept') : '';
    hide(dlg()); var A = root.BAIN_AI, inCall = !!(A && A.active && A.active());
    if (txt) { if (cur.msg) cur.msg.textContent = txt; tellScreen(txt); if (inCall && A.tell) { try { A.tell('The person tapped No on the delete box: nothing was deleted. Say that in one short sentence.'); } catch (e) {} } else speak(txt, lang); }
    cur = null; try { if (from && from.focus) from.focus(); } catch (e) {}
  }
  function finish() {
    var c = cur; hide(dlg()); cur = null;
    if (c && c.reload) { try { location.reload(); } catch (e) {} return; }   // home screen: start fresh, as on a new phone
    try { if (c && c.from && c.from.focus) c.from.focus(); } catch (e) {}
  }
  // "delete my data" / "delete my account" / "erase my data" / Hebrew — in the screen language + English + Hebrew. Opens the box only.
  function phrases() {
    var I = I18(), out = [];
    [I.lang, 'en', 'he'].forEach(function (c) { var L = I.LANGS[c]; if (L && L.s.clearCmd) out = out.concat(String(L.s.clearCmd).toLowerCase().split(/[,،、，]/)); });
    var VW = root.AIN_VCMD_WORDS; [I.lang, 'en'].forEach(function (c) { var w = VW && VW[c] && VW[c].w && VW[c].w.clear; if (w) out = out.concat(w.map(function (x) { return String(x).toLowerCase(); })); });   // v28: the voice words too, every language
    return out.map(function (x) { return x.trim(); }).filter(Boolean);
  }
  function norm(s) { return ' ' + String(s || '').toLowerCase().replace(/[\u0591-\u05C7]/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim() + ' '; }
  function isCmd(text) { var t = norm(text); if (t.length < 4) return null; var w = phrases(); for (var i = 0; i < w.length; i++) if (t.indexOf(' ' + norm(w[i]).trim() + ' ') >= 0) return w[i]; return null; }
  function command(text) { if (!isCmd(text)) return null; ask({ lang: I18().lang, reload: !!root.BAIN_APP }); return 'ask'; }

  root.AIN_LEGAL = { block: block, clearButton: clearButton, clearAll: clearAll, EMAIL: EMAIL, ask: ask, confirm: confirmAsk, pending: pending, kind: function () { return cur && cur.kind; }, listenYesNo: listenYesNo, isCmd: isCmd, command: command, isOpen: isOpen, _yes: confirmYes, _no: cancel };
})(typeof window !== 'undefined' ? window : globalThis);
