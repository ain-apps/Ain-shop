/* AIN Shop — reorder shortcuts (TEST COPY ONLY, v32).
   "Reorder my coffee" / "buy my toothpaste again" / "what did I buy before?"
   (Nati, Nov 17 2026): reorder things bought before, by voice, using the
   existing Buy again / history — nothing new is stored.
   What it reads: BAIN_HIST.all() — localStorage "bain:history" on THIS
   phone only (history.js). An entry means "you picked / went to buy this
   here" (tapped Buy, opened the store page, went to checkout, or added
   it to the list) — AIN Shop never sees the store's checkout, so it is
   not a receipt. orders.js stores nothing of its own; it only opens a
   store's own order-tracking / returns page for stores in that same
   history. This module never invents a second history store.
   What reorder means: a FRESH live search for that item, exactly like a
   normal search, and then the normal store-page flow. It reuses
   BAIN_HIST.reorder(index) — the same check the Buy again button does
   (today's price and stock via BAIN_CO.prepare) — and it NEVER buys
   anything and NEVER pays: buying always happens on the store's own
   page, after the person says yes.
   Conversation: it talks in full sentences, asks which one when several
   past purchases match, and ALWAYS confirms ("Shall I find it again?")
   before anything is re-searched. It speaks through window.BAIN_CONVO
   (site/conversation.js) when that module exists — C.speak(text),
   C.ask(question, onAnswer), C.resolveReference(answer, items) — and
   falls back to plain spoken text (BAIN_APP.sayNative + announce) when
   it does not. A "no" answer stops everything, politely.
   No live search happens here directly and nothing is sent anywhere. */
