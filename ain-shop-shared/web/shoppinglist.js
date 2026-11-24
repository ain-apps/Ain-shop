/* AIN Shop — voice shopping list (TEST COPY ONLY).
   "Add milk to my shopping list" — the phone keeps the list, reads it
   back in full sentences, and can watch just those items for deals.
   - Kept on THIS PHONE ONLY (localStorage "ain.shoppinglist"): no
     server copy, no account, nothing leaves the phone.
   - Voice first: it talks, describes, asks questions, everything by
     speech. It asks "How many?" when the quantity is unclear, and it
     always confirms before removing an item or clearing the list.
   - Conversation context lives in the shared module window.BAIN_CONVO
     (site/conversation.js, built in parallel — it may not exist yet):
     this module only ever calls C.speak(text) and C.ask(question, fn),
     and only after checking they exist. With no BAIN_CONVO it falls
     back to plain spoken text through BAIN_APP (sayNative/announce)
     or, if even that is absent, to returning the spoken line.
   - Deal-watching is NOT built here: watchAll() hands each item to
     the watchlist module (window.BAIN_WATCHLIST.addWatch, or the
     watchlist already in this test copy, BAIN_WATCH.addByQuery).
     If neither exists yet, the request is queued on the phone
     (localStorage "ain.shoppinglist.watchQueued") and watchAll()
     says so — no second watchlist is ever built here.
   - Every watch check must run a fresh live search — never serve a
     cached result as fresh. That rule lives in the watchlist module
     (it refuses cached answers); this module only hands it items. */
