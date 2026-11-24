/* AIN Shop — owner usage counts, phone side (v36).
   One fire-and-forget beacon when a Buy button is tapped (Go to checkout): the item words + store only, no device
   id, no personal data. It never blocks the buy — sendBeacon (or a keepalive fetch) lets the store page open at
   once. The server counts it in the usage_day table for the owner usage page (most-tapped buy buttons).
   window.BAIN_USAGE */
(function (root) {
  'use strict';
  function buyTap(title, store) {
    try {
      var body = JSON.stringify({ item: String(title || '').slice(0, 160), store: String(store || '').slice(0, 60) });
      if (navigator.sendBeacon) { try { navigator.sendBeacon('/api/shop/usage/buy', new Blob([body], { type: 'application/json' })); return true; } catch (e) {} }
      fetch('/api/shop/usage/buy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true }).catch(function () {});
      return true;
    } catch (e) { return false; }
  }
  root.BAIN_USAGE = { buyTap: buyTap };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.BAIN_USAGE;
})(typeof window !== 'undefined' ? window : globalThis);
