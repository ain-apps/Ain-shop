/* AIN Shop v30 — DESCRIBE AND SHOW (Nati, Nov 1 2026 9:28 AM: "while he's describing every option, scroll down and show that option on
   the screen ... Describe and show, same time"). While the voice reads options, the card of the option being read is scrolled into view
   and lit up: big, black on yellow, for low vision.
   - WHICH items: from the AI's tool calls (search_products / more_results / open_store / store_switch → the 3 it reads; product_details,
     open_product, checkout_prepare, list_add → that one; compare_products → those; "next" / "back" → the next / previous 3; carts_read,
     list_read, get_purchase_history → a card is made for each entry that has none on screen: picture, name, price, store).
   - WHEN, inside one spoken answer: the voice model sends ONE audio stream for the whole answer and no event per item, so the moment comes
     from the answer's own transcript (where item 2 starts: its number word, its price, a word of its name) laid on the audio clock
     (output_audio_buffer.started + characters per second, learned from this phone's own answers per language).
   - An interruption freezes the light on the item being read (the AI is told "this one" = that item); next / back / picking one moves it.
   window.AIN_SHOW */
(function (root) {
  'use strict';
  function APP() { return root.BAIN_APP; }
  function $(id) { return document.getElementById(id); }
  var RATE0 = { he: 12.5, yi: 12.5, ar: 12.5, fa: 12.5, ur: 12.5, en: 15, 'zh-CN': 4.5, 'zh-TW': 4.5, ja: 7, ko: 7, th: 12, am: 9 };
  var st = { pend: null, cur: null, timer: null, lit: null, rates: null, log: [] };
  function trace(x) { st.log.push(x + '@' + Date.now() % 100000); if (st.log.length > 80) st.log.shift(); }
  function lang() { var A = APP(); return (A && A.S && A.S.lang) || 'en'; }
  function rates() { if (!st.rates) { try { st.rates = JSON.parse(localStorage.getItem('bain:showRate') || '{}') || {}; } catch (e) { st.rates = {}; } } return st.rates; }
  function rate() { var l = lang(), r = rates()[l]; return r > 2 && r < 40 ? r : (RATE0[l] || 13); }
  function learn(chars, secs) {
    if (!(secs > 2.5 && chars > 30)) return; var v = chars / secs; if (!(v > 2 && v < 40)) return;
    var l = lang(), R = rates(), old = R[l]; R[l] = Math.round((old ? old * 0.5 + v * 0.5 : v) * 100) / 100;
    try { localStorage.setItem('bain:showRate', JSON.stringify(R)); } catch (e) {}
  }
  function reduced() { try { return root.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }

  // ---------------- the cards ----------------
  function S() { var A = APP(); return A && A.S ? A.S : { results: [] }; }
  function same(a, b) { return a && b && ((a.url && a.url === b.url) || (String(a.title || a.name || '') === String(b.title || b.name || '') && String(a.store || '') === String(b.store || ''))); }
  function resultIndex(p) { var R = S().results || []; for (var i = 0; i < R.length; i++) if (same(R[i], p)) return i; return -1; }
  function spotSec() {   // cards for options that have none on screen (cart, list, history entries)
    var sec = $('spotSec'); if (sec) return sec;
    sec = document.createElement('section'); sec.id = 'spotSec'; sec.hidden = true; sec.setAttribute('aria-labelledby', 'spotH');
    var h = document.createElement('h2'); h.id = 'spotH'; sec.appendChild(h);
    var ol = document.createElement('ol'); ol.id = 'spotList'; sec.appendChild(ol);
    var rs = $('resultsSec'); if (rs && rs.parentNode) rs.parentNode.insertBefore(sec, rs); else (document.querySelector('main') || document.body).appendChild(sec);
    return sec;
  }
  function money(p) {
    if (p.price == null || p.price === '') return '';
    if (typeof p.price === 'string' && /[^\d.,]/.test(p.price)) return p.price;
    try { return new Intl.NumberFormat((root.BAIN_I18N && BAIN_I18N.speech && BAIN_I18N.speech()) || 'en-US', { style: 'currency', currency: p.currency || 'USD' }).format(+p.price); } catch (e) { return '$' + p.price; }
  }
  function nameOf(p) { try { return root.AIN_TEXT && AIN_TEXT.shortName ? AIN_TEXT.shortName(p) : String(p.title || p.name || ''); } catch (e) { return String(p.title || p.name || ''); } }
  function makeCard(p, n) {   // n = the number the voice says for it
    var sec = spotSec(), ol = $('spotList'); sec.hidden = false;
    var A = APP(); $('spotH').textContent = A && A.t ? A.t('spotH') : 'Now showing';
    var lis = ol.children;
    for (var k = 0; k < lis.length; k++) if (lis[k]._p && same(lis[k]._p, p)) return lis[k];
    var li = document.createElement('li'); li._p = p; li.className = 'spotCard';
    var img = p.image && /^https:\/\//.test(p.image) ? p.image : null;
    if (img) { var im = document.createElement('img'); im.className = 'img'; im.src = img; im.alt = ''; im.loading = 'eager'; im.setAttribute('referrerpolicy', 'no-referrer'); im.onerror = function () { this.remove(); }; li.appendChild(im); }
    var box = document.createElement('div');
    var h = document.createElement('h3'); h.className = 'p-title nocount'; h.textContent = (n ? n + '. ' : '') + '\u2068' + nameOf(p) + '\u2069'; box.appendChild(h);   // the name keeps its own direction in a Hebrew screen
    var line = [money(p), p.store || ''].filter(Boolean).join(' · ');
    if (line) { var pr = document.createElement('p'); pr.className = 'p-price'; pr.textContent = line; box.appendChild(pr); }
    if (p.option || p.variant) { var op = document.createElement('p'); op.className = 'p-meta'; op.textContent = p.option || p.variant; box.appendChild(op); }
    li.appendChild(box);
    ol.appendChild(li); while (ol.children.length > 12) ol.removeChild(ol.firstChild);
    return li;
  }
  function clearSpots() { var ol = $('spotList'); if (ol) ol.innerHTML = ''; var sec = $('spotSec'); if (sec) sec.hidden = true; }
  // light one target: { i: index in the results } or { p: an entry with no result card, n: its spoken number }
  function light(tg, why) {
    if (!tg) return null;
    var el = null, A = APP(), R = S();
    if (tg.i != null && R.results && R.results[tg.i]) {
      R.spot = tg.i; el = $('p' + tg.i);
      if (!el && A && A.render) { A.render(); el = $('p' + tg.i); }
      var rs = $('resultsSec'); if (rs && rs.hidden) rs.hidden = false;
    } else if (tg.p) {
      var ri = resultIndex(tg.p);
      if (ri >= 0) return light({ i: ri }, why);
      el = makeCard(tg.p, tg.n); R.spot = -1;
    }
    if (!el) return null;
    Array.prototype.forEach.call(document.querySelectorAll('.spot'), function (x) { if (x !== el) { x.classList.remove('spot'); x.removeAttribute('data-spot'); } });
    el.classList.add('spot'); el.setAttribute('data-spot', why || '1');
    st.lit = tg; trace('light:' + (tg.i != null ? 'r' + tg.i : 'c' + (tg.n || '')) + ':' + (why || ''));
    // a card taller than most of the screen is brought in from its top (photo, name, price, store first), else centred
    var tall = false; try { tall = el.getBoundingClientRect().height > (root.innerHeight || 800) * 0.75; } catch (e) {}
    try { el.scrollIntoView({ block: tall ? 'start' : 'center', behavior: reduced() ? 'auto' : 'smooth' }); } catch (e) { try { el.scrollIntoView(); } catch (x) {} }
    return el;
  }
  // render() rebuilds the list: the light stays on the same card
  function afterRender() {
    var R = S(); if (R.spot == null || R.spot < 0) return;
    var el = $('p' + R.spot); if (el && !el.classList.contains('spot')) { el.classList.add('spot'); el.setAttribute('data-spot', 'kept'); }
  }

  // ---------------- what the voice is about to read (from the tool calls) ----------------
  function num(x) { var n = parseInt(x, 10); return n >= 1 ? n : null; }
  function fromTool(name, args, out) {
    out = out || {}; if (out.error) return null;
    var R = S(), list = null;
    function byItems(a) { return (a || []).map(function (o) { var n = num(o && o.item); return n && R.results[n - 1] ? { i: n - 1, n: n, p: R.results[n - 1] } : null; }).filter(Boolean); }
    if (name === 'search_products' || name === 'open_store' || name === 'store_switch' || name === 'store_back') { clearSpots(); list = byItems(out.first); }
    else if (name === 'more_results') list = byItems(out.items);
    else if (name === 'compare_products') list = byItems(out.compare);
    else if (name === 'product_details' || name === 'open_product' || name === 'checkout_prepare' || name === 'list_add') { var n = num(args && args.item); if (n && R.results[n - 1]) list = [{ i: n - 1, n: n, p: R.results[n - 1] }]; }
    else if (name === 'list_read') list = (out.items || []).map(function (x) { return { p: x, n: x.number }; });
    else if (name === 'carts_read') { if (out.carts && out.carts.length === 1) list = (out.carts[0].items || []).map(function (x) { return { p: { title: x.title, price: x.price, currency: x.currency, store: out.carts[0].store, option: x.option }, n: x.number }; }); }
    else if (name === 'get_purchase_history') list = (out.items || []).map(function (x, k) { return { p: { title: x.name || x.title, store: x.store, price: x.price, image: x.image, url: x.url }, n: k + 1 }; });
    if (!list || !list.length) return null;
    plan(list, 'tool:' + name);
    return list;
  }
  // a list the voice reads next: the first one lights now, the rest follow the voice
  function plan(list, why) {
    if (!list || !list.length) return;
    st.pend = { items: list, why: why || '', at: Date.now() };
    if (st.cur && !st.cur.done) finish(false);
    list.forEach(function (x) { if (x.i == null && x.p && resultIndex(x.p) < 0) try { makeCard(x.p, x.n); } catch (e) {} });   // every option gets its card before the voice reaches it
    light(list[0], why);
  }
  function pick(i, why) { var R = S(); if (!R.results || !R.results[i]) return null; st.pend = null; if (st.cur) finish(false); return light({ i: i }, why || 'pick'); }

  // ---------------- following the voice ----------------
  function esc(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  var STOP = { the: 1, and: 1, with: 1, for: 1, pack: 1, inch: 1, black: 0 };
  function numWords(n) {
    var out = [String(n)], I = root.BAIN_I18N, codes = [lang(), 'en'];
    codes.forEach(function (c) { var L = I && I.LANGS && I.LANGS[c], v = L && L.v; if (v && v.num && v.num[n]) v.num[n].forEach(function (w) { w = String(w).toLowerCase().trim(); if (w && out.indexOf(w) < 0) out.push(w); }); });
    return out;
  }
  function cuesFor(item, prev) {
    var p = item.p || {}, cues = [], n = item.n;
    if (n) numWords(n).forEach(function (w) {
      if (/^\d+$/.test(w)) cues.push(new RegExp('(?:^|[^\\d.,$₪€£])' + w + '(?=[.):,]?\\s|[.):,]$|$)'));
      else if (w.length >= 3 || /[^\x00-\x7f]/.test(w)) cues.push(new RegExp('(?:^|[\\s,.:;"(\\-–—])' + esc(w) + '(?=$|[\\s,.:;!?")\\-–—])', 'i'));
    });
    var pr = p.price != null ? String(p.price).replace(/[^\d.]/g, '').split('.')[0] : '';
    var pp = prev && prev.p && prev.p.price != null ? String(prev.p.price).replace(/[^\d.]/g, '').split('.')[0] : '';
    if (pr && pr.length >= 1 && pr !== pp && +pr > 0) cues.push(new RegExp('(?:^|[^\\d])' + pr + '(?![\\d])'));
    var prevWords = {}; String(prev && prev.p ? nameOf(prev.p) : '').toLowerCase().split(/[^\p{L}\p{N}]+/u).forEach(function (w) { prevWords[w] = 1; });
    var store = String(p.store || '').toLowerCase();
    String(nameOf(p) || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(function (w) { return w.length >= 4 && !prevWords[w] && !STOP[w] && store.indexOf(w) < 0 && !/^\d+$/.test(w); }).slice(0, 3).forEach(function (w) { cues.push(new RegExp(esc(w), 'i')); });
    return cues;
  }
  function clauseStart(text, at, floor) {   // back to the start of the sentence / clause the cue sits in
    var lo = Math.max(floor, at - 70), best = at;
    for (var k = at - 1; k >= lo; k--) { var ch = text.charAt(k); if (/[.!?;:\n。！？]/.test(ch)) { best = k + 1; break; } }
    while (best < at && /\s/.test(text.charAt(best))) best++;
    return best;
  }
  function first(cues, text, floor) {
    var at = -1, sub = text.slice(floor);
    cues.forEach(function (re) { var m = re.exec(sub); if (m) { var x = floor + m.index + (m[0].length - m[0].replace(/^[^\p{L}\p{N}]+/u, '').length); if (at < 0 || x < at) at = x; } });
    return at;
  }
  function bounds(c) {   // c.b[j] = where item j starts in the transcript (j ≥ 1); item 0 starts at 0
    var text = c.text, it = c.items;
    if (c.a0 == null) { c.a0 = first(cuesFor(it[0], null), text, 0); if (c.a0 < 0) { c.a0 = null; if (text.length < 160) return; c.a0 = 0; } }   // "I found 12 …" before item 1 is not item 2
    for (var j = 1; j < it.length; j++) {
      if (c.b[j] != null) continue;
      var floor = (j === 1 ? c.a0 : (c.b[j - 1] || 0)) + 6; if (floor >= text.length) return;
      var at = first(cuesFor(it[j], it[j - 1]), text, floor);
      if (at < 0) return;   // not yet in the words that arrived
      c.b[j] = clauseStart(text, at, floor - 5);
      if (c.b[j] <= (c.b[j - 1] || 0)) c.b[j] = at;
    }
  }
  function fallback(c) {   // the whole answer is known and some item was never named clearly: share the rest of the words evenly
    var it = c.items, text = c.text, j0 = 1; while (j0 < it.length && c.b[j0] != null) j0++;
    if (j0 >= it.length) return;
    var from = c.b[j0 - 1] || 0, rest = it.length - j0 + 1, step = (text.length - from) / rest;
    for (var j = j0; j < it.length; j++) c.b[j] = Math.round(from + step * (j - j0 + 1));
    c.fell = true;
  }
  function tick() {
    var c = st.cur; if (!c || c.done || !c.t0) return;
    var spoken = (Date.now() - c.t0) / 1000 * rate(), j = 0;
    for (var k = 1; k < c.items.length; k++) if (c.b[k] != null && c.b[k] <= spoken) j = k;
    if (j !== c.j) { c.j = j; light(c.items[j], 'voice:' + (j + 1)); }
  }
  // ---- events from the voice call (ai.js) ----
  function respStart(id) {
    if (st.cur && !st.cur.done) finish(false);
    if (!st.pend) { st.cur = null; return; }
    st.cur = { id: id || null, items: st.pend.items, why: st.pend.why, text: '', b: [0], j: 0, t0: 0, done: false };
    st.pend = null; trace('follow:' + st.cur.items.length);
  }
  function mine(c, rid) { return !(c.id && rid && rid !== c.id); }   // words of another answer (a "still looking" line) are not this one's
  function text(full, rid) {
    var c = st.cur; if (!c || c.done || !mine(c, rid)) return; c.text = String(full || '');
    bounds(c);
  }
  function textDone(full, rid) { var c = st.cur; if (!c || c.done || !mine(c, rid)) return; c.text = String(full || c.text); bounds(c); fallback(c); c.full = true; }
  function audioStart() {
    var c = st.cur; if (!c || c.done || c.t0) return;
    c.t0 = Date.now(); clearInterval(st.timer); st.timer = setInterval(tick, 120);
  }
  function audioStop(cleared) {
    var c = st.cur; if (!c || c.done) return;
    if (cleared) { if (!c.t0) return false; trace('frozen:' + (c.j + 1)); finish(true); return true; }
    if (c.t0 && c.full) learn(c.text.length, (Date.now() - c.t0) / 1000 - 0.3);
    if (c.full) { var last = 0; for (var k = 1; k < c.items.length; k++) if (c.b[k] != null) last = k; if (last !== c.j) { c.j = last; light(c.items[last], 'voice:end'); } }
    finish(false);
  }
  function respDone(hadWords) {   // an answer that only called another tool said nothing: its list waits for the next answer
    var c = st.cur; if (!c || c.t0 || hadWords || st.pend) return;
    st.pend = { items: c.items, why: c.why, at: Date.now() }; st.cur = null;
  }
  function finish(frozen) { var c = st.cur; clearInterval(st.timer); st.timer = null; if (c) { c.done = true; c.frozen = !!frozen; } }
  function freeze() { if (st.cur && !st.cur.done) { trace('frozen:' + (st.cur.j + 1)); finish(true); } }
  // what is lit now, for the AI ("this one" = that item) and for "show it"
  function current() {
    var tg = st.lit, R = S(); if (!tg) return null;
    if (tg.i != null && R.results[tg.i]) return { item: tg.i + 1, short_name: nameOf(R.results[tg.i]), store: R.results[tg.i].store, in_results: true };
    if (tg.p) return { number: tg.n || null, short_name: nameOf(tg.p), store: tg.p.store || '', in_results: false };
    return null;
  }
  function showCurrent() { var tg = st.lit; if (tg && light(tg, 'cmd')) return current(); var R = S(); if (R.results && R.results.length) { var i = R.spot >= 0 ? R.spot : Math.max(0, (R.shown || 1) - 3); light({ i: Math.min(i, R.results.length - 1) }, 'cmd'); return current(); } return null; }
  function reset() { st.pend = null; finish(false); st.cur = null; st.lit = null; var R = S(); R.spot = -1; Array.prototype.forEach.call(document.querySelectorAll('.spot'), function (x) { x.classList.remove('spot'); x.removeAttribute('data-spot'); }); clearSpots(); }

  root.AIN_SHOW = { plan: plan, pick: pick, light: light, fromTool: fromTool, afterRender: afterRender, respStart: respStart, respDone: respDone, text: text, textDone: textDone,
    audioStart: audioStart, audioStop: audioStop, freeze: freeze, current: current, showCurrent: showCurrent, reset: reset, clearSpots: clearSpots,
    _state: function () { return st; }, _bounds: function (items, txt) { var c = { items: items, text: txt, b: [0] }; bounds(c); return c.b; }, _cues: cuesFor, rate: rate, log: function () { return st.log.slice(); } };
})(typeof window !== 'undefined' ? window : globalThis);
