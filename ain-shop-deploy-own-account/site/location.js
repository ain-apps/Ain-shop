/* AIN Shop — "use my location so it comes faster" (v14, Nati Oct 26 2026: "make the app track my location so it can come faster").
   Asked ONCE (voice + big buttons): "Can AIN Shop use your location to find stores that deliver fastest near you?". On yes the phone's
   position is read ONE time, only when the person shops (a search for the fastest delivery, pickup, what's open near me) and at most every
   6 hours — never in the background, never continuously. The position is turned into a ZIP code (rounded, not linked to the person) and
   ONLY the ZIP code / city is kept, on this phone (localStorage "bain:loc"); no exact position is stored, no server copy, no account.
   On no: the person can say or type a ZIP code. "Forget my location" (voice, typed, or the button by Buy again) deletes it any time.
   Delivery or pickup times are only ever repeated as a store page states them; otherwise: "check the delivery time at checkout". */
(function () {
  'use strict';
  var KEY = 'bain:loc', ASK = 'bain:locAsk', FRESH_MS = 6 * 3600 * 1000;
  var APP = function () { return window.BAIN_APP; };
  function I() { return window.BAIN_I18N; }
  function t(k, v) { return APP() ? APP().t(k, v) : I().t(k, v); }
  function $(id) { return document.getElementById(id); }
  var L = { pending: null, resolve: null, readAt: 0, near: null, busy: false };

  // ---- what is kept: { zip, city, region, country, how: phone|typed|approx, at } — never coordinates ----
  function get() { try { var o = JSON.parse(localStorage.getItem(KEY) || 'null'); return o && (o.zip || o.city) ? o : null; } catch (e) { return null; } }
  function consent() { try { var c = localStorage.getItem(ASK); return c === 'yes' || c === 'no' ? c : null; } catch (e) { return null; } }
  function setConsent(v) { try { if (v) localStorage.setItem(ASK, v); else localStorage.removeItem(ASK); } catch (e) {} }
  function okZip(z) { return /^[A-Z0-9][A-Z0-9 -]{2,9}$/.test(z); }
  function clean(p) {
    if (!p || typeof p !== 'object') return null;
    var zip = String(p.postal || p.zip || '').trim().toUpperCase().slice(0, 10); if (zip && !okZip(zip)) zip = '';
    var o = { zip: zip || null, city: p.city ? String(p.city).slice(0, 60) : null, region: p.region ? String(p.region).slice(0, 60) : null, country: p.country ? String(p.country).slice(0, 2).toUpperCase() : null };
    return o.zip || o.city ? o : null;
  }
  function save(p, how) { var o = clean(p); if (!o) return null; o.how = how || 'phone'; o.at = Date.now(); try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} render(); return o; }
  function label(o) { o = o || get(); if (!o) return ''; return o.zip ? o.zip + (o.city ? ', ' + o.city : '') : [o.city, o.region].filter(Boolean).join(', '); }
  // what a search sends: the ZIP and the town name only
  function args() { var o = get(); if (!o) return null; return { zip: o.zip || '', loc: { city: o.city || '', region: o.region || '', country: o.country || 'US' } }; }
  function forAI() { var o = get(); return o ? { saved: true, zip: o.zip, city: o.city, region: o.region, country: o.country, how: o.how, permission: consent() || 'not asked' } : { saved: false, permission: consent() || 'not asked' }; }
  function zipFrom(text) { var s = String(text || '').toUpperCase(); var m = s.match(/\b\d{5}(?:-\d{4})?\b/); if (m) return m[0]; m = s.match(/\b[A-Z]\d[A-Z] ?\d[A-Z]\d\b|\b[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}\b|\b\d{7}\b|\b\d{4,6}\b/); return m ? m[0] : ''; }
  function setZip(z) {
    var s = String(z || '').trim(), zip = zipFrom(s) || (okZip(s.toUpperCase()) && /\d/.test(s) ? s.toUpperCase() : '');
    if (!zip) return null;
    return save({ postal: zip, country: /^\d{5}(-\d{4})?$/.test(zip) ? 'US' : null }, 'typed');
  }
  function forget() { try { localStorage.removeItem(KEY); } catch (e) {} setConsent('no'); var A = APP(); if (A && A.S) A.S.place = null; L.near = null; render(); renderNear(); return true; }
  // ONE reading of the phone's position, now (a single reading, never a continuous watch); where(true) turns it into a ZIP; the position is not kept
  function readPhone() {
    var A = APP(); if (!A || !A.where) return Promise.resolve(null);
    return A.where(true).then(function (r) {
      if (!r || r.error) return null;
      if (r.denied || (r.approximate && r.note)) return null;   // the phone did not share it: nothing is saved
      L.readAt = Date.now(); return save(A.S.place, r.approximate ? 'approx' : 'phone');
    });
  }
  function allow() { setConsent('yes'); return readPhone(); }
  // before a search that needs it: the saved ZIP, a fresh one-time reading (if allowed and older than 6 h), or the one question
  function ensure(opts) {
    opts = opts || {}; var o = get(), c = consent();
    if (c === 'yes') { if (o && (o.how === 'typed' || Date.now() - (o.at || 0) < FRESH_MS)) return Promise.resolve(o); return readPhone().then(function (x) { return x || o; }); }
    if (o) return Promise.resolve(o);
    if (c === 'no') return Promise.resolve(null);   // they said no (or forgot it): never asked again on its own — "use my location" asks
    if (opts.noAsk || (window.BAIN_AI && BAIN_AI.active())) return Promise.resolve(null);   // in a voice conversation the assistant asks by voice
    return ask();
  }

  // ---- the one question: a dialog with big buttons, also spoken ----
  function say(txt) { if (window.BAIN_AI && BAIN_AI.active()) return; var A = APP(); if (!A) return; A.sayNative(txt); A.announce(txt); }
  function tell(txt) { var A = APP(); if (A) A.status(txt); say(txt); }
  function showZip(on) { var f = $('locZipForm'); if (f) f.hidden = !on; var e = $('locErr'); if (e) e.textContent = ''; if (on) { var i = $('locZip'); if (i) try { i.focus(); } catch (x) {} } }
  function i18n() {
    var map = { locDlgH: 'locQ', locDlgHint: 'locAskHint', locYes: 'locYes', locNo: 'locNo', locLater: 'locLater', locZipL: 'locZipLabel', locZipSave: 'locZipSave' };
    Object.keys(map).forEach(function (id) { var e = $(id); if (e) e.textContent = t(map[id]); });
    var z = $('locZip'); if (z) z.setAttribute('placeholder', '48237');
  }
  function done(v) { var d = $('locDlg'); try { if (d && d.open) d.close(); } catch (e) {} if (d) d.removeAttribute('open'); var r = L.resolve; L.pending = null; L.resolve = null; if (r) r(v); }
  function ask() {
    if (L.pending) return L.pending;
    var d = $('locDlg'); if (!d) return Promise.resolve(null);
    L.pending = new Promise(function (res) { L.resolve = res; });
    i18n(); showZip(false);
    try { if (d.showModal) d.showModal(); else d.setAttribute('open', ''); } catch (e) { d.setAttribute('open', ''); }
    var y = $('locYes'); if (y) try { y.focus(); } catch (e) {}
    say(t('locQ') + ' ' + t('locAskHint'));
    return L.pending;
  }
  function yesTap() {
    setConsent('yes'); var y = $('locYes'); if (y) y.disabled = true;
    readPhone().then(function (o) {
      if (y) y.disabled = false;
      if (o) { tell(t('locSaved', { place: label(o) })); done(o); }
      else { tell(t('locNoShare')); showZip(true); }
    });
  }
  function noTap() { setConsent('no'); showZip(true); say(t('locZipLabel')); }
  function laterTap() { if (!consent()) setConsent('no'); done(get()); }
  function zipSubmit(e) {
    if (e) e.preventDefault(); var i = $('locZip'), v = i ? i.value : '';
    var o = setZip(v);
    if (!o) { var er = $('locErr'); if (er) er.textContent = t('locZipBad'); say(t('locZipBad')); if (i) try { i.focus(); } catch (x) {} return; }
    if (i) i.value = ''; tell(t('locSaved', { place: label(o) })); done(o);
  }

  // ---- the home screen: next to "Buy again": the saved area + "Forget my location", or "Use my location for faster delivery" ----
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function btn(txt, fn, cls) { var b = el('button', cls || '', txt); b.type = 'button'; b.addEventListener('click', function (ev) { ev.stopPropagation(); fn(); }); return b; }
  function useTap() { ask().then(function (o) { var b = $('locBox'); if (o && b) { var f = b.querySelector('.locForget'); if (f) try { f.focus(); } catch (e) {} } }); }
  function forgetTap() { forget(); tell(t('locForgot')); var u = document.querySelector('#locBox .locUse'); if (u) try { u.focus(); } catch (e) {} }
  function render() {
    var b = $('locBox'); if (!b) return; b.innerHTML = ''; var o = get();
    if (o) { b.appendChild(el('p', 'locArea', '\uD83D\uDCCD ' + t('locArea', { place: label(o) }))); b.appendChild(btn(t('locForget'), forgetTap, 'small locForget')); }
    else b.appendChild(btn(t('locUse'), useTap, 'locUse'));
  }

  // ---- "what's open near me": stores near the saved ZIP, hours / pickup / same-day only as their pages say ----
  function nearby(kind) {
    return ensure().then(function (o) {
      if (!o) return { error: 'no_location' };
      L.busy = true; var A = APP(); if (A) A.status(t('searching'));
      var c = window.AbortController ? new AbortController() : null, tm = c ? setTimeout(function () { c.abort(); }, 45000) : null;
      return fetch('/api/shop/nearby', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ zip: o.zip || '', city: o.city || '', region: o.region || '', country: o.country || 'US', kind: kind || '' }), signal: c ? c.signal : undefined })
        .then(function (r) { return r.json(); }).catch(function () { return { error: 'offline' }; })
        .then(function (j) { if (tm) clearTimeout(tm); L.busy = false; if (A) A.status(''); if (!j.error) { L.near = { place: label(o), stores: j.stores || [] }; renderNear(); } return Object.assign({}, j, { place: label(o) }); });
    });
  }
  function storeLine(s) {
    var bits = [s.name]; if (s.address) bits.push(s.address); if (s.hours_today) bits.push(t('nearHours', { h: s.hours_today }));
    if (s.pickup === true) bits.push(t('nearPickup')); if (s.same_day_delivery === true) bits.push(t('nearSameDay'));
    return bits.join(', ');
  }
  function nearSentence(j) {
    if (j && j.error === 'no_location') return t('locNone');
    if (!j || j.error || !j.stores || !j.stores.length) return t('nearNone', { place: (j && j.place) || label() });
    return t('nearH', { place: j.place }) + ': ' + j.stores.slice(0, 3).map(storeLine).join('. ') + '.';
  }
  function renderNear() {
    var sec = $('nearSec'), box = $('nearBox'), h = $('nearH'); if (!sec || !box) return;
    sec.hidden = !L.near; box.innerHTML = ''; if (!L.near) return;
    if (h) h.textContent = t('nearH', { place: L.near.place });
    if (!L.near.stores.length) { box.appendChild(el('p', '', t('nearNone', { place: L.near.place }))); return; }
    var ol = el('ol', 'nearList');
    L.near.stores.forEach(function (s) {
      var li = el('li', 'nearItem'); li.appendChild(el('h3', 'p-title', s.name));
      if (s.address) li.appendChild(el('p', 'p-meta', s.address));
      if (s.hours_today) li.appendChild(el('p', 'p-meta', t('nearHours', { h: s.hours_today })));
      var sv = []; if (s.pickup === true) sv.push(t('nearPickup')); if (s.same_day_delivery === true) sv.push(t('nearSameDay')); if (sv.length) li.appendChild(el('p', 'p-meta', sv.join(' · ')));
      if (s.url) { var a = el('a', 'btn', s.name); a.href = s.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; li.appendChild(a); }
      ol.appendChild(li);
    });
    box.appendChild(ol);
  }

  // ---- results: how many show a delivery / pickup time (as the store page says) ----
  function fastSummary(list) {
    var n = (list || []).filter(function (p) { return p && p.delivery; }).length;
    return n ? t('fastFound', { n: n }) : t('fastNone');
  }
  // the fastest-delivery / pickup search, typed or tapped (the voice assistant calls search_products with fast)
  function fastSearch(query, fast) {
    var A = APP();
    return ensure().then(function () {
      return A.typedSearch(query, { fast: fast, near_me: true }).then(function (j) {
        if (j && !j.error) { var s = fastSummary(A.S.results); A.status(A.t('resultsCount', { n: A.S.results.length }) + ' ' + s); say(s); }
        return j;
      });
    });
  }

  // ---- typed (no voice call) commands, in the screen language + English ----
  function phr(k) { var out = String(t(k)).toLowerCase().split(/[,،、，]/); if (I().lang !== 'en') out = out.concat(String(I().LANGS.en.s[k]).toLowerCase().split(',')); return out.map(function (x) { return x.trim(); }).filter(Boolean).sort(function (a, b) { return b.length - a.length; }); }
  function hit(text, k) { var w = phr(k); for (var i = 0; i < w.length; i++) if (text.indexOf(w[i]) >= 0) return w[i]; return null; }
  function strip(text, k) { phr(k).forEach(function (w) { text = text.split(w).join(' '); }); return text; }
  var FILL = /^(please|for|of|a|an|the|some|me|my|i need|i want|get|find|order|buy|near me|around me|nearby|with|on)\b\s*|\s*\b(please|for me|near me|around me|nearby|today|now)$/i;
  function leftover(text) { var s = String(text).replace(/[?!.,:;]+/g, ' ').replace(/\s+/g, ' ').trim(), prev; do { prev = s; s = s.replace(FILL, '').trim(); } while (s !== prev); return s; }
  function command(raw) {
    var text = String(raw || '').toLowerCase().trim(); if (!text) return null;
    if (hit(text, 'locCmdForget')) { var V = window.AIN_VCMD; if (V && window.AIN_LEGAL && AIN_LEGAL.confirm && get()) { V.ask(V.say('locForgetQ'), function () { forget(); render(); return t('locForgot'); }, 'typed'); return 'ask'; } forgetTap(); return 'forget'; }   // v28: asks first
    if (hit(text, 'locCmdUse')) {
      var z = zipFrom(raw); if (z) { var o = setZip(z); if (o) { tell(t('locSaved', { place: label(o) })); return 'zip'; } }
      useTap(); return 'use';
    }
    if (hit(text, 'locCmdOpen')) { nearby('').then(function (j) { tell(nearSentence(j)); var h = $('nearH'); if (h && !j.error) try { h.focus(); } catch (e) {} }); return 'open'; }
    var fast = hit(text, 'locCmdFast') ? 'delivery' : hit(text, 'locCmdPickup') ? 'pickup' : null;
    if (fast) {
      var q = leftover(strip(text, fast === 'delivery' ? 'locCmdFast' : 'locCmdPickup'));
      var S = APP().S; if (!q && S.query && S.query.query) q = S.query.query;
      if (!q) { tell(t('locFastWhat')); var ti = $('typeIn'); if (ti) try { ti.focus(); } catch (e) {} return 'ask'; }
      fastSearch(q, fast); return 'fast';
    }
    return null;
  }

  function init() {
    var d = $('locDlg');
    if (d) {
      $('locYes').addEventListener('click', yesTap); $('locNo').addEventListener('click', noTap); $('locLater').addEventListener('click', laterTap);
      $('locZipForm').addEventListener('submit', zipSubmit);
      d.addEventListener('cancel', function (e) { e.preventDefault(); laterTap(); });
    }
    i18n(); render(); renderNear();
  }
  window.BAIN_LOC = { get: get, consent: consent, setConsent: setConsent, save: save, setZip: setZip, zipFrom: zipFrom, forget: forget, allow: allow, readPhone: readPhone, ensure: ensure, ask: ask, args: args, label: label, forAI: forAI,
    nearby: nearby, nearSentence: nearSentence, fastSearch: fastSearch, fastSummary: fastSummary, command: command, render: function () { i18n(); render(); renderNear(); }, leftover: leftover, clean: clean };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
