/* AIN Shop — membership / payment screen (v8). READY BUT OFF: while the server's switch (paywallOn) is 0 this file only reads
   /api/status, sees "off", and does nothing visible — no button, no dialog, no cookie, nothing stored.
   When the switch is ON: a random id for this phone (localStorage bain:sub, sent as the first-party cookie ainshop_sub) holds the
   free trial; a "Plan" button appears; when the trial is over the paid features answer 402 and this screen opens and SPEAKS
   (phone voice), with big buttons and voice commands (Subscribe / How much / Cancel / Restore / Close) in all 50 languages.
   No card is ever typed here: "Subscribe" asks the server for the payment page of the connected processor (none yet). */
(function () {
  'use strict';
  var APP = function () { return window.BAIN_APP; };
  var I = function () { return window.BAIN_I18N; };
  var P = { info: null, state: null, rec: null };
  function t(k, v) { return APP() ? APP().t(k, v) : k; }
  function $(id) { return document.getElementById(id); }
  function post(path, body) {
    return fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}), credentials: 'same-origin' })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { j._http = r.status; return j; }); });
  }
  function devId() {
    var id = null; try { id = localStorage.getItem('bain:sub'); } catch (e) {}
    if (!id || !/^[a-zA-Z0-9-]{16,64}$/.test(id)) {
      id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2));
      try { localStorage.setItem('bain:sub', id); } catch (e) {}
    }
    document.cookie = 'ainshop_sub=' + id + '; Path=/; Max-Age=63072000; SameSite=Strict' + (location.protocol === 'https:' ? '; Secure' : '');
    return id;
  }
  function on() { return !!(P.info && P.info.on); }
  function money(s) { return (s && s.price_text) || ('$' + ((P.info && P.info.price_cents || 499) / 100).toFixed(2)); }
  function dateText(ms) { try { return new Date(ms).toLocaleDateString(I().speech(), { year: 'numeric', month: 'long', day: 'numeric' }); } catch (e) { return new Date(ms).toISOString().slice(0, 10); } }
  // one or two sentences that say where this phone stands (shown and spoken)
  function summary(s) {
    s = s || P.state || {};
    var price = t('payPrice', { price: money(s), days: s.trial_days || (P.info && P.info.trial_days) || 30 });
    if (!s.on) return t('payFreeNow');
    if (s.status === 'active' || s.status === 'owner') return t('payActive');
    if (s.status === 'canceled') return t('payCanceled', { date: dateText(s.paid_until) });
    if (s.status === 'trial' || s.status === 'new') return t('payTrialLeft', { days: s.days_left }) + ' ' + price;
    return t('payWall', { price: money(s) });
  }
  function render(s) {
    s = s || P.state || {};
    var st = $('payStatus'); if (st) st.textContent = summary(s);
    var pr = $('payPriceLine'); if (pr) pr.textContent = t('payPrice', { price: money(s), days: s.trial_days || 30 });
    var sub = $('paySub'), can = $('payCan');
    if (sub) sub.hidden = s.status === 'active' || s.status === 'owner';
    if (can) can.hidden = !(s.status === 'active');
    var b = $('payBtn'); if (b) b.hidden = !on();
  }
  function say(x) { var st = $('payMsg'); if (st) st.textContent = x; if (APP()) { APP().announce && APP().announce(x); if (!(window.BAIN_AI && BAIN_AI.active && BAIN_AI.active())) APP().sayNative(x); } }
  function isOpen() { var d = $('payDlg'); return !!(d && d.open); }
  function open(wall) {
    var d = $('payDlg'); if (!d) return;
    render(); if (!d.open) { try { d.showModal(); } catch (e) { d.setAttribute('open', ''); } }
    var m = $('payMsg'); if (m) m.textContent = '';
    say(summary() + ' ' + t('payVoiceHint'));
    var f = wall ? $('paySub') : $('payClose'); if (f && !f.hidden) f.focus();
  }
  function close() { stopRec(); var d = $('payDlg'); if (d && d.open) { try { d.close(); } catch (e) { d.removeAttribute('open'); } } var tk = $('talk'); if (tk) tk.focus(); }
  function refresh() {
    if (!on()) return Promise.resolve(P.state = { on: false, access: true, status: 'free', price_text: money(), trial_days: P.info ? P.info.trial_days : 30 });
    devId();
    return post('/api/sub/status').then(function (s) { P.state = s; render(s); return s; });
  }
  function subscribe(fromAI) {
    if (!on()) return refresh().then(function (s) { if (!fromAI) say(t('payFreeNow')); return Object.assign({}, s, { error: 'paywall_off' }); });
    devId();
    return post('/api/sub/subscribe').then(function (r) {
      if (r.url && /^https:\/\//.test(r.url)) { if (!fromAI) say(t('payOpening')); setTimeout(function () { location.href = r.url; }, fromAI ? 2500 : 1200); return r; }
      if (!fromAI) say(r.error === 'payments_not_connected' ? t('payNotReady') : summary(r)); return r;
    });
  }
  function cancel(fromAI) {
    if (!on()) return refresh().then(function (s) { if (!fromAI) say(t('payNothingToCancel')); return Object.assign({}, s, { nothing_to_cancel: true }); });
    devId();
    return post('/api/sub/cancel').then(function (r) {
      if (r.manage_url && /^https:\/\//.test(r.manage_url)) { setTimeout(function () { location.href = r.manage_url; }, fromAI ? 2500 : 800); return r; }
      if (!fromAI) say(r.nothing_to_cancel ? t('payNothingToCancel') : r.error === 'payments_not_connected' ? t('payNotReady') : t('payCancelDone'));
      if (!r.error) refresh(); return r;
    });
  }
  function restore(fromAI) {
    if (!on()) return refresh().then(function (s) { if (!fromAI) say(t('payFreeNow')); return Object.assign({}, s, { error: 'paywall_off' }); });
    devId();
    return post('/api/sub/restore').then(function (r) { if (!fromAI) say(r.error === 'payments_not_connected' ? t('payNotReady') : summary(r)); if (!r.error) refresh(); return r; });
  }
  // the AI's view (tools subscription_info / subscribe / cancel_subscription / restore_purchase)
  function forAI(s) {
    s = s || {}; var o = { on: !!s.on, status: s.status || 'free', price_text: money(s), per: 'month', trial_days: s.trial_days || 30, stores_join_free: true, say: summary(s) };
    if (s.days_left != null) o.trial_days_left = s.days_left;
    if (s.paid_until) o.active_until = dateText(s.paid_until);
    if (s.error === 'payments_not_connected') o.note = 'payments are not connected yet: paying is not possible yet and nothing is charged — say so honestly';
    else if (s.error === 'paywall_off') o.note = 'AIN Shop is free right now; nothing to pay';
    else if (s.error) o.error = s.error;
    if (s.nothing_to_cancel) o.note = 'nothing to cancel: they are not paying anything';
    if (s.url) o.note = 'the secure payment page is opening now; tell them what it is';
    if (s.manage_url) o.note = 'the store\'s subscription settings are opening now (cancel there)';
    if (!s.on) o.note = o.note || 'AIN Shop is free right now: nobody is charged and nothing is blocked. Only if they ask about later: the plan is ' + o.price_text + ' a month after a ' + o.trial_days + '-day free trial; stores join free.';
    return o;
  }
  // a paid feature answered 402 (switch ON, trial over): open the screen and speak
  function blocked(j) {
    APP() && APP().status(t('payTrialEnded'));
    return refresh().then(function () { open(true); }, function () { open(true); });
  }
  // ---- voice commands on this screen (phone speech recognition; English words always work too) ----
  function words(k) { var out = String(t(k)).toLowerCase().split(/[,،、，]/); if (I().lang !== 'en') out = out.concat(String(I().LANGS.en.s[k]).toLowerCase().split(',')); return out.map(function (x) { return x.trim(); }).filter(Boolean); }
  function has(text, k) { var w = words(k); for (var i = 0; i < w.length; i++) if (text.indexOf(w[i]) >= 0) return true; return false; }
  // v28: subscribing and canceling ask the big Yes/No box first (spoken; answered by tap or by voice) — every path, voice or typed
  function confirmFirst(k, fn) { var V = window.AIN_VCMD; if (V && window.AIN_LEGAL && AIN_LEGAL.confirm) V.ask(V.say(k), function () { fn(); return ''; }, 'typed'); else fn(); }
  function command(text) {   // order matters: "unsubscribe" contains "subscribe"
    var raw = String(text || ''); text = raw.toLowerCase();
    var V = window.AIN_VCMD; if (V) { var hm = V.readings(raw.split(' | ')[0]).filter(function (r) { return r.id === 'help'; })[0]; if (hm) { say(V.helpText('typed')); return 'help'; } }   // v28: "what can I say?"
    if (has(text, 'payCmdCancel')) { confirmFirst('cancelQ', function () { cancel(false); }); return 'cancel'; }
    if (has(text, 'payCmdRestore')) { restore(false); return 'restore'; }
    if (has(text, 'payCmdPrice')) { say(summary()); return 'price'; }
    if (has(text, 'payCmdClose')) { close(); return 'close'; }
    if (has(text, 'payCmdSub')) { confirmFirst('subscribeQ', function () { subscribe(false); }); return 'subscribe'; }
    say(t('payNotHeard') + ' ' + t('payVoiceHint')); return null;
  }
  function stopRec() { try { if (P.rec) P.rec.abort(); } catch (e) {} P.rec = null; }
  function listen() {
    var R = window.SpeechRecognition || window.webkitSpeechRecognition; if (!R) { say(t('payVoiceHint')); return; }
    stopRec(); try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) {}
    var r = P.rec = new R(); r.lang = I().speech(); r.interimResults = false; r.maxAlternatives = 3;
    r.onresult = function (e) { var alts = e.results[0], all = []; for (var i = 0; i < alts.length; i++) all.push(alts[i].transcript); command(all.join(' | ')); };
    r.onerror = function () { say(t('payNotHeard')); };
    r.onend = function () { if (P.rec === r) P.rec = null; };
    try { r.start(); } catch (e) { say(t('payVoiceHint')); }
  }
  function init() {
    var d = $('payDlg');
    if (d) {
      $('paySub').addEventListener('click', function (e) { e.stopPropagation(); subscribe(false); });
      $('payCan').addEventListener('click', function (e) { e.stopPropagation(); cancel(false); });
      $('payRes').addEventListener('click', function (e) { e.stopPropagation(); restore(false); });
      $('paySpeakBtn').addEventListener('click', function (e) { e.stopPropagation(); listen(); });
      $('payClose').addEventListener('click', function (e) { e.stopPropagation(); close(); });
      d.addEventListener('cancel', function (e) { e.preventDefault(); close(); });
    }
    var b = $('payBtn'); if (b) b.addEventListener('click', function () { refresh().then(function () { open(false); }); });
    fetch('/api/status', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (j) {
      P.info = j && j.paywall ? j.paywall : { on: false };
      if (!on()) return;            // OFF: nothing visible, nothing stored
      refresh().then(function (s) { if (s && s.on && s.access === false) open(true); });
    }).catch(function () { P.info = { on: false }; });
  }
  window.BAIN_PAY = { refresh: refresh, subscribe: subscribe, cancel: cancel, restore: restore, forAI: forAI, blocked: blocked, open: open, close: close, isOpen: isOpen, command: command, summary: summary, on: on, _p: P };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
