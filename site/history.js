/* AIN Shop — "buy again": what the person picked before, kept ONLY on this phone (localStorage "bain:history"; no server copy, no account).
   AIN Shop is a guide to the stores and never sees the store's checkout, so an entry means "you picked / went to buy this here", not a receipt.
   An entry is saved when the person taps or says Buy, opens the store's page, goes to checkout, or adds it to the list. The same item picked again
   within 30 minutes (Buy, then Go to checkout) is one pick. Newest first, at most 50 items. Nati, Oct 26 2026: "remembers what they bought last time". */
(function () {
  'use strict';
  var KEY = 'bain:history', MAX = 50, SAME_PICK_MS = 30 * 60 * 1000;
  var APP = function () { return window.BAIN_APP; };
  function I() { return window.BAIN_I18N; }
  function t(k, v) { return APP() ? APP().t(k, v) : I().t(k, v); }
  function $(id) { return document.getElementById(id); }
  var H = { expanded: false, busy: false };

  function keyOf(url) { return String(url || '').split('#')[0]; }
  function all() { try { var a = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(a) ? a.filter(function (x) { return x && x.url && x.title; }) : []; } catch (e) { return []; } }
  function save(a) { try { if (a.length) localStorage.setItem(KEY, JSON.stringify(a.slice(0, MAX))); else localStorage.removeItem(KEY); } catch (e) {} render(); }
  function num(p) { if (p == null || p === '') return null; var n = typeof p === 'number' ? p : parseFloat(String(p).replace(/[^0-9.,-]/g, '').replace(/,(?=\d{3}\b)/g, '').replace(',', '.')); return isFinite(n) ? n : null; }

  // p: a search result, a checkout answer, or a list entry — { title, store, url, image, price, currency, variant }
  function record(p, how) {
    if (!p || !p.url || !p.title || !/^https?:\/\//.test(String(p.url))) return null;
    var a = all(), k = keyOf(p.url), now = Date.now(), e = null, at = -1;
    for (var i = 0; i < a.length; i++) if (keyOf(a[i].url) === k) { e = a[i]; at = i; break; }
    var short = ''; try { short = APP() ? APP().shortName(p) : ''; } catch (x) {}
    var variant = p.variant && typeof p.variant === 'object' ? p.variant.title : p.variant;
    if (!e) e = { title: '', store: '', url: k, count: 0, first: now, last: 0 };
    else a.splice(at, 1);
    if (!e.last || now - e.last > SAME_PICK_MS) e.count = (e.count || 0) + 1;
    e.title = String(p.title).slice(0, 160); e.name = String(short || e.name || p.title).slice(0, 90);
    e.store = String(p.store || e.store || '').slice(0, 60);
    if (p.image && /^https:\/\//.test(p.image)) e.image = String(p.image).slice(0, 500);
    var pr = num(p.price); if (pr != null) { e.price = pr; e.currency = p.currency || e.currency || null; }
    if (variant && !/^default/i.test(variant)) e.variant = String(variant).slice(0, 80);
    e.last = now; e.how = how || 'pick';
    a.unshift(e); save(a); return e;
  }
  function recent(n) { return all().slice(0, n || 5); }
  function clear() { save([]); return true; }
  function words(s) { return String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').split(/[^\p{L}\p{N}]+/u).filter(function (w) { return w.length >= 3 || /[^\x00-\x7f]/.test(w) && w.length >= 2; }); }
  var STOP = { the: 1, and: 1, for: 1, from: 1, with: 1, same: 1, last: 1, time: 1, again: 1, buy: 1, bought: 1, order: 1, reorder: 1, my: 1, usual: 1, what: 1, did: 1, get: 1, item: 1, that: 1, this: 1, one: 1, please: 1, forget: 1, remove: 1, history: 1, open: 1, want: 1 };
  // "1", "2" … = the number in the newest-first list; a name ("the milk") = the best word match
  function find(q) {
    var a = all(); if (!a.length || q == null || q === '') return -1;
    var n = parseInt(q, 10); if (/^\s*\d+\s*$/.test(String(q))) return n >= 1 && n <= a.length ? n - 1 : -1;
    var qs = words(q).filter(function (w) { return !STOP[w]; }); if (!qs.length) return -1;
    var best = -1, bs = 0;
    a.forEach(function (e, i) {
      var ws = words(e.title + ' ' + (e.name || '') + ' ' + e.store + ' ' + (e.variant || '')), s = 0;
      qs.forEach(function (w) { if (ws.some(function (x) { return x === w || (w.length >= 4 && (x.indexOf(w) === 0 || w.indexOf(x) === 0) && Math.min(x.length, w.length) >= 4); })) s++; });
      if (s > bs) { bs = s; best = i; }
    });
    return best;
  }
  function forget(q) { var a = all(), i = find(q); if (i < 0) return null; var x = a.splice(i, 1)[0]; save(a); return x; }
  function money(price, cur) { if (price == null) return t('priceUnknown'); try { return new Intl.NumberFormat(I().speech(), { style: 'currency', currency: cur || 'USD' }).format(price); } catch (e) { return '$' + price; } }
  function day(ts) { try { return new Intl.DateTimeFormat(I().speech(), { month: 'short', day: 'numeric' }).format(new Date(ts)); } catch (e) { return new Date(ts).toISOString().slice(0, 10); } }
  function daysAgo(ts) { return Math.max(0, Math.floor((Date.now() - ts) / 86400000)); }
  function sameAsNow(old, now) { return old != null && now != null && Math.abs(old - now) < 0.005; }

  // the AI's view: names and stores only (no links, no prices) for the session instructions
  function forAI(n) { return all().slice(0, n || 20).map(function (e, i) { return (i + 1) + '. ' + (e.name || e.title) + ' (' + e.store + ')'; }).join('; '); }
  function brief(e, i) { return { number: i + 1, name: e.name || e.title, store: e.store, option: e.variant || null, last_price: e.price != null ? e.price : null, currency: e.currency || null, picked_times: e.count || 1, last_picked: new Date(e.last).toISOString().slice(0, 10), days_ago: daysAgo(e.last) }; }

  // "buy again": the item becomes the current result and the store is asked for TODAY's price and stock (the same check as Buy)
  function reorder(q) {
    var a = all(), i = typeof q === 'number' ? q : find(q); var e = a[i];
    if (!e) return Promise.resolve({ error: 'not_found', count: a.length });
    var S = APP().S, p = { title: e.title, short: e.name, store: e.store, url: e.url, image: e.image || null, price: e.price != null ? e.price : null, currency: e.currency || null, price_source: 'history', from_history: true };
    S.results = [p]; S.query = { query: e.name || e.title, stores: [e.store] }; S.shown = 0; S.chosen = 0; S.spot = -1; S.details = {}; S.searchedAt = Date.now(); S.storeMode = null;
    APP().render(); H.busy = true; render();
    if (!window.BAIN_CO) { H.busy = false; render(); return Promise.resolve({ entry: e, index: i, checked: false, change: 'unknown', available: null }); }
    return BAIN_CO.prepare(0, 1, e.variant || '', { quiet: true }).then(function (co) {
      H.busy = false; render();
      var f = (co && co.info) || {}, out = { entry: e, index: i, info: f, checked: !co.error, old_price: e.price != null ? e.price : null, price: null, currency: f.currency || e.currency || null, available: null, change: 'unknown' };
      if (co.error) return out;
      var fromPage = f.price_source == null || !/search listing/.test(String(f.price_source));
      if (f.path === 'sold_out' || f.in_stock === false) { out.available = false; out.change = 'unavailable'; return out; }
      out.available = true;
      if (f.price != null && fromPage) { out.price = f.price; out.change = out.old_price == null ? 'new' : sameAsNow(out.old_price, f.price) ? 'same' : f.price > out.old_price ? 'up' : 'down'; }
      return out;
    });
  }
  function reorderSentence(r) {
    if (r.error) return t('histNone');
    var e = r.entry;
    if (r.change === 'unavailable') return t('histUnavail', { store: e.store });
    if (r.change === 'same') return t('histSame', { price: money(r.price, r.currency) });
    if (r.change === 'up' || r.change === 'down') return t('histChanged', { old: money(r.old_price, r.currency), price: money(r.price, r.currency) });
    return t('histNoCheck');
  }
  function lastSentence(n) {
    var a = recent(n || 5); if (!a.length) return t('histNone');
    return t('histLast', { items: a.map(function (e) { return (e.name || e.title) + ' (' + e.store + ')'; }).join('; ') });
  }

  // ---- the "Buy again" list on the home screen (only when there is history) ----
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function btn(txt, fn, cls) { var b = el('button', cls || '', txt); b.type = 'button'; b.addEventListener('click', function (ev) { ev.stopPropagation(); fn(); }); return b; }
  function say(txt) { if (window.BAIN_AI && BAIN_AI.active()) return; APP().sayNative(txt); APP().announce(txt); }
  function againTap(i) {
    var e = all()[i]; if (!e) return;
    if (window.BAIN_AI && BAIN_AI.active()) { BAIN_AI.tell('The user tapped Buy again on item ' + (i + 1) + ' of their history (' + (e.name || e.title) + ', ' + e.store + '). Call reorder_item with item ' + (i + 1) + ' and tell them the result.'); return; }
    APP().status(t('coLoading'));
    reorder(i).then(function (r) {
      var s = $('coSec'); if (s && !s.hidden) try { s.scrollIntoView({ block: 'start' }); $('coH').focus(); } catch (x) {}
      var txt = (r.entry ? (r.entry.name || r.entry.title) + ', ' + r.entry.store + '. ' : '') + reorderSentence(r);
      APP().status(txt); say(txt);
    });
  }
  function forgetTap(i) { var e = all()[i]; if (!e) return; var x = forget(String(i + 1)); if (x) { var m = t('histForgot', { name: x.name || x.title }); APP().status(m); APP().announce(m); var h = $('histH'); if (h && !all().length) { var tl = $('talk'); if (tl) tl.focus(); } } }
  function clearTap() {
    var V = window.AIN_VCMD;   // v28: the big spoken Yes/No box (was the phone's small confirm())
    if (V && window.AIN_LEGAL && AIN_LEGAL.confirm) { V.ask(t('histClearAsk'), function () { clear(); var tl = $('talk'); if (tl) try { tl.focus(); } catch (e) {} return t('histCleared'); }, 'typed'); return; }
    var ok = true; try { ok = window.confirm(t('histClearAsk')); } catch (e) { ok = true; }
    if (!ok) return; clear(); var m = t('histCleared'); APP().status(m); APP().announce(m); var tl = $('talk'); if (tl) try { tl.focus(); } catch (e) {}
  }
  function render() {
    var sec = $('histSec'), box = $('histBox'), h = $('histH'); if (!sec || !box) return;
    var a = all(); sec.hidden = !a.length; box.innerHTML = ''; if (h) h.textContent = t('histH');
    if (!a.length) return;
    box.appendChild(el('p', 'hint', t('histNote')));
    var ol = el('ol', 'histList'), show = H.expanded ? a.slice(0, 20) : a.slice(0, 5);
    show.forEach(function (e, i) {
      var li = el('li', 'histItem'), info = el('div', 'histInfo');
      info.appendChild(el('h3', 'p-title', e.name || e.title));
      info.appendChild(el('p', 'p-price', (e.price != null ? money(e.price, e.currency) + ' · ' : '') + e.store + (e.variant ? ' · ' + e.variant : '')));
      info.appendChild(el('p', 'p-meta', t('histMeta', { n: e.count || 1, date: day(e.last) })));
      li.appendChild(info);
      if (e.image && /^https:\/\//.test(e.image)) { var im = el('img', 'img'); im.src = e.image; im.alt = ''; im.loading = 'lazy'; im.decoding = 'async'; im.setAttribute('referrerpolicy', 'no-referrer'); im.onerror = function () { this.remove(); }; li.appendChild(im); }
      var act = el('div', 'p-actions');
      var b1 = btn(t('histAgain'), function () { againTap(i); }, 'big histAgain'); b1.setAttribute('aria-label', t('histAgain') + ': ' + (e.name || e.title) + ', ' + e.store); if (H.busy) b1.disabled = true; act.appendChild(b1);
      var b2 = btn(t('histForget'), function () { forgetTap(i); }, 'small'); b2.setAttribute('aria-label', t('histForget') + ': ' + (e.name || e.title)); act.appendChild(b2);
      li.appendChild(act); ol.appendChild(li);
    });
    box.appendChild(ol);
    var row = el('div', 'p-actions');
    if (a.length > 5) { var m = btn(H.expanded ? t('histLess') : t('histMore', { n: Math.min(a.length, 20) }), function () { H.expanded = !H.expanded; render(); }, 'small'); m.setAttribute('aria-expanded', H.expanded ? 'true' : 'false'); row.appendChild(m); }
    row.appendChild(btn(t('histClear'), clearTap, 'small histClear'));
    box.appendChild(row);
  }

  // ---- typed (no voice call) commands, in the screen language + English: "what did I buy last time", "buy the same milk again", "clear my history" ----
  function phr(k) { var out = String(t(k)).toLowerCase().split(/[,،、，]/); ['en', 'he', 'yi'].forEach(function (c) { if (I().lang !== c && I().LANGS[c] && I().LANGS[c].s[k]) out = out.concat(String(I().LANGS[c].s[k]).toLowerCase().split(/[,،、，]/)); }); return out.map(function (x) { return x.trim(); }).filter(Boolean); }   // v19: + Hebrew + Yiddish
  function hit(text, k) { var w = phr(k); for (var i = 0; i < w.length; i++) if (text.indexOf(w[i]) >= 0) return w[i];
    var IN = window.BAIN_INTENT, h = IN && IN.hit(text, w); return h ? h.phrase : null; }   // v19: forgiving (misheard / cut-off words)
  function strip(text, k) { phr(k).forEach(function (w) { text = text.split(w).join(' '); }); return text; }
  function command(raw) {
    var text = String(raw || '').toLowerCase().trim(); if (!text) return null;
    if (hit(text, 'histCmdClear')) { if (!all().length) { say(t('histNone')); return 'none'; } clearTap(); return 'clear'; }
    if (hit(text, 'histCmdForget') && all().length) {
      var fi = find(strip(text, 'histCmdForget')), V = window.AIN_VCMD;
      if (fi >= 0 && V && window.AIN_LEGAL && AIN_LEGAL.confirm) {   // v28: forgetting asks the Yes/No box first
        var fe = all()[fi]; V.ask(V.say('forgetQ', { n: fi + 1 }) + ' (' + (fe.name || fe.title) + ')', function () { var y = forget(String(fi + 1)); render(); return y ? t('histForgot', { name: y.name || y.title }) : ''; }, 'typed'); return 'ask';
      }
      var x = forget(strip(text, 'histCmdForget')); var m = x ? t('histForgot', { name: x.name || x.title }) : lastSentence(5);
      APP().status(m); say(m); return x ? 'forget' : 'list';
    }
    if (hit(text, 'histCmdShow')) {
      if (!all().length) { APP().status(t('histNone')); say(t('histNone')); return 'none'; }
      var i = find(strip(text, 'histCmdShow'));
      if (i >= 0) { againTap(i); return 'reorder'; }
      var s = lastSentence(5); APP().status(s); say(s);
      var hh = $('histH'); if (hh) try { hh.focus(); } catch (e) {}
      return 'list';
    }
    return null;
  }

  function init() { render(); }
  window.BAIN_HIST = { record: record, all: all, recent: recent, find: find, forget: forget, clear: clear, reorder: reorder, reorderSentence: reorderSentence, lastSentence: lastSentence, forAI: forAI, brief: brief, command: command, render: render, money: money };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
