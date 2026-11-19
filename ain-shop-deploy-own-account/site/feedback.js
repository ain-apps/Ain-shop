/* AIN Shop — voice feedback on search results (TEST COPY ONLY).
   "That result was helpful" / "that one wasn't helpful" / "number 2 was
   wrong" (Nati, Nov 17 2026): the person tells the app, by voice, how
   a result was, and the app remembers — on this phone only — so it can
   read the good ones first next time.
   How it works, in order:
     1. HEAR IT: command() understands a verdict about "that one",
        "the first one", "number 2", or a result named by its words.
        It resolves which result is meant through window.BAIN_CONVO
        (C.resolveReference / C.lastResults) when that shared module
        exists, and falls back to the results on screen (BAIN_APP.S)
        when it does not. The module never assumes BAIN_CONVO is there.
     2. KEPT ON THIS PHONE ONLY (localStorage "ain.feedback", same
        pattern as the teaching records in teaching.js and the watchlist):
        no server copy, no account, nothing leaves the phone. At most
        200 feedback events; the oldest drop. What is stored is only
        the product title / store / link, the query, the verdict, and
        the date. No names, emails, addresses, or anything else.
     3. USED TO ORDER WHAT IS READ FIRST — GENTLY: boostForRanking()
        returns a small number, never more than +0.05 or less than
        -0.05. A helpful result reads a little earlier, a not-helpful
        or wrong one a little later — but feedback can never bury a
        clearly relevant item or promote an irrelevant one: two items
        whose relevance is more than 0.10 apart keep their order no
        matter how much feedback either one has (see ranked()).
        _worker.js is untouched; the boost is applied only when the
        app orders results for reading.
     4. WRONG IS AN OFFER, NOT AN AUTO-REPORT: when the person says a
        result was wrong, the app asks "Want me to note that as a
        mistake to fix?" and does NOTHING more until they answer.
        Only on a clear yes is the case handed to the existing
        report-a-mistake flow (BAIN_TEACH.record, the same on-phone
        teaching record corrections.js saves) — as a candidate
        correction, pending review. It is never auto-sent, auto-shared,
        or auto-applied, and the corrections email is never opened
        by this module. On a no, the case is dropped and only the
        "read fewer like that one" feedback stays.
   Spoken style: the app is a voice conversation like a person — every
   verdict is answered in a full sentence, in a warm voice, through
   C.speak(text) when BAIN_CONVO exists, otherwise through the app's
   own speech (sayNative) when no voice call is active. */
