/* AIN Shop — shared pure memory, phone side (v36).
   One shared memory entry per item lives in the app's own database (D1, behind /api/shop/memory): name, brand,
   barcode, what a photo showed, price and price history, where to buy it, which aisle/shelf it sits on, reviews
   summary, allergens/ingredients. The phone side does three things:
   (1) teaches in-store locations — aisle/shelf is user-taught only, never guessed; the teaching is saved on this
       phone first, and shared ONLY after the person says yes (memory_share posts with confirmed:true);
   (2) looks an item up — the phone's own taught aisle first, then the shared memory;
   (3) shares a taught barcode — the barcode the person taught on this phone, only after they say yes.
   PURE = item facts only: no sizes, no lists, no purchase history, no person's location, no names. The server
   enforces the whitelist — anything personal in a share is dropped, never stored.
   window.BAIN_MEMORY */
(function (root) {
  'use strict';
  var KEY = 'ainshop.aisles.v1';
  var LAST = null;   // the last thing taught (aisle or barcode) — so "share it" knows what to share; never leaves the phone by itself
  function setLastTaught(v) { LAST = v || null; }
  function lastTaught() { return LAST; }
  function norm(s) { try { return String(s == null ? '' : s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim(); } catch (e) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim(); } }
  function load() { try { var o = JSON.parse(localStorage.getItem(KEY) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }
  function save(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} }
  function aisleKey(name, store) { var n = norm(name), s = norm(store); return n ? (s ? n + '|' + s : n) : null; }
  // "the Heinz ketchup is on aisle 7 at Walmart" — saved on this phone; sharing is a separate yes (share())
  function teachAisle(name, store, aisle, shelf) {
    var k = aisleKey(name, store); if (!k) return null;
    var a = String(aisle == null ? '' : aisle).trim().slice(0, 40); if (!a) return null;
    var all = load();
    all[k] = { name: String(name).slice(0, 160), store: String(store || '').slice(0, 60), aisle: a, shelf: String(shelf || '').slice(0, 40) || null, taught_at: Date.now() };
    var ks = Object.keys(all); if (ks.length > 200) { ks.sort(function (x, y) { return (all[x].taught_at || 0) - (all[y].taught_at || 0); }); ks.slice(0, ks.length - 200).forEach(function (x) { delete all[x]; }); }
    save(all); setLastTaught({ what: 'aisle', entry: { name: all[k].name, store: all[k].store, aisle: all[k].aisle, shelf: all[k].shelf } }); return all[k];
  }
  function aisleLocal(name, store) { var k = aisleKey(name, store); return k ? (load()[k] || null) : null; }
  function post(path, body) {
    return fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return { error: 'bad_answer' }; }); })
      .catch(function () { return { error: 'offline' }; });
  }
  // look an item up: this phone's taught aisle first, then the shared memory (aisle + generic facts together)
  function lookup(name, store) {
    var local = aisleLocal(name, store);
    return post('/api/shop/memory', { name: name, store: store || null }).then(function (j) {
      if (j && j.error) return { found: !!local, local: local || null, error: j.error };
      var facts = (j && j.facts) || null, generic = (j && j.generic && j.generic.facts) || null;
      if (!local && !facts && !generic) return { found: false };
      return { found: true, local: local || null, facts: facts, generic: generic, taught: !!(j && j.taught), updated_at: (j && j.updated_at) || 0 };
    });
  }
  // share one taught fact — ONLY called after the person said yes; the server refuses anything unconfirmed
  function share(entry) {
    return post('/api/shop/memory/share', { confirmed: true, entry: entry || {} }).then(function (j) {
      if (!j || j.error) return { saved: false, error: (j && j.error) || 'share failed' };
      return { saved: !!j.saved, dropped: j.dropped || [] };
    });
  }
  // share the barcode the person taught on this phone (BAIN_BC.taught), after their yes — code defaults to the last barcode
  function shareBarcode(code) {
    var BC = root.BAIN_BC; if (!BC || !BC.taught) return Promise.resolve({ saved: false, error: 'barcode teaching is not available' });
    var c = String(code || '').replace(/\D/g, '');
    if (!c) { try { var l = BC.last ? BC.last() : null; c = l && l.code ? String(l.code).replace(/\D/g, '') : ''; } catch (err) {} }
    if (!c) return Promise.resolve({ saved: false, error: 'no barcode was taught on this phone' });
    var e = null; try { e = BC.taught(c); } catch (err) {}
    if (!e) return Promise.resolve({ saved: false, error: 'that barcode was not taught on this phone' });
    return share({ name: e.name, brand: e.brand || null, size: e.quantity || null, barcode: c });
  }
  // one spoken paragraph for a lookup result — every unknown is said plainly (pure given the result)
  function describe(r, name, store) {
    if (!r) return 'I could not look that up just now.';
    if (r.error) return 'I could not look that up just now.';
    if (!r.found) return 'Nobody has taught me where ' + (name || 'that item') + ' sits' + (store ? ' at ' + store : '') + ' yet.';
    var p = [];
    var aisleRaw = (r.local && r.local.aisle) || (r.facts && r.facts.aisle);
    var aisle = aisleRaw ? String(aisleRaw).replace(/^aisle\s+/i, '').trim() : null;   // "aisle 7" and "7" both read as "on aisle 7"
    var shelf = (r.local && r.local.shelf) || (r.facts && r.facts.shelf);
    if (aisle) p.push('It is on aisle ' + aisle + (shelf ? ', shelf ' + shelf : '') + (store ? ' at ' + store : '') + '.');
    else p.push('Nobody has taught me which aisle it is on' + (store ? ' at ' + store : '') + ' yet.');
    var g = r.generic || r.facts;
    if (g && g.price_cents) p.push('Last seen at ' + (g.store || store || 'a store') + ' for $' + (g.price_cents / 100).toFixed(2) + (g.price_seen_at ? ' on ' + new Date(g.price_seen_at).toLocaleDateString() : '') + '.');
    if (g && g.rating != null) p.push('Buyers rate it ' + g.rating + ' out of 5' + (g.reviews_count != null ? ' from ' + g.reviews_count + ' reviews' : '') + '.');
    if (r.taught) p.push('That aisle was taught by another shopper.');
    return p.join(' ');
  }
  // typed "where is the Heinz ketchup in Walmart?" / "which aisle is the ketchup at Walmart?"
  function command(raw) {
    var text = String(raw || '').toLowerCase().trim(); if (!text) return false;
    var m = text.match(/^(?:where is|which aisle(?: is)?|what aisle(?: is)?)\s+(.+?)\s+(?:in|at)\s+(.+)$/);
    if (!m) return false;
    var A = root.BAIN_APP; if (!A) return false;
    lookup(m[1].trim(), m[2].trim()).then(function (r) { var s = describe(r, m[1].trim(), m[2].trim()); A.status(s); A.announce(s); if (!(root.BAIN_AI && root.BAIN_AI.active())) A.sayNative(s); });
    return true;
  }
  function forAI() { return 'Shared memory: "where is the ketchup in Walmart?" — the aisle a shopper taught, the last price seen, the rating. Aisles are user-taught only; say plainly when nobody taught one. Sharing a taught fact needs the person’s yes first (memory_share).'; }
  root.BAIN_MEMORY = { teachAisle: teachAisle, aisleLocal: aisleLocal, lookup: lookup, share: share, shareBarcode: shareBarcode, describe: describe, command: command, norm: norm, setLastTaught: setLastTaught, lastTaught: lastTaught, forAI: forAI };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.BAIN_MEMORY;
})(typeof window !== 'undefined' ? window : globalThis);
