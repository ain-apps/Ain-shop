/* AIN Shop — call the store by voice (v36).
   "Call Walmart" — the store's public phone number, from the store directory (verified numbers) or the live store
   lookup. On the website a tap on the call link dials; in the iPhone wrapper the tel: link is handed to the Phone app
   (the wrapper already opens any non-http(s) scheme with UIApplication.shared.open — no wrapper change needed). A
   store with no public number (eBay, Etsy, Wayfair) says so plainly instead of dialing a made-up number.
   window.BAIN_CALL */
(function (root) {
  'use strict';
  function info() { return root.BAIN_STOREINFO || null; }
  // {display, tel} for a store name, or null when no public number is known — never a made-up number
  function numberFor(name) {
    var SI = info(); if (!SI) return null;
    if (SI.phoneFor) { var p = SI.phoneFor(name); if (p) return p; }
    return null;
  }
  function callStore(name) {
    var n = numberFor(name);
    if (!n) return { error: 'no_number', note: 'I do not have a public phone number for ' + (name || 'that store') + ' — their help is on their website.' };
    try { root.location.href = 'tel:' + n.tel; } catch (e) { return { error: 'could_not_dial', number: n.display }; }
    return { ok: true, store: name, number: n.display, note: 'Calling ' + name + ' at ' + n.display + '.' };
  }
  // the on-screen call link for a store (an <a href="tel:…">), or null when there is no public number
  function link(name) {
    var n = numberFor(name); if (!n || typeof document === 'undefined') return null;
    var a = document.createElement('a'); a.href = 'tel:' + n.tel; a.className = 'storeCall'; a.textContent = 'Call ' + (name || '') + ': ' + n.display; return a;
  }
  root.BAIN_CALL = { numberFor: numberFor, callStore: callStore, link: link };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.BAIN_CALL;
})(typeof window !== 'undefined' ? window : globalThis);