(function (root) {
  'use strict';
  var APP = function () { return root.BAIN_APP; };
  var HIST = function () { return root.BAIN_HIST; };
  var CONVO = function () { return root.BAIN_CONVO || null; };
  function I() { return root.BAIN_I18N; }
  function t(k, v) { return APP() ? APP().t(k, v) : (I() ? I().t(k, v) : k); }
  function $(id) { return root.document ? root.document.getElementById(id) : null; }
  var R = { lastList: [], pending: null, busy: false };

  // ---- reading the history (never writing a new store) ----
  function hist() { var H = HIST(); return H && H.all ? H.all() : []; }
  function nameOf(e) { return e.name || e.title || ''; }
  function money(price, cur) {
    var H = HIST();
    if (price == null) return t('priceUnknown');
    if (H && H.money) { try { return H.money(price, cur); } catch (e) {} }
    try { return new Intl.NumberFormat(I() ? I().speech() : 'en-US', { style: 'currency', currency: cur || 'USD' }).format(price); } catch (e) { return '$' + price; }
  }
  function priceText(e) { return e.price != null ? money(e.price, e.currency) : t('priceUnknown'); }
  function words(s) { return String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').split(/[^\p{L}\p{N}]+/u).filter(function (w) { return w.length >= 3; }); }
  var STOP = { the: 1, and: 1, for: 1, from: 1, with: 1, same: 1, last: 1, time: 1, again: 1, buy: 1, bought: 1, order: 1, reorder: 1, my: 1, usual: 1, what: 1, did: 1, get: 1, item: 1, that: 1, this: 1, one: 1, please: 1, history: 1, open: 1, want: 1, find: 1, me: 1, before: 1 };
  function score(e, qs) {
    var ws = words(e.title + ' ' + (e.name || '') + ' ' + e.store + ' ' + (e.variant || '')), s = 0;
    qs.forEach(function (w) { if (ws.some(function (x) { return x === w || (w.length >= 4 && (x.indexOf(w) === 0 || w.indexOf(x) === 0) && Math.min(x.length, w.length) >= 4); })) s++; });
    return s;
  }
  // every past item whose words match the request, best match first, then most recent
  function matches(query) {
    var a = hist(); if (!a.length) return [];
    var qs = words(query).filter(function (w) { return !STOP[w]; });
    if (!qs.length) return [];
    return a.map(function (e, i) { return { e: e, i: i, s: score(e, qs) }; })
      .filter(function (x) { return x.s > 0; })
      .sort(function (x, y) { return (y.s - x.s) || ((y.e.last || 0) - (x.e.last || 0)); })
      .map(function (x) { return x.e; });
  }
  // most recent matching past item, or null
  function lastBought(query) { var m = matches(query); return m.length ? m[0] : null; }
  // distinct previously bought/opened items, most recent first (history already
  // dedups by URL; this also collapses the same name at the same store)
  function reorderCandidates() {
    var seen = {}, out = [];
    hist().forEach(function (e) {
      var k = String(nameOf(e)).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() + '|' + String(e.store || '').toLowerCase();
      if (seen[k]) return; seen[k] = 1; out.push(e);
    });
    return out;
  }
  function indexOfEntry(e) { var a = hist(); for (var i = 0; i < a.length; i++) if (a[i] === e || (a[i].url && e.url && String(a[i].url).split('#')[0] === String(e.url).split('#')[0])) return i; return -1; }

  // ---- what the person hears (full sentences, never a bare name) ----
  function speakReorder(e) {
    return t('reorderAsk', { name: nameOf(e), store: e.store || '', price: priceText(e) });
  }
  function describe(e, i) {
    var n = nameOf(e);
    var s = (i != null ? (i + 1) + '. ' : '') + n;
    if (e.variant) s += ' (' + e.variant + ')';
    s += ' — ' + priceText(e) + (e.store ? ' at ' + e.store : '');
    if (e.count > 1) s += ', ' + t('reorderTimes', { n: e.count });
    return s;
  }
  // "Which coffee — the Colombian one for $12.99, or the decaf for $9.99?"
  function disambiguationQuestion(query, list) {
    var shown = list.slice(0, 3);
    var parts = shown.map(function (e) {
      var n = nameOf(e);
      return 'the ' + n + ' for ' + priceText(e) + (e.store ? ' at ' + e.store : '');
    });
    var joined = parts.length > 2 ? parts.slice(0, -1).join(', ') + ', or ' + parts[parts.length - 1] : parts.join(', or ');
    return t('reorderWhich', { what: String(query || '').trim() || t('reorderItem'), items: joined });
  }
  function listSentence(n) {
    var a = reorderCandidates().slice(0, n || 5);
    if (!a.length) return t('reorderNone');
    return t('reorderList', { items: a.map(function (e, i) { return describe(e, i); }).join('; ') });
  }
  function noHistorySentence(query) {
    return t('reorderNoMatch', { what: String(query || '').trim() || t('reorderItem') });
  }

  // ---- speaking / asking, through the conversation module when it exists ----
  function speak(txt) {
    var C = CONVO();
    if (C && C.speak) { try { C.speak(txt); return; } catch (e) {} }
    if (!txt) return;
    if (root.BAIN_AI && root.BAIN_AI.active()) return;
    var A = APP(); if (!A) return;
    try { A.sayNative(txt); } catch (e) {}
    try { A.announce(txt); } catch (e) {}
  }
  function status(txt) { var A = APP(); if (A && A.status) try { A.status(txt); } catch (e) {} }
  // ask a yes/no or which-one question; returns true when a live conversation
  // took the question, false when there is no conversation module to ask with
  function ask(question, onAnswer) {
    var C = CONVO();
    if (C && C.ask) { try { C.ask(question, onAnswer); return true; } catch (e) { return false; } }
    return false;
  }
  function isYes(answer) {
    var a = String(answer == null ? '' : answer).toLowerCase().trim();
    if (!a) return false;
    if (/^(yes|yeah|yep|yup|sure|ok|okay|please|go ahead|do it|find it|reorder it)\b/.test(a)) return true;
    if (/^(no|nope|not now|stop|cancel|never mind|don'?t)\b/.test(a)) return false;
    return a.indexOf('yes') >= 0 && a.indexOf('no') < 0;
  }
  // "the cheaper one" / "the second one" / "2" / "the decaf" — first the
  // conversation module's resolver, then plain words and numbers
  function resolveAnswer(answer, list) {
    if (!list || !list.length) return null;
    var C = CONVO();
    if (C && C.resolveReference) {
      try { var r = C.resolveReference(answer, list); if (r) return (r && r.product) ? r.product : r; } catch (e) {}
    }
    var a = String(answer == null ? '' : answer).toLowerCase().trim();
    if (!a) return null;
    var ORD = { first: 0, second: 1, third: 2, fourth: 3, fifth: 4, '1st': 0, '2nd': 1, '3rd': 2, '4th': 3, '5th': 4 };
    var m = a.match(/\b(\d+)\b/);
    if (m) { var n = parseInt(m[1], 10); if (n >= 1 && n <= list.length) return list[n - 1]; }
    for (var k in ORD) if (a.indexOf(k) >= 0) return list[ORD[k]] || null;
    if (/\bcheaper\b|\bcheapest\b|\blowest\b/.test(a)) {
      var cheap = list.slice().sort(function (x, y) { return (x.price == null ? Infinity : x.price) - (y.price == null ? Infinity : y.price); });
      return cheap[0] || null;
    }
    if (/\bexpensive\b|\bmost expensive\b|\bpriciest\b|\bhighest\b/.test(a)) {
      var dear = list.slice().sort(function (x, y) { return (y.price == null ? -Infinity : y.price) - (x.price == null ? -Infinity : x.price); });
      return dear[0] || null;
    }
    if (/\bnewest\b|\blatest\b|\bmost recent\b/.test(a)) return list[0];
    if (/\boldest\b|\bearliest\b/.test(a)) return list[list.length - 1];
    var hit = matches(a).filter(function (e) { return list.indexOf(e) >= 0; });
    if (hit.length) return hit[0];
    var qw = words(a).filter(function (w) { return !STOP[w]; });
    for (var i = 0; i < list.length; i++) { var tw = words(nameOf(list[i]) + ' ' + (list[i].variant || '')); if (qw.some(function (w) { return tw.indexOf(w) >= 0; })) return list[i]; }
    return null;
  }
  function isReference(text) {
    var a = String(text || '').toLowerCase().trim();
    return /^(the\s+)?(cheaper|cheapest|more expensive|most expensive|first|second|third|fourth|fifth|newest|latest|oldest|last|other|that|this)\s+(one|item|coffee|thing)?$/.test(a) || /^\s*\d+\s*$/.test(a) || /^(the\s+)?(cheaper|cheapest)\s+one$/.test(a);
  }

  // ---- the reorder itself: confirm first, then the normal fresh-search flow ----
  // Reuses BAIN_HIST.reorder(index): the item becomes the current result and
  // the store is asked for TODAY's price and stock — the same check as Buy.
  // Nothing is bought and nothing is paid here; the store page opens the
  // normal way, and buying happens there, by the person, if they choose.
  function doReorder(e) {
    var H = HIST(), i = indexOfEntry(e);
    if (H && H.reorder && i >= 0) return H.reorder(i);
    var A = APP();
    if (A && A.searchRaw) {
      return A.searchRaw({ query: nameOf(e), stores: e.store ? [e.store] : [], fresh: true }).then(function (j) {
        if (!j || j.error || !j.products || !j.products.length) return { entry: e, index: i, checked: false, change: 'unknown', error: (j && j.error) || 'not_found' };
        if (A.S) { A.S.results = j.products; A.S.query = { query: nameOf(e), stores: e.store ? [e.store] : [] }; A.S.shown = 0; A.S.chosen = 0; A.S.spot = -1; A.S.details = {}; A.S.searchedAt = Date.now(); A.render(); }
        return { entry: e, index: i, checked: true, change: 'unknown', available: null };
      });
    }
    return Promise.resolve({ entry: e, index: i, checked: false, change: 'unknown', error: 'reorder_unavailable' });
  }
  // ask "Shall I find it again?" — on yes, run the fresh search; on no, stop
  function confirmAndReorder(e) {
    R.pending = e;
    var q = speakReorder(e);
    status(q);
    var asked = ask(q, function (answer) {
      R.pending = null;
      if (isYes(answer)) { runReorder(e); return; }
      var m = t('reorderStopped', { name: nameOf(e) });
      status(m); speak(m);
    });
    if (!asked) { speak(q); }   // no conversation module: spoken + the screen shows it; the coordinator wires the Yes/No tap
    return { item: e, asked: asked, question: q };
  }
  function runReorder(e) {
    if (R.busy) return Promise.resolve({ entry: e, error: 'busy' });
    R.busy = true;
    status(t('reorderSearching', { name: nameOf(e) }));
    return doReorder(e).then(function (r) {
      R.busy = false;
      var H = HIST(), m;
      if (r.error === 'not_found') m = t('reorderGone', { name: nameOf(e), store: e.store || '' });
      else if (r.error) m = t('reorderNoCheck', { name: nameOf(e) });
      else if (H && H.reorderSentence) { try { m = (nameOf(e) + ', ' + (e.store || '') + '. ') + H.reorderSentence(r); } catch (x) { m = t('reorderFound', { name: nameOf(e), store: e.store || '' }); } }
      else m = t('reorderFound', { name: nameOf(e), store: e.store || '' });
      status(m); speak(m);
      return r;
    });
  }

  // ---- typed (no voice call) commands ----
  // "reorder my coffee", "buy my toothpaste again", "order the same milk again",
  // "what did I buy before?", "reorder the cheaper one" (after a list was read)
  var LIST_WORDS = ['what did i buy', 'what have i bought', 'what did i order', 'what have i ordered', 'show my purchases', 'my past purchases', 'my purchase history', 'what did i buy before', 'what did i buy last time', 'my recent purchases', 'list my purchases'];
  function stripReorderWords(text) {
    return text.replace(/\b(reorder|re-order|order again|buy again|buy it again|get it again|same as before|same as last time|the same|my usual|my|again|please)\b/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function isReorderCommand(text) {
    var a = String(text || '').toLowerCase().trim();
    if (!a) return false;
    if (LIST_WORDS.some(function (w) { return a.indexOf(w) >= 0; })) return true;
    return /\breorder\b|\border again\b|\bbuy .* again\b|\bget .* again\b|\bsame as (before|last time)\b|\bmy usual\b/.test(a);
  }
  function command(raw) {
    var text = String(raw || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (!text || !isReorderCommand(text)) return null;
    if (!hist().length) {
      // a named request gets the named answer ("I don't see a coffee…");
      // only a bare list question gets the generic "nothing bought yet"
      var n0 = LIST_WORDS.some(function (w) { return text.indexOf(w) >= 0; }) ? t('reorderNone') : noHistorySentence(stripReorderWords(text));
      status(n0); speak(n0); return 'none';
    }
    // "what did I buy before?" — read the list, remember it for "the cheaper one"
    if (LIST_WORDS.some(function (w) { return text.indexOf(w) >= 0; })) {
      var list = reorderCandidates().slice(0, 5);
      R.lastList = list;
      var s = listSentence(5);
      status(s); speak(s);
      return 'list';
    }
    // "reorder the cheaper one" / "the second one" — a reference to the list just read
    var rest = stripReorderWords(text);
    if (R.lastList.length && (!rest || isReference(rest) || isReference(text))) {
      var ref = resolveAnswer(rest || text, R.lastList);
      if (ref) return confirmAndReorder(ref) && 'ask';
      var m0 = t('reorderWhichUnclear');
      status(m0); speak(m0);
      return 'ask';
    }
    var query = rest || text;
    var found = matches(query);
    if (!found.length) {
      var m1 = noHistorySentence(query);
      status(m1); speak(m1);
      return 'none';
    }
    if (found.length === 1) {
      confirmAndReorder(found[0]);
      return 'ask';
    }
    // several past coffees — ask which one, then confirm the one they pick
    var many = found.slice(0, 5);
    R.lastList = many;
    var q = disambiguationQuestion(query, many);
    status(q);
    var asked = ask(q, function (answer) {
      var pick = resolveAnswer(answer, many);
      if (pick) { confirmAndReorder(pick); return; }
      var m2 = t('reorderWhichUnclear');
      status(m2); speak(m2);
    });
    if (!asked) speak(q);
    return 'ask';
  }

  function init() { /* no panel of its own: it speaks through the Buy again list */ }
  root.BAIN_REORDER = {
    lastBought: lastBought, matches: matches, reorderCandidates: reorderCandidates,
    speakReorder: speakReorder, describe: describe, disambiguationQuestion: disambiguationQuestion,
    listSentence: listSentence, noHistorySentence: noHistorySentence,
    resolveAnswer: resolveAnswer, isReference: isReference, isYes: isYes,
    confirmAndReorder: confirmAndReorder, runReorder: runReorder, doReorder: doReorder,
    isReorderCommand: isReorderCommand, command: command,
    _state: function () { return R; }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.BAIN_REORDER;
  if (root.document) { if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', init); else init(); }
})(typeof window !== 'undefined' ? window : globalThis);