(function (root) {
  'use strict';
  var KEY = 'ain.feedback';
  var MAX_EVENTS = 200;
  var MAX_TITLE = 160;
  // The whole point of the bound: the biggest swing feedback can cause
  // between two items is 0.05 - (-0.05) = 0.10, so any two items whose
  // relevance is more than 0.10 apart keep their order. Feedback only
  // ever decides near-ties — it re-orders the reading, it never
  // overrules relevance.
  var MAX_BOOST = 0.05;
  var HELPFUL_STEP = 0.025;   // +0.025 per helpful, up to 2 counted
  var NOT_HELPFUL_STEP = 0.025;
  var WRONG_STEP = 0.05;      // one wrong verdict is the full -0.05

  function convo() { try { return root.BAIN_CONVO || null; } catch (e) { return null; } }
  function APP() { try { return root.BAIN_APP || null; } catch (e) { return null; } }
  function ls() { try { return root.localStorage || null; } catch (e) { return null; } }
  function clean(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE); }
  function normTitle(s) { try { return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim(); } catch (e) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); } }
  function normUrl(u) { return String(u || '').split('#')[0].replace(/\/+$/, '').toLowerCase(); }
  function shortName(p) { try { var A = APP(); if (A && A.shortName) return A.shortName(p); } catch (e) {} return clean(p && p.title); }

  // Spoken text. English here on purpose: there are no feedback keys in
  // i18n.js (another agent owns that file), so the module ships its own
  // full sentences; if a key ever exists, t() below will use it.
  var STR = {
    noResults: "I haven't read any results yet, so there's nothing to rate. Try a search first, and then tell me if a result was helpful.",
    noSuch: "I couldn't tell which result you meant. Could you say its number, like number 2?",
    helpful: 'Got it — thank you. I\'ll read more like {name} first.',
    notHelpful: 'Got it — I\'ll read fewer like that one first.',
    wrongAsk: 'Got it — I\'ll read fewer like that one first. Want me to note that as a mistake to fix?',
    wrongYes: 'Done — I\'ve noted it on this phone only, so it can be checked. I\'ll bring it to you before anything is shared, and you can say yes or no to the fix.',
    wrongYesNoTeach: 'Got it — I\'ve noted it on this phone only. I\'ll read fewer like that one first.',
    wrongNo: 'Okay, I won\'t note it as a mistake. I\'ll just read fewer like that one first.',
    wrongNoPending: 'There\'s no mistake waiting to be noted right now.',
    summaryNone: 'You haven\'t rated any results yet.',
    summary: 'So far you\'ve said {h} {hWord} helpful, {n} not helpful, and {w} wrong.'
  };
  function t(k, v) {
    var A = APP(), s = null;
    try { if (A && A.t) { var got = A.t(k, v); if (got !== k) s = got; } } catch (e) {}
    if (s == null) { s = STR[k] != null ? STR[k] : k; s = String(s).replace(/\{(\w+)\}/g, function (_, n) { return v && v[n] != null ? v[n] : ''; }); }
    return s;
  }
  function say(text) {
    var C = convo();
    if (C && C.speak) { try { C.speak(text); return; } catch (e) {} }
    var A = APP(); if (!A) return;
    try { A.status(text); } catch (e) {}
    try { A.announce(text); } catch (e) {}
    // Inside a voice call the AI voice speaks the returned sentence;
    // sayNative is only for when no call is active.
    try { if (!(root.BAIN_AI && root.BAIN_AI.active())) A.sayNative(text); } catch (e) {}
  }

  // ---- storage: on this phone only, nothing sent anywhere ----
  function load() { var s = ls(); if (!s) return []; try { var a = JSON.parse(s.getItem(KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function saveAll(a) { var s = ls(); if (!s) return false; try { if (a.length) s.setItem(KEY, JSON.stringify(a.slice(-MAX_EVENTS))); else s.removeItem(KEY); return true; } catch (e) { return false; } }

  // One stable key per product: the link when there is one (same item at
  // the same store), otherwise the title + store. Feedback is about the
  // item, never about the person.
  function productKey(p) {
    if (p == null) return '';
    if (typeof p === 'string') return normTitle(p);
    if (p.url) return 'url:' + normUrl(p.url);
    return 'title:' + normTitle(p.title) + '|' + normTitle(p.store);
  }
  function normVerdict(v) {
    var s = String(v == null ? '' : v).toLowerCase().replace(/[\s-]+/g, '_').trim();
    if (s === 'helpful' || s === 'great' || s === 'good' || s === 'useful') return 'helpful';
    if (s === 'not_helpful' || s === 'not_useful' || s === 'unhelpful' || s === 'bad') return 'not_helpful';
    if (s === 'wrong' || s === 'incorrect' || s === 'not_right') return 'wrong';
    return null;
  }

  // record(product, verdict, query) — verdict 'helpful' | 'not_helpful' | 'wrong'.
  // product is a search result { title, store, url } (or a key string).
  // Returns the stored event, or null when there is nothing to record.
  function record(product, verdict, query) {
    var v = normVerdict(verdict);
    if (!v || !product) return null;
    var key = productKey(product);
    if (!key) return null;
    var title = typeof product === 'string' ? product : clean(product.title);
    if (!title) return null;
    var q = clean(query != null ? query : currentQuery());
    var ev = { key: key, title: title, store: typeof product === 'string' ? '' : clean(product.store || ''), url: typeof product === 'string' ? '' : String(product.url || '').split('#')[0].slice(0, 500), query: q, verdict: v, at: new Date().toISOString().slice(0, 10) };
    var list = load(); list.push(ev); saveAll(list);
    return ev;
  }

  // helpfulness(productOrKey) -> counts for one product.
  function helpfulness(productOrKey) {
    var key = typeof productOrKey === 'string' && (productOrKey.indexOf('url:') === 0 || productOrKey.indexOf('title:') === 0) ? productOrKey : productKey(productOrKey);
    var c = { helpful: 0, not_helpful: 0, wrong: 0, total: 0, net: 0, boost: 0 };
    if (!key) return c;
    load().forEach(function (ev) { if (ev.key !== key) return; c.total++; if (ev.verdict === 'helpful') c.helpful++; else if (ev.verdict === 'not_helpful') c.not_helpful++; else if (ev.verdict === 'wrong') c.wrong++; });
    c.net = c.helpful - c.not_helpful - c.wrong;
    c.boost = boostForKey(key);
    return c;
  }
  function boostForKey(key) {
    var c = { helpful: 0, not_helpful: 0, wrong: 0 };
    load().forEach(function (ev) { if (ev.key !== key) return; if (ev.verdict === 'helpful') c.helpful++; else if (ev.verdict === 'not_helpful') c.not_helpful++; else if (ev.verdict === 'wrong') c.wrong++; });
    var b = HELPFUL_STEP * Math.min(c.helpful, 2) - NOT_HELPFUL_STEP * Math.min(c.not_helpful, 2) - WRONG_STEP * Math.min(c.wrong, 1);
    if (b > MAX_BOOST) b = MAX_BOOST;
    if (b < -MAX_BOOST) b = -MAX_BOOST;
    return Math.round(b * 1000) / 1000;
  }
  // boostForRanking(product) — the small number the read-order adds to a
  // result's relevance score. Always in [-0.05, +0.05], however much
  // feedback one product has had.
  function boostForRanking(product) { var k = productKey(product); return k ? boostForKey(k) : 0; }

  function recentFeedback(n) { return load().slice(-(n || 20)).reverse(); }
  function clear() { saveAll([]); pending = null; return true; }
  function exportJSON() { return JSON.stringify(load(), null, 2); }
  function summary() {
    var list = load();
    if (!list.length) return t('summaryNone');
    var h = 0, n = 0, w = 0;
    list.forEach(function (ev) { if (ev.verdict === 'helpful') h++; else if (ev.verdict === 'not_helpful') n++; else if (ev.verdict === 'wrong') w++; });
    return t('summary', { h: h, hWord: h === 1 ? 'result was' : 'results were', n: n, w: w });
  }

  // ranked(results, scoreOf) — a copy of the results in the order they
  // should be READ, relevance first, feedback second. scoreOf(p) is the
  // relevance score (same scale _worker.js uses). Stable: equal adjusted
  // scores keep their original order. Because |boost| <= 0.05, the
  // adjusted order can only differ from the relevance order when two
  // items are within 0.10 of each other — a clearly more relevant item
  // (more than 0.10 ahead) can never be pushed down by feedback.
  function ranked(results, scoreOf) {
    var list = (results || []).slice();
    var scored = list.map(function (p, i) {
      var raw = 0; try { raw = typeof scoreOf === 'function' ? (+scoreOf(p) || 0) : 0; } catch (e) { raw = 0; }
      return { p: p, i: i, raw: raw, adj: raw + boostForRanking(p) };
    });
    scored.sort(function (a, b) { if (b.adj !== a.adj) return b.adj - a.adj; return a.i - b.i; });
    return scored.map(function (x) { return x.p; });
  }

  // ---- which result is the person talking about? ----
  function lastResults() {
    var C = convo();
    if (C && C.lastResults) { try { var r = C.lastResults(); if (Array.isArray(r)) return r; } catch (e) {} }
    var A = APP();
    try { if (A && A.S && Array.isArray(A.S.results)) return A.S.results; } catch (e) {}
    return [];
  }
  function currentQuery() {
    var C = convo();
    if (C && C.lastQuery) { try { var q = C.lastQuery(); if (q) return String(q); } catch (e) {} }
    var A = APP();
    try { if (A && A.S && A.S.query && A.S.query.query) return String(A.S.query.query); } catch (e) {}
    return '';
  }
  function currentIndex() {
    var A = APP();
    try { if (A && A.S) { if (A.S.spot >= 0) return A.S.spot; if (A.S.chosen >= 0) return A.S.chosen; } } catch (e) {}
    return 0;
  }
  var ORDINALS = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12 };
  function resolveTarget(text, results) {
    if (!results.length) return -1;
    var C = convo();
    // 1. The conversation module knows what "that one" means.
    if (C && C.resolveReference) {
      try {
        var r = C.resolveReference(text, results);
        if (typeof r === 'number' && r >= 0 && r < results.length) return r;
        if (r && typeof r === 'object') {
          if (typeof r.index === 'number' && r.index >= 0 && r.index < results.length) return r.index;
          if (r.title || r.url) { for (var k = 0; k < results.length; k++) if (productKey(results[k]) === productKey(r)) return k; }
        }
      } catch (e) {}
    }
    // 2. "number 2", "result 2", "the 2nd", "2" on its own.
    var m = /(?:number|result|item|#)\s*(\d{1,2})\b/.exec(text) || /\b(\d{1,2})(?:st|nd|rd|th)\b/.exec(text);
    if (m) { var n = parseInt(m[1], 10); if (n >= 1 && n <= results.length) return n - 1; return -2; }
    var ow = /\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth)\b/.exec(text);
    if (ow && ORDINALS[ow[1]]) { var o = ORDINALS[ow[1]]; if (o <= results.length) return o - 1; return -2; }
    // 3. "that one / this one / that result / the last one" = the result
    // being read right now (the lit-up one, else the chosen one, else the first).
    if (/\b(that|this)\s+(one|result|item)\b/.test(text) || /\bthat one\b/.test(text) || /\bthis one\b/.test(text)) {
      if (/last one|the last/.test(text)) return results.length - 1;
      return currentIndex();
    }
    if (/\blast one\b/.test(text)) return results.length - 1;
    // 4. Words from a result's own title ("the Nike shoes were great").
    var words = normTitle(text).split(' ').filter(function (w) { return w.length >= 4; });
    var best = -1, bs = 0;
    results.forEach(function (p, i) {
      var tw = normTitle(p.title).split(' '), s = 0;
      words.forEach(function (w) { if (tw.indexOf(w) >= 0) s++; });
      if (s > bs) { bs = s; best = i; }
    });
    if (best >= 0 && bs >= 1) return best;
    return -1;
  }

  // ---- the pending "was wrong" offer ----
  // Only ever one pending offer. It holds the product + query so a later
  // "yes" can hand it to the teaching flow — and nothing else.
  var pending = null;
  function pendingWrong() { return pending; }

  // answerMistakeOffer(yes) — the person's answer to "Want me to note
  // that as a mistake to fix?" yes may be true/false or "yes"/"no".
  // YES: hands the case to the EXISTING teaching flow (BAIN_TEACH.record
  // — the same on-phone record corrections.js saves) as a candidate
  // correction, pending review. Nothing is sent, shared, or applied.
  // NO: drops it; only the "read fewer like that one" feedback stays.
  function answerMistakeOffer(yes) {
    var y = yes === true || String(yes || '').toLowerCase().trim().indexOf('yes') === 0 || String(yes || '').toLowerCase().trim() === 'yeah' || String(yes || '').toLowerCase().trim() === 'sure';
    var p = pending; pending = null;
    if (!p) { var s0 = t('wrongNoPending'); say(s0); return { action: 'none', sentence: s0 }; }
    if (!y) { var s1 = t('wrongNo'); say(s1); return { action: 'declined', sentence: s1, product: p.product }; }
    var noted = false;
    try {
      if (root.BAIN_TEACH && root.BAIN_TEACH.record) {
        var rec = root.BAIN_TEACH.record({ query: p.query, wrong_title: p.product.title, source: 'voice-feedback' });
        noted = !!rec;
      }
    } catch (e) { noted = false; }
    var s2 = noted ? t('wrongYes') : t('wrongYesNoTeach');
    say(s2);
    return { action: 'mistake_noted', sentence: s2, product: p.product, noted: noted };
  }
  function confirmMistake(yes) { return answerMistakeOffer(yes); }

  // ---- voice commands ----
  // "that result was helpful", "that one wasn't helpful",
  // "number 2 was wrong", "the first one was great".
  // Returns null when the words are not feedback at all, so the caller
  // can try the next command handler. Otherwise returns an object with
  // the sentence to speak (already spoken through BAIN_CONVO when it
  // exists) — the AI voice speaks `sentence` when there is no C.
  function detectVerdict(text) {
    if (/\bwrong\b|\bincorrect\b|\bnot (the )?right\b|\bnot what i (asked|wanted|meant)\b|\bthat'?s not it\b|\bthis isn'?t (it|right)\b|\bnot the one\b/.test(text)) return 'wrong';
    if (/\bnot helpful\b|\bwasn'?t helpful\b|\bwas not helpful\b|\bnot useful\b|\bwasn'?t useful\b|\bwas not useful\b|\bdidn'?t help\b|\bnot helping\b|\buseless\b|\bno help\b/.test(text)) return 'not_helpful';
    if (/\bhelpful\b|\bgreat\b|\bgood one\b|\bloved (it|that)\b|\bperfect\b|\buseful\b|\bthat helped\b|\bthis helped\b|\bhelped (a lot|me)\b|\bexcellent\b|\bjust right\b/.test(text)) return 'helpful';
    return null;
  }
  function command(raw) {
    var text = String(raw || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (!text) return null;
    // A yes/no answer to the pending "note it as a mistake?" offer
    // comes first — "yes" here must not be read as new feedback.
    if (pending && /^(yes|yeah|yep|sure|ok|okay|please|do it|go ahead|no|nope|not now|don'?t)\b/.test(text)) {
      return answerMistakeOffer(/^(yes|yeah|yep|sure|ok|okay|please|do it|go ahead)\b/.test(text));
    }
    var verdict = detectVerdict(text);
    if (!verdict) return null;
    var results = lastResults();
    if (!results.length) { var s0 = t('noResults'); say(s0); return { action: 'none', verdict: verdict, sentence: s0 }; }
    var idx = resolveTarget(text, results);
    if (idx === -2 || idx < 0) { var s1 = t('noSuch'); say(s1); return { action: 'none', verdict: verdict, sentence: s1 }; }
    var product = results[idx];
    var ev = record(product, verdict, currentQuery());
    if (!ev) { var s2 = t('noSuch'); say(s2); return { action: 'none', verdict: verdict, sentence: s2 }; }
    var name = shortName(product);
    if (verdict === 'helpful') {
      var sh = t('helpful', { name: name }); say(sh);
      return { action: 'feedback', verdict: 'helpful', product: product, key: ev.key, sentence: sh };
    }
    if (verdict === 'not_helpful') {
      var sn = t('notHelpful', { name: name }); say(sn);
      return { action: 'feedback', verdict: 'not_helpful', product: product, key: ev.key, sentence: sn };
    }
    // wrong: record the feedback, then ASK — the teaching case is only
    // created if the person says yes to the question.
    pending = { product: product, query: ev.query || currentQuery() };
    var sw = t('wrongAsk', { name: name }); say(sw);
    return { action: 'ask_mistake', verdict: 'wrong', product: product, key: ev.key, sentence: sw, needsConfirm: true };
  }

  root.BAIN_FEED = { KEY: KEY, MAX_BOOST: MAX_BOOST, record: record, helpfulness: helpfulness, boostForRanking: boostForRanking, ranked: ranked, recentFeedback: recentFeedback, summary: summary, productKey: productKey, clear: clear, exportJSON: exportJSON, command: command, handleVoice: command, pendingWrong: pendingWrong, answerMistakeOffer: answerMistakeOffer, confirmMistake: confirmMistake, lastResults: lastResults };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.BAIN_FEED;
})(typeof window !== 'undefined' ? window : globalThis);
