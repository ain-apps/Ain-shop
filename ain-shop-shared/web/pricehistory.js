/* AIN Shop — price history (v36).
   "Was this cheaper before?" — only from prices this phone has actually seen: search results (recorded as they
   arrive) and the watchlist's first/last prices. Never a guessed past price, never a made-up one. When the app has
   never seen the item, it says so plainly. Stored on this phone only (localStorage), wiped by "delete my data".
   window.BAIN_PRICEHIST */
(function (root) {
  'use strict';
  var KEY = 'ainshop.pricehist.v1', MAX = 300;
  function norm(s) { try { return String(s == null ? '' : s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim(); } catch (e) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim(); } }
  function key(title, store) { var t = norm(title), s = norm(store); return t ? (s ? t + ' @ ' + s : t) : null; }
  function load() { try { var o = JSON.parse(localStorage.getItem(KEY) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }
  function save(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} }
  function record(title, store, price, url) {
    if (typeof price !== 'number' || !isFinite(price) || price <= 0) return null;
    var k = key(title, store); if (!k) return null;
    var all = load(), now = Date.now();
    var e = all[k] || { title: String(title).slice(0, 160), store: String(store || '').slice(0, 60), lowest: price, lowest_at: now, highest: price, highest_at: now, last: price, last_at: now, seen: 0 };
    if (price < e.lowest) { e.lowest = price; e.lowest_at = now; }
    if (price > e.highest) { e.highest = price; e.highest_at = now; }
    e.last = price; e.last_at = now; e.seen = (e.seen || 0) + 1;
    if (url) e.url = String(url).slice(0, 400);
    all[k] = e;
    var ks = Object.keys(all);
    if (ks.length > MAX) { ks.sort(function (a, b) { return (all[a].last_at || 0) - (all[b].last_at || 0); }); ks.slice(0, ks.length - MAX).forEach(function (x) { delete all[x]; }); }
    save(all); return e;
  }
  function recordMany(items) { (Array.isArray(items) ? items : []).forEach(function (p) { if (p && p.title) record(p.title, p.store, p.price, p.url); }); }
  // fold the watchlist's prices in (read-only): a watched item's first and last prices are prices this phone has seen
  function withWatch(e, title, store) {
    if (!e) return null;
    try {
      var W = root.BAIN_WATCH; if (!W || !W.all) return e;
      var t = norm(title);
      W.all().forEach(function (w) {
        if (!w || norm(w.name || w.title) !== t) return;
        if (store && w.store && norm(w.store) !== norm(store)) return;
        [['first_price', w.first_seen || w.added], ['last_price', w.last_seen || w.checked]].forEach(function (pair) {
          var p = w[pair[0]]; if (typeof p !== 'number' || !isFinite(p) || p <= 0) return;
          if (p < e.lowest) { e.lowest = p; }
          if (p > e.highest) { e.highest = p; }
        });
      });
    } catch (err) {}
    return e;
  }
  function history(title, store) {
    var k = key(title, store); if (!k) return null;
    var e = load()[k] || null;
    return withWatch(e ? Object.assign({}, e) : null, title, store);
  }
  // the spoken answer for "was this cheaper before?" — pure given an entry and the current price
  function verdict(e, current) {
    if (!e) return { seen: false, text: 'I have never seen a price for this one on this phone, so I cannot tell you whether it was cheaper before.' };
    var when = function (ms) { try { return new Date(ms).toLocaleDateString(); } catch (err) { return ''; } };
    if (typeof current === 'number' && isFinite(current) && current > 0) {
      if (current <= e.lowest) return { seen: true, best: true, text: 'This is the lowest price I have seen for it — $' + current.toFixed(2) + (e.seen > 1 ? ', seen ' + e.seen + ' times.' : '.') };
      return { seen: true, best: false, text: 'It was cheaper before — the lowest I have seen is $' + e.lowest.toFixed(2) + ' on ' + when(e.lowest_at) + ', and it is $' + current.toFixed(2) + ' now.' };
    }
    return { seen: true, best: false, text: 'The lowest price I have seen for it is $' + e.lowest.toFixed(2) + ' on ' + when(e.lowest_at) + ', and the highest is $' + e.highest.toFixed(2) + '.' };
  }
  function forAI() { return 'Price history: "was this cheaper before?" — only from prices this phone has actually seen (searches and the watchlist); say plainly when the item has never been seen.'; }
  root.BAIN_PRICEHIST = { record: record, recordMany: recordMany, history: history, verdict: verdict, key: key, norm: norm, forAI: forAI };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.BAIN_PRICEHIST;
})(typeof window !== 'undefined' ? window : globalThis);
