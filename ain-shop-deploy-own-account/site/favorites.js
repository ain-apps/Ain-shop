/* AIN Shop — favorite stores (TEST COPY ONLY, v32).
   "Check my favorite stores first" (Nati, Nov 17 2026): the person
   names the stores they like best by voice, the phone remembers them,
   and every search checks those stores first.
   How it works:
     1. REMEMBER (by voice): "my favorite stores are Walmart and
        Target", "add Target to my favorites", "check Target first".
     2. KEPT ON THIS PHONE ONLY (localStorage "ain.favorites"): no
        server copy, no account, nothing leaves the phone. At most
        10 favorites.
     3. CHECK FIRST: orderedStores(allStores) puts the favorites
        first, in the order the person named them, then the rest in
        their original order. app.js passes that ordered list as the
        `stores` param of /api/shop/search, which _worker.js already
        accepts (cleanQuery clips it to 8 stores).
   Voice, like a person: every action is described in a full spoken
   sentence ("Target is now one of your favorites. I'll check it
   first from now on."); when something is unclear the app asks a
   follow-up question instead of failing silently ("Which stores do
   you want as favorites?"); nothing is removed without a yes first
   ("Remove Walmart from your favorites?").
   Conversation: speaks through window.BAIN_CONVO (site/conversation.js)
   when it exists — C.speak(text) to talk, C.askConfirm(question,
   onYes, onNo) to confirm — and falls back to plain spoken text
   (BAIN_APP.sayNative + announce + status) when it does not. If
   BAIN_CONVO has no askConfirm, a removal waits for a spoken
   "yes" / "no" instead: the pending removal lives only in memory,
   never on disk, until the person answers.
   Store names are matched case-insensitively and normalized to the
   ~30 known stores in _worker.js STORE_NAMES where possible
   ("walmart" -> "Walmart", "best buy" -> "Best Buy", "home depot" ->
   "The Home Depot"). A store the app does not know yet is still kept,
   spelled as the person said it, so a new favorite is never lost. */
