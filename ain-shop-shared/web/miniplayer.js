/* AIN Shop — mini floating window, like YouTube picture-in-picture (v36).
   "Shrink" collapses the app to a small floating window that keeps talking, so the person can use other apps at the
   same time. Honest limit: a web page cannot float over other apps on iOS — the real mechanism is background audio
   (the iPhone wrapper keeps the voice playing when the app is in the background). On the website the mini window
   lives inside the page (drag it anywhere; it shows the current spoken result and the voice controls), and the voice
   keeps going while the tab is open. Tapping Shrink tells the app "keep talking while I switch away" (see callpause).
   window.BAIN_MINI */
(function (root) {
  'use strict';
  var APP = function () { return root.BAIN_APP; };
  function t(k, v) { return APP() ? APP().t(k, v) : k; }
  function $(id) { return document.getElementById(id); }
  var M = { el: null, txt: null, on: false, x: null, y: null };

  function aiOn() { return root.BAIN_AI && BAIN_AI.active(); }
  function topLine() {
    var A = APP(); if (!A || !A.S) return '';
    var r = (A.S.results || [])[0];
    if (r) return [r.title, r.price_text || (r.price != null ? A.money(r.price, r.currency) : '')].filter(Boolean).join(' — ');
    if (A.S.query && A.S.query.query) return t('miniSearching', { q: A.S.query.query });
    return '';
  }
  function statusLine() {
    if (aiOn()) return t('miniListening');
    var top = topLine();
    return top || t('miniIdle');
  }
  function update() {
    if (!M.el || !M.on) return;
    if (M.txt) M.txt.textContent = statusLine();
  }
  function build() {
    if (M.el) return M.el;
    var d = document.createElement('div'); d.id = 'miniPlayer'; d.className = 'miniPlayer'; d.hidden = true;
    d.setAttribute('role', 'region'); d.setAttribute('aria-label', t('miniLabel'));
    var h = document.createElement('div'); h.className = 'miniHead';
    var tx = document.createElement('p'); tx.className = 'miniText'; tx.id = 'miniText'; h.appendChild(tx);
    var x = document.createElement('button'); x.type = 'button'; x.className = 'miniX'; x.textContent = '×'; x.setAttribute('aria-label', t('miniClose')); x.addEventListener('click', function (e) { e.stopPropagation(); hide(); }); h.appendChild(x);
    d.appendChild(h);
    var row = document.createElement('div'); row.className = 'miniRow';
    var talk = document.createElement('button'); talk.type = 'button'; talk.className = 'big miniBtn'; talk.textContent = t('miniTalk');
    talk.addEventListener('click', function (e) { e.stopPropagation(); if (root.BAIN_AI && BAIN_AI.toggle) BAIN_AI.toggle(); update(); });
    var stop = document.createElement('button'); stop.type = 'button'; stop.className = 'big alt miniBtn'; stop.textContent = t('miniStop');
    stop.addEventListener('click', function (e) { e.stopPropagation(); if (root.BAIN_AI && BAIN_AI.stop) BAIN_AI.stop('mini'); update(); });
    var more = document.createElement('button'); more.type = 'button'; more.className = 'big alt miniBtn'; more.textContent = t('miniMore');
    more.addEventListener('click', function (e) { e.stopPropagation(); if (aiOn() && root.BAIN_AI.tell) root.BAIN_AI.tell('The person tapped "More results" in the mini window. Call more_results now.'); else if (APP() && APP().more) APP().more(); });
    var exp = document.createElement('button'); exp.type = 'button'; exp.className = 'big alt miniBtn'; exp.textContent = t('miniExpand');
    exp.addEventListener('click', function (e) { e.stopPropagation(); hide(); var tb = $('talkBtn'); if (tb) { try { tb.focus(); } catch (err) {} } });
    row.appendChild(talk); row.appendChild(stop); row.appendChild(more); row.appendChild(exp);
    d.appendChild(row);
    document.body.appendChild(d);
    M.el = d; M.txt = tx;
    // drag anywhere on the card (touch and mouse): it follows the finger, and stays on screen
    var drag = null;
    function pos(e) { var p = (e.touches && e.touches[0]) || e; return { x: p.clientX, y: p.clientY }; }
    function onDown(e) { if (e.target && e.target.tagName === 'BUTTON') return; var p = pos(e); drag = { dx: p.x - d.getBoundingClientRect().left, dy: p.y - d.getBoundingClientRect().top }; d.classList.add('drag'); }
    function onMove(e) { if (!drag) return; var p = pos(e); var nx = Math.max(0, Math.min(window.innerWidth - 40, p.x - drag.dx)), ny = Math.max(0, Math.min(window.innerHeight - 40, p.y - drag.dy)); d.style.left = nx + 'px'; d.style.top = ny + 'px'; d.style.right = 'auto'; d.style.bottom = 'auto'; if (e.cancelable) e.preventDefault(); }
    function onUp() { drag = null; d.classList.remove('drag'); }
    d.addEventListener('pointerdown', onDown);
    d.addEventListener('pointermove', onMove);
    d.addEventListener('pointerup', onUp); d.addEventListener('pointercancel', onUp);
    return d;
  }
  function show() {
    build(); M.on = true; M.el.hidden = false; update();
    var tb = $('talk'); if (tb) tb.classList.add('miniOn');   // the big Talk button dims while the mini window is on
  }
  function hide() {
    M.on = false; if (M.el) M.el.hidden = true;
    var tb = $('talk'); if (tb) tb.classList.remove('miniOn');
  }
  function toggle() { if (M.on) hide(); else show(); }
  function shrinkButton() {
    // the "Shrink" button next to the Talk button: the explicit "keep talking while I use other apps" signal.
    // The Talk button's id is "talk" (index.html); "talkBtn" is kept as a fallback.
    var tb = $('talk') || $('talkBtn'); if (!tb || document.getElementById('miniShrinkBtn')) return;
    var b = document.createElement('button'); b.type = 'button'; b.id = 'miniShrinkBtn'; b.className = 'big alt miniShrink'; b.textContent = t('miniShrink');
    b.setAttribute('aria-label', t('miniShrink'));
    b.addEventListener('click', function (e) { e.stopPropagation(); show(); });
    if (tb.parentNode) tb.parentNode.insertBefore(b, tb.nextSibling);
  }
  function init() { shrinkButton(); }
  root.BAIN_MINI = { show: show, hide: hide, toggle: toggle, update: update, active: function () { return M.on; }, shrinkButton: shrinkButton, init: init };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(typeof window !== 'undefined' ? window : globalThis);
