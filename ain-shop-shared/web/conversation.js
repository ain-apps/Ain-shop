/* AIN Shop — shared conversation module (TEST COPY ONLY, v33).
   "The whole app should be a voice conversation like a person, back and
   forth" (Nati, Nov 17 2026): the app's voice talks, describes items,
   asks questions, gives prices and stock, everything by speech. This
   file is the shared infrastructure the other new features use — the
   watchlist, the shopping list, reorder, deals — so they all remember
   what was just said and can ask "shall I?" the same way.
   Kept on this phone only, in memory only: the last search, the last
   ~20 turns, and one pending confirmation. NOTHING here is saved to
   localStorage, sent to any server, or kept after the page closes —
   close the tab and the conversation is gone. That is deliberate:
   the conversation log is session-scoped by design.
   How speech works today (checked Nov 17 2026, read-only):
     - In a voice call the voice is OpenAI Realtime (ai.js): the call
       is opened by the live server (_worker.js) and the audio comes
       back over WebRTC. speak() hands the line to BAIN_AI.sayLine()
       when a call is active, so the person hears the same voice.
     - Outside a call there is no Realtime voice, so the phone's own
       voice reads it: app.js sayNative() uses speechSynthesis with
       the language only and NO voice choice. speak() here uses
       speechSynthesis too, but picks a warm female voice first
       (see pickVoice). The user speaks of the app's voice as "she".
     - The Realtime voice itself cannot be changed from this file:
       it is the VOICE constant on the live server (see the note at
       the bottom of this file). Never a male voice, in either path.
   Other modules use it like this:
     BAIN_CONVO.rememberSearch(query, products)   // after every search
     BAIN_CONVO.resolveReference("the cheaper one") // -> {index, product}
     BAIN_CONVO.askConfirm("Buy the Nike shoes for $49.99 at Walmart, shall I go ahead?", onYes, onNo)
     BAIN_CONVO.handleReply("yes")                // -> 'yes' | 'no' | null
     BAIN_CONVO.ask("Want more, details on one, or a comparison?")
     BAIN_CONVO.speak("I found 12 running shoes.")
   window.BAIN_CONVO */