(function (root) {
  'use strict';
  var KEY = 'ain.favorites';
  var MAX = 10;

  // The ~30 known stores (site/_worker.js STORE_NAMES, same spellings).
  var KNOWN = ['Walmart', 'Target', 'Amazon', 'Best Buy', 'IKEA', 'Wayfair',
    'The Home Depot', "Lowe's", 'Costco', "Macy's", "Kohl's", 'eBay', 'Etsy',
    "Sam's Club", 'Overstock', 'CVS', 'Walgreens', 'Gardner White',
    "Bob's Discount Furniture", 'Rooms To Go', 'Ashley', 'Meijer', 'Kroger',
    'Apple', 'Nike', 'Allbirds', 'Zappos', 'Chewy', 'Staples',
    'Dollar General', 'Dollar Tree'];

  function convo() { return root.BAIN_CONVO || null; }
  function app() { return root.BAIN_APP || null; }
  function ls() { try { return root.localStorage || null; } catch (e) { return null; } }

  // "walmart.com" / "BEST BUY" / "the home depot store" -> a lookup key.
  function keyOf(s) {
    return String(s || '').toLowerCase().trim()
      .replace(/^https?:\/\//, '').replace(/^www\./, '')
      .replace(/\.(com|net|org|shop|store|co\.il|co\.uk|ca|de|fr|us|co)$/, '')
      .replace(/^the\s+/, '').replace(/\s+(store|shop|online|website|site)$/, '')
      .replace(/['’`]/g, '').replace(/[^a-z0-9]+/g, '');
  }
  var KNOWN_BY_KEY = {};
  KNOWN.forEach(function (n) { KNOWN_BY_KEY[keyOf(n)] = n; });
  // Extra spellings people say that keyOf alone would miss.
  var ALIAS = { bestbuy: 'Best Buy', homedepot: 'The Home Depot', lowes: "Lowe's",
    macys: "Macy's", kohls: "Kohl's", samsclub: "Sam's Club", sams: "Sam's Club",
    bobs: "Bob's Discount Furniture", bobsdiscountfurniture: "Bob's Discount Furniture",
    roomstogo: 'Rooms To Go', gardnerwhite: 'Gardner White',
    dollargeneral: 'Dollar General', dollartree: 'Dollar Tree' };

  function clean(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, 40); }
  function titleCase(s) {
    return s.replace(/(^|[\s-])([a-z])/g, function (m, a, b) { return a + b.toUpperCase(); });
  }
  // "walmart" -> "Walmart"; "Aldi" (unknown) -> "Aldi", kept as said.
  function normalize(name) {
    var c = clean(name); if (!c) return '';
    var k = keyOf(c);
    if (KNOWN_BY_KEY[k]) return KNOWN_BY_KEY[k];
    if (ALIAS[k]) return ALIAS[k];
    return c === c.toLowerCase() ? titleCase(c) : c;
  }
  function sameName(a, b) { return keyOf(a) === keyOf(b) && keyOf(a) !== ''; }

  // ---------------- stored list (this phone only) ----------------
  function load() {
    var s = ls(); if (!s) return [];
    try {
      var a = JSON.parse(s.getItem(KEY) || '[]');
      if (!Array.isArray(a)) return [];
      var out = [];
      a.forEach(function (x) { var n = normalize(x); if (n && !out.some(function (y) { return sameName(y, n); })) out.push(n); });
      return out.slice(0, MAX);
    } catch (e) { return []; }
  }
  function saveAll(a) {
    var s = ls(); if (!s) return false;
    try { if (a.length) s.setItem(KEY, JSON.stringify(a.slice(0, MAX))); else s.removeItem(KEY); return true; }
    catch (e) { return false; }
  }
  function list() { return load(); }
  function isFavorite(name) { return list().some(function (n) { return sameName(n, name); }); }

  // ---------------- speaking ----------------
  function speak(text) {
    var C = convo();
    if (C && typeof C.speak === 'function') { try { C.speak(text); return; } catch (e) {} }
    var A = app();
    if (A) {
      try { if (A.status) A.status(text); } catch (e) {}
      try { if (A.announce) A.announce(text); } catch (e) {}
      try { if (A.sayNative) A.sayNative(text); } catch (e) {}
    }
  }
  function joinNames(names) {
    if (names.length === 1) return names[0];
    if (names.length === 2) return names[0] + ' and ' + names[1];
    return names.slice(0, -1).join(', ') + ', and ' + names[names.length - 1];
  }
  function listSentence() {
    var a = list();
    if (!a.length) return "You don't have any favorite stores saved yet.";
    return 'Your favorite stores are ' + joinNames(a) + '.';
  }

  // ---------------- the list ----------------
  // Adds one store; a store already there stays where it is (no duplicate).
  // Returns { added, name } or null when nothing was named.
  function add(name) {
    var n = normalize(name); if (!n) return null;
    var a = list();
    if (a.some(function (x) { return sameName(x, n); })) {
      speak(n + ' is already one of your favorites. I check it first already.');
      return { added: false, name: n };
    }
    if (a.length >= MAX) {
      speak('You already have ' + MAX + ' favorite stores, so I did not add ' + n + '. Say "remove a store from my favorites" first if you want to swap one.');
      return { added: false, name: n, full: true };
    }
    a.push(n); saveAll(a);
    speak(n + ' is now one of your favorites. I will check it first from now on.');
    return { added: true, name: n };
  }
  // Replaces the whole list with the stores named, in the order named.
  function setFavorites(names) {
    var out = [];
    (names || []).forEach(function (x) { var n = normalize(x); if (n && !out.some(function (y) { return sameName(y, n); })) out.push(n); });
    out = out.slice(0, MAX); saveAll(out);
    if (!out.length) { speak("I didn't catch any store names. Which stores do you want as favorites?"); return out; }
    speak('Got it. Your favorite stores are ' + joinNames(out) + '. I will check those first from now on.');
    return out;
  }
  // Removes one store, no questions asked — callers that talk to the
  // person must confirm first (see removeAsk). Returns the removed
  // name, or null when it was not a favorite.
  function remove(name) {
    var n = normalize(name); if (!n) return null;
    var a = list(), i = -1;
    for (var k = 0; k < a.length; k++) if (sameName(a[k], n)) { i = k; break; }
    if (i < 0) { speak(n + " isn't one of your favorites, so there is nothing to remove."); return null; }
    var gone = a.splice(i, 1)[0]; saveAll(a);
    speak(gone + ' is no longer one of your favorites.');
    return gone;
  }
  function clear() { saveAll([]); return true; }

  // "Check Target first": Target becomes a favorite and moves to the
  // front, so it is the very first store checked. Returns the name.
  function checkFirst(name) {
    var n = normalize(name); if (!n) return null;
    var a = list().filter(function (x) { return !sameName(x, n); });
    a.unshift(n); saveAll(a.slice(0, MAX));
    speak("I'll check " + n + ' first from now on.');
    return n;
  }

  // Favorites first (in the order the person named them), then the
  // rest in their original order. allStores may be display names
  // ("Walmart"), domains ("walmart.com"), or objects with a name /
  // store field; each entry comes back in the shape it arrived in.
  // A favorite missing from allStores still comes first, by name.
  function orderedStores(allStores) {
    var favs = list(), rest = [], seen = {};
    function storeName(x) { return x && typeof x === 'object' ? (x.name || x.store || '') : String(x || ''); }
    (allStores || []).forEach(function (x) {
      var nm = storeName(x);
      if (favs.some(function (f) { return sameName(f, nm); })) seen[keyOf(nm)] = x;
      else rest.push(x);
    });
    var first = favs.map(function (f) {
      // Prefer the entry as the caller spelled it ("walmart.com" stays
      // "walmart.com"); fall back to the favorite's own display name.
      for (var k in seen) if (sameName(f, storeName(seen[k]))) return seen[k];
      return f;
    });
    return first.concat(rest);
  }
  // The ordered favorite names, ready for the `stores` param of
  // /api/shop/search — _worker.js cleanQuery already accepts it.
  function storesForSearch() { return list(); }

  // ---------------- confirming a removal ----------------
  // The removal waits for a yes. When BAIN_CONVO.askConfirm exists it
  // asks there; otherwise the question is spoken and a spoken "yes" /
  // "no" afterwards answers it (pending lives only in memory).
  var pendingRemove = null;
  function removeAsk(name) {
    var n = normalize(name); if (!n) return null;
    if (!isFavorite(n)) { speak(n + " isn't one of your favorites, so there is nothing to remove."); return 'none'; }
    var q = 'Remove ' + n + ' from your favorites?';
    var C = convo();
    if (C && typeof C.askConfirm === 'function') {
      try {
        var r = C.askConfirm(q, function () { remove(n); }, function () { speak('Okay, ' + n + ' stays one of your favorites.'); });
        if (r && typeof r.then === 'function') {
          r.then(function (ok) { if (ok) remove(n); else speak('Okay, ' + n + ' stays one of your favorites.'); });
        }
      } catch (e) { speak(q); pendingRemove = n; }
      return 'ask';
    }
    speak(q);
    pendingRemove = n;
    return 'ask';
  }
  // Answers a pending removal question: "yes" removes, "no" keeps.
  function answerPending(text) {
    if (!pendingRemove) return null;
    var t = String(text || '').toLowerCase().trim();
    if (/^(yes|yeah|yep|yes please|sure|ok|okay)$/.test(t)) {
      var n = pendingRemove; pendingRemove = null; remove(n); return 'removed';
    }
    if (/^(no|nope|not|no thanks|cancel|never mind|nevermind)$/.test(t)) {
      var k = pendingRemove; pendingRemove = null;
      speak('Okay, ' + k + ' stays one of your favorites.');
      return 'kept';
    }
    return 'ask'; // anything else: the question still stands
  }

  // ---------------- voice / typed commands ----------------
  // Splits "Walmart and Target", "Walmart, Target", "Walmart & Target".
  function parseNames(text) {
    return String(text || '').split(/,|\band\b|&|\+/i)
      .map(function (x) { return x.replace(/^(my favorite stores? (are|is)|favorite stores? (are|is)|the|please)\s+/i, '').trim(); })
      .map(function (x) { return x.replace(/\s+(is|are)\s+my favorites?$/i, '').trim(); })
      .filter(function (x) { return x.length > 0 && x.length <= 40; });
  }
  // Strips the command words, leaving just the store name(s).
  function stripCmd(text, phrases) {
    var t = ' ' + String(text || '').toLowerCase().trim() + ' ';
    phrases.forEach(function (p) { t = t.split(' ' + p + ' ').join(' '); t = t.split(' ' + p).join(' '); t = t.split(p + ' ').join(' '); });
    return t.replace(/\s+/g, ' ').trim();
  }
  // Returns 'add' | 'remove' | 'ask' | 'list' | 'set' | 'check' |
  // 'removed' | 'kept' | 'none' | null (not a favorites command).
  function command(raw) {
    var text = String(raw || '').toLowerCase().trim(); if (!text) return null;
    if (pendingRemove) {
      var ans = answerPending(text);
      if (ans) return ans;
    }
    var fav = text.indexOf('favor') >= 0 || text.indexOf('favourite') >= 0;
    // "what are my favorite stores?" / "list my favorites"
    if (fav && /^(what|which|show|list|tell|read|say|name|remind).{0,40}(favorite|favourite)/.test(text)) {
      if (!list().length) { speak("You don't have any favorite stores saved yet. Which stores do you want as favorites?"); return 'ask'; }
      speak(listSentence() + " I'll check those first when I search.");
      return 'list';
    }
    // "check my favorite stores" — needs favorites first, else ask.
    if (fav && /check|search|look/.test(text) && !/remove|add|set|first/.test(text)) {
      if (!list().length) { speak("You don't have any favorite stores saved yet. Which stores do you want as favorites?"); return 'ask'; }
      speak("I'll check " + joinNames(list()) + ' first.');
      return 'check';
    }
    // "remove Walmart from my favorites" — always asks first.
    if (/remove|delete|take .* (off|out)|forget/.test(text) && fav) {
      var rn = stripCmd(text, ['remove', 'delete', 'from my favorites', 'from my favourites', 'from favorites', 'from favourites', 'my favorites', 'my favourites', 'favorites', 'favourites', 'please']);
      var names = parseNames(rn);
      if (!names.length) { speak('Which store should I remove from your favorites?'); return 'ask'; }
      removeAsk(names[0]);
      return 'ask';
    }
    // "add Target to my favorites" / "make Target a favorite"
    if (fav && (/^add\b|add .* to|make .* (a )?favorite|save .* as/.test(text))) {
      var an = stripCmd(text, ['add', 'to my favorites', 'to my favourites', 'to favorites', 'to favourites', 'my favorites', 'my favourites', 'as a favorite', 'as a favourite', 'make', 'a favorite', 'a favourite', 'save', 'please']);
      var adds = parseNames(an);
      if (!adds.length) { speak('Which store should I add to your favorites?'); return 'ask'; }
      adds.forEach(function (x) { add(x); });
      return 'add';
    }
    // "my favorite stores are Walmart and Target"
    if (fav && /(my favorite|my favourite|favorite stores? are|favourite stores? are)/.test(text)) {
      var sn = stripCmd(text, ['my favorite stores are', 'my favourite stores are', 'my favorite stores is', 'favorite stores are', 'favourite stores are', 'my favorites are', 'my favourites are', 'my favorites', 'my favourites', 'please']);
      var sets = parseNames(sn);
      if (!sets.length) { speak('Which stores do you want as favorites?'); return 'ask'; }
      setFavorites(sets);
      return 'set';
    }
    // "check Target first" / "search Walmart first"
    var m = /^(check|search|look at|try)\s+(.+?)\s+first\b/.exec(text);
    if (m) { var n = normalize(m[2]); if (n) { checkFirst(n); return 'check'; } }
    if (fav && /first/.test(text)) {
      var fn = stripCmd(text, ['check', 'search', 'first', 'my favorites', 'my favourites', 'favorites', 'favourites', 'please']);
      var fs = parseNames(fn);
      if (fs.length) { checkFirst(fs[0]); return 'check'; }
    }
    return null;
  }

  function forAI() {
    var a = list();
    return a.length ? 'Favorite stores (check first, in this order): ' + a.join(', ') + '.' : 'No favorite stores saved yet.';
  }

  root.BAIN_FAVORITES = { KEY: KEY, KNOWN_STORES: KNOWN.slice(), MAX: MAX,
    list: list, add: add, remove: remove, removeAsk: removeAsk, setFavorites: setFavorites,
    clear: clear, isFavorite: isFavorite, checkFirst: checkFirst,
    normalize: normalize, sameName: sameName, orderedStores: orderedStores,
    storesForSearch: storesForSearch, listSentence: listSentence,
    command: command, answerPending: answerPending, forAI: forAI,
    _pendingRemove: function () { return pendingRemove; } };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.BAIN_FAVORITES;
})(typeof window !== 'undefined' ? window : globalThis);
