/* AIN Shop — "found a mistake?": corrections go to ainshop.corrections@mail.tab.bot (Nati, Oct 26 2026, 11:12 PM).
   A line on the home screen, in the language list and on /contact (all 50 languages), a typed/voice "report a mistake" that reads the address
   and opens an email with the subject "AIN Shop correction" and the current search / product in the body, and — until Nov 17, 2026 only —
   one short line at the end of the voice assistant's first answer in each conversation (ai.js asks corrAiLine()). */
(function () {
  'use strict';
  var EMAIL = 'ainshop.corrections@mail.tab.bot', SUBJECT = 'AIN Shop correction';
  var AI_LINE_UNTIL = Date.UTC(2026, 10, 18, 5, 0, 0);   // the end of Nov 17, 2026 in Detroit (EST, UTC-5); the screen/contact line stays after that
  var APP = function () { return window.BAIN_APP; };
  function t(k, v) { return APP().t(k, v); }
  function $(id) { return document.getElementById(id); }
  function aiLineOn(now) { return (now == null ? Date.now() : now) < AI_LINE_UNTIL; }
  function context() {
    var S = APP() ? APP().S : null, out = [];
    if (S && S.query && S.query.query) out.push('Search: ' + S.query.query);
    var p = S && S.chosen >= 0 ? S.results[S.chosen] : null;
    var co = window.BAIN_CO && BAIN_CO.current(); if (!p && co && co.info) p = co.info;
    if (p) out.push('Product: ' + String(p.title || '').slice(0, 160) + (p.store ? ' — ' + p.store : '') + (p.url ? '\n' + p.url : ''));
    if (S) out.push('App language: ' + S.lang);
    return out.join('\n');
  }
  function mailto() {
    var body = 'What is wrong:\n\n\n---\n' + context();
    return 'mailto:' + EMAIL + '?subject=' + encodeURIComponent(SUBJECT) + '&body=' + encodeURIComponent(body);
  }
  function open() {
    // TEACHING LOOP (test copy only, v31): also save a local teaching
    // record on this phone — query said + wrong product shown, no personal
    // data. The email below still goes out exactly as before. This call
    // can never break the email: it is wrapped in try/catch inside
    // recordFromCorrection(), and a failure here just skips the record.
    // The record stays on this phone until someone reviews it; nothing
    // is shared to other users automatically — each correction waits for
    // the user's yes in chat before it goes to anyone else.
    try { if (window.BAIN_TEACH && BAIN_TEACH.recordFromCorrection) BAIN_TEACH.recordFromCorrection(); } catch (e) {}
    try { location.href = mailto(); return true; } catch (e) { return false; } }
  function spoken() { return 'ain shop dot corrections at mail dot tab dot bot'; }
  function render() {
    Array.prototype.forEach.call(document.querySelectorAll('a.corrLink'), function (a) {
      a.textContent = t('corrLine', { email: EMAIL }); a.href = mailto();
      if (!a.dataset.wired) { a.dataset.wired = '1'; a.addEventListener('click', function () { a.href = mailto(); }); }
    });
  }
  function phr(k) { var I = window.BAIN_I18N, out = String(t(k)).toLowerCase().split(/[,،、，]/); if (I.lang !== 'en') out = out.concat(String(I.LANGS.en.s[k]).toLowerCase().split(',')); return out.map(function (x) { return x.trim(); }).filter(Boolean); }
  function command(raw) {
    var text = String(raw || '').toLowerCase(), w = phr('corrCmd'), hit = false;
    for (var i = 0; i < w.length; i++) if (text.indexOf(w[i]) >= 0) { hit = true; break; }
    if (!hit) return null;
    var m = t('corrOpening', { email: EMAIL }); APP().status(m); APP().announce(m);
    if (!(window.BAIN_AI && BAIN_AI.active())) APP().sayNative(t('corrOpening', { email: EMAIL.replace(/\./g, ' . ').replace('@', ' @ ') }));
    setTimeout(open, 2500); return 'report';
  }
  window.BAIN_CORR = { EMAIL: EMAIL, SUBJECT: SUBJECT, AI_LINE_UNTIL: AI_LINE_UNTIL, aiLineOn: aiLineOn, mailto: mailto, open: open, spoken: spoken, context: context, render: render, command: command };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render); else render();
})();
