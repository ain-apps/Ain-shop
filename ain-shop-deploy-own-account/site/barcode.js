/* AIN Shop v7 — barcode scanning for blind shoppers. Hold any product's barcode (UPC/EAN, also QR) to the back camera:
   beeps speed up when stripes are seen, spoken hints help find it, a chime + vibration when it is read, then the server looks the
   code up in free open product databases (never invented). The decoder is the phone's own BarcodeDetector when it has one, else
   zxing-wasm (zxing-cpp, MIT/Apache) bundled in /vendor — nothing loads from another site. After ~15 s without a read a photo goes
   to the picture endpoint to read the printed digits. Photos and codes are not stored on the phone. */
(function () {
  'use strict';
  var APP = function () { return window.BAIN_APP; };
  function t(k, v) { return APP() ? APP().t(k, v) : k; }
  function $(id) { return document.getElementById(id); }
  function aiOn() { return window.BAIN_AI && BAIN_AI.active(); }
  var ZX_FORMATS = ['EAN13', 'EAN8', 'UPCA', 'UPCE', 'QRCode'];
  var NATIVE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'qr_code'];
  var B = { dec: null, decP: null, scan: null, last: null, beep: null, audio: null };

  // ---------------- decoder: native BarcodeDetector, else bundled zxing-wasm (loaded on first use) ----------------
  function forceZx() { try { return /[?&]bc=zxing/.test(location.search); } catch (e) { return false; } }
  function loadScript(src) { return new Promise(function (ok, no) { var s = document.createElement('script'); s.src = src; s.async = true; s.onload = ok; s.onerror = function () { no(new Error('load ' + src)); }; document.head.appendChild(s); }); }
  function decoder() {
    if (B.dec) return Promise.resolve(B.dec);
    if (B.decP) return B.decP;   // a page-local promise (this is the phone, not the server Worker)
    B.decP = Promise.resolve().then(function () {
      if (!forceZx() && window.BarcodeDetector && BarcodeDetector.getSupportedFormats) {
        return BarcodeDetector.getSupportedFormats().then(function (fs) {
          var want = NATIVE_FORMATS.filter(function (f) { return fs.indexOf(f) >= 0; });
          if (want.indexOf('ean_13') < 0) return null;
          var d = new BarcodeDetector({ formats: want });
          return { kind: 'native', read: function (cv) { return d.detect(cv).then(function (rs) { var r = rs && rs[0]; return r ? { text: r.rawValue, format: r.format } : null; }); } };
        }).catch(function () { return null; });
      }
      return null;
    }).then(function (nat) {
      if (nat) return nat;
      return (window.ZXingWASM ? Promise.resolve() : loadScript('vendor/zxing-reader.js')).then(function () {
        var wasmUrl = new URL('vendor/zxing_reader.wasm', location.href).href;
        return ZXingWASM.prepareZXingModule({ overrides: { locateFile: function (p, pre) { return /\.wasm$/.test(p) ? wasmUrl : pre + p; } }, fireImmediately: true });
      }).then(function () {
        return { kind: 'zxing', read: function (cv) {
          var x = cv.getContext('2d', { willReadFrequently: true }), id = x.getImageData(0, 0, cv.width, cv.height);
          return ZXingWASM.readBarcodes(id, { formats: ZX_FORMATS, tryHarder: true, tryRotate: true, tryInvert: false, maxNumberOfSymbols: 1 }).then(function (rs) {
            var r = (rs || []).filter(function (z) { return z.isValid && z.text; })[0]; return r ? { text: r.text, format: r.format } : null; });
        } };
      });
    }).then(function (d) { B.dec = d; B.decP = null; return d; }, function (e) { B.decP = null; throw e; });
    return B.decP;
  }
  // draw a video / image / canvas into a canvas no wider than maxW and read it
  function grab(src, maxW) {
    var w = src.videoWidth || src.naturalWidth || src.width, h = src.videoHeight || src.naturalHeight || src.height; if (!w || !h) return null;
    var s = Math.min(1, (maxW || 1280) / Math.max(w, h)), cv = document.createElement('canvas'); cv.width = Math.round(w * s); cv.height = Math.round(h * s);
    cv.getContext('2d', { willReadFrequently: true }).drawImage(src, 0, 0, cv.width, cv.height); return cv;
  }
  function decodeSource(src, maxW) { var cv = grab(src, maxW); if (!cv) return Promise.resolve(null); return decoder().then(function (d) { return d.read(cv); }).catch(function () { return null; }); }

  // ---------------- "is there a barcode-like region?" — stripes: many strong light/dark changes along rows, the same in neighbouring rows ----------------
  function stripeScore(data, w, h) {   // data: RGBA of a small frame (e.g. 160×120); returns 0..1
    function lum(i) { return (data[i] * 3 + data[i + 1] * 6 + data[i + 2]) / 10; }
    function along(horizontal) {   // bars cross the line many times, AND the next line shows the same pattern (bars, not noise)
      var lines = horizontal ? h : w, len = horizontal ? w : h, best = 0, run = 0, prevRow = null, x, y, a, b;
      for (a = 2; a < lines - 2; a += 2) {
        var flips = 0, prev = 0, last = -1, sum = 0, mn = 255, mx = 0, row = new Int8Array(len), v = new Float32Array(len);
        for (b = 0; b < len; b++) { x = horizontal ? b : a; y = horizontal ? a : b; v[b] = lum((y * w + x) * 4); sum += v[b]; if (v[b] < mn) mn = v[b]; if (v[b] > mx) mx = v[b]; }
        if (mx - mn < 60) { run = 0; prevRow = null; continue; }
        var mid = sum / len;
        for (b = 0; b < len; b++) { var s = v[b] > mid ? 1 : -1; row[b] = s; if (s !== prev) { if (prev && last >= 0 && b - last <= len / 12) flips++; prev = s; last = b; } }
        var agree = 0; if (prevRow) { for (b = 0; b < len; b++) if (row[b] === prevRow[b]) agree++; agree /= len; }
        prevRow = row;
        var sc = Math.min(1, flips / 28) * (agree > 0.8 ? 1 : agree > 0.7 ? 0.5 : 0);
        if (sc > 0.45) run++; else run = 0;
        best = Math.max(best, sc * Math.min(1, run / 5));
      }
      return best;
    }
    return Math.max(along(true), along(false));
  }
  function frameScore(vid) {
    try { var cv = document.createElement('canvas'); cv.width = 160; cv.height = 120; var x = cv.getContext('2d', { willReadFrequently: true }); x.drawImage(vid, 0, 0, 160, 120); return stripeScore(x.getImageData(0, 0, 160, 120).data, 160, 120); } catch (e) { return 0; }
  }

  // ---------------- sound: beeps that speed up, a chime when read ----------------
  // v22 static fix: the beeps' sound context is put to sleep (suspended) 1.5 s after the last beep, so it never keeps the phone's audio
  // output running in the background (a running context left after a scan = faint hiss on some iPhones, and next to a voice call).
  function ac() { try { if (!B.audio) { var A = window.AudioContext || window.webkitAudioContext; if (!A) return null; B.audio = new A(); } if (B.audio.state === 'suspended') B.audio.resume(); return B.audio; } catch (e) { return null; } }
  function sleepSoon(ms) { clearTimeout(B.sleepT); B.sleepT = setTimeout(function () { try { if (B.audio && B.audio.state === 'running' && B.audio.suspend) B.audio.suspend(); } catch (e) {} }, ms); }
  function tone(freq, ms, vol, at) { var a = ac(); if (!a) return; var o = a.createOscillator(), g = a.createGain(), t0 = a.currentTime + (at || 0); o.type = 'sine'; o.frequency.value = freq; g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol || 0.15, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000); o.connect(g); g.connect(a.destination); o.start(t0); o.stop(t0 + ms / 1000 + 0.02); sleepSoon(1500 + ((at || 0) * 1000) + ms); }
  function chime() { tone(1047, 120, 0.2, 0); tone(1319, 120, 0.2, 0.12); tone(1568, 220, 0.22, 0.24); try { if (navigator.vibrate) navigator.vibrate([60, 40, 120]); } catch (e) {} }
  function beepLoop() {
    var s = B.scan; if (!s || s.done) return;
    var sc = s.score || 0, gap = sc < 0.2 ? 1400 : Math.round(900 - 720 * Math.min(1, (sc - 0.2) / 0.6));
    tone(sc < 0.2 ? 520 : 700 + 500 * sc, 60, sc < 0.2 ? 0.05 : 0.12);
    s.beepT = setTimeout(beepLoop, gap);
  }
  function hint(key) {
    var s = B.scan; if (!s || s.hinted[key]) return; s.hinted[key] = 1;
    APP().status(t(key));
    if (!(aiOn() && BAIN_AI.tell('Barcode scanner hint (the scanner is still running): say only this, very briefly, in the person\'s language: "' + t(key) + '"'))) APP().sayNative(t(key));
  }

  // ---------------- what a code is ----------------
  function classify(text, format) {
    var s = String(text || '').trim(), f = String(format || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (/qr/.test(f) || !/^\d{6,14}$/.test(s)) {
      if (/^https?:\/\//i.test(s)) { var host = ''; try { host = new URL(s).hostname.replace(/^www\./, ''); } catch (e) {} return { type: 'url', url: s.slice(0, 600), host: host, https: /^https:\/\//i.test(s) }; }
      if (/^\d{8,14}$/.test(s)) return { type: 'product', code: s, format: f };
      return { type: 'text', text: s.slice(0, 300) };
    }
    return { type: 'product', code: s, format: f };
  }
  function lookup(code, format) {
    APP().status(t('bcRead'));
    return fetch('/api/shop/barcode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: String(code), format: format || '', lang: APP().S.lang }) })
      .then(function (r) { return r.json().catch(function () { return { error: 'bad_answer' }; }); })
      .catch(function () { return { error: 'offline' }; });
  }
  // a read code → the full result object every caller gets: { kind:'barcode', via, code, lookup } or a QR
  function resolve(hit, via) {
    var c = classify(hit.text, hit.format);
    if (c.type !== 'product') { var r = { kind: 'qr', via: via, qr: c }; B.last = r; render(r); return Promise.resolve(r); }
    return lookup(c.code, c.format).then(function (j) { var r = { kind: 'barcode', via: via, code: c.code, lookup: j }; B.last = r; render(r); APP().status(''); return r; });
  }

  // ---------------- the live scanner ----------------
  function supported() { return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia); }
  function scan(onResult) {
    if (B.scan) return Promise.resolve({ ok: true, already: true });
    if (window.BAIN_CO && BAIN_CO.camOpenNow()) BAIN_CO.camClose();
    var box = $('camBox'), vid = $('camVid'); if (!box || !vid) return Promise.resolve({ error: 'no_camera_ui' });
    if (!supported()) return Promise.resolve({ error: 'no_camera', fallback: 'file' });
    var s = B.scan = { onResult: onResult, t0: Date.now(), done: false, hinted: {}, score: 0, strong: 0, busy: false, photoTried: false };
    ac();
    decoder().catch(function () {});   // start loading the decoder while the camera opens
    return navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false }).then(function (stream) {
      if (B.scan !== s) { stream.getTracks().forEach(function (x) { x.stop(); }); return { error: 'closed' }; }
      s.stream = stream; vid.srcObject = stream; vid.setAttribute('playsinline', ''); vid.muted = true; try { vid.play(); } catch (e) {}
      try { var tr = stream.getVideoTracks()[0]; if (tr && tr.applyConstraints) tr.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(function () {}); } catch (e) {}
      box.hidden = false; box.classList.add('bcMode'); APP().status(t('bcGuide'));
      if (!aiOn()) APP().sayNative(t('bcGuide'));
      setTimeout(beepLoop, 1200);
      s.tick = setTimeout(loop, 400);
      return { ok: true };
    }).catch(function (e) { B.scan = null; box.classList.remove('bcMode'); APP().status(t('camDenied')); return { error: e && e.name === 'NotAllowedError' ? 'camera_not_allowed' : 'camera_failed' }; });
  }
  function loop() {
    var s = B.scan, vid = $('camVid'); if (!s || s.done) return;
    var el = Date.now() - s.t0;
    if (!vid || !vid.videoWidth) { s.tick = setTimeout(loop, 200); return; }
    s.score = frameScore(vid); if (s.score > 0.5) s.strong++; else s.strong = 0;
    if (s.strong >= 4) hint('bcHintStill');
    if (el > 6000 && s.score < 0.2) hint('bcHintSlow');
    if (el > 10500) hint('bcHintTurn');
    if (el > 15000 && !s.photoTried) photoFallback();
    if (el > 45000) { finish(null, 'timeout'); return; }
    decodeSource(vid, 1280).then(function (hit) {
      if (B.scan !== s || s.done) return;
      if (hit && hit.text) { finish(hit, 'camera'); return; }
      s.tick = setTimeout(loop, 90);
    });
  }
  function shrinkJpeg(src) { var cv = grab(src, 1600); return cv ? cv.toDataURL('image/jpeg', 0.85) : null; }
  function photoFallback(now) {   // ~15 s with no read (or "take it"): the picture endpoint reads the printed digits; scanning goes on meanwhile
    var s = B.scan, vid = $('camVid'); if (!s || s.photoTried || !vid || !vid.videoWidth) return false;
    s.photoTried = true; var img = shrinkJpeg(vid); if (!img) return false;
    hint('bcPhoto');
    fetch('/api/shop/identify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: img, lang: APP().S.lang, mode: 'barcode' }) })
      .then(function (r) { return r.json().catch(function () { return {}; }); }).catch(function () { return {}; })
      .then(function (j) {
        if (B.scan !== s || s.done) return;
        s.photo = j;
        if (j && j.barcode_ok && j.barcode) finish({ text: j.barcode, format: 'photo' }, 'photo');
        else if (now) finish(null, 'photo_unreadable');
      });
    return true;
  }
  function take() { var s = B.scan; if (!s) return false; if (!s.photoTried) return photoFallback(true); return true; }
  function stopCam() {
    var s = B.scan; B.scan = null; if (!s) return; s.done = true; clearTimeout(s.tick); clearTimeout(s.beepT);
    if (s.stream) s.stream.getTracks().forEach(function (x) { x.stop(); });
    var box = $('camBox'); if (box) { box.hidden = true; box.classList.remove('bcMode'); } var vid = $('camVid'); if (vid) vid.srcObject = null;
  }
  function finish(hit, via) {
    var s = B.scan; if (!s || s.done) return; var cb = s.onResult, photo = s.photo; stopCam();
    if (!hit) { var r = { kind: 'none', via: via, photo: photo && photo.identified ? photo : null, tip: photo && photo.tip }; B.last = r; APP().status(t('bcNoRead')); if (cb) cb(r); return; }
    chime();
    setTimeout(function () { resolve(hit, via).then(function (r) { if (photo && photo.identified) r.photo = photo; if (cb) cb(r); }); }, 250);
  }

  // ---------------- what the AI is told / what the phone says ----------------
  function facts(j) { var p = j.product || {}; var o = { name: p.name, brand: p.brand, size: p.quantity, kind: p.kind, category: p.category, source: p.source }; ['allergens', 'traces', 'labels'].forEach(function (k) { if (p[k] && p[k].length) o[k === 'traces' ? 'may_contain' : k] = p[k]; }); if (p.ingredients) { o.ingredients = p.ingredients; o.ingredients_language = p.ingredients_lang; } if (p.nutrition_per_100g) o.nutrition_per_100g = p.nutrition_per_100g; if (p.serving_size) o.serving_size = p.serving_size; if (p.model) o.model = p.model; if (p.color) o.color = p.color; if (p.description) o.description = p.description; return o; }
  function tellText(r) {
    if (!r) return 'Barcode result: nothing. Offer to try again (barcode_scan).';
    if (r.kind === 'qr') { var q = r.qr; return q.type === 'url' ? 'QR code read: a link to the website ' + q.host + ' (' + q.url + '). Tell the person the website name. Do not open it unless they ask; if they ask, call qr_open_link.' : 'QR code read, it contains this text: "' + q.text + '". Read it to the person.'; }
    if (r.kind === 'none') {
      var ph = r.photo;
      return 'Barcode scanner: no barcode could be read (' + r.via + ').' + (ph ? ' But the photo shows (AI impression, not certain): ' + JSON.stringify({ description: ph.description, brand: ph.brand, product: ph.product, model_or_size: ph.model_or_size, search_query: ph.search_query }) + '. Say "I couldn\'t read the barcode, but from the picture it looks like…", then offer to find where to buy it (search_products with that query).' : ' Say so briefly; tips: more light, hold it 15-20 cm away, turn the item to find the barcode. Offer to try again (barcode_scan) or to describe the item from a photo (camera_open).');
    }
    var j = r.lookup || {};
    if (j.error === 'rate_limited') return 'Barcode ' + r.code + ' was read, but the daily lookup limit is reached. Say so and offer the photo description (camera_open).';
    if (j.error && !('found' in j)) return 'Barcode ' + r.code + ' was read, but the lookup did not work right now (' + j.error + '). Say so and offer to try again.';
    if (j.error) return 'The numbers ' + r.code + ' are not a valid product barcode: ' + (j.note || j.error) + '. Say so and offer to scan again (barcode_scan).';
    if (!j.found) return 'Barcode ' + r.code + ' was read, but it is NOT in the free product databases (tried: ' + (j.sources_tried || []).join(', ') + '). Say this honestly and NEVER guess what the product is. Offer two things: describe it from a photo (camera_open), or search the stores for the number ' + r.code + ' (search_products with query "' + r.code + '"; results may not be this exact item — say so).';
    return 'Barcode ' + r.code + ' read' + (r.via === 'photo' ? ' (digits read from a photo)' : '') + '. Product facts from ' + (j.product && j.product.source) + ' (an open database filled in by people; say ONLY these facts, add nothing, do not guess missing ones): ' + JSON.stringify(facts(j)) +
      '. Tell the person in their language, briefly: what it is (name, brand, size). For food: say the allergens and the "may contain" list if given (say "no allergens are listed" only if the list is empty — that does not mean it is allergen-free), mention kosher/vegan/gluten labels if listed, and offer to read the ingredients (read them only if asked; translate them). Then ask "Want me to find where to buy it?" — on yes call search_products with query "' + j.search_query + '".';
  }
  function speakText(r) {
    if (!r || r.kind === 'none') return r && r.photo ? t('bcNoRead') + ' ' + t('camSaw', { d: r.photo.description }) : t('bcNoRead');
    if (r.kind === 'qr') return r.qr.type === 'url' ? t('bcQrLink', { host: r.qr.host }) : t('bcQrText', { text: r.qr.text });
    var j = r.lookup || {}; if (!j.found) return j.error === 'rate_limited' ? t('limit') : t('bcNotFound', { code: r.code.split('').join(' ') });
    var p = j.product, L = function (s) { return String(s || '').toLowerCase().replace(/[^a-z0-9\u00c0-\uffff]+/g, ''); }, bw = L(String(p.brand || '').split(/\s+/)[0]);
    var d = [p.name, p.brand && p.name && bw && L(p.name).indexOf(bw) < 0 ? p.brand : '', p.quantity].filter(Boolean).join(', ');
    var out = t('bcIs', { d: d });
    if (p.allergens && p.allergens.length) out += ' ' + t('bcAllergens', { a: p.allergens.join(', ') });
    if (p.traces && p.traces.length) out += ' ' + t('bcTraces', { a: p.traces.join(', ') });
    if (p.labels && p.labels.length) out += ' ' + t('bcLabels', { a: p.labels.join(', ') });
    return out + ' ' + t('bcAskBuy');
  }
  // the result card under the camera (big buttons = the same actions as by voice)
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function render(r) {
    var el = $('bcResult'); if (!el) return; r = r || B.last; if (!r) { el.hidden = true; el.innerHTML = ''; return; }
    var h = '', j = r.lookup || {};
    if (r.kind === 'qr') h = '<p>' + esc(speakText(r)) + '</p>' + (r.qr.type === 'url' && r.qr.https ? '<button type="button" id="bcOpen">' + esc(t('bcOpenLink')) + '</button>' : '');
    else if (r.kind === 'barcode' && j.found) {
      var p = j.product;
      h = (p.image ? '<img src="' + esc(p.image) + '" alt="" width="72" height="72" loading="lazy">' : '') + '<p class="bcName">' + esc([p.brand, p.name, p.quantity].filter(Boolean).join(' · ')) + '</p>' +
        (p.allergens && p.allergens.length ? '<p>' + esc(t('bcAllergens', { a: p.allergens.join(', ') })) + '</p>' : '') +
        (p.traces && p.traces.length ? '<p>' + esc(t('bcTraces', { a: p.traces.join(', ') })) + '</p>' : '') +
        (p.labels && p.labels.length ? '<p>' + esc(t('bcLabels', { a: p.labels.join(', ') })) + '</p>' : '') +
        '<p class="small">' + esc(t('bcSource', { src: p.source })) + ' · ' + esc(r.code) + '</p>' +
        '<div class="row"><button type="button" id="bcBuyBtn">' + esc(t('bcBuy')) + '</button>' + (p.kind === 'food' || p.ingredients ? '<button type="button" id="bcIngrBtn" class="small">' + esc(t('bcIngr')) + '</button>' : '') + '</div>';
    } else h = '<p>' + esc(speakText(r)) + '</p><div class="row"><button type="button" id="bcDescBtn">' + esc(t('bcDescribe')) + '</button></div>';
    el.innerHTML = h; el.hidden = false;
    var b1 = $('bcBuyBtn'); if (b1) b1.addEventListener('click', function (e) { e.stopPropagation(); buy(); });
    var b2 = $('bcIngrBtn'); if (b2) b2.addEventListener('click', function (e) { e.stopPropagation(); readIngredients(); });
    var b3 = $('bcDescBtn'); if (b3) b3.addEventListener('click', function (e) { e.stopPropagation(); var cb = $('camBtn'); if (cb) cb.click(); });
    var b4 = $('bcOpen'); if (b4) b4.addEventListener('click', function (e) { e.stopPropagation(); openLink(); });
  }
  function buy() {
    var r = B.last, j = r && r.lookup; if (!j || !j.found) return;
    if (aiOn()) { BAIN_AI.tell('The user tapped "Find where to buy" for the scanned product. Call search_products with query "' + j.search_query + '".'); return; }
    APP().search({ query: j.search_query });
  }
  function readIngredients() {
    var r = B.last, p = r && r.lookup && r.lookup.product; if (!p) return;
    if (aiOn()) { BAIN_AI.tell('The user asked to hear the ingredients of the scanned product. Read them (translated into their language): ' + (p.ingredients || 'not listed')); return; }
    APP().sayNative(p.ingredients || t('bcIngrNone'));
  }
  function openLink() { var r = B.last; if (!r || r.kind !== 'qr' || r.qr.type !== 'url' || !r.qr.https) return { error: 'no https link from a QR code' }; try { window.open(r.qr.url, '_blank', 'noopener'); } catch (e) {} return { ok: true, host: r.qr.host }; }
  function resultNoAI(r) { APP().sayNative(speakText(r)); }
  function button() {
    if (aiOn()) { BAIN_AI.tell('The user tapped the Scan barcode button. Call barcode_scan now.'); return; }
    scan(resultNoAI).then(function (r) { if (r && r.error) APP().sayNative(r.error === 'camera_not_allowed' ? t('camDenied') : t('bcNoRead')); });
  }
  function i18n() { var b = $('bcBtn'); if (b) b.textContent = t('bcBtn'); if (B.last) render(B.last); }
  function init() { var b = $('bcBtn'); if (b) b.addEventListener('click', function (e) { e.stopPropagation(); button(); }); i18n(); }
  function foundHit(hit, via) { chime(); return resolve(hit, via); }
  window.BAIN_BC = { last: function () { return B.last; }, scan: scan, foundHit: foundHit, stop: stopCam, take: take, scanning: function () { return !!B.scan; }, decodeSource: decodeSource, decoder: decoder, resolve: resolve, lookup: lookup,
    classify: classify, stripeScore: stripeScore, tellText: tellText, speakText: speakText, render: render, i18n: i18n, buy: buy, readIngredients: readIngredients, openLink: openLink, last: function () { return B.last; }, _audio: function () { return B.audio || null; } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
