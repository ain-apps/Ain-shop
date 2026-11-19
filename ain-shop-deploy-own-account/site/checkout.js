/* AIN Shop — voice checkout + "my list" + camera. The AI drives all of it through tools (ai.js); every step also has a big button.
   Payment always happens on the store's own site: AIN Shop never asks for, sees, reads or stores card details. The camera photo of an
   item goes to our server once to be recognised and is not stored. "My list" lives only in this phone's storage (localStorage). */
(function () {
  'use strict';
  var APP = function () { return window.BAIN_APP; };
  function t(k, v) { return APP().t(k, v); }
  function $(id) { return document.getElementById(id); }
  var C = { co: null, busy: false, cam: null };
  function fmt(price, cur) { if (price == null) return t('priceUnknown'); if (!cur) return String(price); try { return new Intl.NumberFormat(window.BAIN_I18N.speech(), { style: 'currency', currency: cur || 'USD' }).format(price); } catch (e) { return (cur || '$') + ' ' + price; } }
  function aiOn() { return window.BAIN_AI && BAIN_AI.active(); }
  function say(txt) { if (aiOn()) return; APP().sayNative(txt); }

  // ---------------- checkout: the exact item, price, shipping, returns → the shortest path to the store's payment page ----------------
  function prepare(i, qty, choice, opts) {
    var S = APP().S, p = S.results[i]; if (!p) return Promise.resolve({ error: 'no_item' });
    C.busy = true; render(); APP().status(t('coLoading'));
    var c = window.AbortController ? new AbortController() : null, tm = c ? setTimeout(function () { c.abort(); }, 25000) : null;
    return fetch('/api/shop/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: c ? c.signal : undefined,
      body: JSON.stringify({ url: p.url, store: p.store, quantity: qty || 1, choice: choice || '' }) })
      .then(function (r) { return r.json().catch(function () { return { error: 'bad_answer' }; }); })
      .catch(function () { return { error: 'offline' }; })
      .then(function (j) { if (tm) clearTimeout(tm); return j && j.retry_from_phone ? fromPhone(p, j, qty, choice) : j; })
      .then(function (j) {
        C.busy = false;
        if (j.error) { C.co = { i: i, error: j.error, info: { title: p.title, store: p.store, url: p.url, path: 'product_page', checkout_url: p.url, handoff: 'coHelpProduct', quantity: qty || 1, price: p.price, currency: p.currency } }; }
        else { if (j.price == null && p.price != null) { j.price = p.price; j.currency = j.currency || p.currency; j.price_source = 'search listing (not checked on the store page)'; j.total = Math.round(p.price * (j.quantity || 1) * 100) / 100; }
          if (!j.currency) j.currency = p.currency || null; if (!j.title) j.title = p.title; C.co = { i: i, info: j }; }
        if (!(opts && opts.quiet)) picked(C.co.info, 'buy', p);   // "buy again" memory (history.js); a price check for Buy again is quiet
        APP().S.chosen = i; APP().render(); render(); APP().status('');
        return C.co;
      });
  }
  // the store's server refused ours ("too many requests"): this phone reads the store's public Shopify product data itself and sends it
  function fromPhone(p, j0, qty, choice) {
    var o, h; try { o = new URL(p.url).origin; h = (new URL(p.url).pathname.match(/\/products\/([^\/?#]+)/) || [])[1]; } catch (e) { return j0; }
    if (!h) return j0;
    function get(u) { var c = window.AbortController ? new AbortController() : null, tm = c ? setTimeout(function () { c.abort(); }, 8000) : null; return fetch(u, { credentials: 'omit', signal: c ? c.signal : undefined }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }).then(function (x) { if (tm) clearTimeout(tm); return x; }); }
    return Promise.all([get(o + '/products/' + h + '.js'), get(o + '/meta.json')]).then(function (rs) {
      if (!rs[0]) return j0;
      return fetch('/api/shop/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: p.url, store: p.store, quantity: qty || 1, choice: choice || '', shopify_js: rs[0], shop_currency: rs[1] && rs[1].currency }) })
        .then(function (r) { return r.json(); }).catch(function () { return j0; });
    });
  }
  function goLabel(info) { var s = info.store || ''; return info.path === 'checkout' ? t('coGo', { store: s }) : info.path === 'cart' ? t('coGoCart', { store: s }) : t('coGoPage', { store: s }); }
  function remember(info) { try { localStorage.setItem('bain:lastco', JSON.stringify({ store: info.store, title: info.title, path: info.path, handoff: info.handoff || 'coHelpProduct', at: Date.now() })); } catch (e) {} }
  function lastCo() { try { var x = JSON.parse(localStorage.getItem('bain:lastco') || 'null'); return x && Date.now() - x.at < 6 * 3600 * 1000 ? x : null; } catch (e) { return null; } }
  // the "buy again" memory on this phone (history.js): the search listing's own name, link and photo, the checked price when there is one
  function picked(f, how, p) {
    if (!window.BAIN_HIST || !f) return null;
    if (!p && C.co && C.co.info === f) p = APP().S.results[C.co.i];
    if (p && f.url && p.url !== f.url && f.store && p.store !== f.store) p = null;
    var src = p || f, checked = f.price != null && !/search listing/.test(String(f.price_source || ''));
    return BAIN_HIST.record({ title: src.title || f.title, short: src.short, store: src.store || f.store, url: src.url || f.url, image: src.image || f.image, price: checked ? f.price : (src.price != null ? src.price : f.price), currency: (checked ? f.currency : src.currency) || f.currency, variant: f.variant }, how);
  }
  function pickedGroup(gr) { if (gr && gr.items) gr.items.forEach(function (x) { if (window.BAIN_HIST) BAIN_HIST.record(x, 'list_checkout'); }); }
  // voice: the page itself goes to the store (no tap needed — a new tab opened without a tap is blocked on iPhone); Back returns here
  function go(info, fromVoice) {
    info = info || (C.co && C.co.info); if (!info || !info.checkout_url) return false;
    remember(info); if (info.group) pickedGroup(info.group); else picked(info, 'checkout'); APP().status(t('coLeaving', { store: info.store || '' }));
    if (fromVoice) { try { location.assign(info.checkout_url); } catch (e) { return false; } }
    return true;
  }
  function helpText(key) { var lc = lastCo(); key = key || (C.co && C.co.info && C.co.info.handoff) || (lc && lc.handoff) || 'coHelpProduct'; return t(key) + ' ' + t('cardHelp'); }

  // ---------------- my list (this phone only) ----------------
  function list() { try { var a = JSON.parse(localStorage.getItem('bain:basket') || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function saveList(a) { try { localStorage.setItem('bain:basket', JSON.stringify(a.slice(0, 50))); } catch (e) {} render(); }
  function addToList(info) {
    if (!info || !info.url) return null;
    var a = list(), v = info.variant || null;
    var e = { title: String(info.title || '').slice(0, 140), store: info.store || '', url: info.url, origin: (function () { try { return new URL(info.url).origin; } catch (x) { return ''; } })(),
      platform: info.platform || 'other', variant_id: v ? v.id : null, variant: v ? v.title : '', qty: info.quantity || 1, price: info.price != null ? info.price : null, currency: info.currency || null,
      checkout_url: info.checkout_url || info.url, path: info.path || 'product_page', handoff: info.handoff || 'coHelpProduct', added: Date.now() };
    var same = a.find(function (x) { return x.url === e.url && String(x.variant_id) === String(e.variant_id); });
    if (same) same.qty = Math.min(99, same.qty + e.qty); else a.push(e);
    saveList(a); picked(info, 'list'); APP().announce(t('listAdded', { title: e.title })); return e;
  }
  function removeFromList(n) { var a = list(); if (n < 1 || n > a.length) return null; var x = a.splice(n - 1, 1)[0]; saveList(a); return x; }
  function groups() { var g = {}, order = []; list().forEach(function (x, k) { var key = x.origin || x.store; if (!g[key]) { g[key] = { store: x.store, origin: x.origin, items: [] }; order.push(key); } g[key].items.push(Object.assign({ n: k + 1 }, x)); }); return order.map(function (k) { return g[k]; }); }
  // one store's items → one link: Shopify takes them all in one cart link (/cart/<id>:<qty>,<id>:<qty>); others one item at a time
  function groupCheckout(gr) {
    var shop = gr.items.filter(function (x) { return x.platform === 'shopify' && x.variant_id; });
    if (shop.length === gr.items.length && shop.length) return { store: gr.store, path: 'checkout', handoff: 'coHelpShopify', title: shop.map(function (x) { return x.title; }).join(', '), checkout_url: gr.origin + '/cart/' + shop.map(function (x) { return x.variant_id + ':' + x.qty; }).join(','), count: shop.length, one_at_a_time: false };
    var first = gr.items[0];
    return { store: gr.store, path: first.path, handoff: first.handoff, title: first.title, checkout_url: first.checkout_url, count: 1, one_at_a_time: gr.items.length > 1, left: gr.items.length - 1 };
  }

  // ---------------- camera: hold the item up, the picture is taken when steady ----------------
  function camSupported() { return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia); }
  function camOpen(onResult) {
    if (C.cam) return Promise.resolve({ ok: true, already: true });
    if (window.BAIN_BC && BAIN_BC.scanning()) BAIN_BC.stop();
    var box = $('camBox'), vid = $('camVid'); if (!box || !vid) return Promise.resolve({ error: 'no_camera_ui' });
    C.cam = { onResult: onResult, steady: 0, last: null, t0: Date.now(), done: false };
    if (!camSupported()) { C.cam = null; return Promise.resolve({ error: 'no_camera', fallback: 'file' }); }
    return navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false }).then(function (stream) {
      if (!C.cam) { stream.getTracks().forEach(function (x) { x.stop(); }); return { error: 'closed' }; }
      C.cam.stream = stream; vid.srcObject = stream; vid.setAttribute('playsinline', ''); vid.muted = true; try { vid.play(); } catch (e) {}
      box.hidden = false; APP().status(t('camGuide')); say(t('camGuide'));
      C.cam.timer = setInterval(steadyCheck, 300);
      return { ok: true };
    }).catch(function (e) { C.cam = null; APP().status(t('camDenied')); return { error: e && e.name === 'NotAllowedError' ? 'camera_not_allowed' : 'camera_failed' }; });
  }
  function steadyCheck() {   // tiny grey frame every 0.3 s; ~2 s with little change (after the first 1.5 s) = steady → take it
    var c = C.cam, vid = $('camVid'); if (!c || c.done || !vid || !vid.videoWidth) return;
    var cv = document.createElement('canvas'); cv.width = 32; cv.height = 24; var x = cv.getContext('2d'); x.drawImage(vid, 0, 0, 32, 24);
    var d = x.getImageData(0, 0, 32, 24).data, g = new Array(768), diff = 0, k;
    for (k = 0; k < 768; k++) g[k] = (d[k * 4] + d[k * 4 + 1] + d[k * 4 + 2]) / 3;
    if (c.last) { for (k = 0; k < 768; k++) diff += Math.abs(g[k] - c.last[k]); diff /= 768; }
    c.last = g;
    if (c.last && diff < 6) c.steady++; else c.steady = 0;
    // v7: "what is this" tries the barcode first — every frame is also given to the barcode reader while we wait for a steady picture
    if (window.BAIN_BC && !c.bcBusy) { c.bcBusy = true; BAIN_BC.decodeSource(vid, 1280).then(function (hit) { c.bcBusy = false; if (hit && hit.text && C.cam === c && !c.done) barcodeHit(hit, 'camera'); }); }
    if (Date.now() - c.t0 > 1500 && c.steady >= 7) take();
    if (Date.now() - c.t0 > 25000) take();
  }
  function barcodeHit(hit, via) { var c = C.cam; if (!c || c.done) return; c.done = true; var cb = c.onResult; camClose(); BAIN_BC.foundHit(hit, via).then(function (r) { if (cb) cb(r); }); }
  function camClose() { var c = C.cam; C.cam = null; if (!c) return; clearInterval(c.timer); if (c.stream) c.stream.getTracks().forEach(function (x) { x.stop(); }); var box = $('camBox'); if (box) box.hidden = true; var vid = $('camVid'); if (vid) vid.srcObject = null; }
  function shrink(src, w, h) { var s = Math.min(1, 1024 / Math.max(w, h)), cv = document.createElement('canvas'); cv.width = Math.round(w * s); cv.height = Math.round(h * s); cv.getContext('2d').drawImage(src, 0, 0, cv.width, cv.height); return cv.toDataURL('image/jpeg', 0.8); }
  function take() {
    var c = C.cam, vid = $('camVid'); if (!c || c.done || !vid || !vid.videoWidth) return false;
    c.done = true; var img = shrink(vid, vid.videoWidth, vid.videoHeight), cb = c.onResult, still = null;
    if (window.BAIN_BC) { still = document.createElement('canvas'); still.width = vid.videoWidth; still.height = vid.videoHeight; still.getContext('2d').drawImage(vid, 0, 0); }
    camClose();
    withBarcode(still, img).then(function (r) { if (cb) cb(r); });
    return true;
  }
  // a still picture: read a barcode in it first (exact product facts); else the AI picture description — and if the AI could read
  // valid barcode digits in the photo, those are looked up too
  function withBarcode(still, dataUrl) {
    var BC = window.BAIN_BC;
    return (BC && still ? BC.decodeSource(still, 1600) : Promise.resolve(null)).then(function (hit) {
      if (hit && hit.text) return BC.foundHit(hit, 'photo_scan');
      return identify(dataUrl).then(function (r) {
        if (!BC || !r || !r.barcode_ok || !r.barcode) return r;
        return BC.resolve({ text: r.barcode, format: 'photo' }, 'photo').then(function (b) { if (b.lookup && b.lookup.found) { b.photo = r; return b; } return r; });
      });
    });
  }
  function identify(dataUrl) {
    APP().status(t('camLooking')); say(t('camLooking'));
    return fetch('/api/shop/identify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: dataUrl, lang: APP().S.lang }) })
      .then(function (r) { return r.json().catch(function () { return { error: 'bad_answer' }; }); }).catch(function () { return { error: 'offline' }; })
      .then(function (j) { APP().status(j.identified ? t('camSaw', { d: j.description }) : (j.error ? '' : t('camNotFound'))); return j; });
  }
  function fromFile(file, cb) {   // the photo picker fallback (when the live camera is not available)
    if (!file) return; var fr = new FileReader();
    fr.onload = function () { var im = new Image(); im.onload = function () { withBarcode(im, shrink(im, im.naturalWidth, im.naturalHeight)).then(cb); }; im.src = fr.result; };
    fr.readAsDataURL(file);
  }
  // what happens with a camera result when no AI conversation is on: say it, then search for it
  function camResultNoAI(r) {
    if (r && r.kind && window.BAIN_BC) { APP().sayNative(BAIN_BC.speakText(r)); return; }
    if (!r || r.error || !r.identified) { APP().sayNative(r && r.tip ? t('camNotFound') : t('camNotFound')); return; }
    APP().sayNative(t('camSaw', { d: r.description }));
    APP().search({ query: r.search_query });
  }
  function camButton() {
    if (aiOn()) { BAIN_AI.tell('The user tapped the Camera button. Call camera_open now.'); return; }
    if (!camSupported()) { var f = $('camFile'); if (f) f.click(); return; }
    camOpen(camResultNoAI).then(function (r) { if (r && r.error) { var f = $('camFile'); if (f && r.error !== 'camera_not_allowed') f.click(); else APP().sayNative(t('camDenied')); } });
  }

  // ---------------- screen ----------------
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function btn(txt, fn, cls) { var b = el('button', cls || '', txt); b.type = 'button'; b.addEventListener('click', function (e) { e.stopPropagation(); fn(); }); return b; }
  function render() {
    var sec = $('coSec'), box = $('coBox');
    if (sec && box) {
      box.innerHTML = '';
      if (C.busy) { sec.hidden = false; box.appendChild(el('p', 'hint', t('coLoading'))); }
      else if (C.co) {
        sec.hidden = false; var f = C.co.info;
        box.appendChild(el('h3', 'co-title', f.title || ''));
        if (C.co.error) box.appendChild(el('p', 'hint', t('coFail')));
        if (f.variant && f.variant.title && !/^default/i.test(f.variant.title)) box.appendChild(el('p', '', t('coVariant', { v: f.variant.title })));
        if (f.needs_choice) box.appendChild(el('p', 'warn', t('coChoose', { options: (f.options || []).map(function (o) { return o.name + ': ' + o.values.slice(0, 12).join(', '); }).join(' · ') })));
        if (f.path === 'sold_out') box.appendChild(el('p', 'warn', t('coSoldOut')));
        box.appendChild(el('p', '', t('coQty', { n: f.quantity || 1 })));
        box.appendChild(el('p', 'p-price', t('coPrice', { price: fmt(f.price, f.currency), total: fmt(f.total != null ? f.total : (f.price != null ? f.price * (f.quantity || 1) : null), f.currency) })));
        box.appendChild(el('p', '', f.shipping && f.shipping.text ? t('coShip', { text: f.shipping.text }) : t('coShipNone')));
        box.appendChild(el('p', 'p-del' + (f.delivery && f.delivery.text ? '' : ' none'), f.delivery && f.delivery.text ? '\uD83D\uDE9A ' + t('delStore', { text: f.delivery.text }) : t('delCheck')));   // v14: how fast, only as the store page says
        box.appendChild(el('p', '', f.returns && f.returns.text ? t('coRet', { text: f.returns.text }) : t('coRetNone')));
        box.appendChild(el('p', '', t('coStore', { store: f.store || '' })));
        var act = el('div', 'p-actions');
        if (f.checkout_url) { var a = el('a', 'btn', goLabel(f)); a.href = f.checkout_url; a.rel = 'noopener noreferrer'; a.addEventListener('click', function () { remember(f); picked(f, 'checkout'); if (aiOn()) BAIN_AI.stop('checkout'); }); act.appendChild(a); }
        if (f.url && !f.needs_choice && f.path !== 'sold_out') act.appendChild(btn(t('coAdd'), function () { addToList(f); }));
        act.appendChild(btn(t('coHelpBtn'), function () { APP().sayNative(helpText()); }));
        act.appendChild(btn(t('cardHelpBtn'), function () { APP().sayNative(t('cardHelp')); }));
        box.appendChild(act);
      } else sec.hidden = true;
    }
    var ls = $('listSec'), lb = $('listBox');
    if (ls && lb) {
      var a2 = list(); ls.hidden = !a2.length; lb.innerHTML = '';
      if (a2.length) {
        // v18: one cart per store — its items, its total, its own checkout button (the same links as before: affiliate tracking unchanged)
        groups().forEach(function (g) {
          var box2 = el('div', 'cartBox'), ST = window.BAIN_STORES, tt = ST ? ST.totals(g.items) : null;
          var h3 = el('h3', 'cartH', tt ? t('cartLine', { store: g.store, n: tt.count, total: tt.text }) : t('cartOf', { store: g.store }));
          box2.appendChild(h3);
          var ol = el('ol', 'mylist');
          g.items.forEach(function (x) { var k = x.n - 1; var li = el('li'); li.value = x.n; li.appendChild(el('span', '', x.title + (x.variant && !/^default/i.test(x.variant) ? ' · ' + x.variant : '') + ' · ×' + x.qty + ' · ' + fmt(x.price, x.currency) + ' · ' + x.store)); var rb = btn(t('listRemove'), function () { removeFromList(k + 1); }, 'small'); rb.setAttribute('aria-label', t('listRemove') + ': ' + x.title); li.appendChild(rb); ol.appendChild(li); });
          box2.appendChild(ol);
          var gc = groupCheckout(g); var a3 = el('a', 'btn', t('listCheckout', { store: g.store })); a3.href = gc.checkout_url; a3.rel = 'noopener noreferrer'; a3.addEventListener('click', function () { remember(gc); pickedGroup(g); if (aiOn()) BAIN_AI.stop('checkout'); });
          var act2 = el('div', 'p-actions'); act2.appendChild(a3); box2.appendChild(act2);
          lb.appendChild(box2);
        });
        if (groups().length > 1 && window.BAIN_STORES) { var cs = BAIN_STORES.carts(); lb.appendChild(el('p', 'p-price cartsSum', t('cartsSum', { n: cs.stores.length, total: cs.total_text }))); }
        lb.appendChild(el('p', 'hint', t('listNote')));
      }
    }
    var bk = $('coBack'), lc = lastCo();
    if (bk) { bk.hidden = !lc || !!C.co; if (lc) bk.textContent = t('coBack', { store: lc.store || '' }); }
    var cb = $('camBtn'); if (cb) cb.textContent = t('camBtn');
    var ct = $('camTake'); if (ct) ct.textContent = t('camTake'); var cc = $('camClose'); if (cc) cc.textContent = t('camClose');
    var ch = $('coH'); if (ch) ch.textContent = t('coH'); var lh = $('listH'); if (lh) lh.textContent = groups().length > 1 ? t('cartsH') : t('listH');
    if (window.BAIN_STORES) try { BAIN_STORES.render(); } catch (e) {}   // the store buttons show each cart's count
  }
  function buyButton(i) {
    var p = APP().S.results[i];
    var b = btn(t('buy'), function () {
      prepare(i, 1, '').then(function (co) {
        var f = co.info; var sec = $('coSec'); if (sec) try { sec.scrollIntoView({ block: 'start' }); $('coH').focus(); } catch (e) {}
        if (aiOn()) return BAIN_AI.tell('The user tapped Buy on item ' + (i + 1) + '. Call checkout_prepare for item ' + (i + 1) + ' and confirm the details out loud.');
        say([f.title, f.price != null ? fmt(f.price, f.currency) : '', f.shipping && f.shipping.text ? t('coShip', { text: f.shipping.text }) : t('coShipNone'), f.delivery && f.delivery.text ? t('delStore', { text: f.delivery.text }) : t('delCheck'), f.returns && f.returns.text ? t('coRet', { text: f.returns.text }) : t('coRetNone'), t('coStore', { store: f.store || '' })].filter(Boolean).join('. '));
      });
    });
    b.setAttribute('aria-label', t('buyAt', { store: p ? p.store : '' }) + ': ' + (p ? (window.AIN_TEXT ? AIN_TEXT.shortName(p) : p.title) : ''));   // v21: the short name (like the other buttons) and which store sells it
    return b;
  }
  function init() {
    var cb = $('camBtn'); if (cb) cb.addEventListener('click', function (e) { e.stopPropagation(); camButton(); });
    var ct = $('camTake'); if (ct) ct.addEventListener('click', function (e) { e.stopPropagation(); if (window.BAIN_BC && BAIN_BC.scanning()) BAIN_BC.take(); else take(); });
    var cc = $('camClose'); if (cc) cc.addEventListener('click', function (e) { e.stopPropagation(); camClose(); if (window.BAIN_BC) BAIN_BC.stop(); if (aiOn()) BAIN_AI.tell('The user closed the camera.'); });
    var cf = $('camFile'); if (cf) cf.addEventListener('change', function () { var file = cf.files && cf.files[0]; cf.value = ''; fromFile(file, function (r) { if (aiOn()) BAIN_AI.tell(camTellText(r)); else camResultNoAI(r); }); });
    var bk = $('coBack'); if (bk) bk.addEventListener('click', function (e) { e.stopPropagation(); if (aiOn()) BAIN_AI.tell('The user asked for checkout help. Call checkout_help.'); else APP().sayNative(helpText()); });
    render();
  }
  function camTellText(r) {
    if (r && r.kind && window.BAIN_BC) return BAIN_BC.tellText(r);
    if (!r || r.error) return 'Camera result: the picture could not be analysed right now (' + (r && r.error || 'error') + '). Say so briefly and offer to try again.';
    if (!r.identified) return 'Camera result: the item could not be identified. Tip: ' + (r.tip || 'more light, closer, label towards the camera') + '. Say this honestly in the person\'s language and offer to try again (camera_open).';
    return 'Camera result (AI from the photo, an impression, not certain): ' + JSON.stringify({ description: r.description, brand: r.brand, product: r.product, model_or_size: r.model_or_size, color: r.color, barcode: r.barcode, confidence: r.confidence, search_query: r.search_query }) + '. Say in one short sentence what you see ("from the picture it looks like…"), then say you are looking for where to buy it and call search_products with query "' + r.search_query + '".';
  }
  window.BAIN_CO = { prepare: prepare, go: go, current: function () { return C.co; }, helpText: helpText, lastCo: lastCo, list: list, addToList: addToList, removeFromList: removeFromList, groups: groups, groupCheckout: groupCheckout,
    camOpen: camOpen, camClose: camClose, take: take, camOpenNow: function () { return !!C.cam; }, camTellText: camTellText, identify: identify, render: render, buyButton: buyButton, remember: remember };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
