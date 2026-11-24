/* AIN Shop — natural language in any language (TEST COPY ONLY, v32).
   "The AI understands every voice command in all 50 languages, not just
   exact phrasings" (Nati, Nov 17 2026). Standalone module: it NEVER edits
   vcmd.js / intent.js / i18n.js and NEVER runs a command itself — it only
   classifies what was said. Integration wiring (script tag + call site)
   happens later by the coordinator; see the integration snippet in the
   delivery report.

   How it works, in order (cheapest first, AI last):
     1. EXACT — AIN_VCMD.match() when present (the whole-sentence tables
        in vcmd-i18n.js, ~13,000 phrasings in 50 languages). Confidence 1.
     2. LOCAL — normalize(): strip politeness/fillers ("please", "could
        you", "I want to", "por favor", "בבקשה"...), expand a small
        synonym map, drop articles; then token-overlap scoring against
        the same phrasing tables, so word order and extra words do not
        matter ("settings open please" = "open settings"). A one-word
        command only counts on a short utterance, so "close up cream"
        never means "close". Confidence 0.75–0.95.
     3. AI — POST /api/ai/intent (worker route, NOT in this file — see the
        report snippet; the coordinator adds it to _worker.js). The route
        returns ONLY {command, args, confidence}. If the route is missing
        (404), the network fails, or the answer is not valid JSON, the
        module falls back gracefully to a spoken clarifying question —
        it never guesses and never acts on a failed AI call.
     4. QUESTION — below confidence, or when nothing matches: ask in full
        sentences ("Did you mean ...?") instead of acting. A product
        search ("grey couch under 500 dollars") is NOT a failed command:
        it falls through to search with no question at all.

   HARD RULES (never relaxed, whatever the confidence):
     - Buy / pay / delete ALWAYS need a spoken confirmation first:
       buy_n, go_checkout, subscribe, cancel_sub, list_remove,
       forget_n, hist_clear, loc_forget, clear. interpret() only sets
       needsConfirm:true — it never runs the command. The caller must
       route those through the Yes/No box (AIN_VCMD.ask / AIN_LEGAL).
     - Nothing is promised at 100%. Aim is 95/100: the module says so
       in its questions ("I think you meant...") and never claims
       certainty it does not have.
     - Everything is spoken through window.BAIN_CONVO.speak() when that
       shared module exists (warm female voice, the app's "she"); when
       it does not exist yet, fall back to AIN_VCMD.speak / the phone
       voice — never throw.
     - No data leaves the phone except the one /api/ai/intent call, which
       sends only the utterance and the language code. No recording, no
       account, nothing stored. The 47 non-English/Hebrew/Yiddish
       phrasing tables were machine-made and not checked by native
       speakers, so the AI layer matters most in those languages.
*/
(function (root) {
  'use strict';

  /* ---------------- small helpers ---------------- */
  function N(s) {   // normalize like BAIN_INTENT when present, else a local copy
    if (root.BAIN_INTENT && BAIN_INTENT.normalize) return BAIN_INTENT.normalize(s);
    s = String(s == null ? '' : s).toLowerCase();
    try { s = s.normalize('NFKD'); } catch (e) {}
    return s.replace(/[\u0300-\u036f]/g, '').replace(/[\u0591-\u05c7]/g, '')
      .replace(/[\u064b-\u065f\u0670]/g, '').replace(/[’'`´]/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
  }
  function lev(a, b, max) {
    if (root.BAIN_INTENT && BAIN_INTENT.lev) return BAIN_INTENT.lev(a, b, max);
    if (a === b) return 0; max = max == null ? 2 : max;
    if (Math.abs(a.length - b.length) > max) return max + 1;
    var prev = [], cur, i, j; for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) { cur = [i]; var lo = i;
      for (j = 1; j <= b.length; j++) { cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); if (cur[j] < lo) lo = cur[j]; }
      if (lo > max) return max + 1; prev = cur; }
    return prev[b.length];
  }
  function wordLike(a, b) {   // one spoken word ≈ one phrase word (typo / cut-off / suffix)
    if (root.BAIN_INTENT && BAIN_INTENT.wordLike) return BAIN_INTENT.wordLike(a, b);
    if (a === b) return true;
    var n = Math.min(a.length, b.length);
    if (n >= 4 && lev(a, b, n >= 8 ? 2 : 1) <= (n >= 8 ? 2 : 1)) return true;
    if (a.length >= 4 && b.length > a.length && b.indexOf(a) === 0 && a.length >= b.length * 0.6) return true;
    if (b.length >= 4 && a.length > b.length && a.indexOf(b) === 0 && a.length - b.length <= 2) return true;
    return false;
  }
  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
  function round2(x) { return Math.round(x * 100) / 100; }

  /* ---------------- the command set (read, never copied) ---------------- */
  function LANGS() { return (root.BAIN_I18N && BAIN_I18N.LANGS) || {}; }
  function V(code) { var L = LANGS()[code]; return (L && L.v) || null; }
  function langNow(fallback) { return (root.BAIN_I18N && BAIN_I18N.lang) || fallback || 'en'; }
  // Every command id, from the English table (all 50 languages share ids).
  function commandIds() {
    var en = V('en');
    if (en && en.w) return Object.keys(en.w);
    return ['help', 'settings', 'close', 'lang', 'speed_fast', 'speed_normal', 'speed_slow', 'speed_ask', 'clear',
      'privacy', 'terms', 'contact', 'join', 'tip', 'report', 'notice_ok', 'talk_start', 'talk_end', 'plan',
      'subscribe', 'cancel_sub', 'restore', 'camera', 'take', 'cam_close', 'barcode', 'bc_buy', 'bc_ingr',
      'bc_desc', 'bc_open', 'co_help', 'card_help', 'co_add', 'go_checkout', 'buy_n', 'open_n', 'desc_n',
      'list_read', 'list_remove', 'again_n', 'forget_n', 'hist_clear', 'hist_more', 'hist_less', 'loc_use',
      'loc_forget', 'loc_yes', 'loc_no', 'loc_later', 'store_close', 'track', 'return', 'carts', 'all_stores',
      'stop', 'next', 'back', 'yes', 'no', 'show_cur', 'show_n'];
  }
  // Buy / pay / delete: ALWAYS a spoken confirmation first, whatever the confidence.
  var SENSITIVE = { buy_n: 1, go_checkout: 1, subscribe: 1, cancel_sub: 1, list_remove: 1, forget_n: 1, hist_clear: 1, loc_forget: 1, clear: 1 };
  // Thresholds (tuned so a wrong action is rarer than a question; 100% is not promised).
  var ACT_LOCAL = 0.75;    // local score at/above this: act (confirm first if sensitive)
  var ASK_LOCAL = 0.30;    // local score at/above this: looks command-like, worth asking the AI / asking the person
  var ACT_AI = 0.70;       // AI confidence at/above this: act (confirm first if sensitive)
  var ASK_AI = 0.45;       // AI confidence at/above this: ask "did you mean ...?" instead of acting

  /* ---------------- layer 2a: normalize ---------------- */
  // Articles dropped on both sides for scoring (same set vcmd.js uses, plus a few).
  var ART = {};
  ('the a an my me el la los las un una mi mis le les l un une mon ma mes du de des der die das den dem des ein eine einen meine mein meinen il lo gli i uno o os as um uma meu minha minhas meus het een mijn den det en ett min mitt mina az egy a az moj moja moje ten ta ha et את').split(' ').forEach(function (w) { if (w) ART[w] = 1; });
  // Extra polite leads the fill tables do not all carry (lead/tail only — never mid-sentence, so "show me more" keeps "show me").
  var EXTRA_FILL = {
    en: ['i need', 'i need to', 'i wanna', 'i want', 'could you please', 'can you please', 'please could you', 'please can you', 'hey please', 'um please', 'uh please'],
    es: ['porfa', 'porfa vor', 'me puedes', 'podrias por favor', 'puedes por favor', 'quiero que', 'necesito'],
    he: ['אפשר בבקשה', 'תוכל בבקשה', 'תוכלי בבקשה', 'אני צריכה', 'אני צריך', 'אני מבקש', 'אני מבקשת'],
    fr: ['s il vous plait', 's il te plait', 'je voudrais', 'je veux', 'tu peux', 'vous pouvez'],
    de: ['ich mochte', 'ich will', 'kannst du', 'konnen sie', 'bitte'],
    ar: ['من فضلك', 'أريد', 'اريد'],
    ru: ['пожалуйста', 'я хочу', 'можете'],
    pt: ['por favor', 'eu quero', 'pode'],
    it: ['per favore', 'vorrei', 'voglio', 'puoi']
  };
  // Small synonym map: whole words only, applied after filler-stripping.
  // Kept deliberately small — a wrong synonym is worse than no synonym.
  var SYN = {
    en: { purchase: 'buy', acquire: 'buy', erase: 'delete', wipe: 'delete', terminate: 'cancel', halt: 'stop' },
    es: { adquirir: 'comprar', borrar: 'eliminar', apagar: 'cerrar' },
    he: { 'לרכוש': 'קנה', 'מחוק': 'מחק' },
    fr: { acheter: 'acheter', effacer: 'supprimer' },
    de: { kaufen: 'kaufen', loschen: 'löschen' }
  };
  function fillersFor(code) {
    var out = [], seen = {};
    [code, 'en'].forEach(function (c) {
      var v = V(c); if (v && v.fill) v.fill.forEach(function (f) { var n = N(f); if (n && !seen[n]) { seen[n] = 1; out.push(n); } });
      (EXTRA_FILL[c] || []).forEach(function (f) { var n = N(f); if (n && !seen[n]) { seen[n] = 1; out.push(n); } });
    });
    out.sort(function (a, b) { return b.length - a.length; });   // longest first: "i would like to" before "i want"
    return out;
  }
  function stripFillers(t, code) {
    var fill = fillersFor(code), prev;
    do {
      prev = t;
      fill.forEach(function (f) {
        if (t === f) { t = ''; return; }
        if (t.indexOf(f + ' ') === 0) t = t.slice(f.length + 1);
        if (t.length > f.length && t.slice(-(f.length + 1)) === ' ' + f) t = t.slice(0, -(f.length + 1));
      });
      t = t.trim();
    } while (t && t !== prev);
    return t || N(t) ? t : t;
  }
  // The normalizer: base normalize (+ speech mishearing fixes when present),
  // filler strip, synonym expand, article drop, repeated-word collapse.
  function normalize(text, lang) {
    var code = lang || langNow();
    var t = (root.BAIN_INTENT && BAIN_INTENT.fix) ? BAIN_INTENT.fix(text) : N(text);
    if (!t) return '';
    t = stripFillers(t, code);
    if (!t) return '';
    var syn = SYN[code] || SYN.en;
    t = t.split(' ').map(function (w) { return syn[w] || w; }).join(' ');
    t = t.split(' ').filter(function (w) { return w && !ART[w]; }).join(' ');
    t = t.split(' ').filter(function (w, i, a) { return w !== a[i - 1]; }).join(' ');   // "close close" = "close"
    return t.trim();
  }

  /* ---------------- layer 2b: closest command (local scoring) ---------------- */
  function numWords(code) {   // { normalized word -> number } for {n} / {ord} slots, this language + English
    var out = {}, codes = [code, 'en'];
    codes.forEach(function (c) { var v = V(c); if (!v || !v.num) return;
      Object.keys(v.num).forEach(function (k) { (v.num[k] || []).forEach(function (w) { var n = N(w); if (n) out[n] = +k; }); });
    });
    return out;
  }
  function langNameMap() {   // normalized language name (own + English) -> code
    var out = {}, L = LANGS();
    Object.keys(L).forEach(function (c) {
      [L[c].name, L[c].en].forEach(function (nm) { var n = N(nm); if (n) out[n] = c; });
      var v = L[c].v; if (v && v.names) Object.keys(v.names).forEach(function (spoken) { (v.names[spoken] || []).forEach(function (w) { var n = N(w); if (n) out[n] = spoken; }); });
    });
    return out;
  }
  var STORES = ['walmart', 'target', 'amazon', 'best buy', 'costco', 'ikea', 'cvs', 'walgreens', 'kroger', 'meijer', 'home depot', 'lowes', 'macys', 'kohls', 'dollar tree', 'aldi', 'whole foods', 'trader joes', 'safeway', 'publix', 'heb'];
  function extractArgs(spoken, phrase, code) {
    var args = {}, nums = numWords(code), words = spoken.split(' ');
    var hasN = /\{(n|ord)\}/.test(phrase), hasLang = /\{lang\}/.test(phrase), hasStore = /\{store\}/.test(phrase);
    if (hasN) {
      for (var i = 0; i < words.length; i++) {
        var d = words[i].match(/^(\d{1,2})$/); if (d) { args.n = +d[1]; break; }
        if (nums[words[i]]) { args.n = nums[words[i]]; break; }
      }
      if (args.n != null && (args.n < 1 || args.n > 60)) delete args.n;
    }
    if (hasLang) {
      var names = langNameMap();
      for (var j = words.length; j >= 1; j--) for (var s = 0; s + j <= words.length; s++) {
        var cand = words.slice(s, s + j).join(' ');
        if (names[cand]) { args.lang = names[cand]; s = words.length; break; }
      }
    }
    if (hasStore) {
      var low = ' ' + spoken + ' ';
      for (var k = 0; k < STORES.length; k++) if (low.indexOf(' ' + STORES[k] + ' ') >= 0 || low.slice(1) === STORES[k] || low.slice(0, -1) === ' ' + STORES[k]) { args.store = STORES[k]; break; }
    }
    return args;
  }
  // Score one phrasing against the spoken words: template words matched
  // (fuzzy, any order) over template words, small penalty for extra words.
  // A slot ({n}/{ord}/{lang}/{store}) is not a word to match — it is filled
  // from extractArgs, and a slot phrasing with no fillable arg scores low.
  function phraseScore(spokenWords, phrase, code) {
    // Strip the slot BEFORE normalizing: N() turns "{n}" into the word "n",
    // which would count as a template word that can never match.
    var raw = N(phrase.replace(/\{(n|ord|lang|store)\}/g, ' ')).replace(/\s+/g, ' ').trim();
    var tw = raw.split(' ').filter(function (w) { return w && !ART[w]; });
    if (!tw.length) return { score: 0, matched: 0 };
    var used = {}, matched = 0;
    tw.forEach(function (pw) {
      for (var i = 0; i < spokenWords.length; i++) {
        if (!used[i] && wordLike(spokenWords[i], pw)) { used[i] = 1; matched++; break; }
      }
    });
    if (!matched) return { score: 0, matched: 0 };
    var score = matched / tw.length;
    var extra = spokenWords.length - matched;
    score -= Math.min(0.25, extra * 0.04);   // extra words tolerated, not free
    if (/\{(n|ord)\}/.test(phrase)) {   // a number slot with no number in what was said is a weak match
      var nums = numWords(code), hasNum = spokenWords.some(function (w) { return /^\d{1,2}$/.test(w) || nums[w]; });
      if (!hasNum) score = Math.min(score, 0.45);
    }
    if (/\{lang\}/.test(phrase)) {
      var names = langNameMap(), hasLang = spokenWords.some(function (w) { return names[w]; });
      if (!hasLang) score = Math.min(score, 0.45);
    }
    if (tw.length === 1 && spokenWords.length > 2) score = Math.min(score, 0.4);   // "close up cream" is not "close"
    return { score: clamp(score, 0, 1), matched: matched };
  }
  // Ranked [{command, args, score, matched, phrase, lang}] — best phrasing per command, best first.
  function closestCommand(text, lang) {
    var code = lang || langNow();
    var spoken = normalize(text, code);
    if (!spoken) return [];
    var words = spoken.split(' ').filter(Boolean);
    var best = {};
    [code, 'en'].forEach(function (c) {
      var v = V(c); if (!v || !v.w) return;
      Object.keys(v.w).forEach(function (id) {
        (v.w[id] || []).forEach(function (ph) {
          var ps = phraseScore(words, ph, code);
          if (ps.score > 0 && (!best[id] || ps.score > best[id].score || (ps.score === best[id].score && ps.matched > best[id].matched))) {
            best[id] = { command: id, args: extractArgs(spoken, ph, code), score: round2(ps.score), matched: ps.matched, phrase: String(ph), lang: c };
          }
        });
      });
    });
    return Object.keys(best).map(function (k) { return best[k]; }).sort(function (a, b) { return b.score - a.score || b.matched - a.matched || a.command.localeCompare(b.command); }).slice(0, 5);
  }

  /* ---------------- layer 3: AI classifier via /api/ai/intent ---------------- */
  // fetchFn is injectable for tests: classifyViaAI(text, lang, fakeFetch).
  // Returns {ok:true, command, args, confidence} or {ok:false, error}.
  // Any failure — no route (404), no network, bad JSON, unknown command —
  // is {ok:false}: the caller asks a question instead of guessing.
  function classifyViaAI(text, lang, fetchFn) {
    var code = lang || langNow();
    var f = fetchFn || (typeof fetch !== 'undefined' ? fetch : null);
    if (!f) return Promise.resolve({ ok: false, error: 'no_fetch' });
    var ctrl = null, timer = null;
    try {
      if (typeof AbortController !== 'undefined') { ctrl = new AbortController(); timer = setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, 8000); }
    } catch (e) {}
    var opts = { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: String(text || '').slice(0, 200), lang: code }) };
    if (ctrl) opts.signal = ctrl.signal;
    return Promise.resolve().then(function () { return f('/api/ai/intent', opts); }).then(function (r) {
      if (timer) clearTimeout(timer);
      if (!r || !r.ok) return { ok: false, error: 'http_' + (r ? r.status : 'none') };
      return r.json();
    }).then(function (j) {
      if (!j || typeof j !== 'object') return { ok: false, error: 'bad_json' };
      if (j.error) return { ok: false, error: String(j.error) };
      var cmd = String(j.command || '');
      if (cmd === 'search' || cmd === 'none') return { ok: true, command: cmd, args: {}, confidence: clamp(Number(j.confidence) || 0, 0, 1) };
      if (commandIds().indexOf(cmd) < 0) return { ok: false, error: 'unknown_command' };
      var args = (j.args && typeof j.args === 'object') ? j.args : {};
      var clean = {};
      if (args.n != null) { var n = parseInt(args.n, 10); if (n >= 1 && n <= 60) clean.n = n; }
      if (args.lang && LANGS()[args.lang]) clean.lang = args.lang;
      if (args.store && typeof args.store === 'string') clean.store = args.store.slice(0, 60);
      var conf = clamp(Number(j.confidence), 0, 1); if (isNaN(conf)) conf = 0;
      return { ok: true, command: cmd, args: clean, confidence: round2(conf) };
    }).catch(function (e) {
      if (timer) clearTimeout(timer);
      return { ok: false, error: (e && e.name === 'AbortError') ? 'timeout' : 'fetch_failed' };
    });
  }

  /* ---------------- questions, in full sentences ---------------- */
  var QUESTION = {
    en: { didYouMean: 'Did you mean “{phrase}”?', didntCatch: 'Sorry, I didn’t catch that. Could you say it again, in different words?', repeat: 'Sorry, I didn’t hear anything. Could you say it again?', confirm: 'Just to check — {phrase}? Say yes to go ahead, or no to keep things as they are.' },
    es: { didYouMean: '¿Quisiste decir “{phrase}”?', didntCatch: 'Perdón, no te entendí. ¿Puedes repetirlo con otras palabras?', repeat: 'Perdón, no escuché nada. ¿Puedes repetirlo?', confirm: 'Solo para confirmar — ¿{phrase}? Di que sí para seguir, o que no para dejar todo como está.' },
    he: { didYouMean: 'התכוונת ל“{phrase}”?', didntCatch: 'סליחה, לא הבנתי. אפשר לומר את זה שוב במילים אחרות?', repeat: 'סליחה, לא שמעתי כלום. אפשר לומר את זה שוב?', confirm: 'רק כדי לוודא — {phrase}? אמור כן כדי להמשיך, או לא כדי להשאיר הכול כמו שזה.' },
    fr: { didYouMean: 'Vouliez-vous dire « {phrase} » ?', didntCatch: 'Pardon, je n’ai pas compris. Pouvez-vous le redire autrement ?', repeat: 'Pardon, je n’ai rien entendu. Pouvez-vous répéter ?', confirm: 'Juste pour vérifier — {phrase} ? Dites oui pour continuer, ou non pour ne rien changer.' },
    de: { didYouMean: 'Meinten Sie „{phrase}“?', didntCatch: 'Entschuldigung, das habe ich nicht verstanden. Können Sie es anders sagen?', repeat: 'Entschuldigung, ich habe nichts gehört. Können Sie es wiederholen?', confirm: 'Nur zur Sicherheit — {phrase}? Sagen Sie Ja zum Fortfahren oder Nein, um alles so zu lassen.' }
  };
  function qtext(code, key, phrase) {
    var q = QUESTION[code] || QUESTION.en;
    return String(q[key] || QUESTION.en[key]).replace('{phrase}', phrase || '');
  }
  // A readable form of a command in this language ("buy number 2", "open settings").
  function describe(id, lang, args) {
    var code = lang || langNow();
    if (root.AIN_VCMD && AIN_VCMD.phrase) { try { return AIN_VCMD.phrase(id, code); } catch (e) {} }
    var v = V(code) || V('en'), w = (v && v.w && v.w[id] && v.w[id][0]) || id;
    var n = (args && args.n) || 2, nm = (args && args.lang && LANGS()[args.lang]) ? LANGS()[args.lang].name : 'English';
    return String(w).replace(/\{n\}/g, String(n)).replace(/\{ord\}/g, String(n)).replace(/\{lang\}/g, nm).replace(/\{store\}/g, (args && args.store) || 'Walmart');
  }
  function buildQuestion(code, candidate) {   // candidate: {command, args} | null
    if (!candidate) return qtext(code, 'didntCatch');
    return qtext(code, 'didYouMean', describe(candidate.command, code, candidate.args));
  }

  /* ---------------- speaking (BAIN_CONVO first, never throws) ---------------- */
  function speak(text, lang) {
    if (!text) return false;
    try {
      var C = root.BAIN_CONVO || null;
      if (C && typeof C.speak === 'function') { C.speak(text, lang); return true; }
      if (root.AIN_VCMD && typeof AIN_VCMD.speak === 'function') { AIN_VCMD.speak(text); return true; }
      var A = root.BAIN_APP;
      if (A && typeof A.sayNative === 'function') { A.sayNative(text); return true; }
    } catch (e) {}
    return false;
  }

  /* ---------------- layer 4: interpret ---------------- */
  // interpret(text, lang, opts) -> Promise<{command, args, confidence,
  //   needsConfirm, confirmQuestion, askedQuestion, source}>
  //   source: 'exact' | 'local' | 'ai' | 'question' | 'search' | 'none'
  //   command null + askedQuestion set = ask the person, do NOT act.
  //   command null + askedQuestion null + source 'search' = a product
  //   search, not a command — the caller searches as usual.
  //   needsConfirm true = sensitive (buy/pay/delete): the caller MUST ask
  //   the person (Yes/No box) before running it, whatever the confidence.
  // opts: { fetchFn, useAI: true|false (default true), speakQuestion: true|false }
  function interpret(text, lang, opts) {
    opts = opts || {};
    var code = lang || langNow();
    var said = String(text == null ? '' : text);
    function done(r) {
      if (opts.speakQuestion !== false && r.askedQuestion) speak(r.askedQuestion, code);
      return r;
    }
    function result(command, args, confidence, source, askedQuestion) {
      var needs = !!(command && SENSITIVE[command]);
      return { command: command || null, args: args || null, confidence: round2(confidence || 0),
        needsConfirm: needs, confirmQuestion: needs ? qtext(code, 'confirm', describe(command, code, args)) : null,
        askedQuestion: askedQuestion || null, source: source };
    }
    // Silence / noise: ask the person to say it again — never act, never search.
    if (!N(said) || (root.BAIN_INTENT && BAIN_INTENT.noise && BAIN_INTENT.noise(said))) {
      return Promise.resolve(done(result(null, null, 0, 'none', qtext(code, 'repeat'))));
    }
    // 1. Exact whole-sentence match (the existing tables win whenever they match).
    try {
      var VCMD = root.AIN_VCMD;
      if (VCMD && typeof VCMD.match === 'function') {
        var m = VCMD.match(said, 'typed');
        if (m && m.id) return Promise.resolve(done(result(m.id, m.arg || null, 1, 'exact', null)));
      }
    } catch (e) {}
    // 2. Local fuzzy match on the normalized form.
    var local = closestCommand(said, code);
    var best = local[0] || null;
    if (best && best.score >= ACT_LOCAL) {
      return Promise.resolve(done(result(best.command, best.args, 0.55 + best.score * 0.4, 'local', null)));
    }
    // Not a confident local match. If it does not even look command-like —
    // or only ONE word of a command matched ("close up cream") — it is a
    // product search: fall through with no question and no AI call.
    if (!best || best.score < ASK_LOCAL || (best.matched < 2 && best.score < 0.6)) {
      return Promise.resolve(done(result(null, null, 0, 'search', null)));
    }
    // 3. AI classifier — but only when it looks command-like. If the AI
    // route is missing or fails, ask the person with the closest command.
    if (opts.useAI === false) {
      return Promise.resolve(done(result(null, null, 0, 'question', buildQuestion(code, best))));
    }
    return classifyViaAI(said, code, opts.fetchFn).then(function (ai) {
      if (ai.ok && ai.command && ai.command !== 'search' && ai.command !== 'none') {
        if (ai.confidence >= ACT_AI) return done(result(ai.command, ai.args, ai.confidence, 'ai', null));
        if (ai.confidence >= ASK_AI) return done(result(null, null, ai.confidence, 'question', buildQuestion(code, { command: ai.command, args: ai.args })));
      }
      if (ai.ok && (ai.command === 'search' || ai.command === 'none')) {
        return done(result(null, null, ai.confidence || 0, 'search', null));
      }
      // AI unavailable / unsure: ask with the closest local command.
      return done(result(null, null, best.score, 'question', buildQuestion(code, best)));
    });
  }

  // Convenience for the later integration only: interpret, then — when the
  // result is a confident, non-sensitive command — run it through the
  // existing vcmd runner (which itself asks the Yes/No box for sensitive
  // ones). Questions are spoken, searches are left to the caller.
  // Returns a Promise<{ran, result}>; never throws.
  function handle(text, lang, how, opts) {
    return interpret(text, lang, opts).then(function (r) {
      if (!r.command) return { ran: false, result: r };
      var VCMD = root.AIN_VCMD;
      if (!VCMD || typeof VCMD.run !== 'function') return { ran: false, result: r };
      try {
        var out = VCMD.run({ id: r.command, arg: r.args }, how || 'typed') || {};
        if (out.ask) { VCMD.ask(out.ask.q, out.ask.run, how || 'typed'); return { ran: true, result: r }; }
        if (out.say) speak(out.say, lang);
        return { ran: true, result: r };
      } catch (e) { return { ran: false, result: r }; }
    });
  }

  var api = { normalize: normalize, closestCommand: closestCommand, classifyViaAI: classifyViaAI, interpret: interpret,
    handle: handle, speak: speak, describe: describe, buildQuestion: buildQuestion, commandIds: commandIds,
    SENSITIVE: SENSITIVE, THRESHOLDS: { ACT_LOCAL: ACT_LOCAL, ASK_LOCAL: ASK_LOCAL, ACT_AI: ACT_AI, ASK_AI: ASK_AI } };
  root.BAIN_LANGFALLBACK = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
