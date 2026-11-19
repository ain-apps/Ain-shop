/* AIN Shop v22 — "Track my delivery" and "Return an item" (Nati, Oct 28 2026). AIN Shop never sees store checkouts or orders, so it
   cannot track a parcel itself: it opens the STORE's own order-tracking or returns page (the person signs in there), for the stores in
   their "Buy again" history (history.js, this phone only) or a store they name. Known stores have a checked page (Oct 30 2026); any
   other store opens its home page with a plain hint where to look. Buttons #ordTrack / #ordReturn, voice tool order_help (ai.js),
   typed words (i18n ordCmdTrack / ordCmdReturn). Nothing is sent to our server and nothing new is stored. */
(function (root) {
  'use strict';
  // host → { n: name, t: order/tracking page, r: returns page, ta/ra: true when the page is the person's own account page (sign in) }
  var PAGES = {
    'walmart.com': { n: 'Walmart', t: 'https://www.walmart.com/orders', ta: 1, r: 'https://www.walmart.com/orders', ra: 1 },
    'target.com': { n: 'Target', t: 'https://www.target.com/orders', ta: 1, r: 'https://www.target.com/returns' },
    'amazon.com': { n: 'Amazon', t: 'https://www.amazon.com/gp/css/order-history', ta: 1, r: 'https://www.amazon.com/gp/css/order-history', ra: 1 },
    'bestbuy.com': { n: 'Best Buy', t: 'https://www.bestbuy.com/site/help-topics/how-to-track-your-order/pcmcat316000050014.c?id=pcmcat316000050014', r: 'https://www.bestbuy.com/site/help-topics/return-exchange-policy/pcmcat260800050014.c?id=pcmcat260800050014' },
    'costco.com': { n: 'Costco', t: 'https://customerservice.costco.com/app/answers/detail/a_id/1142', r: 'https://customerservice.costco.com/app/answers/answer_view/a_id/6874' },
    'ikea.com': { n: 'IKEA', t: 'https://www.ikea.com/us/en/customer-service/track-manage-order/', r: 'https://www.ikea.com/us/en/returns/' },
    'wayfair.com': { n: 'Wayfair', t: 'https://www.wayfair.com/track_package', ta: 1, r: 'https://www.wayfair.com/help/article/returns' },
    'homedepot.com': { n: 'Home Depot', t: 'https://www.homedepot.com/myaccount/guest-order-tracking', ta: 1, r: 'https://www.homedepot.com/c/Return_Policy' },
    'lowes.com': { n: "Lowe's", t: 'https://www.lowes.com/mylowes/orders/checkorderstatus', ta: 1, r: 'https://www.lowes.com/l/help/returns-policy' },
    'macys.com': { n: "Macy's", t: 'https://www.macys.com/customer-service/articles/how-can-i-track-my-order', r: 'https://www.macys.com/returns' },
    'cvs.com': { n: 'CVS', t: 'https://www.cvs.com/retail/help/help-subtopic-order-status-tracking', r: 'https://www.cvs.com/retail/help/return_policy' },
    'walgreens.com': { n: 'Walgreens', t: 'https://www.walgreens.com/orderhistory/orders-ui', ta: 1, r: 'https://www.walgreens.com/topic/help/shophelp/returns_help_main.jsp' },
    'kroger.com': { n: 'Kroger', r: 'https://www.kroger.com/hc/help/returns' },
    'ebay.com': { n: 'eBay', t: 'https://www.ebay.com/mye/myebay/purchase', ta: 1, r: 'https://www.ebay.com/help/buying/returns-refunds/return-item-refund?id=4041' },
    'samsclub.com': { n: "Sam's Club", t: 'https://help.samsclub.com/app/answers/detail/a_id/185', r: 'https://help.samsclub.com/app/answers/detail/a_id/128' },
    'chewy.com': { n: 'Chewy', t: 'https://www.chewy.com/app/account/orderhistory', ta: 1, r: 'https://www.chewy.com/customer-care/returns/making-a-return/start-a-return' },
    'etsy.com': { n: 'Etsy', t: 'https://www.etsy.com/your/purchases', ta: 1, r: 'https://help.etsy.com/hc/en-us/articles/115015440807' },
    'nordstrom.com': { n: 'Nordstrom', t: 'https://www.nordstrom.com/my-account/order-lookup', ta: 1, r: 'https://www.nordstrom.com/browse/customer-service/return-policy' }
  };
  var O = { kind: null, pending: null };
  function APP() { return root.BAIN_APP; }
  function HIST() { return root.BAIN_HIST; }
  function t(k, v) { return APP() ? APP().t(k, v) : (root.BAIN_I18N ? root.BAIN_I18N.t(k, v) : k); }
  function $(id) { return root.document ? root.document.getElementById(id) : null; }
  function aiOn() { return !!(root.BAIN_AI && root.BAIN_AI.active()); }
  function hostOf(url) { try { return new URL(String(url)).hostname.toLowerCase().replace(/^(www|m|www2|shop)\./, ''); } catch (e) { return ''; } }
  function squash(s) { s = String(s || '').toLowerCase(); try { s = s.normalize('NFKD').replace(/[\u0300-\u036f]/g, ''); } catch (e) {} return s.replace(/['’`]/g, '').replace(/[^\p{L}\p{N}]+/gu, ''); }
  function known(host) { if (!host) return null; for (var h in PAGES) if (host === h || host.slice(-(h.length + 1)) === '.' + h) return h; return null; }
  // a store name the person said or typed ("walmart", "Best Buy", "וולמארט", "lowes") → a key of PAGES, else null
  function byName(name) {
    var n = name; if (root.BAIN_STORES && root.BAIN_STORES.norm) try { n = root.BAIN_STORES.norm(name) || name; } catch (e) {}
    var q = squash(n); if (!q) return null;
    for (var h in PAGES) { var a = squash(PAGES[h].n), b = squash(h.split('.')[0]); if (q === a || q === b || q === squash(h)) return h; }
    return null;
  }
  // the stores the person picked items from (newest first, one row per store), from "Buy again" on this phone
  function stores() {
    var H = HIST(), a = H ? H.all() : [], seen = {}, out = [];
    a.forEach(function (e) {
      var host = hostOf(e.url), k = known(host) || host; if (!k || seen[k]) return; seen[k] = 1;
      var origin = ''; try { origin = new URL(String(e.url)).origin + '/'; } catch (x) {}
      if (!/^https:\/\//.test(origin)) return;
      out.push({ key: k, store: (PAGES[k] && PAGES[k].n) || e.store || host, origin: origin, last_item: e.name || e.title, last_picked: e.last });
    });
    return out;
  }
  // where to send the person for one store: { store, url, known, account }
  function pageFor(row, kind) {
    var P = PAGES[row.key], u = P && (kind === 'return' ? P.r : P.t);
    if (u) return { store: P.n, url: u, known: true, account: !!(kind === 'return' ? P.ra : P.ta) };
    return { store: row.store, url: row.origin, known: false, account: false };
  }
  function fromName(name) {
    var k = byName(name); if (k) return { key: k, store: PAGES[k].n, origin: 'https://www.' + k + '/' };
    var list = stores(), q = squash(name);
    for (var i = 0; i < list.length; i++) if (q && (squash(list[i].store) === q || squash(list[i].key).indexOf(q) === 0)) return list[i];
    return null;
  }
  // choose the store: a store name, else words of an item in the history ("the milk"), else the only store; else ask
  function resolve(kind, store, item) {
    var list = stores(), row = null;
    if (store) row = fromName(store);
    if (!row && item && HIST()) { var i = HIST().find(item); if (i >= 0) { var e = HIST().all()[i], h = hostOf(e.url), k = known(h) || h; row = list.filter(function (r) { return r.key === k; })[0] || null; } }
    if (!row && !store && list.length === 1) row = list[0];
    if (row) { var p = pageFor(row, kind); p.kind = kind; return p; }
    return { kind: kind, ask: true, stores: list.map(function (r) { return r.store; }), unknown_store: store || null };
  }
  function sentence(p) {
    if (!p.known) return t(p.kind === 'return' ? 'ordUnknownReturn' : 'ordUnknownTrack', { store: p.store });
    return t(p.kind === 'return' ? 'ordOpenReturn' : 'ordOpenTrack', { store: p.store }) + ' ' + t(p.account ? 'ordHowAcct' : 'ordHowHelp');
  }
  function say(txt) { if (!txt || aiOn()) return; if (APP()) { APP().sayNative(txt); APP().announce(txt); } }
  function status(txt) { if (APP()) APP().status(txt); }
  // open a store page: from a tap it simply opens; from voice the phone may block it → the next tap anywhere opens it
  function open(p) {
    if (!p || !p.url) return false;
    var w = null; try { w = root.open(p.url, '_blank'); if (w) { try { w.opener = null; } catch (e) {} } } catch (e) { w = null; }
    if (w) { O.pending = null; return true; }
    O.pending = p; var m = t('tapToOpen', { store: p.store }); status(m); if (APP()) APP().announce(m);
    return false;
  }
  if (root.document) root.document.addEventListener('pointerdown', function (e) {
    if (!O.pending) return; var p = O.pending; O.pending = null;
    if (e.target && e.target.closest && e.target.closest('a.ordLink')) return;   // the link itself opens it
    e.preventDefault(); e.stopPropagation();
    var w = root.open(p.url, '_blank'); if (w) { try { w.opener = null; } catch (x) {} } else root.location.href = p.url;
  }, true);

  // ---- the panel under the two buttons ----
  function el(tag, cls, txt) { var x = root.document.createElement(tag); if (cls) x.className = cls; if (txt != null) x.textContent = txt; return x; }
  function render() {
    var bt = $('ordTrack'), br = $('ordReturn'); if (bt) bt.textContent = t('ordTrackBtn'); if (br) br.textContent = t('ordReturnBtn');
    var sec = $('ordSec'), box = $('ordBox'), h = $('ordH'); if (!sec || !box) return;
    if (!O.kind) { sec.hidden = true; box.innerHTML = ''; return; }
    var kind = O.kind; sec.hidden = false; box.innerHTML = '';
    if (h) h.textContent = t(kind === 'return' ? 'ordReturnBtn' : 'ordTrackBtn');
    box.appendChild(el('p', 'hint', t('ordNote')));
    var list = stores();
    if (!list.length) box.appendChild(el('p', 'p-meta', t(kind === 'return' ? 'ordNoneReturn' : 'ordNone')));   // v28: the Return panel's example is a return (was "track my Walmart order")
    else {
      if (list.length > 1) box.appendChild(el('p', 'p-meta', t('ordPick')));
      var ul = el('ul', 'ordList');
      list.slice(0, 8).forEach(function (r) {
        var p = pageFor(r, kind), li = el('li'), a = el('a', 'btn big ordLink', t(kind === 'return' ? 'ordLinkReturn' : 'ordLinkTrack', { store: p.store }));
        a.href = p.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.setAttribute('data-store', r.key);
        a.setAttribute('aria-describedby', 'newTabNote');
        a.addEventListener('click', function () { O.pending = null; var m = sentence(p); status(m); say(m); });
        li.appendChild(a);
        if (r.last_item) li.appendChild(el('p', 'p-meta', r.last_item));
        ul.appendChild(li);
      });
      box.appendChild(ul);
    }
    box.appendChild(el('p', 'hint', t('ordOther')));
    var c = el('button', 'small', t('ordClose')); c.type = 'button'; c.addEventListener('click', function (e) { e.stopPropagation(); close(); var b = $(kind === 'return' ? 'ordReturn' : 'ordTrack'); if (b) try { b.focus(); } catch (x) {} });
    box.appendChild(c);
  }
  function show(kind) {
    O.kind = kind; render();
    var sec = $('ordSec'), h = $('ordH'); if (sec) try { sec.scrollIntoView({ block: 'start' }); } catch (e) {}
    var list = stores(), first = sec && sec.querySelector('a.ordLink');
    var m = list.length ? (list.length === 1 ? t(kind === 'return' ? 'ordLinkReturn' : 'ordLinkTrack', { store: pageFor(list[0], kind).store }) : t('ordPick')) : t(kind === 'return' ? 'ordNoneReturn' : 'ordNone');
    status(m);
    if (first && list.length === 1) try { first.focus(); } catch (e) {} else if (h) try { h.focus(); } catch (e) {}
    say(t('ordNote') + ' ' + m);
  }
  function close() { O.kind = null; render(); }
  function button(kind) {
    show(kind);
    if (aiOn()) root.BAIN_AI.tell('The user tapped the "' + (kind === 'return' ? 'Return an item' : 'Track my delivery') + '" button; the screen now shows one button per store from their history (' + (forAI() || 'none yet') + '). Say in one or two short sentences, in their language: AIN Shop does not hold orders, the store does; tap your store to open its ' + (kind === 'return' ? 'returns' : 'order') + ' page, or say the store name. Do not call order_help unless they say a store.');
  }
  // voice (ai.js tool order_help) and typed words: one step
  function start(kind, store, item, fromTap) {
    kind = kind === 'return' ? 'return' : 'track';
    var p = resolve(kind, store, item);
    if (p.ask) { show(kind); return p; }
    var m = sentence(p); status(m);
    if (fromTap) open(p);
    return p;
  }
  // typed: "track my Walmart order", "where is my order", "return an item from Target"
  function phr(k) { return String(t(k) || '').toLowerCase().split(/\s*[,،、，]\s*/).filter(function (x) { return x.length >= 3 || /[\u3000-\u9fff\uac00-\ud7af]/.test(x) && x.length >= 2; }); }
  function storeIn(text) {   // a store named anywhere in the words, also glued to a prefix ("ב-walmart", "chez walmart", "וולמארט")
    for (var h in PAGES) {
      var nm = PAGES[h].n.toLowerCase(), names = [nm, nm.replace(/['’]/g, ''), nm.replace(/['’]s\b/g, ''), h, h.split('.')[0]];
      for (var i = 0; i < names.length; i++) if (names[i].length >= 3 && text.indexOf(names[i]) >= 0) return { key: h, words: names[i] };
    }
    var list = stores(); for (var j = 0; j < list.length; j++) { var s = String(list[j].store || '').toLowerCase(); if (s.length >= 3 && text.indexOf(s) >= 0) return { key: list[j].key, words: s }; }
    if (root.BAIN_STORES && root.BAIN_STORES.norm) { var k = null; try { k = byName(root.BAIN_STORES.norm(text)); } catch (e) {} if (k) return { key: k, words: '' }; }
    return null;
  }
  function kindOf(text) {   // the words with and without spaces (Chinese/Japanese write no spaces: "查Walmart订单" → "查订单")
    var tr = phr('ordCmdTrack'), rt = phr('ordCmdReturn'), flat = text.replace(/\s+/g, ''), i;
    function has(w) { return text.indexOf(w) >= 0 || (w.replace(/\s+/g, '').length >= 2 && flat.indexOf(w.replace(/\s+/g, '')) >= 0); }
    for (i = 0; i < rt.length; i++) if (has(rt[i])) return 'return';
    for (i = 0; i < tr.length; i++) if (has(tr[i])) return 'track';
    return null;
  }
  function command(raw) {
    var text = String(raw || '').toLowerCase().replace(/\s+/g, ' ').trim(); if (!text) return null;
    var s = storeIn(text), rest = s && s.words ? text.split(s.words).join(' ').replace(/\s+/g, ' ').trim() : text;
    var kind = kindOf(rest) || kindOf(text); if (!kind) return null;
    var p = start(kind, s ? s.key : null, null, true);
    if (!p.ask) { O.kind = kind; render(); say(sentence(p)); }
    return kind;
  }
  function _kind(text) { var st = storeIn(text), rest = st && st.words ? text.split(st.words).join(' ').replace(/\s+/g, ' ').trim() : text; var k = kindOf(rest) || kindOf(text); return k ? { kind: k, key: st ? st.key : null } : null; }
  function forAI() { return stores().map(function (r) { return r.store; }).join(', '); }
  function init() {
    var bt = $('ordTrack'), br = $('ordReturn');
    if (bt) bt.addEventListener('click', function (e) { e.stopPropagation(); button('track'); });
    if (br) br.addEventListener('click', function (e) { e.stopPropagation(); button('return'); });
    render();
  }
  root.BAIN_ORDERS = { PAGES: PAGES, hostOf: hostOf, known: known, byName: byName, stores: stores, pageFor: pageFor, resolve: resolve, sentence: sentence, start: start, open: open, show: show, close: close, render: render, command: command, _kind: _kind, forAI: forAI, _state: function () { return O; } };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.BAIN_ORDERS;
  if (root.document) { if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', init); else init(); }
})(typeof window !== 'undefined' ? window : globalThis);