(function (root) {
  'use strict';

  var MAX_LOG = 20;          // turns kept (user + app), in memory only
  var MAX_PRODUCTS = 50;     // results kept from the last search

  var st = {
    query: '', products: [], searchedAt: 0,
    log: [],                 // [{ who: 'user'|'app', text, at }]
    pending: null,           // { summary, onYes, onNo, at } or null
    pendingAsk: null,       // { onAnswer, at } — one open question waiting for words back
    lastQuestion: '',
    lastSpoken: null         // { text, via, voice } — what speak() did last
  };

  // ---------------- helpers ----------------
  function clean(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
  function norm(s) {
    try { return clean(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, ''); }
    catch (e) { return clean(s).toLowerCase(); }
  }
  function words(s) { return norm(s).replace(/[^a-z0-9\u05d0-\u05ea\u0600-\u06ff\u00c0-\u024f\s]/g, ' ').split(/\s+/).filter(Boolean); }
  function num(p) {
    if (p == null || p === '') return null;
    var n = typeof p === 'number' ? p : parseFloat(String(p).replace(/[^0-9.,-]/g, '').replace(/,(?=\d{3}\b)/g, '').replace(',', '.'));
    return isFinite(n) ? n : null;
  }
  function hay(p) {
    // everything a spoken word about a product can match against
    return norm([p.title, p.name, p.short, p.short_name, p.brand, p.store, p.option, p.variant, p.color, p.colour, p.size].join(' '));
  }
  function nameOf(p) {
    try { if (root.BAIN_APP && root.BAIN_APP.shortName) return root.BAIN_APP.shortName(p); } catch (e) {}
    return String(p.title || p.name || p.short_name || '');
  }
  function langCode() {
    try { if (root.BAIN_APP && root.BAIN_APP.S && root.BAIN_APP.S.lang) return String(root.BAIN_APP.S.lang); } catch (e) {}
    try { if (root.BAIN_I18N && root.BAIN_I18N.lang) return String(root.BAIN_I18N.lang); } catch (e) {}
    return 'en';
  }
  function speechLang() {
    try { if (root.BAIN_I18N && root.BAIN_I18N.speech) return root.BAIN_I18N.speech(); } catch (e) {}
    var l = langCode();
    return l === 'he' ? 'he-IL' : l === 'yi' ? 'yi' : l.indexOf('-') >= 0 ? l : l + '-' + l.toUpperCase();
  }

  // ---------------- the conversation log (in memory only) ----------------
  function logTurn(who, text) {
    text = clean(text); if (!text) return;
    st.log.push({ who: who, text: text.slice(0, 500), at: Date.now() });
    while (st.log.length > MAX_LOG) st.log.shift();
  }
  function log() { return st.log.map(function (x) { return { who: x.who, text: x.text, at: x.at }; }); }

  // ---------------- the last search ----------------
  function rememberSearch(query, products) {
    st.query = clean(query);
    st.products = Array.isArray(products) ? products.slice(0, MAX_PRODUCTS) : [];
    st.searchedAt = Date.now();
    return st.products.length;
  }
  function lastResults() { return st.products.slice(); }
  function lastQuery() { return st.query; }
  function lastSearch() { return { query: st.query, products: st.products.slice(), at: st.searchedAt }; }
  // one short line for the AI's instructions (ai.js), like the other modules' forAI()
  function forAI(n) {
    if (!st.products.length) return 'Last search: none yet.';
    var list = st.products.slice(0, n || 3).map(function (p, i) {
      var pr = num(p.price);
      return (i + 1) + '. ' + nameOf(p) + (p.store ? ' (' + p.store + ')' : '') + (pr != null ? ' ' + pr : '');
    }).join('; ');
    return 'Last search: "' + st.query + '" — ' + st.products.length + ' results: ' + list + '. ' +
      'The person can say "the first one", "the cheaper one", "the one from Walmart", "the blue one", "that one".';
  }

  // ---------------- "which one?" — resolving a reference ----------------
  var ORDINALS = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12,
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  var STOP = { the: 1, a: 1, an: 1, one: 1, item: 1, product: 1, that: 1, this: 1, it: 1, please: 1, from: 1, at: 1, in: 1, of: 1, with: 1, me: 1, show: 1, buy: 1, get: 1, want: 1, take: 1, is: 1, for: 1 };
  function hit(i, p) { return { index: i, number: i + 1, product: p }; }
  // the item lit up on screen right now (show.js): "that one" / "this one" means that item
  function litIndex() {
    try {
      var S = root.AIN_SHOW && root.AIN_SHOW.current && root.AIN_SHOW.current();
      if (S && S.in_results && S.item >= 1 && S.item <= st.products.length) return S.item - 1;
    } catch (e) {}
    return -1;
  }
  function byPrice(wantCheapest, list) {
    var best = -1, bv = null;
    list.forEach(function (p, i) {
      var v = num(p.price); if (v == null) return;
      if (bv == null || (wantCheapest ? v < bv : v > bv)) { bv = v; best = i; }
    });
    return best < 0 ? null : hit(best, list[best]);
  }
  function byStore(storeWords, list) {
    var needle = norm(storeWords.join(' ')); if (!needle) return null;
    for (var i = 0; i < list.length; i++) {
      var s = norm(list[i].store || '');
      if (s && (s.indexOf(needle) >= 0 || needle.indexOf(s) >= 0)) return hit(i, list[i]);
    }
    return null;
  }
  function byWords(ws, list) {
    // every content word must be in the product's title / store / option
    var keep = ws.filter(function (w) { return !STOP[w] && w.length >= 2; });
    if (!keep.length) return null;
    var best = -1, bs = 0;
    list.forEach(function (p, i) {
      var h = ' ' + hay(p) + ' ';
      var s = 0, ok = true;
      keep.forEach(function (w) {
        if (h.indexOf(' ' + w) >= 0 || h.indexOf(w) >= 0) s++;
        else ok = false;
      });
      if (ok && s > bs) { bs = s; best = i; }
    });
    if (best >= 0) return hit(best, list[best]);
    // fall back: the product sharing the most words (at least one)
    best = -1; bs = 0;
    list.forEach(function (p, i) {
      var h = ' ' + hay(p) + ' ', s = 0;
      keep.forEach(function (w) { if (h.indexOf(w) >= 0) s++; });
      if (s > bs) { bs = s; best = i; }
    });
    return best >= 0 && bs > 0 ? hit(best, list[best]) : null;
  }
  // resolveReference(text, list?) — "the second one", "the cheaper one",
  // "the one from Walmart", "the blue one". With no list it resolves
  // against the last search; a caller may pass its own list (reorder
  // passes past purchases, feedback passes the current results) and the
  // answer is {index, number, product} from THAT list. "That one" only
  // means the lit-up item for the last search itself.
  function resolveReference(text, against) {
    var list = Array.isArray(against) && against.length ? against : st.products;
    var fromSearch = list === st.products;
    if (!list.length) return null;
    var t = norm(text || ''), ws = words(t);
    if (!t) return null;
    // "the last one" / "the final one"
    if (/\blast\b|\bfinal\b/.test(t) && /\bone\b|\bitem\b|\bproduct\b/.test(t)) return hit(list.length - 1, list[list.length - 1]);
    // "the cheaper one" / "the cheapest one" / "the most expensive one" / "the priciest"
    if (/\bcheapest\b|\bcheaper\b|\bleast expensive\b|\blowest price\b/.test(t)) return byPrice(true, list);
    if (/\bmost expensive\b|\bpriciest\b|\bdearest\b|\bhighest price\b|\bexpensive/.test(t)) return byPrice(false, list);
    // "the one from Walmart" / "the Walmart one"
    var m = t.match(/\bfrom\s+(.+?)(?:\s+one|\s+item|\s+product|\s*$)/);
    if (m) { var r = byStore(words(m[1]), list); if (r) return r; }
    // "that one" / "this one" = the item being read / lit up now; with a
    // single result it can only be that one; otherwise do not guess.
    if (/^(that|this)\s+(one|item|product)\b/.test(t) || t === 'that one' || t === 'this one' || /\bthat one\b|\bthis one\b/.test(t)) {
      var li = fromSearch ? litIndex() : -1;
      if (li >= 0) return hit(li, list[li]);
      if (list.length === 1) return hit(0, list[0]);
      return null;
    }
    // "the other one" = the one that is NOT lit up, when there are two
    if (/\bother one\b/.test(t) && list.length === 2) {
      var li2 = fromSearch ? litIndex() : -1;
      if (li2 >= 0) return hit(1 - li2, list[1 - li2]);
      return null;
    }
    // "the second one" / "number 2" / "item 3" / "option 1"
    var d = t.match(/\b(?:number|item|option|result|no\.?)\s*(\d{1,2})\b/);
    if (d) { var n = parseInt(d[1], 10); return n >= 1 && n <= list.length ? hit(n - 1, list[n - 1]) : null; }
    for (var k = 0; k < ws.length; k++) {
      // an ordinal word ("second") counts only when it names the item:
      // "the second one" / "the second" — NOT the "one" in "the red one"
      if (ORDINALS[ws[k]] && (ws[k + 1] === 'one' || ws[k + 1] === 'item' || ws[k + 1] === 'product' || (k === ws.length - 1 && ws[k - 1] === 'the'))) {
        var o = ORDINALS[ws[k]];
        return o >= 1 && o <= list.length ? hit(o - 1, list[o - 1]) : null;
      }
    }
    // "the blue one" / "the large one" / "the Nike one" — descriptive words
    var dm = t.match(/^(?:the\s+)?(.+?)\s+(?:one|item|product)\b/);
    if (dm) { var r2 = byWords(words(dm[1]), list); if (r2) return r2; }
    // bare descriptive words ("blue", "Walmart") — only when they match one product clearly
    var r3 = byWords(ws, list);
    return r3;
  }

  // ---------------- the voice: warm female, never male ----------------
  // Browser voices carry no gender flag, so pickVoice() scores names.
  // Known female-sounding voices (iOS / macOS / Chrome / Edge): Samantha
  // (en-US), Karen (en-AU), Moira (en-IE), Tessa (en-ZA), Veena (en-IN),
  // Fiona (en-GB), Susan, Zira, Ava, Aria, Jenny, Sonia, Natasha, Google
  // US English (female by default). Known male names are excluded
  // whenever any other voice exists: Alex, Daniel, Fred, Jorge, Thomas,
  // David, Mark, James, "Google UK English Male", and names ending in
  // " Male". If no female-sounding voice is found, the fallback is the
  // browser's default voice (or the first voice) — never a voice that
  // is known to be male. If getVoices() is still empty (voices load
  // async on some phones), the utterance is spoken with no voice set
  // and the browser picks its default.
  var FEMALE_NAMES = ['samantha', 'karen', 'moira', 'tessa', 'veena', 'fiona', 'susan', 'zira', 'ava', 'aria', 'jenny', 'sonia', 'natasha', 'kate', 'serena', 'allison', 'joana', 'google us english', 'google uk english female', 'microsoft aria', 'microsoft jenny', 'microsoft sonia', 'microsoft natasha', 'microsoft zira', 'siri female', 'female'];
  var MALE_NAMES = ['alex', 'daniel', 'fred', 'jorge', 'thomas', 'david', 'mark', 'james', 'google uk english male', 'microsoft guy', 'microsoft davis', 'microsoft christopher', 'microsoft eric', 'microsoft ryan', 'siri male', ' male'];
  function voiceScore(v, lang) {
    var name = String((v && v.name) || '').toLowerCase();
    var vl = String((v && v.lang) || '').toLowerCase();
    var score = 0;
    if (lang) {
      var want = String(lang).toLowerCase().replace('_', '-');
      if (vl === want) score += 10;
      else if (vl.split('-')[0] === want.split('-')[0]) score += 6;
    }
    var female = FEMALE_NAMES.some(function (f) { return name.indexOf(f) >= 0; });
    var male = MALE_NAMES.some(function (f) { return name.indexOf(f) >= 0; });
    if (female && !male) score += 20;
    if (male) score -= 50;
    if (v && v.default) score += 2;
    return score;
  }
  function pickVoice(voices, lang) {
    voices = Array.isArray(voices) ? voices.filter(Boolean) : [];
    if (!voices.length) return null;
    var best = null, bs = -Infinity;
    voices.forEach(function (v) { var s = voiceScore(v, lang); if (s > bs) { bs = s; best = v; } });
    // never hand back a known-male voice while another voice exists
    var male = MALE_NAMES.some(function (f) { return String(best.name || '').toLowerCase().indexOf(f) >= 0; });
    if (male) {
      var other = null;
      voices.forEach(function (v) { if (v !== best && !MALE_NAMES.some(function (f) { return String(v.name || '').toLowerCase().indexOf(f) >= 0; })) { if (!other) other = v; } });
      if (other) return other;
    }
    return best;
  }
  function voiceInfo() {
    try {
      var ss = root.speechSynthesis;
      if (!ss || !ss.getVoices) return { name: null, lang: null, via: 'none', reason: 'no-speechSynthesis' };
      var vs = ss.getVoices() || [];
      if (!vs.length) return { name: null, lang: speechLang(), via: 'none', reason: 'no-voices-yet' };
      var v = pickVoice(vs, speechLang());
      return v ? { name: v.name, lang: v.lang, via: 'speechSynthesis', reason: '' } : { name: null, lang: speechLang(), via: 'none', reason: 'no-voices-yet' };
    } catch (e) { return { name: null, lang: null, via: 'none', reason: 'error' }; }
  }
  function inCall() {
    try { return !!(root.BAIN_AI && root.BAIN_AI.active && root.BAIN_AI.active()); } catch (e) { return false; }
  }
  function speak(text) {
    text = clean(text); if (!text) return null;
    logTurn('app', text);
    var out = { text: text, via: 'none', voice: null };
    try { if (root.BAIN_APP && root.BAIN_APP.status) root.BAIN_APP.status(text); } catch (e) {}
    try { if (root.BAIN_APP && root.BAIN_APP.announce) root.BAIN_APP.announce(text); } catch (e) {}
    // 1. In a voice call the Realtime voice says it (ai.js) — same voice as the rest of the conversation.
    if (inCall()) {
      try {
        if (root.BAIN_AI.sayLine) { root.BAIN_AI.sayLine(text); out.via = 'realtime'; st.lastSpoken = out; return out; }
      } catch (e) {}
    }
    // 2. Outside a call: the phone's own voice, warm female when one exists.
    try {
      var ss = root.speechSynthesis;
      if (ss && root.SpeechSynthesisUtterance) {
        try { ss.cancel(); } catch (e) {}
        var u = new root.SpeechSynthesisUtterance(text);
        u.lang = speechLang();
        var v = pickVoice(ss.getVoices ? ss.getVoices() : [], speechLang());
        if (v) { try { u.voice = v; } catch (e) {} out.voice = v.name || null; }
        out.via = 'speechSynthesis';
        ss.speak(u);
        st.lastSpoken = out; return out;
      }
    } catch (e) {}
    // 3. Last resort: the app's existing native speaker (app.js sayNative).
    try {
      if (root.BAIN_APP && root.BAIN_APP.sayNative) { root.BAIN_APP.sayNative(text); out.via = 'sayNative'; st.lastSpoken = out; return out; }
    } catch (e) {}
    st.lastSpoken = out; return out;
  }
  function lastSpoken() { return st.lastSpoken ? { text: st.lastSpoken.text, via: st.lastSpoken.via, voice: st.lastSpoken.voice } : null; }

  // ---------------- asking ----------------
  // ask(question, onAnswer) — an open question ("how many?", "which
  // one?"). When onAnswer is given, the person's next words come back
  // through answerAsk() (typed) or the answer_pending tool (voice call)
  // and the callback runs once, with their exact words. A question with
  // no callback is just spoken; the caller listens another way.
  function ask(question, onAnswer) {
    question = clean(question); if (!question) return '';
    st.lastQuestion = question;
    if (typeof onAnswer === 'function') st.pendingAsk = { onAnswer: onAnswer, at: Date.now() };
    speak(question);
    return question;
  }
  function lastQuestion() { return st.lastQuestion; }
  function pendingAsk() { return st.pendingAsk ? { at: st.pendingAsk.at } : null; }
  function answerAsk(text) {
    var p = st.pendingAsk; if (!p) return false;
    st.pendingAsk = null;
    logTurn('user', text);
    try { p.onAnswer(text); } catch (e) {}
    return true;
  }

  // ---------------- confirming: ask once, act only on a clear yes/no ----------------
  var YES_WORDS = { yes: 1, yeah: 1, yep: 1, yup: 1, sure: 1, ok: 1, okay: 1, correct: 1, right: 1, please: 1, go: 1, ahead: 1, do: 1, buy: 1, 'go ahead': 1, 'yes please': 1 };
  var NO_WORDS = { no: 1, nope: 1, nah: 1, not: 1, never: 1, stop: 1, cancel: 1, 'no thanks': 1, 'no thank you': 1, 'not now': 1, "don't": 1, dont: 1 };
  function askConfirm(summary, onYes, onNo) {
    summary = clean(summary); if (!summary) return null;
    st.pending = { summary: summary, onYes: typeof onYes === 'function' ? onYes : null, onNo: typeof onNo === 'function' ? onNo : null, at: Date.now() };
    var q = /\?\s*$/.test(summary) ? summary : summary + ' — is that right?';
    speak(q);
    return { summary: summary, at: st.pending.at };
  }
  function pending() { return st.pending ? { summary: st.pending.summary, at: st.pending.at } : null; }
  function clearPending() { st.pending = null; return true; }
  function runPending(which) {
    var p = st.pending; if (!p) return false;
    st.pending = null;
    var fn = which === 'yes' ? p.onYes : p.onNo;
    if (fn) { try { fn(); } catch (e) {} }
    return true;
  }
  function answerYes() { logTurn('user', 'yes'); return runPending('yes'); }
  function answerNo() { logTurn('user', 'no'); return runPending('no'); }
  // The reply the person gave while a confirmation was open.
  // Returns 'yes' or 'no' (callback run, confirmation cleared), or
  // null when it was neither — the confirmation stays open and nothing
  // is guessed. Callers must not act on a null.
  function handleReply(text) {
    var t = norm(text || '');
    if (!st.pending) return null;
    if (!t) return null;
    logTurn('user', text);
    if (YES_WORDS[t] || /^yes\b/.test(t) || /\byes please\b/.test(t) || /\bgo ahead\b/.test(t) || t === 'ok' || t === 'okay' || t === 'sure') { runPending('yes'); return 'yes'; }
    if (NO_WORDS[t] || /^no\b/.test(t) || /\bno thanks\b/.test(t) || /\bnot now\b/.test(t)) { runPending('no'); return 'no'; }
    return null;
  }

  root.BAIN_CONVO = {
    rememberSearch: rememberSearch, lastResults: lastResults, lastQuery: lastQuery, lastSearch: lastSearch, forAI: forAI,
    resolveReference: resolveReference,
    askConfirm: askConfirm, answerYes: answerYes, answerNo: answerNo, handleReply: handleReply, pending: pending, clearPending: clearPending,
    ask: ask, lastQuestion: lastQuestion, answerAsk: answerAsk, pendingAsk: pendingAsk,
    speak: speak, lastSpoken: lastSpoken, pickVoice: pickVoice, voiceInfo: voiceInfo, inCall: inCall,
    logUser: function (t) { logTurn('user', t); }, logApp: function (t) { logTurn('app', t); }, log: log,
    _state: function () { return st; }
  };
})(typeof window !== 'undefined' ? window : globalThis);

/* NOTE — the Realtime voice (NOT changeable from this file, or from the
   phone at all): site/_worker.js line 7, `const VOICE = 'marin';`, used
   at line ~290 as `audio: { output: { voice: VOICE } }` in the session
   the server opens with OpenAI Realtime. 'marin' is already a female
   voice, so nothing needs to change for the voice to be "she" — but
   only someone with access to the live server (Tab holds it) can
   confirm or change it. If a warmer female voice is ever wanted, the
   server-side change is that one line: VOICE = 'coral' or 'shimmer'
   (both female OpenAI Realtime voices), then redeploy the Worker.
   This test copy never touches _worker.js, so this file does not and
   cannot change the live voice. */