(function (root) {
  'use strict';
  var KEY = 'ain.shoppinglist';
  var QUEUE_KEY = 'ain.shoppinglist.watchQueued';
  var MAX = 50;
  var MAX_NAME = 120;

  function C() { return root.BAIN_CONVO || null; }
  function APP() { return root.BAIN_APP; }

  // ---- spoken text: BAIN_CONVO first, BAIN_APP's voice second ----
  function speak(text) {
    if (!text) return '';
    var c = C();
    if (c && typeof c.speak === 'function') { try { c.speak(text); } catch (e) {} return text; }
    var A = APP();
    if (A) {
      try { if (A.status) A.status(text); } catch (e) {}
      try { if (A.announce) A.announce(text); } catch (e) {}
      try { if (A.sayNative) A.sayNative(text); } catch (e) {}
      return text;
    }
    return text;
  }
  // Ask a question and run fn(answer) with what the person says.
  // Returns true when somebody asked, false when no asker exists.
  function ask(q, fn) {
    var c = C();
    if (c && typeof c.ask === 'function') { try { c.ask(q, fn); } catch (e) { return false; } return true; }
    var V = root.AIN_VCMD;
    if (V && typeof V.ask === 'function') { try { V.ask(q, fn, 'typed'); } catch (e) { return false; } return true; }
    return false;
  }

  // ---- storage ----
  function ls() { try { return root.localStorage || null; } catch (e) { return null; } }
  function load() {
    var s = ls(); if (!s) return [];
    try { var a = JSON.parse(s.getItem(KEY) || '[]'); return Array.isArray(a) ? a.filter(function (x) { return x && x.name; }) : []; }
    catch (e) { return []; }
  }
  function saveAll(a) {
    var s = ls(); if (!s) return false;
    try { if (a.length) s.setItem(KEY, JSON.stringify(a.slice(0, MAX))); else s.removeItem(KEY); return true; }
    catch (e) { return false; }
  }

  // ---- names: "  2   Milks " -> "milks"; "milks" and "milk" are the same item ----
  function clean(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, MAX_NAME); }
  function keyOf(name) {
    return clean(name).toLowerCase()
      .replace(/^(a|an|the|some)\s+/, '')
      .replace(/\s+/g, ' ')
      .split(' ').map(function (w) { return (w.length > 3 && w.slice(-1) === 's' && w.slice(-2) !== 'ss') ? w.slice(0, -1) : w; }).join(' ');
  }
  function findIndex(a, name) {
    var k = keyOf(name);
    for (var i = 0; i < a.length; i++) if (keyOf(a[i].name) === k) return i;
    return -1;
  }

  // ---- quantities: "2", "two", "a dozen", "dozen" ----
  var WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
    a: 1, an: 1 };
  function qtyOf(s) {
    if (s == null) return null;
    if (typeof s === 'number' && isFinite(s) && s > 0) return Math.floor(s);
    var t = String(s).toLowerCase().trim();
    if (/^\d+$/.test(t)) { var n = parseInt(t, 10); return n > 0 ? n : null; }
    if (WORDS[t] != null) return WORDS[t];
    if (/^(a\s+)?dozen$/.test(t)) return 12;
    var m = /^(\d+)\s+dozen$/.exec(t); if (m) return parseInt(m[1], 10) * 12;
    return null;
  }
  // "2 milks" / "two milks" / "a dozen eggs" / "milk" -> { qty, name }
  function parseQuantity(text) {
    var t = clean(text); if (!t) return { qty: null, name: '' };
    var d = /^(a\s+)?dozen\s+(.+)$/i.exec(t);
    if (d) return { qty: 12, name: clean(d[2]) };
    var d2 = /^(\d+)\s+dozen\s+(.+)$/i.exec(t);
    if (d2) return { qty: parseInt(d2[1], 10) * 12, name: clean(d2[2]) };
    var m = /^(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|a|an)\s+(.+)$/i.exec(t);
    if (m) { var q = qtyOf(m[1]); if (q != null) return { qty: q, name: clean(m[2]) }; }
    return { qty: null, name: t };
  }

  // ---- conversation memory (this module's own; BAIN_CONVO holds the rest) ----
  var lastMentioned = '';   // so "remove it" means the last item talked about
  var pendingQty = null;    // { name } while "How many?" is unanswered

  // ---- the list ----
  // qty omitted (null/undefined) and a conversation module exists: ask "How many?"
  // and add when the person answers. Returns the item, or { pending: true }.
  function add(item, qty) {
    var name = clean(item); if (!name) return null;
    var q = qtyOf(qty);
    if (q == null && qty != null) q = null; // unparseable qty counts as "unclear"
    if (q == null && qty == null) {
      // No quantity given at all: ask, if anyone can ask — otherwise add one.
      var asked = ask('How many ' + name + ' should I add to your shopping list?', function (answer) {
        var heard = qtyOf(String(answer || '').trim().toLowerCase().replace(/^(just\s+|only\s+)/, ''));
        if (heard == null) { speak("I didn't catch a number, so I'll add one " + name + '.'); heard = 1; }
        pendingQty = null;
        var done = addNow(name, heard);
        speak(addedLine(done));
      });
      if (asked) { pendingQty = { name: name }; return { pending: true, name: name }; }
      q = 1;
    }
    if (q == null) q = 1;
    var it = addNow(name, q);
    speak(addedLine(it));
    return it;
  }
  function addNow(name, q) {
    var a = load(), i = findIndex(a, name), now = Date.now();
    if (i >= 0) { a[i].qty = (a[i].qty || 1) + q; a[i].addedAt = a[i].addedAt || now; }
    else a.push({ name: name, qty: q, addedAt: now });
    saveAll(a);
    lastMentioned = name;
    return a[findIndex(a, name)];
  }
  function addedLine(it) {
    return it ? 'Added ' + it.qty + ' ' + it.name + ' to your shopping list.' : '';
  }
  // Direct removal (the Yes/No box calls this after the person says yes).
  // Returns the removed item, or null when it was not on the list.
  function remove(item) {
    var name = clean(item); if (!name) return null;
    if (/^(it|that|that one)$/i.test(name) && lastMentioned) name = lastMentioned;
    var a = load(), i = findIndex(a, name); if (i < 0) return null;
    var x = a.splice(i, 1)[0]; saveAll(a);
    if (lastMentioned && keyOf(lastMentioned) === keyOf(name)) lastMentioned = '';
    return x;
  }
  function list() { return load(); }
  function count() { return load().length; }
  function clear() { saveAll([]); lastMentioned = ''; return true; }

  // ---- what the person hears ----
  function listSentence() {
    var a = load();
    if (!a.length) return 'Your shopping list is empty.';
    return 'Your list has ' + a.length + (a.length === 1 ? ' item: ' : ' items: ') +
      a.map(function (x) { return x.name + ', ' + (x.qty || 1); }).join('; ') + '.';
  }

  // ---- conversational remove / clear: always confirm first ----
  // Returns 'ask' while waiting for the answer, the removed item when
  // there was nobody to ask and the person still needs the list changed
  // (never happens — with no asker nothing is removed), or null.
  function requestRemove(item) {
    var name = clean(item);
    if (!name) { speak('What should I remove from your shopping list?'); return 'ask'; }
    if (/^(it|that|that one)$/i.test(name) && lastMentioned) name = lastMentioned;
    var a = load(), i = findIndex(a, name);
    if (i < 0) { speak(name + ' is not on your shopping list.'); return null; }
    var shown = a[i].name;
    var asked = ask('Remove ' + shown + ' from your shopping list?', function (answer) {
      var yes = /^(yes|yeah|yep|sure|ok|okay|please|remove it)/i.test(String(answer || '').trim());
      if (yes) { var x = remove(shown); speak(x ? 'Removed ' + x.name + ' from your shopping list.' : ''); }
      else speak('Okay, I left ' + shown + ' on your shopping list.');
    });
    if (!asked) { speak("I couldn't ask you to confirm, so I left " + shown + ' on your shopping list.'); return null; }
    return 'ask';
  }
  function requestClear() {
    if (!load().length) { speak('Your shopping list is already empty.'); return null; }
    var asked = ask('Are you sure you want to clear your whole shopping list?', function (answer) {
      var yes = /^(yes|yeah|yep|sure|ok|okay|please|clear it)/i.test(String(answer || '').trim());
      if (yes) { clear(); speak('Your shopping list is cleared.'); }
      else speak('Okay, I kept your shopping list as it is.');
    });
    if (!asked) { speak("I couldn't ask you to confirm, so I kept your shopping list as it is."); return null; }
    return 'ask';
  }

  // ---- deal-watching handoff (this module watches nothing itself) ----
  // Shape the watchlist module can consume: its addByQuery takes a query
  // string, so each item is handed over by name.
  function watchListItems() {
    return load().map(function (x) { return { query: x.name, title: x.name, name: x.name, qty: x.qty || 1 }; });
  }
  function pendingWatch() {
    var s = ls(); if (!s) return false;
    try { return s.getItem(QUEUE_KEY) === '1'; } catch (e) { return false; }
  }
  function setQueued(on) {
    var s = ls(); if (!s) return;
    try { if (on) s.setItem(QUEUE_KEY, '1'); else s.removeItem(QUEUE_KEY); } catch (e) {}
  }
  // Hand every list item to the watchlist module. Prefers the name the
  // task names (BAIN_WATCHLIST.addWatch); falls back to the watchlist
  // already in this test copy (BAIN_WATCH.addByQuery). If neither
  // exists, the request is queued on the phone and reported, not lost.
  function watchAll() {
    var items = watchListItems();
    if (!items.length) { speak('Your shopping list is empty, so there is nothing to watch for deals.'); return { watched: 0, queued: false }; }
    var W = root.BAIN_WATCHLIST, n = 0, via = null;
    if (W && typeof W.addWatch === 'function') {
      items.forEach(function (it) { try { W.addWatch(it); n++; } catch (e) {} });
      via = 'BAIN_WATCHLIST.addWatch';
    } else if (root.BAIN_WATCH && typeof root.BAIN_WATCH.addByQuery === 'function') {
      items.forEach(function (it) { try { root.BAIN_WATCH.addByQuery(it.query, null); n++; } catch (e) {} });
      via = 'BAIN_WATCH.addByQuery';
    }
    if (via) {
      setQueued(false);
      speak('I\'ll watch your shopping list for deals: ' + items.map(function (x) { return x.name; }).join(', ') + '. I\'ll tell you when a price drops.');
      return { watched: n, queued: false, via: via };
    }
    setQueued(true);
    speak('I noted that you want me to watch your shopping list for deals, but the deal watcher is not ready yet. I\'ll watch them as soon as it is.');
    return { watched: 0, queued: true, via: null };
  }
  // Retry a queued watch request once the watchlist module has loaded.
  function flushQueuedWatch() {
    if (!pendingWatch()) return { watched: 0, queued: false, via: null };
    return watchAll();
  }

  // ---- voice commands ----
  // "add 2 milks to my shopping list", "put bread on my shopping list",
  // "remove eggs from my shopping list", "remove it from my shopping list",
  // "what's on my shopping list?", "clear my shopping list",
  // "watch my shopping list for deals". Returns an action word or null
  // when the sentence is not a shopping-list command (it stays a search).
  function command(raw) {
    var text = String(raw || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (!text) return null;
    var m;
    m = /^(?:please\s+)?(?:add|put)\s+(.+?)\s+(?:to|on|onto)\s+(?:my\s+)?shopping\s+list\.?$/.exec(text);
    if (m) {
      var p = parseQuantity(m[1]);
      if (!p.name) { speak('What should I add to your shopping list?'); return 'ask'; }
      var r = add(p.name, p.qty);
      return r && r.pending ? 'ask' : 'add';
    }
    m = /^(?:please\s+)?remove\s+(.+?)\s+from\s+(?:my\s+)?shopping\s+list\.?$/.exec(text);
    if (m) { var rr = requestRemove(m[1]); return rr === 'ask' ? 'ask' : 'none'; }
    if (/^(?:please\s+)?(?:clear|empty)\s+(?:my\s+)?shopping\s+list\.?$/.test(text)) {
      return requestClear() === 'ask' ? 'ask' : 'none';
    }
    if (/(what'?s|what is)\s+on\s+(?:my\s+)?shopping\s+list|read\s+(?:my\s+)?shopping\s+list|show\s+(?:my\s+)?shopping\s+list|(?:my\s+)?shopping\s+list/.test(text)) {
      var s = listSentence();
      if (load().length) lastMentioned = load()[load().length - 1].name;
      speak(s);
      return 'list';
    }
    if (/watch\s+(?:my\s+)?shopping\s+list\s+for\s+deals|watch\s+for\s+deals\s+on\s+(?:my\s+)?shopping\s+list|watch\s+(?:my\s+)?shopping\s+list/.test(text)) {
      var w = watchAll();
      return w.queued ? 'watch-queued' : 'watch';
    }
    return null;
  }

  root.BAIN_SHOPLIST = { add: add, remove: remove, list: list, clear: clear, count: count,
    listSentence: listSentence, parseQuantity: parseQuantity, qtyOf: qtyOf,
    command: command, requestRemove: requestRemove, requestClear: requestClear,
    watchListItems: watchListItems, watchAll: watchAll, pendingWatch: pendingWatch, flushQueuedWatch: flushQueuedWatch,
    speak: speak, ask: ask };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.BAIN_SHOPLIST;
})(typeof window !== 'undefined' ? window : globalThis);
