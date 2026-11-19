/* AIN Shop — several stores at once (v18, Nati Oct 27 2026: "do the same thing in the shop app, that people buy from different stores").
   Each store the person goes to keeps its own PLACE (last search, its results, the item they were on) and its own CART (the "my list"
   items from that store — checkout.js groups the list by store; checkout links are the list's own, untouched, so affiliate tracking
   stays as it was). "All stores" is the normal search across every store. Switch by voice (ai.js tools store_switch / store_back /
   stores_list / store_close / carts_read), by typing ("go to Walmart", "other store", "all my carts") and by big buttons.
   Everything lives only on this phone (localStorage "bain:stores"); nothing goes to our server. */
(function () {
  'use strict';
  var KEY = 'bain:stores', ALL = '*', MAX_PLACES = 8, MAX_RESULTS = 40;
  function APP() { return window.BAIN_APP; }
  function CO() { return window.BAIN_CO; }
  function t(k, v) { return APP().t(k, v); }
  function $(id) { return document.getElementById(id); }
  // spoken / typed store names in other alphabets → the store's own name (the AI passes Latin names; typing may not)
  var ALIAS = { 'וולמארט': 'walmart', 'וולמרט': 'walmart', 'וואלמארט': 'walmart', 'טרגט': 'target', 'טארגט': 'target', 'אמזון': 'amazon', 'קוסטקו': 'costco', 'בסט ביי': 'bestbuy', 'בסטביי': 'bestbuy', 'איקאה': 'ikea', 'איביי': 'ebay', 'וולגרינס': 'walgreens', 'סי וי אס': 'cvs', 'קרוגר': 'kroger', 'מייג\'ר': 'meijer', 'מייגר': 'meijer', 'הום דיפו': 'homedepot',
    'וואָלמאַרט': 'walmart', 'אַמאַזאָן': 'amazon', 'وولمارت': 'walmart', 'أمازون': 'amazon', 'امازون': 'amazon', 'тарґет': 'target', 'волмарт': 'walmart', 'уолмарт': 'walmart', 'амазон': 'amazon', 'таргет': 'target', 'コストコ': 'costco', 'ウォルマート': 'walmart', 'アマゾン': 'amazon', '沃尔玛': 'walmart', '亚马逊': 'amazon', '好市多': 'costco', '沃爾瑪': 'walmart', '亞馬遜': 'amazon', '월마트': 'walmart', '아마존': 'amazon', '코스트코': 'costco' };
  function norm(s) {
    s = String(s || '').toLowerCase().trim(); if (!s) return '';
    try { s = s.normalize('NFKD').replace(/[\u0300-\u036f]/g, ''); } catch (e) {}
    for (var a in ALIAS) if (s.indexOf(a) >= 0) return ALIAS[a];
    s = s.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '').replace(/\.(com|net|org|shop|store|co\.il|co\.uk|ca|de|fr|us|co)$/, '');
    s = s.replace(/['’`]s\b/g, 's').replace(/^the\s+/, '').replace(/\s+(store|shop|online|website|site)$/, '');
    return s.replace(/[^\p{L}\p{N}]+/gu, '');
  }
  function lev(a, b) { if (Math.abs(a.length - b.length) > 2) return 9; var d = [], i, j; for (i = 0; i <= a.length; i++) d[i] = [i]; for (j = 0; j <= b.length; j++) d[0][j] = j;
    for (i = 1; i <= a.length; i++) for (j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; }
  function same(a, b) { a = norm(a); b = norm(b); if (!a || !b) return false; if (a === b) return true; if (a.length >= 4 && b.length >= 4 && (a.indexOf(b) === 0 || b.indexOf(a) === 0)) return true; return a.length >= 5 && b.length >= 5 && lev(a, b) <= (Math.min(a.length, b.length) >= 8 ? 2 : 1); }

  // ---------------- state (this phone only) ----------------
  function load() { try { var s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && s.places && typeof s.places === 'object') { if (!Array.isArray(s.order)) s.order = Object.keys(s.places); return s; } } catch (e) {} return { active: ALL, prev: null, places: {}, order: [] }; }
  var ST = load();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(ST)); } catch (e) { /* full: drop the stored results, keep names */ try { for (var k in ST.places) ST.places[k].results = []; localStorage.setItem(KEY, JSON.stringify(ST)); } catch (x) {} } }
  function place(k) { return k === ALL ? (ST.places[ALL] || (ST.places[ALL] = { key: ALL, name: '' })) : ST.places[k]; }
  function stores() { return ST.order.filter(function (k) { return k !== ALL && ST.places[k]; }).map(function (k) { return ST.places[k]; }); }
  function active() { return ST.active && ST.active !== ALL && ST.places[ST.active] ? ST.places[ST.active] : null; }
  function label(p) { return p ? p.name : t('storeAll'); }
  function nice(name) {   // "target" → "Target", "best buy" → "Best Buy", "walmart.com" → "Walmart"; names written with capitals stay as written
    var n = String(name || '').trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/.*$/, '').replace(/\.(com|net|org|shop|store|co\.il|co\.uk|us)$/i, '').slice(0, 40);
    return n === n.toLowerCase() ? n.replace(/(^|[\s-])(\p{Ll})/gu, function (m, a, b) { return a + b.toUpperCase(); }) : n;
  }
  function find(name) {   // an open store by a name as said or typed
    if (!name) return null; var n = norm(name), best = null;
    stores().forEach(function (p) { if (!best && (p.key === n || same(p.name, name) || (p.site && same(p.site, name)))) best = p; });
    return best;
  }
  function trimResults(a) { return (a || []).slice(0, MAX_RESULTS).map(function (p) { var o = {}; for (var k in p) if (typeof p[k] !== 'string' || p[k].length < 600) o[k] = p[k]; return o; }); }
  function snapshot() {   // the screen's current list → the active place
    var S = APP().S, k = ST.active || ALL, p = place(k); if (!p) return;
    p.query = S.query || null; p.results = trimResults(S.results); p.shown = S.shown || 0; p.chosen = S.chosen; p.searchedAt = S.searchedAt || 0; p.storeMode = S.storeMode || null; p.at = Date.now();
    save();
  }
  function restore(p) {   // a place → the screen
    var S = APP().S; p = p || place(ALL);
    S.results = (p.results || []).slice(); S.query = p.query || null; S.shown = p.shown || 0; S.chosen = p.chosen == null ? -1 : p.chosen; S.spot = -1; S.searchedAt = p.searchedAt || 0; S.details = {}; S.pendingOpen = null;
    S.storeMode = p.key === ALL ? null : (p.storeMode || null);
    APP().render();
  }
  function ensure(name, extra) {   // the store's place, made when new
    var p = find(name) || (extra && extra.site && find(extra.site));
    if (!p) {
      var k = norm(name) || norm(extra && extra.site); if (!k) return null;
      if (ST.places[k]) p = ST.places[k];
      else {
        p = { key: k, name: nice(name), results: [], query: null, at: Date.now() }; ST.places[k] = p; ST.order.push(k);
        var open = stores(); if (open.length > MAX_PLACES) { var old = open.filter(function (x) { return x.key !== ST.active; }).sort(function (a, b) { return (a.at || 0) - (b.at || 0); })[0]; if (old) close(old.key, true); }
      }
    }
    if (extra && extra.site) p.site = extra.site;
    if (extra && extra.name && extra.name.length < 40) p.name = extra.name;
    return p;
  }
  function moveTo(k) { if (k === (ST.active || ALL)) return false; snapshot(); ST.prev = ST.active || ALL; ST.active = k; save(); restore(place(k)); render(); return true; }

  // ---------------- carts (from the list in checkout.js; one per store) ----------------
  function groups() { return CO() ? CO().groups() : []; }
  function cartFor(p) { if (!p) return null; var gs = groups(); for (var i = 0; i < gs.length; i++) if (same(gs[i].store, p.name) || (p.site && gs[i].origin && same(gs[i].origin, p.site))) return gs[i]; return null; }
  function fmt(v, cur) { try { return new Intl.NumberFormat(window.BAIN_I18N.speech(), { style: 'currency', currency: cur || 'USD' }).format(v); } catch (e) { return '$' + (Math.round(v * 100) / 100); } }
  function totals(items) {   // per currency; items with no price are counted apart
    var by = {}, unknown = 0, n = 0;
    (items || []).forEach(function (x) { var q = x.qty || 1; n += q; if (x.price == null || isNaN(+x.price)) { unknown++; return; } var c = x.currency || 'USD'; by[c] = (by[c] || 0) + (+x.price) * q; });
    var parts = Object.keys(by).map(function (c) { return fmt(Math.round(by[c] * 100) / 100, c); });
    return { count: n, by: by, unknown: unknown, text: parts.length ? parts.join(' + ') : t('priceUnknown') };
  }
  function carts() {   // every store's cart with its total, plus all together
    var gs = groups(), all = [];
    var list = gs.map(function (g) { var tt = totals(g.items); all = all.concat(g.items); return { store: g.store, origin: g.origin, items: g.items, count: tt.count, total: tt.by, total_text: tt.text, unknown_prices: tt.unknown }; });
    var sum = totals(all);
    return { stores: list, count: sum.count, total: sum.by, total_text: sum.text, unknown_prices: sum.unknown };
  }
  function cartsSentence(only) {
    var c = carts(), out = [];
    var list = only ? c.stores.filter(function (x) { return same(x.store, only.name); }) : c.stores;
    if (only && !list.length) return t('cartEmptyStore', { store: only.name });
    if (!list.length) return t('cartsEmpty');
    list.forEach(function (x) { out.push(t('cartLine', { store: x.store, n: x.count, total: x.total_text })); });
    if (!only && list.length > 1) out.push(t('cartsSum', { n: list.length, total: c.total_text }));
    if (list.some(function (x) { return x.unknown_prices; })) out.push(t('cartsSomeUnknown'));
    return out.join(' ');
  }

  // ---------------- what the person can do ----------------
  function say(txt) { APP().status(txt); APP().announce(txt); var A = window.BAIN_AI; if (!(A && A.active && A.active())) APP().sayNative(txt); }
  function placeSentence(p) { return p ? (p.query && p.query.query ? t('storeBackTo', { store: p.name, q: p.query.query }) : t('storeNow', { store: p.name })) : t('storeNowAll'); }
  // go to a store (name) or to all stores (null / "all"); opts.quiet = no speech (voice tools speak through the AI)
  function go(name, opts) {
    opts = opts || {};
    if (!name || name === ALL) { moveTo(ALL); if (!opts.quiet) say(t('storeNowAll')); return { store: null, all_stores: true }; }
    var had = find(name), p = had || ensure(name, opts); if (!p) return { error: 'no store name' };
    moveTo(p.key);
    var fresh = !had || !(p.results && p.results.length);
    if (!opts.quiet) { say(fresh ? t('storeNew', { store: p.name }) : placeSentence(p)); if (fresh) { var ti = $('typeIn'); if (ti) try { ti.focus(); } catch (e) {} } else { var h = $('resultsH'); if (h) try { h.focus(); } catch (e) {} } }
    return { store: p.name, new_here: fresh, place: p };
  }
  function back(opts) {
    opts = opts || {};
    var k = ST.prev && (ST.prev === ALL || ST.places[ST.prev]) ? ST.prev : null;
    if (!k || k === (ST.active || ALL)) {   // no remembered "other": the most recent other store
      var o = stores().filter(function (x) { return x.key !== ST.active; }).sort(function (a, b) { return (b.at || 0) - (a.at || 0); })[0];
      k = o ? o.key : (ST.active && ST.active !== ALL ? ALL : null);
    }
    if (!k) { if (!opts.quiet) say(t('storeNoOther')); return { error: 'no other store open' }; }
    moveTo(k); var p = active(); if (!opts.quiet) say(placeSentence(p));
    return { store: p ? p.name : null, all_stores: !p, place: p };
  }
  function close(k, silent) {
    var p = ST.places[k]; if (!p || k === ALL) return null;
    if (ST.active === k) { ST.active = ST.prev && ST.prev !== k && (ST.prev === ALL || ST.places[ST.prev]) ? ST.prev : ALL; restore(place(ST.active)); }
    delete ST.places[k]; ST.order = ST.order.filter(function (x) { return x !== k; }); if (ST.prev === k) ST.prev = null;
    save(); render(); if (!silent) say(t('storeClosed', { store: p.name }));
    return p;
  }

  // ---------------- hooks from app.js ----------------
  // before a search: a search with no store named, made while at a store, stays in that store; naming one store moves there; several = all stores
  function scope(args) {
    args = args || {}; var st = (args.stores || []).filter(Boolean);
    if (args.all_stores) { moveTo(ALL); args.stores = []; return args; }
    if (st.length === 1) { var p = ensure(st[0]); if (p) moveTo(p.key); return args; }
    if (st.length > 1) { moveTo(ALL); return args; }
    var a = active(); if (a) args.stores = [a.name];
    return args;
  }
  // before reading a store's own site ("open Gardner-White"): that store becomes the active place first, so the old place keeps its list
  function beforeStore(args) { var p = ensure(args.site, { site: /\./.test(args.site || '') ? args.site : null }); if (p) moveTo(p.key); return p; }
  function storeFailed() { var p = active(); if (p && !(p.results && p.results.length) && !cartFor(p)) close(p.key, true); }   // a site that is not a store / could not be read leaves no empty store behind
  function landed() {   // the store's own spelling from its results ("walmart" said → "Walmart" as the store writes it)
    var p = active(), S = APP().S;
    if (p && S.results && S.results.length) { var nm = S.results[0].store; if (nm && String(nm).length < 40 && same(nm, p.name) && S.results.every(function (x) { return same(x.store, nm); })) p.name = String(nm); }
    snapshot(); render();
  }   // after results arrive (search or a store's own site)
  function storeLanded(j, args) { var p = active() || beforeStore(args); if (p) { if (j.store && String(j.store).length < 40) p.name = j.store; if (j.url) p.site = j.url; } landed(); }

  // ---------------- typed commands (no voice call): screen language + English ----------------
  function I() { return window.BAIN_I18N; }
  // v19: the screen language + English + Hebrew + Yiddish (people mix them: "תעבור ל Walmart", "go to וולמארט")
  function phr(k) { var out = String(t(k)).toLowerCase().split(/[,،、，]/); ['en', 'he', 'yi'].forEach(function (c) { if (I().lang !== c && I().LANGS[c] && I().LANGS[c].s[k]) out = out.concat(String(I().LANGS[c].s[k]).toLowerCase().split(/[,،、，]/)); }); return out.map(function (x) { return x.trim(); }).filter(Boolean).sort(function (a, b) { return b.length - a.length; }); }
  function hit(text, k) { var w = phr(k); for (var i = 0; i < w.length; i++) if (text.indexOf(w[i]) >= 0) return w[i];
    var IN = window.BAIN_INTENT, h = IN && IN.hit(text, w); return h ? h.phrase : null; }   // v19: forgiving (misheard, cut-off words, accents, Yiddish marks)
  function command(raw) {
    var text = String(raw || '').toLowerCase().trim(); if (!text || text.length > 80) return null;
    var IN = window.BAIN_INTENT; if (IN) text = IN.fix(text) || text;   // v19: "read all my cards" → carts, "go too wall mart" → go to walmart
    if (hit(text, 'cartsCmd')) { var sx = cartsSentence(); say(sx); var lh = $('listH'); if (lh && !$('listSec').hidden) try { lh.focus(); } catch (e) {} return 'carts'; }
    if (hit(text, 'storeCmdAll')) { go(null); return 'all'; }
    if (hit(text, 'storeCmdBack')) { back(); return 'back'; }
    // "go to <store>" / "<store>に行って": the phrase must open or close the sentence, and very short phrases are not trusted (no "去污剂" → a store)
    var tx = text.replace(/[.!?。！？]+$/, '').trim(), w = phr('storeCmdGo').filter(function (x) { return x.length >= 2 && !/^[a-z]{1,2}$/.test(x); });
    for (var i = 0; i < w.length; i++) {
      var g = w[i], name = null;
      if (tx.indexOf(g) === 0) name = tx.slice(g.length); else if (tx.length > g.length && tx.lastIndexOf(g) === tx.length - g.length) name = tx.slice(0, tx.length - g.length);
      if (name == null) continue;
      name = name.replace(/^[\s'’\-:]+|[\s'’\-:]+$/g, '').replace(/^(the|a)\s+/, '').trim();
      if (name && name.length <= 40 && name.split(/\s+/).length <= 4 && (find(name) || g.length >= 3 || /[^\x00-\x7f]/.test(g))) { go(name); return 'go'; }
    }
    var ld = IN && IN.lead(tx, w);   // v19: "swich to walmart", "tak me to target"
    if (ld && ld.rest && ld.rest.split(' ').length <= 3) { var nm = ld.rest.replace(/^(the|a)\s+/, ''); if (nm) { go(nm); return 'go'; } }
    return null;
  }

  // ---------------- for the AI ----------------
  function forAI() {
    var a = active(), list = stores().map(function (p) { var c = cartFor(p); return p.name + (c ? ' (cart: ' + c.items.length + ')' : '') + (p.query && p.query.query ? ' [last search: ' + p.query.query + ']' : ''); });
    return { active: a ? a.name : 'all stores', open: list, carts: carts().stores.map(function (x) { return x.store + ': ' + x.count + ' items, ' + x.total_text; }) };
  }
  function brief(p) { var c = cartFor(p), tt = c ? totals(c.items) : null; return { store: p.name, last_search: p.query && p.query.query || null, results_kept: (p.results || []).length, cart_items: tt ? tt.count : 0, cart_total: tt ? tt.text : null, active: p.key === ST.active }; }

  // ---------------- the big buttons ----------------
  function btn(txt, fn, cls) { var b = document.createElement('button'); b.type = 'button'; b.className = cls || 'big'; b.textContent = txt; b.addEventListener('click', function (e) { e.stopPropagation(); fn(); }); return b; }
  function render() {
    var sec = $('storesSec'), box = $('storesBox'); if (!sec || !box) return;
    var open = stores(), gs = groups();
    var h = $('storesH'); if (h) h.textContent = t('storesH');
    sec.hidden = !open.length && !gs.length;
    box.innerHTML = '';
    if (sec.hidden) return;
    var hint = document.createElement('p'); hint.className = 'hint'; hint.textContent = t('storesHint'); box.appendChild(hint);
    var row = document.createElement('div'); row.className = 'storeRow'; row.setAttribute('role', 'group'); row.setAttribute('aria-label', t('storesH'));
    var ab = btn(t('storeAll'), function () { go(null); }, 'big storeBtn'); ab.setAttribute('aria-pressed', ST.active && ST.active !== ALL ? 'false' : 'true'); row.appendChild(ab);
    open.forEach(function (p) {
      var c = cartFor(p), n = c ? totals(c.items).count : 0;
      var b = btn(n ? t('storeCartN', { store: p.name, n: n }) : p.name, function () { go(p.name); }, 'big storeBtn');
      b.setAttribute('aria-pressed', p.key === ST.active ? 'true' : 'false'); b.dataset.store = p.key; row.appendChild(b);
    });
    box.appendChild(row);
    var act = document.createElement('div'); act.className = 'p-actions';
    var pk = ST.prev && ST.prev !== (ST.active || ALL) && (ST.prev === ALL || ST.places[ST.prev]) ? ST.prev : null;
    if (pk) act.appendChild(btn(t('storeBackBtn', { store: label(pk === ALL ? null : ST.places[pk]) }), function () { back(); }, 'big alt storeBack'));
    if (gs.length) act.appendChild(btn(t('cartsBtn') + ' (' + carts().count + ')', function () { var s = cartsSentence(); say(s); var lh = $('listH'); if (lh) try { lh.focus(); } catch (e) {} }, 'big alt cartsBtn'));
    var a = active(); if (a) { var cb = btn(t('storeCloseBtn', { store: a.name }), function () { close(a.key); }, 'small storeClose'); act.appendChild(cb); }
    box.appendChild(act);
  }
  function init() {
    // the screen opens where the person left it: that store's last search and results
    var a = active(); if (a && a.results && a.results.length && APP() && !APP().S.results.length) restore(a);
    render();
  }
  window.BAIN_STORES = { norm: norm, same: same, find: find, stores: stores, active: active, go: go, back: back, close: function (name) { var p = find(name); return p ? close(p.key) : null; }, scope: scope, beforeStore: beforeStore, landed: landed, storeLanded: storeLanded, storeFailed: storeFailed,
    carts: carts, cartFor: cartFor, cartsSentence: cartsSentence, totals: totals, command: command, forAI: forAI, brief: brief, render: render, snapshot: snapshot, _state: function () { return ST; }, _reset: function () { ST = { active: ALL, prev: null, places: {}, order: [] }; save(); render(); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
