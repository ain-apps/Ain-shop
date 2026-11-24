/* AIN Shop — the screen: language, results list, opening the store's page, location. The voice conversation is ai.js. */
(function () {
  'use strict';
  var I = window.BAIN_I18N;
  var S = { lang: 'en', results: [], total: 0, partial: false, query: null, shown: 0, chosen: -1, spot: -1, details: {}, place: null, searchedAt: 0, pendingOpen: null };
  // first visit: the phone's own language list picks one of the 50 (I.pick); after that the person's choice is remembered
  try { var sv = localStorage.getItem('bain:lang'); S.lang = sv && I.LANGS[sv] ? sv : I.pick(navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'en']); } catch (e) { S.lang = 'en'; }
  var $ = function (id) { return document.getElementById(id); };
  function t(k, v) { return I.t(k, v); }

  function applyLang() {
    I.set(S.lang);
    document.documentElement.lang = S.lang; document.documentElement.dir = I.dir();
    Array.prototype.forEach.call(document.querySelectorAll('[data-i18n]'), function (el) {
      var v = null; try { v = JSON.parse(el.getAttribute('data-i18n-v') || 'null'); } catch (e) {}
      el.textContent = t(el.getAttribute('data-i18n'), v);
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-i18n-label]'), function (el) { el.setAttribute('aria-label', t(el.getAttribute('data-i18n-label'))); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-i18n-ph]'), function (el) { el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph'))); });
    langButton();
    if (S.results.length) render();
    if (window.BAIN_HIST) BAIN_HIST.render();
    if (window.BAIN_WATCH) BAIN_WATCH.render();   // v32: price drop alerts
    if (window.BAIN_LOC) BAIN_LOC.render();
    if (window.BAIN_CORR) BAIN_CORR.render();
    // v22: the camera / barcode buttons and the orders panel follow the language at once (they only changed with a results list before,
    // so a language picked by voice or in the list left "Scan barcode" and "Camera: what is this?" in English)
    if (window.BAIN_CO) try { BAIN_CO.render(); } catch (e) {}
    if (window.BAIN_BC) try { BAIN_BC.i18n(); } catch (e) {}
    if (window.BAIN_ORDERS) try { BAIN_ORDERS.render(); } catch (e) {}
    if (window.BAIN_AI) BAIN_AI.ui();
  }
  function setLang(l) { l = I.code(l); if (!l) return false; S.lang = l; try { localStorage.setItem('bain:lang', l); } catch (e) {} applyLang(); return l; }

  // ---- the language picker: one big button in the header opens a list of all languages, each written in its own name ----
  function langButton() {
    var b = $('langBtn'); if (!b) return; var L = I.LANGS[S.lang];
    b.textContent = '';
    var g = document.createElement('span'); g.setAttribute('aria-hidden', 'true'); g.className = 'globe'; g.textContent = '🌐'; b.appendChild(g);
    var n = document.createElement('span'); n.textContent = L.name; n.setAttribute('lang', S.lang); b.appendChild(n);
    b.setAttribute('aria-label', t('langBtnLabel', { name: L.name })); b.setAttribute('aria-haspopup', 'dialog'); b.setAttribute('aria-expanded', langOpen() ? 'true' : 'false');
  }
  function langOpen() { var d = $('langDlg'); return !!(d && (d.open || d.getAttribute('data-open') === '1')); }
  // v22: the list is in A–Z order by the name shown (each language's own name; Latin names A–Z first, then the other alphabets)
  function langOrder() {
    var C = null; try { C = new Intl.Collator('en', { sensitivity: 'base' }); } catch (e) {}
    return I.list().slice().sort(function (x, y) { var a = I.LANGS[x].name, b = I.LANGS[y].name; return C ? C.compare(a, b) : (a < b ? -1 : a > b ? 1 : 0); });
  }
  function buildLangList() {
    var ul = $('langList'); if (!ul) return; ul.innerHTML = '';
    langOrder().forEach(function (code) {
      var L = I.LANGS[code], li = document.createElement('li'), b = document.createElement('button');
      b.type = 'button'; b.className = 'langItem'; b.setAttribute('lang', code); b.setAttribute('dir', L.dir); b.setAttribute('data-lang', code);
      b.textContent = L.name;
      if (code === S.lang) { b.setAttribute('aria-current', 'true'); b.className += ' current'; }
      b.addEventListener('click', function (e) { e.stopPropagation(); chooseLang(code); });
      li.appendChild(b); ul.appendChild(li);
    });
  }
  function openLang() {
    var d = $('langDlg'); if (!d) return;
    $('langTitle').textContent = t('langTitle'); $('langHint').textContent = t('langHint'); $('langClose').textContent = t('langClose');
    setTexts();
    d.setAttribute('lang', S.lang); d.setAttribute('dir', I.dir());
    buildLangList();
    if (d.showModal) { try { d.showModal(); } catch (e) { d.setAttribute('open', ''); } } else d.setAttribute('open', '');
    d.setAttribute('data-open', '1'); langButton();
    var cur = d.querySelector('.langItem.current') || d.querySelector('.langItem'); if (cur) setTimeout(function () { try { cur.focus({ preventScroll: true }); d.scrollTop = 0; } catch (e) {} }, 30);   // v23: opens at the top, so Settings (delete my data) is in sight; focus stays on the current language
  }
  // v23 (Nati, Oct 31: "I tried to delete my account" from Settings): a Settings part at the top of this dialog with the big delete button.
  // The heading and the no-account line are in English and Hebrew; other languages show only the (translated) button.
  function setTexts() {
    var own = I.LANGS[S.lang] && I.LANGS[S.lang].s, h = $('setH'), b = $('setClear'), n = $('setClearNote'); if (!b) return;
    if (h) { h.hidden = !(own && own.setH); h.textContent = t('setH'); }
    b.textContent = t('clearBtn');
    if (n) { n.hidden = !(own && own.clearNoAcct); n.textContent = t('clearNoAcct'); }
    speedTexts();   // v25
    var sec = $('setSec'); if (sec) { sec.setAttribute('lang', S.lang); if (h && h.hidden) sec.setAttribute('aria-label', t('clearBtn')); else sec.removeAttribute('aria-label'); }
  }
  // v25 (Nati, Nov 1): Response speed — how long a voice call waits after he stops talking (Fast ~300 ms, Normal ~450 ms = default, Slow ~800 ms).
  // Kept on this phone (localStorage bain:speed); ai.js reads it for the turn detection. English + Hebrew labels; other languages show English.
  function speedOf() { var v = ''; try { v = localStorage.getItem('bain:speed') || ''; } catch (e) {} return /^(fast|slow)$/.test(v) ? v : 'normal'; }
  function speedTexts() {
    var box = $('speedSec'); if (!box) return;
    var own = I.LANGS[S.lang] && I.LANGS[S.lang].s && I.LANGS[S.lang].s.speedH; box.setAttribute('lang', own ? S.lang : 'en'); box.setAttribute('dir', own ? I.dir() : 'ltr');
    $('speedH').textContent = t('speedH'); $('speedHint').textContent = t('speedHint');
    var cur = speedOf(), K = { fast: 'speedFast', normal: 'speedNormal', slow: 'speedSlow' };
    Array.prototype.forEach.call(box.querySelectorAll('button[data-speed]'), function (b) { var k = b.getAttribute('data-speed'); b.textContent = t(K[k]); b.setAttribute('aria-pressed', k === cur ? 'true' : 'false'); });
  }
  function setSpeed(k) {
    try { if (k === 'normal') localStorage.removeItem('bain:speed'); else localStorage.setItem('bain:speed', k); } catch (e) {}
    speedTexts();
    var msg = t('speedSet', { s: t({ fast: 'speedFast', normal: 'speedNormal', slow: 'speedSlow' }[k]) }); status(msg); announce(msg);
    if (window.BAIN_AI && BAIN_AI.speedChanged) BAIN_AI.speedChanged();
    return msg;
  }
  // v27: the speed by voice / typed words ("faster", "wait longer", "normal speed", "מהר יותר", "what's my speed?"). Outside a call the phone's own voice says it.
  function speedCmd(v, strict) {
    var k = window.BAIN_INTENT && BAIN_INTENT.speed ? BAIN_INTENT.speed(v, strict) : null; if (!k) return null;
    var msg;
    if (k === 'ask') { msg = t('speedSet', { s: t({ fast: 'speedFast', normal: 'speedNormal', slow: 'speedSlow' }[speedOf()]) }); status(msg); announce(msg); }
    else msg = setSpeed(k);
    return { cmd: k, speed: k === 'ask' ? speedOf() : k, msg: msg };
  }
  function speedTyped(v) { var r = speedCmd(v); if (!r) return false; setTimeout(function () { sayNative(r.msg); }, 400); return true; }
  function closeLang() {
    var d = $('langDlg'); if (!d) return;
    if (d.close && d.open) { try { d.close(); } catch (e) {} } d.removeAttribute('open'); d.setAttribute('data-open', '0');
    langButton(); try { $('langBtn').focus(); } catch (e) {}
  }
  function chooseLang(code) {
    var before = S.lang; setLang(code); closeLang();
    var msg = t('langChanged', { name: I.LANGS[S.lang].name }); status(msg); announce(msg);
    if (S.lang !== before && window.BAIN_AI && BAIN_AI.active()) BAIN_AI.langChanged(S.lang);
  }
  function status(txt) { var s = $('status'); if (s) s.textContent = txt || ''; var m = $('camMsg'); if (m) m.textContent = txt || ''; }
  function announce(txt) { var a = $('announce'); if (!a) return; a.textContent = ''; setTimeout(function () { a.textContent = txt; }, 60); }

  function ago(ts) { if (!ts) return ''; var m = Math.round((Date.now() - ts) / 60000); return m < 1 ? t('justNow') : m < 60 ? t('minAgo', { n: m }) : t('hAgo', { n: Math.round(m / 60) }); }
  function money(p) { if (p.price == null) return t('priceUnknown'); try { return new Intl.NumberFormat(I.speech(), { style: 'currency', currency: p.currency || 'USD' }).format(p.price); } catch (e) { return '$' + p.price; } }
  function srcLine(p) { return p.price_source === 'store_page' ? t('priceChecked', { store: p.store, ago: ago(p.checked_at) }) : p.price_source === 'store_api' ? t('priceApi', { store: p.store }) : t('priceSearch'); }

  function shortName(p) { try { return window.AIN_TEXT ? AIN_TEXT.shortName(p) : String(p.title || ''); } catch (e) { return String(p.title || ''); } }
  function render() {
    if (window.BAIN_CO) try { BAIN_CO.render(); } catch (e) {}
    if (window.BAIN_BC) try { BAIN_BC.i18n(); } catch (e) {}
    if (window.BAIN_STORES) try { BAIN_STORES.render(); } catch (e) {}
    var sec = $('resultsSec'), ol = $('results'); if (!sec || !ol) return;
    sec.hidden = !S.results.length && !S.query;
    var qx = S.query ? '\u2068' + S.query.query + '\u2069' : '';   // the search words keep their own direction inside a Hebrew/Arabic sentence
    var atStore = window.BAIN_STORES && BAIN_STORES.active();   // v18: the heading says which store this list belongs to
    $('resultsH').textContent = S.query ? (atStore ? '\u2068' + atStore.name + '\u2069 · ' : '') + t('results', { q: qx }) + ' · ' + t('resultsCount', { n: S.total || S.results.length }) : '';   // v34: the heading says how many good results were found in total, not just how many are on this page
    var sk = document.querySelector('a.skip');   // the skip link exists only once there are results to skip to (never "Results for “”")
    if (sk) { sk.hidden = !S.query; sk.textContent = S.query ? t('results', { q: qx }) : ''; }
    $('where').textContent = S.query && S.query.near ? t('where', { place: S.query.near }) : '';
    ol.innerHTML = '';
    if (S.query && !S.results.length) { var li0 = document.createElement('li'); li0.textContent = t('noResults'); ol.appendChild(li0); return; }
    S.results.forEach(function (p, i) {
      var li = document.createElement('li'); li.id = 'p' + i; if (i === S.chosen) li.classList.add('chosen'); if (i === S.spot) { li.classList.add('spot'); li.setAttribute('data-spot', 'kept'); }   // v30: the item being read stays lit
      var d = S.details[i] || {};
      var name = shortName(p), img = null;
      if (p.image && /^https:\/\//.test(p.image)) {   // the store's own product photo (no grey box when there is none)
        img = document.createElement('img'); img.className = 'img'; img.src = p.image; img.loading = 'lazy'; img.decoding = 'async';
        img.alt = ''; img.setAttribute('referrerpolicy', 'no-referrer');   // v21: decorative — the name is the heading just above and the photo description (when asked) is its own line, so a screen reader does not hear the name twice
        img.onerror = function () { this.remove(); li.classList.remove('has-img'); };
        li.classList.add('has-img');
      }
      var box = document.createElement('div');
      var h = document.createElement('h3'); h.className = 'p-title'; h.textContent = name; box.appendChild(h);
      var pr = document.createElement('p'); pr.className = 'p-price'; pr.textContent = money(p) + ' · ' + p.store; box.appendChild(pr);
      var meta = []; if (p.rating != null) meta.push(t('stars', { r: p.rating })); if (p.reviews != null) meta.push(t('reviews', { n: p.reviews })); if (p.in_stock === true) meta.push(t('inStock')); if (p.in_stock === false) meta.push(t('outStock'));
      if (p.brand && name.toLowerCase().indexOf(String(p.brand).toLowerCase()) < 0) meta.unshift(p.brand); if (p.color) meta.push(p.color);
      if (meta.length) { var me = document.createElement('p'); me.className = 'p-meta'; me.textContent = meta.join(' · '); box.appendChild(me); }
      if (p.local) { var lo = document.createElement('p'); lo.className = 'p-meta'; lo.textContent = p.local; box.appendChild(lo); }
      // v14: how fast — only the store page's own words; when the person asked for the fastest way and the page says nothing: check at checkout
      if (p.delivery) { var dl = document.createElement('p'); dl.className = 'p-meta p-del'; dl.textContent = '\uD83D\uDE9A ' + t('delStore', { text: p.delivery }); box.appendChild(dl); }
      else if (S.query && S.query.fast) { var dc = document.createElement('p'); dc.className = 'p-meta p-del none'; dc.textContent = t('delCheck'); box.appendChild(dc); }
      var sl = document.createElement('p'); sl.className = 'p-src ' + p.price_source; sl.textContent = srcLine(p); box.appendChild(sl);
      if (d.looks) { var lk = document.createElement('p'); lk.className = 'p-look'; lk.textContent = d.looks; box.appendChild(lk); }
      var act = document.createElement('div'); act.className = 'p-actions';
      var a = document.createElement('a'); a.className = 'btn'; a.href = p.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = t('openAt', { store: p.store }); a.setAttribute('aria-describedby', 'newTabNote');   // v21: says the store opens in a new tab
      a.addEventListener('click', function () { S.chosen = i; li.classList.add('chosen'); if (window.BAIN_HIST) BAIN_HIST.record(p, 'open'); });
      var dbtn = document.createElement('button'); dbtn.type = 'button'; dbtn.textContent = t('describe'); dbtn.setAttribute('aria-label', t('describe') + ': ' + name);
      dbtn.addEventListener('click', function () { describeOut(i); });
      act.appendChild(a); if (window.BAIN_CO) act.appendChild(BAIN_CO.buyButton(i)); act.appendChild(dbtn);
      li.appendChild(box); if (img) li.appendChild(img); li.appendChild(act); ol.appendChild(li);
    });
  }

  // ---- data from the server ----
  function postJSON(path, body, ms) {
    var c = window.AbortController ? new AbortController() : null, tm = c ? setTimeout(function () { c.abort(); }, ms || 45000) : null;
    return fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: c ? c.signal : undefined })
      .then(function (r) { return r.json().catch(function () { return { error: 'bad_answer' }; }).then(function (j) { j._status = r.status; return j; }); })
      .catch(function (e) { return { error: e && e.name === 'AbortError' ? 'timeout' : 'offline' }; })
      .then(function (j) { if (tm) clearTimeout(tm); return j; });
  }
  function searchBody(args, raw) {
    // raw = a background check (price drops): no store move, no place change — the person stays where they are
    if (!raw && window.BAIN_STORES) args = BAIN_STORES.scope(Object.assign({}, args));   // v18: each store keeps its own place; a search made at a store stays in that store
    var body = { query: args.query, stores: args.stores || [], min_price: args.min_price, max_price: args.max_price, near: args.near || '', near_me: !!args.near_me, country: args.country || 'US', currency: args.currency || 'USD' };
    // v14: the saved ZIP (only the ZIP/town, from location.js) goes with a fastest-delivery / pickup / near-me search, and with every search once allowed
    if (args.fast) body.fast = args.fast === 'pickup' ? 'pickup' : 'delivery';
    // v32: a price-drop check asks for a genuinely fresh search — the server skips its cache read and write for it (never a cached answer)
    if (args.fresh) body.fresh = true;
    var la = window.BAIN_LOC && BAIN_LOC.args();
    if (la && la.zip && !body.near && (args.near_me || body.fast || BAIN_LOC.consent() === 'yes' || (BAIN_LOC.get() || {}).how === 'typed')) { body.zip = la.zip; body.loc = la.loc; }
    if (!body.near && !body.zip && args.near_me && S.place) { body.near = [S.place.city, S.place.region, S.place.country].filter(Boolean).join(', '); body.loc = { city: S.place.city, region: S.place.region, country: S.place.country }; }
    return body;
  }
  // v34: the same ranking for the first answer and for the rest when they fill in — favorite stores first (nothing removed), then the feedback nudge
  function rankResults(list) {
    try { if (window.BAIN_FAVORITES && BAIN_FAVORITES.isFavorite) { var _f = list.filter(function (p) { return BAIN_FAVORITES.isFavorite(p.store); }); var _o = list.filter(function (p) { return !BAIN_FAVORITES.isFavorite(p.store); }); if (_f.length && _o.length) list = _f.concat(_o); } } catch (e) {}
    try { if (window.BAIN_FEED && BAIN_FEED.ranked) list = BAIN_FEED.ranked(list); } catch (e) {}
    return list;
  }
  var fillSeq = 0;   // v34: a new search cancels the fill-in still asking for the last one
  // v34 (speed): the first answer came back early (partial:true) while the rest
  // are still being checked — ask for the same search again every few seconds.
  // Each ask is a free cache hit until the full list lands, then the list grows
  // in place: the top 3 already spoken stay where they are, the rest appear
  // below them and by asking for more.
  function fillIn(body) {
    var seq = ++fillSeq, tries = 0;
    (function poll() {
      if (seq !== fillSeq || tries++ >= 11) { if (seq === fillSeq) S.partial = false; return; }   // about 45 seconds, then stop asking
      setTimeout(function () {
        if (seq !== fillSeq) return;
        postJSON('/api/shop/search', body, 50000).then(function (j2) {
          if (seq !== fillSeq) return;
          if (!j2 || j2.error) { S.partial = false; return; }
          if (j2.partial) { poll(); return; }
          S.results = rankResults(j2.products || []);
          S.total = (typeof j2.total === 'number' && j2.total >= 0) ? j2.total : S.results.length;
          S.partial = false;
          try { if (window.BAIN_CONVO && BAIN_CONVO.rememberSearch) BAIN_CONVO.rememberSearch(S.query.query || body.query, S.results); } catch (e) {}
          render(); status(t('resultsCount', { n: S.total || S.results.length }));
          if (window.BAIN_AI && BAIN_AI.resultsIn) try { BAIN_AI.resultsIn(); } catch (e) {}
          if (window.BAIN_AI && BAIN_AI.moreIn) try { BAIN_AI.moreIn(S.total); } catch (e) {}   // the voice hears the rest arrived, next time they ask for more
        });
      }, 4000);
    })();
  }
  function search(args) {
    status(t('searching'));
    var body = searchBody(args);
    return postJSON('/api/shop/search', body, 50000).then(function (j) {
      if (j.error) { status(''); return j; }
      S.results = j.products || []; S.total = (typeof j.total === 'number' && j.total >= 0) ? j.total : S.results.length; S.partial = !!j.partial;   // v34: the server's true count of good matches (before the top-3 cut); old answers without it fall back to the list length
      S.query = j.query || body; S.shown = 0; S.chosen = -1; S.spot = -1; S.details = {}; S.searchedAt = j.searched_at || Date.now();
      fillSeq++;   // a new search cancels any fill-in still asking for the last one
      // v33: favorite stores first (stable — nothing is removed, the broad search stays broad), then the
      // feedback ranking (at most a small nudge), then the conversation remembers what was found
      S.results = rankResults(S.results);
      try { if (window.BAIN_CONVO && BAIN_CONVO.rememberSearch) BAIN_CONVO.rememberSearch(S.query.query || body.query, S.results); } catch (e) {}
      render(); status(t('resultsCount', { n: S.total || S.results.length }));
      try { var rs = $('resultsSec'); if (rs && !rs.hidden && S.results.length && rs.scrollIntoView) rs.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (e) {}   // v21: the results come into view (the focus is not moved, so a talking screen reader is not cut off)
      if (window.BAIN_STORES) BAIN_STORES.landed();
      if (window.BAIN_AI && BAIN_AI.resultsIn) try { BAIN_AI.resultsIn(); } catch (e) {}   // no stale "Still checking the stores…" / "Connecting…" once results are here
      if (j.partial) fillIn(body);   // v34: the rest are still being checked — they fill in by themselves
      return j;
    });
  }
  // v32: a search that does NOT touch the results on screen and does NOT move the person to another store (price-drop checks).
  // Same request as search(), but the answer comes back as data only. Pass fresh:true for a genuinely fresh search.
  function searchRaw(args) { return postJSON('/api/shop/search', searchBody(args, true), 50000); }
  // v33: natural-language commands in any of the 50 languages. The exact tables (AIN_VCMD) and every
  // feature's own commands have already said no by now; this is the last resort before a product search.
  // A command runs (with a yes/no box first for buy/pay/delete); a question is already spoken out loud;
  // a product is searched as usual. Never runs anything on a guess.
  async function tryLangFallback(v) {
    try {
      var r = await BAIN_LANGFALLBACK.interpret(v, S.lang);
      if (r && r.command) {
        if (r.needsConfirm) {
          if (window.AIN_VCMD && AIN_VCMD.ask) AIN_VCMD.ask(r.confirmQuestion, function () { BAIN_LANGFALLBACK.handle(v, S.lang, 'typed'); }, 'typed');
          else BAIN_LANGFALLBACK.handle(v, S.lang, 'typed');
          return;
        }
        BAIN_LANGFALLBACK.handle(v, S.lang, 'typed');
        return;
      }
      if (r && r.askedQuestion) return;   // she already asked "did you mean …?" — wait for the answer
    } catch (e) {}
    typedSearch(v);
  }
  // a typed search without the AI (no microphone, no voice call): results on screen, the screen reader lands on them
  function typedSearch(v, extra) {
    var args = window.AIN_TEXT ? AIN_TEXT.parseTyped(v) : { query: v };
    if (extra) for (var k in extra) if (extra[k] != null) args[k] = extra[k];
    // v35 (place choice): "search in England" asked what to buy — the next
    // search uses that place instead of the saved area. The pending place is
    // always taken (cleared) here, so a search naming its own place does not
    // leave a stale place behind for the search after it.
    if (window.BAIN_LOC && BAIN_LOC.takePendingPlace) { var pp = BAIN_LOC.takePendingPlace(); if (pp && !args.near) args.near = pp; }
    announce(t('searching'));
    var sp = window.BAIN_STORES && BAIN_STORES.active();   // v18: at a store read from its own site, a typed search looks inside that store
    var run = sp && sp.site && !(args.stores && args.stores.length) ? storeOpen({ site: sp.site, query: args.query }) : search(args);
    return run.then(function (j) {
      if (j && j.error) { var m = j.error === 'off_topic' ? t('offTopic') : j.error === 'rate_limited' ? t('limit') : j.error === 'offline' ? t('offline') : t('noResults'); status(m); announce(m); return j; }
      var h = $('resultsH'); if (h) { try { h.focus({ preventScroll: false }); } catch (e) { h.focus(); } }
      return j;
    });
  }
  function getJSON(u, ms) { var c = new AbortController(), tm = setTimeout(function () { c.abort(); }, ms || 10000); return fetch(u, { signal: c.signal }).then(function (r) { return r.json(); }).catch(function () { return { error: 'network' }; }).finally(function () { clearTimeout(tm); }); }
  function noticeSeen() { try { return localStorage.getItem('bain:notice') === '1'; } catch (e) { return false; } }
  function markNotice() { try { localStorage.setItem('bain:notice', '1'); } catch (e) {} }
  function storeOpen(args) {   // "open <store>": read that store's own site; its products become the current list
    status(t('readingStore', { s: args.site || '' }));
    if (window.BAIN_STORES) BAIN_STORES.beforeStore(args);   // v18: the store opens as its own place
    return postJSON('/api/shop/store', { site: args.site, query: args.query || '' }, 50000).then(function (j) {
      if (j.error) { status(''); if (window.BAIN_STORES) BAIN_STORES.storeFailed(); return j; }
      S.storeMode = { store: j.store, url: j.url };
      if (j.products && j.products.length) { S.results = j.products; S.total = (typeof j.total === 'number' && j.total >= 0) ? j.total : j.products.length; S.partial = false; fillSeq++; S.query = { query: args.query || '', stores: [j.store] }; S.shown = 0; S.chosen = -1; S.spot = -1; S.details = {}; S.searchedAt = Date.now();
        try { if (window.BAIN_FEED && BAIN_FEED.ranked) S.results = BAIN_FEED.ranked(S.results); } catch (e) {}
        try { if (window.BAIN_CONVO && BAIN_CONVO.rememberSearch) BAIN_CONVO.rememberSearch(S.query.query, S.results); } catch (e) {}
        render(); }
      if (window.BAIN_STORES) BAIN_STORES.storeLanded(j, args);
      status(j.readable ? t('storeOpened', { s: j.store }) : t('storeBlocked', { s: j.store }));
      return j;
    });
  }
  function partners() { return getJSON('/api/stores/partners', 10000); }
  function details(i) {
    var p = S.results[i]; if (!p) return Promise.resolve({ error: 'no_such_item' });
    if (S.details[i]) return Promise.resolve(S.details[i]);
    return postJSON('/api/shop/details', { url: p.url, store: p.store, image: p.image }, 30000).then(function (j) {
      if (!j.error) { S.details[i] = j; if (j.image && !p.image) p.image = j.image; render(); }
      return j;
    });
  }
  function describeOut(i) {   // the Describe button without the AI: the phone voice reads what the picture shows
    if (window.AIN_SHOW) try { AIN_SHOW.pick(i, 'describe'); } catch (e) {}   // v30: describe and show
    details(i).then(function (d) {
      var p = S.results[i], txt = d && d.looks ? d.looks : t('noResults');
      if (window.BAIN_AI && BAIN_AI.active()) return BAIN_AI.tell('The user tapped Describe on item ' + (i + 1) + ' (' + p.title + '). Tell them briefly what it looks like from this photo description: ' + txt);
      sayNative(p.title + '. ' + txt);
    });
  }
  function sayNative(txt) { try { if (!window.speechSynthesis) return; speechSynthesis.cancel(); var u = new SpeechSynthesisUtterance(txt); u.lang = I.speech(); speechSynthesis.speak(u); } catch (e) {} }

  // ---- choosing: the store's own page opens; the person pays the store there ----
  function open(i, fromTap) {
    var p = S.results[i]; if (!p) return false;
    S.chosen = i; render();
    if (window.BAIN_HIST) BAIN_HIST.record(p, 'open');   // "buy again" memory, this phone only
    var w = null; try { w = window.open(p.url, '_blank'); if (w) { try { w.opener = null; } catch (e) {} } } catch (e) { w = null; }
    if (w) { status(t('opening', { store: p.store })); S.pendingOpen = null; return true; }
    // iPhone blocks a page opened without a tap: the next tap anywhere opens it
    S.pendingOpen = i; status(t('tapToOpen', { store: p.store })); announce(t('tapToOpen', { store: p.store }));
    var li = $('p' + i); if (li) { var a = li.querySelector('a.btn'); if (a) try { a.focus(); } catch (e) {} }
    return false;
  }
  document.addEventListener('pointerdown', function (e) {
    if (S.pendingOpen == null) return;
    var i = S.pendingOpen, p = S.results[i]; S.pendingOpen = null; if (!p) return;
    if (e.target && e.target.closest && e.target.closest('a.btn')) return;   // the link itself opens it
    e.preventDefault(); e.stopPropagation();
    var w = window.open(p.url, '_blank'); if (w) { try { w.opener = null; } catch (x) {} status(t('opening', { store: p.store })); } else { location.href = p.url; }
  }, true);

  // ---- where the person is ----
  function where(precise) {
    function name(j) { return [j.city, j.region, j.country].filter(Boolean).join(', '); }
    function approx() { return fetch('/api/geo').then(function (r) { return r.json(); }).then(function (j) { S.place = j; return { place: name(j), approximate: true, source: 'internet connection' }; }).catch(function () { return { error: 'unknown' }; }); }
    if (!precise || !navigator.geolocation) return approx();
    return new Promise(function (res) {
      var done = false; var tm = setTimeout(function () { if (!done) { done = true; approx().then(function (x) { x.note = 'the phone did not answer, used the internet connection'; res(x); }); } }, 12000);
      navigator.geolocation.getCurrentPosition(function (pos) {
        if (done) return; done = true; clearTimeout(tm);
        fetch('/api/geo/reverse?lat=' + pos.coords.latitude.toFixed(2) + '&lon=' + pos.coords.longitude.toFixed(2)).then(function (r) { return r.json(); })
          .then(function (j) { S.place = j; res({ place: name(j), approximate: false, source: 'phone location' }); }).catch(function () { approx().then(res); });
      }, function () { if (done) return; done = true; clearTimeout(tm); status(t('locDenied')); approx().then(function (x) { x.note = 'the person did not share the phone location'; x.denied = true; res(x); }); }, { timeout: 10000, maximumAge: 600000 });
    });
  }

  // visitor counter: one beacon per device per day (a random id on this phone; no personal data). Test runs say so and are counted apart.
  function countVisit() {
    try {
      var d = new Date().toISOString().slice(0, 10); if (localStorage.getItem('bain:hitDay') === d) return;
      var id = localStorage.getItem('bain:dev'), fresh = !id;
      if (!id) { id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)); localStorage.setItem('bain:dev', id); }
      var ua = navigator.userAgent || '', plat = /iPhone|iPod/.test(ua) ? 'iphone' : /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? 'ipad' : /Android/.test(ua) ? 'android' : 'computer';
      var test = !!navigator.webdriver || /[?&]test=1\b/.test(location.search) || /Headless/i.test(ua);
      fetch('/api/hit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id, new: fresh, platform: plat, lang: S.lang, test: test }), keepalive: true })
        .then(function (r) { if (r.ok) localStorage.setItem('bain:hitDay', d); }).catch(function () {});
    } catch (e) {}
  }

  // ---- buttons ----
  function init() {
    applyLang(); setTimeout(countVisit, 1500);
    if (window.BAIN_SHOPLIST && !window.BAIN_SHOPPINGLIST) window.BAIN_SHOPPINGLIST = window.BAIN_SHOPLIST;   // v33: the deals summary looks for BAIN_SHOPPINGLIST
    var nb = $('noticeOk'); if (nb) { if (noticeSeen()) $('notice').hidden = true; nb.addEventListener('click', function (e) { e.stopPropagation(); markNotice(); $('notice').hidden = true; $('talk').focus(); }); }
    $('langBtn').addEventListener('click', function () { if (langOpen()) closeLang(); else openLang(); });
    var dlg = $('langDlg');
    if (dlg) {
      $('langClose').addEventListener('click', function (e) { e.stopPropagation(); closeLang(); });
      dlg.addEventListener('cancel', function (e) { e.preventDefault(); closeLang(); });   // Escape / the phone's back gesture
      dlg.addEventListener('click', function (e) { if (e.target === dlg) closeLang(); });   // a tap outside the list
    }
    Array.prototype.forEach.call(document.querySelectorAll('#speedSec button[data-speed]'), function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); setSpeed(b.getAttribute('data-speed')); }); });   // v25
    var sc = $('setClear'); if (sc) sc.addEventListener('click', function (e) { e.stopPropagation(); if (window.AIN_LEGAL) AIN_LEGAL.ask({ lang: S.lang, from: sc, reload: true }); });   // v23
    $('talk').addEventListener('click', function () { if (window.BAIN_AI) BAIN_AI.toggle(); });
    var stb = $('setBtn'); if (stb) stb.addEventListener('click', function (e) { e.stopPropagation(); if (langOpen()) return; openLang(); setTimeout(function () { var h = $('setH'), sc = $('setClear'); try { (h && !h.hidden ? h : sc).focus({ preventScroll: true }); } catch (x) {} }, 60); });   // v28: a big Settings button on the main screen
    $('typeForm').addEventListener('submit', function (e) {
      e.preventDefault(); var v = $('typeIn').value.trim(); if (!v) return; $('typeIn').value = '';
      // typing never switches the microphone on: during a voice conversation the words join it; otherwise they are a plain search
      if (window.BAIN_AI && BAIN_AI.active()) return BAIN_AI.sendText(v);
      if (speedTyped(v)) return;   // v27: "faster", "wait longer", "normal speed", "what's my speed?"
      // v33: answer the question she just asked first — a yes/no confirmation, or an open question
      // ("how many?", "which one?"). Only consumes the words when something is actually waiting.
      if (window.BAIN_CONVO) { var _pr = BAIN_CONVO.handleReply(v); if (_pr) return; if (BAIN_CONVO.answerAsk && BAIN_CONVO.answerAsk(v)) return; }
      if (window.AIN_VCMD && AIN_VCMD.typed(v)) return;   // v28: every button by typing its whole-sentence command ("open settings", "what can I say", "go to checkout"…)
      if (window.AIN_LEGAL && AIN_LEGAL.command(v)) return;   // v23: "delete my data", "delete my account", "מחק את הנתונים שלי" → the yes/no box (never deletes by itself)
      if (window.BAIN_ORDERS && BAIN_ORDERS.command(v)) return;   // v22: "track my Walmart order", "where is my order", "return an item"
      if (window.BAIN_LOC && BAIN_LOC.command(v)) return;   // "fastest delivery milk", "pickup near me", "what's open near me", "forget my location"
      if (window.BAIN_HIST && BAIN_HIST.command(v)) return;   // "what did I buy last time", "buy the same milk again", "clear my history"
      if (window.BAIN_WATCH && BAIN_WATCH.command(v)) return;   // v32: "remember this item", "remember I'm looking for … below $…", "check my watched items"
      if (window.BAIN_FAVORITES && BAIN_FAVORITES.command(v)) return;   // v33: "add Walmart to my favorites", "my favorite stores"
      if (window.BAIN_SHOPLIST && BAIN_SHOPLIST.command(v)) return;   // v33: "add milk to my shopping list", "what's on my list"
      if (window.BAIN_REORDER && BAIN_REORDER.command(v)) return;   // v33: "reorder the coffee", "buy it again"
      if (window.BAIN_DEALS && BAIN_DEALS.command(v)) return;   // v33: "what deals at Walmart", "any deals today"
      if (window.BAIN_FEED && BAIN_FEED.command(v)) return;   // v33: "that was helpful", "that one was wrong"
      if (window.BAIN_ROUNDUP && BAIN_ROUNDUP.command(v)) return;   // v33: "what dropped today", "daily roundup"
      if (window.BAIN_CORR && BAIN_CORR.command(v)) return;   // "report a mistake"
      if (window.BAIN_STORES && BAIN_STORES.command(v)) return;   // v18: "go to Walmart", "other store", "all stores", "all my carts"
      if (window.BAIN_LANGFALLBACK) { tryLangFallback(v); return; }   // v33: natural phrasing in any language; a product falls through to a search
      typedSearch(v);
    });
  }
  window.BAIN_APP = { S: S, t: t, shortName: shortName, typedSearch: typedSearch, status: status, announce: announce, search: search, searchRaw: searchRaw, noticeSeen: noticeSeen, markNotice: markNotice, storeOpen: storeOpen, partners: partners, details: details, open: open, where: where, render: render, setLang: setLang, langOrder: langOrder, openLang: openLang, closeLang: closeLang, langOpen: langOpen, sayNative: sayNative, setSpeed: setSpeed, speedOf: speedOf, speedCmd: speedCmd, money: money, srcLine: srcLine, ago: ago };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
