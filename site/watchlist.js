/* AIN Shop — price drop alerts (TEST COPY ONLY, v32).
   "Remember I'm looking for a specific item" (Nati, Nov 17 2026): the
   phone keeps a watch list, and when the person asks, it checks each
   watched item and speaks up when the price dropped.
   How it works, in order:
     1. REMEMBER (by voice): after a search, "remember this item" watches
        the item on screen; or "remember I'm looking for [item] below
        $[price]" watches an item by name — a fresh search right away
        finds it and remembers its FIRST price. A watch is one item at
        one store (the same item at the same store is what a price drop
        means); the target price is optional.
     2. KEPT ON THIS PHONE ONLY (localStorage "ainshop.watchlist.v1",
        same pattern as the teaching records and the Buy again history):
        no server copy, no account, nothing leaves the phone. At most
        20 watches; the list can be cleared in Settings ("delete my data"
        clears this too, with everything else on the phone).
     3. CHECK (on demand only): "check my watched items" runs ONE fresh
        live search per watched item, right now, one after another —
        each check uses one of today's 60 searches and a few cents of
        the daily budget. There is NO background loop and NO push:
        nothing is checked while the app is closed, because the live
        server that could do that is Tab's, and we do not have access
        to it. The person hears the drops when they ask.
     4. HARD RULE (Nati: "repeat's gotta be live"): a check is a
        genuinely FRESH search — the request carries fresh:true, the
        server skips the cache read AND the cache write for it, and the
        answer must say fresh:true with no cached flag. If the answer
        ever comes back cached, the check is refused and NO price is
        recorded. A remembered price is never spoken as today's price:
        it is always "first seen at".
   A drop = the fresh price is lower than the first-seen price. A
   target hit = the fresh price is at or below the price the person
   named. If the fresh search does not find the item, that is reported
   honestly ("I couldn't find it just now") — never "it is gone".
   What is never stored: names, emails, addresses, ZIPs, card details,
   or anything besides the item, the store, and its prices. */
(function (root) {
  'use strict';
  var KEY = 'ainshop.watchlist.v1';
  var MAX = 20;
  var MAX_TITLE = 160;
  var APP = function () { return root.BAIN_APP; };
  function I() { return root.BAIN_I18N; }
  function t(k, v) { return APP() ? APP().t(k, v) : I().t(k, v); }
  function $(id) { return root.document ? root.document.getElementById(id) : null; }
  var W = { expanded: false, busy: false };

  function clean(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE); }
  function num(p) { if (p == null || p === '') return null; var n = typeof p === 'number' ? p : parseFloat(String(p).replace(/[^0-9.,-]/g, '').replace(/,(?=\d{3}\b)/g, '').replace(',', '.')); return isFinite(n) ? n : null; }
  function ls() { try { return root.localStorage || null; } catch (e) { return null; } }
  function load() { var s = ls(); if (!s) return []; try { var a = JSON.parse(s.getItem(KEY) || '[]'); return Array.isArray(a) ? a.filter(function (x) { return x && x.query; }) : []; } catch (e) { return []; } }
  function saveAll(a) { var s = ls(); if (!s) return false; try { if (a.length) s.setItem(KEY, JSON.stringify(a.slice(0, MAX))); else s.removeItem(KEY); return true; } catch (e) { return false; } }
  function normUrl(u) { return String(u || '').split('#')[0].replace(/\/+$/, '').toLowerCase(); }
  function normTitle(s) { try { return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim(); } catch (e) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); } }
  function idFor(w) { var base = w.url ? normUrl(w.url) : (String(w.query || '').toLowerCase() + '|' + String(w.store || '').toLowerCase()); return 'w-' + base.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80); }
  function money(price, cur) { if (price == null) return t('priceUnknown'); try { return new Intl.NumberFormat(I().speech(), { style: 'currency', currency: cur || 'USD' }).format(price); } catch (e) { return '$' + price; } }

  // ---- the list ----
  // p: a search result { title, store, url, price, currency, image }; opts: { query, target_price }
  function add(p, opts) {
    if (!p || !p.title || !p.url || !/^https?:\/\//.test(String(p.url))) return null;
    opts = opts || {};
    var a = load(), k = normUrl(p.url), e = null, at = -1;
    for (var i = 0; i < a.length; i++) if (a[i].url && normUrl(a[i].url) === k) { e = a[i]; at = i; break; }
    if (!e) {
      e = { id: '', query: clean(opts.query || p.title), title: String(p.title).slice(0, MAX_TITLE), name: '', store: String(p.store || '').slice(0, 60), url: String(p.url).split('#')[0], image: null, currency: p.currency || null,
        first_price: null, target_price: null, last_price: null, last_checked: 0, last_change: 'unchecked', added: Date.now() };
      e.id = idFor(e);
      try { e.name = APP() ? APP().shortName(p) : ''; } catch (x) {}
      if (!e.name) e.name = e.title;
      e.name = String(e.name).slice(0, 90);
    } else a.splice(at, 1);
    if (p.image && /^https:\/\//.test(p.image)) e.image = String(p.image).slice(0, 500);
    var pr = num(p.price); if (pr != null) { if (e.first_price == null) e.first_price = pr; e.last_price = pr; e.currency = p.currency || e.currency || null; }
    var tp = num(opts.target_price); if (tp != null) e.target_price = tp;
    if (opts.query) e.query = clean(opts.query);
    a.unshift(e); saveAll(a); return e;
  }
  // watch by words, before the item is found: the first check finds it and remembers its first price
  function addByQuery(query, targetPrice) {
    var q = clean(query); if (!q) return null;
    var a = load(), e = null;
    for (var i = 0; i < a.length; i++) if (normTitle(a[i].query) === normTitle(q)) { e = a[i]; break; }
    if (!e) {
      e = { id: 'w-' + q.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80), query: q, title: q, name: q, store: '', url: '', image: null, currency: null,
        first_price: null, target_price: num(targetPrice), last_price: null, last_checked: 0, last_change: 'unchecked', added: Date.now() };
      a.unshift(e);
    } else if (num(targetPrice) != null) e.target_price = num(targetPrice);
    saveAll(a); return e;
  }
  function all() { return load(); }
  function pos(id) { var a = load(); for (var i = 0; i < a.length; i++) if (a[i].id === id) return i; return -1; }
  function words(s) { return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').split(/[^\p{L}\p{N}]+/u).filter(function (w) { return w.length >= 3; }); }
  var STOP = { the: 1, and: 1, for: 1, from: 1, with: 1, watch: 1, watching: 1, watched: 1, remember: 1, item: 1, this: 1, that: 1, one: 1, please: 1, stop: 1, my: 1, the: 1 };
  // "1", "2" … = the number in the list; a name ("the shoes") = the best word match
  function find(q) {
    var a = all(); if (!a.length || q == null || q === '') return -1;
    if (/^\s*\d+\s*$/.test(String(q))) { var n = parseInt(q, 10); return n >= 1 && n <= a.length ? n - 1 : -1; }
    var qs = words(q).filter(function (w) { return !STOP[w]; }); if (!qs.length) return -1;
    var best = -1, bs = 0;
    a.forEach(function (e, i) {
      var ws = words(e.title + ' ' + (e.name || '') + ' ' + e.store + ' ' + e.query), s = 0;
      qs.forEach(function (w) { if (ws.some(function (x) { return x === w || (w.length >= 4 && (x.indexOf(w) === 0 || w.indexOf(x) === 0) && Math.min(x.length, w.length) >= 4); })) s++; });
      if (s > bs) { bs = s; best = i; }
    });
    return best;
  }
  function forget(q) { var a = all(), i = typeof q === 'number' ? q : find(q); if (i < 0 || !a[i]) return null; var x = a.splice(i, 1)[0]; saveAll(a); return x; }
  function clear() { saveAll([]); render(); return true; }
  function brief(w, i) { return { number: (i == null ? pos(w.id) : i) + 1, name: w.name || w.title, store: w.store || null, query: w.query, first_price: w.first_price, last_price: w.last_price, target_price: w.target_price, currency: w.currency || null, last_change: w.last_change, last_checked: w.last_checked ? new Date(w.last_checked).toISOString().slice(0, 10) : null }; }
  function forAI(n) { return all().slice(0, n || 20).map(function (w, i) { return (i + 1) + '. ' + (w.name || w.title) + (w.store ? ' (' + w.store + ')' : '') + (w.first_price != null ? ' — first seen ' + money(w.first_price, w.currency) : ' — no price seen yet') + (w.target_price != null ? ', target ' + money(w.target_price, w.currency) : ''); }).join('; '); }

  // ---- matching a fresh result to a watch: the SAME item at the SAME store ----
  function sameItem(w, p) {
    if (!p || !p.url || !p.title) return false;
    if (w.url && normUrl(p.url) === normUrl(w.url)) return true;
    if (w.store && p.store && String(p.store).toLowerCase() === String(w.store).toLowerCase() && normTitle(p.title) === normTitle(w.title)) return true;
    // first sighting (a watch made of words only, no store or link yet): every word of the query is in the title.
    // The search was run with the watch's own words, so the results are already relevant; once matched, the watch
    // pins to that item's link and store, and later checks use the strict rules above.
    if (!w.url && !w.store) {
      var qw = normTitle(w.query).split(' ').filter(Boolean), tw = normTitle(p.title).split(' ');
      if (qw.length && qw.every(function (x) { return tw.indexOf(x) >= 0; })) return true;
    }
    return false;
  }
  // oldPrice null = first sighting. target_hit = at or below the price the person named.
  function priceChange(oldPrice, newPrice, targetPrice) {
    if (newPrice == null) return { change: 'unknown', target_hit: false };
    var th = targetPrice != null && newPrice <= targetPrice;
    if (oldPrice == null) return { change: 'found', target_hit: th };
    if (Math.abs(newPrice - oldPrice) < 0.005) return { change: 'same', target_hit: th };
    return { change: newPrice < oldPrice ? 'drop' : 'up', target_hit: th };
  }

  // ---- checking: one genuinely FRESH live search per watch, right now ----
  function checkOne(w) {
    var A = APP();
    if (!A || !A.searchRaw) return Promise.resolve({ watch: w, error: 'search not available', change: 'unknown' });
    return A.searchRaw({ query: w.query, stores: w.store ? [w.store] : [], fresh: true }).then(function (j) {
      var out = { watch: w, searched: true, searches_used: 1 };
      if (!j || j.error) { out.error = j && j.error ? j.error : 'search failed'; out.change = 'unknown'; return out; }
      // HARD RULE: a cached answer is refused — no price is recorded from it
      if (j.cached) { out.error = 'not_fresh'; out.change = 'unknown'; return out; }
      var list = j.products || [], found = null;
      for (var i = 0; i < list.length; i++) if (sameItem(w, list[i])) { found = list[i]; break; }
      if (!found) { out.change = 'not_found'; out.found = false; return saveCheck(out); }
      out.found = true; out.product = found;
      var pc = priceChange(w.first_price, num(found.price), w.target_price);
      out.change = pc.change; out.target_hit = pc.target_hit; out.price = num(found.price); out.old_price = w.first_price;
      return saveCheck(out);
    });
    function saveCheck(o) {
      if (!o.error) {
        var a = load(), e = null;
        for (var k = 0; k < a.length; k++) if (a[k].id === w.id) { e = a[k]; break; }
        if (e) {
          if (o.found && o.product) {
            if (o.product.url) { e.url = String(o.product.url).split('#')[0]; e.title = String(o.product.title).slice(0, MAX_TITLE); e.store = String(o.product.store || '').slice(0, 60); if (!e.name || e.name === e.query) { try { e.name = APP() ? APP().shortName(o.product) : e.name; } catch (x) {} } }
            if (o.price != null) { if (e.first_price == null) e.first_price = o.price; e.last_price = o.price; e.currency = o.product.currency || e.currency || null; }
          }
          e.last_checked = Date.now(); e.last_change = o.change; saveAll(a);
          o.watch = e;
        }
      }
      return o;
    }
  }
  // one at a time, in the order watched (each check is a live search: 10-50 s, one of today's 60). Stops when the daily limit is reached.
  // Afterwards the found items become the current list, drops first — so "open the first one" works by voice, like buy-again does.
  function checkAll() {
    var list = all(), out = [], used = 0;
    if (!list.length) return Promise.resolve({ checked: 0, results: [], searches_used: 0 });
    var chain = Promise.resolve();
    list.forEach(function (w) {
      chain = chain.then(function () {
        if (out.some(function (r) { return r.error === 'rate_limited'; })) return null;
        return checkOne(w).then(function (r) { out.push(r); used += r.searches_used || 0; });
      });
    });
    return chain.then(function () {
      var A = APP(), found = [], drops = [];
      out.forEach(function (r) { if (r.found && r.product) { if (r.change === 'drop') drops.push(r.product); else found.push(r.product); } });
      var items = drops.concat(found);
      if (A && A.S && items.length) { A.S.results = items; A.S.query = { query: 'watched items', stores: [] }; A.S.shown = 0; A.S.chosen = -1; A.S.spot = -1; A.S.details = {}; A.S.searchedAt = Date.now(); A.render(); }
      render();
      return { checked: out.length, results: out, searches_used: used };
    });
  }

  // ---- what the person hears ----
  function checkSentence(r) {
    var w = r.watch, name = w.name || w.title;
    if (r.error === 'rate_limited') return t('watchLimit');
    if (r.error === 'not_fresh') return t('watchNotFresh', { name: name });
    if (r.error) return t('watchNoCheck', { name: name });
    if (r.change === 'not_found') return t('watchGone', { name: name, store: w.store });
    if (r.change === 'found') return t('watchFound', { name: name, store: r.product.store, price: money(r.price, r.product.currency) }) + (r.target_hit ? ' ' + t('watchTargetHit', { price: money(w.target_price, r.product.currency) }) : '');
    if (r.change === 'drop') return t('watchDrop', { name: name, store: r.product.store, old: money(r.old_price, r.product.currency), price: money(r.price, r.product.currency) }) + (r.target_hit ? ' ' + t('watchTargetHit', { price: money(w.target_price, r.product.currency) }) : '');
    if (r.change === 'up') return t('watchUp', { name: name, store: r.product.store, old: money(r.old_price, r.product.currency), price: money(r.price, r.product.currency) });
    if (r.change === 'same') return t('watchSame', { name: name, store: r.product.store, price: money(r.price, r.product.currency) });
    return t('watchNoCheck', { name: name });
  }
  function listSentence() {
    var a = all(); if (!a.length) return t('watchNone');
    return t('watchList', { items: a.map(function (w, i) {
      var p = w.last_price != null ? money(w.last_price, w.currency) : (w.first_price != null ? money(w.first_price, w.currency) : t('priceUnknown'));
      return (i + 1) + '. ' + (w.name || w.title) + (w.store ? ' (' + w.store + ')' : '') + ': ' + p + (w.target_price != null ? ', target ' + money(w.target_price, w.currency) : '');
    }).join('; ') });
  }

  // ---- the watch list on the home screen (only when there are watches) ----
  function el(tag, cls, txt) { var e = root.document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function btn(txt, fn, cls) { var b = el('button', cls || '', txt); b.type = 'button'; b.addEventListener('click', function (ev) { ev.stopPropagation(); fn(); }); return b; }
  function say(txt) { if (root.BAIN_AI && BAIN_AI.active()) return; APP().sayNative(txt); APP().announce(txt); }
  function checkTap(i) {
    var w = all()[i]; if (!w || W.busy) return;
    APP().status(t('watchChecking')); W.busy = true; render();
    checkOne(w).then(function (r) { W.busy = false; render(); var m = checkSentence(r); APP().status(m); say(m); });
  }
  function stopTap(i) {
    var w = all()[i]; if (!w) return;
    var V = root.AIN_VCMD;
    if (V && root.AIN_LEGAL && AIN_LEGAL.confirm) {
      V.ask(t('watchStopAsk', { name: w.name || w.title }), function () { var y = forget(String(i + 1)); render(); return y ? t('watchStopped', { name: y.name || y.title }) : ''; }, 'typed'); return;
    }
    var x = forget(String(i + 1)); if (x) { var m = t('watchStopped', { name: x.name || x.title }); APP().status(m); APP().announce(m); }
  }
  function clearTap() {
    var V = root.AIN_VCMD;
    if (V && root.AIN_LEGAL && AIN_LEGAL.confirm) { V.ask(t('watchClearAsk'), function () { clear(); var tl = $('talk'); if (tl) try { tl.focus(); } catch (e) {} return t('watchCleared'); }, 'typed'); return; }
    var ok = true; try { ok = root.confirm(t('watchClearAsk')); } catch (e) { ok = true; }
    if (!ok) return; clear(); var m = t('watchCleared'); APP().status(m); APP().announce(m);
  }
  function render() {
    var sec = $('watchSec'), box = $('watchBox'), h = $('watchH'); if (!sec || !box) return;
    var a = all(); sec.hidden = !a.length; box.innerHTML = ''; if (h) h.textContent = t('watchH');
    if (!a.length) return;
    box.appendChild(el('p', 'hint', t('watchNote')));
    var ol = el('ol', 'histList'), show = W.expanded ? a.slice(0, 20) : a.slice(0, 5);
    show.forEach(function (w, i) {
      var li = el('li', 'histItem'), info = el('div', 'histInfo');
      info.appendChild(el('h3', 'p-title', w.name || w.title));
      var pl = (w.first_price != null ? money(w.first_price, w.currency) : t('priceUnknown')) + (w.last_price != null && w.last_price !== w.first_price ? ', now ' + money(w.last_price, w.currency) : '');
      info.appendChild(el('p', 'p-price', pl + (w.store ? ' · ' + w.store : '') + (w.target_price != null ? ' · target ' + money(w.target_price, w.currency) : '')));
      info.appendChild(el('p', 'p-meta', t('watchMeta', { change: w.last_change || 'unchecked', date: w.last_checked ? new Date(w.last_checked).toISOString().slice(0, 10) : '' })));
      li.appendChild(info);
      if (w.image && /^https:\/\//.test(w.image)) { var im = el('img', 'img'); im.src = w.image; im.alt = ''; im.loading = 'lazy'; im.decoding = 'async'; im.setAttribute('referrerpolicy', 'no-referrer'); im.onerror = function () { this.remove(); }; li.appendChild(im); }
      var act = el('div', 'p-actions');
      var b1 = btn(t('watchCheck'), function () { checkTap(i); }, 'big'); b1.setAttribute('aria-label', t('watchCheck') + ': ' + (w.name || w.title)); if (W.busy) b1.disabled = true; act.appendChild(b1);
      var b2 = btn(t('watchStop'), function () { stopTap(i); }, 'small'); b2.setAttribute('aria-label', t('watchStop') + ': ' + (w.name || w.title)); act.appendChild(b2);
      li.appendChild(act); ol.appendChild(li);
    });
    box.appendChild(ol);
    var row = el('div', 'p-actions');
    if (a.length > 5) { var m = btn(W.expanded ? t('histLess') : t('histMore', { n: Math.min(a.length, 20) }), function () { W.expanded = !W.expanded; render(); }, 'small'); m.setAttribute('aria-expanded', W.expanded ? 'true' : 'false'); row.appendChild(m); }
    row.appendChild(btn(t('watchCheckAll'), function () {
      if (W.busy) return; APP().status(t('watchChecking')); say(t('watchChecking')); W.busy = true; render();
      checkAll().then(function (res) { W.busy = false; render(); var m2 = res.results.map(checkSentence).join(' ') || t('watchNone'); APP().status(m2); say(m2); });
    }, 'big'));
    row.appendChild(btn(t('watchClear'), clearTap, 'small histClear'));
    box.appendChild(row);
  }

  // ---- typed (no voice call) commands: "remember this item", "remember I'm looking for … below $…", "check my watched items" ----
  function phr(k) { var out = String(t(k)).toLowerCase().split(/[,،、，]/); ['en', 'he', 'yi'].forEach(function (c) { if (I().lang !== c && I().LANGS[c] && I().LANGS[c].s[k]) out = out.concat(String(I().LANGS[c].s[k]).toLowerCase().split(/[,،、，]/)); }); return out.map(function (x) { return x.trim(); }).filter(Boolean); }
  function hit(text, k) { var w = phr(k); for (var i = 0; i < w.length; i++) if (text.indexOf(w[i]) >= 0) return w[i];
    var IN = root.BAIN_INTENT, h = IN && IN.hit(text, w); return h ? h.phrase : null; }
  function strip(text, k) { phr(k).forEach(function (w) { text = text.split(w).join(' '); }); return text; }
  // "below $50", "under 50 dollars", "$50" → { target: 50, rest: the words without the price }
  function parseTarget(text) {
    var m = /(?:below|under|less than|cheaper than|at most|up to)\s*\$?\s*(\d+(?:[.,]\d{1,2})?)/.exec(text);
    if (!m) m = /\$\s*(\d+(?:[.,]\d{1,2})?)/.exec(text);
    if (!m) return { target: null, rest: text };
    var n = parseFloat(String(m[1]).replace(',', '.'));
    return { target: isFinite(n) ? n : null, rest: text.replace(m[0], ' ').replace(/\s+/g, ' ').trim() };
  }
  function command(raw) {
    var text = String(raw || '').toLowerCase().trim(); if (!text) return null;
    var A = APP();
    if (hit(text, 'watchCmdAdd')) {
      // only a command when there IS an item on screen — otherwise it is a search ("remember this" the book)
      if (!A || !A.S || !A.S.results || !A.S.results.length) return null;
      var idx = A.S.chosen >= 0 ? A.S.chosen : (A.S.spot >= 0 ? A.S.spot : 0);
      var p = A.S.results[idx]; if (!p) return null;
      var pt = parseTarget(strip(text, 'watchCmdAdd'));
      var w = add(p, { query: A.S.query && A.S.query.query ? A.S.query.query : p.title, target_price: pt.target });
      if (!w) return null;
      var m = t('watchAdded', { name: w.name || w.title, store: w.store, price: w.first_price != null ? money(w.first_price, w.currency) : t('priceUnknown') });
      if (w.target_price != null) m += ' ' + t('watchTargetSet', { price: money(w.target_price, w.currency) });
      A.status(m); say(m); render(); return 'add';
    }
    if (hit(text, 'watchCmdSearch')) {
      var rest = strip(text, 'watchCmdSearch').replace(/^(i'?m|i am)\s+looking for\s+/, '').replace(/^looking for\s+/, '').trim();
      var pt2 = parseTarget(rest), q = pt2.rest;
      if (!q) { var m2 = t('watchWhat'); A.status(m2); say(m2); return 'none'; }
      var w2 = addByQuery(q, pt2.target);
      if (!w2) return null;
      A.status(t('watchSearching', { name: q })); say(t('watchSearching', { name: q }));
      checkOne(w2).then(function (r) {
        var m3 = r.error ? t('watchNoCheck', { name: q }) : (r.change === 'not_found' ? t('watchNotFound', { name: q }) : checkSentence(r));
        A.status(m3); say(m3); render();
      });
      return 'search';
    }
    if (hit(text, 'watchCmdCheck')) {
      if (!all().length) { var m4 = t('watchNone'); A.status(m4); say(m4); return 'none'; }
      A.status(t('watchChecking')); say(t('watchChecking'));
      checkAll().then(function (res) {
        var m5 = res.results.map(checkSentence).join(' ') || t('watchNone');
        A.status(m5); say(m5);
      });
      return 'check';
    }
    if (hit(text, 'watchCmdList')) {
      var s = listSentence(); A.status(s); say(s); var hh = $('watchH'); if (hh) try { hh.focus(); } catch (e) {}
      return 'list';
    }
    if (hit(text, 'watchCmdStop') && all().length) {
      var fi = find(strip(text, 'watchCmdStop')), V = root.AIN_VCMD;
      if (fi >= 0 && V && root.AIN_LEGAL && AIN_LEGAL.confirm) {
        var fe = all()[fi];
        V.ask(t('watchStopAsk', { name: fe.name || fe.title }), function () { var y = forget(String(fi + 1)); render(); return y ? t('watchStopped', { name: y.name || y.title }) : ''; }, 'typed'); return 'ask';
      }
      var x = forget(strip(text, 'watchCmdStop')); var m6 = x ? t('watchStopped', { name: x.name || x.title }) : listSentence();
      A.status(m6); say(m6); return x ? 'stop' : 'list';
    }
    return null;
  }

  function init() { render(); }
  root.BAIN_WATCH = { add: add, addByQuery: addByQuery, all: all, pos: pos, find: find, forget: forget, clear: clear, brief: brief, forAI: forAI, sameItem: sameItem, normUrl: normUrl, normTitle: normTitle, priceChange: priceChange, parseTarget: parseTarget, checkOne: checkOne, checkAll: checkAll, checkSentence: checkSentence, listSentence: listSentence, command: command, render: render };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.BAIN_WATCH;
  if (root.document) { if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', init); else init(); }
})(typeof window !== 'undefined' ? window : globalThis);
