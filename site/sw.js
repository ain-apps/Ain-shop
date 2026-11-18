/* AIN Shop service worker: the app shell works offline; /api is never cached. */
var V = 'ainshop-v30';
var SHELL = ['./', 'boot.js', 'home.js', 'styles.css', 'i18n.js', 'textkit.js', 'app.js', 'checkout.js', 'intent.js', 'stores.js', 'history.js', 'watchlist.js', 'conversation.js', 'favorites.js', 'pricespeech.js', 'shoppinglist.js', 'reorder.js', 'dealssummary.js', 'langfallback.js', 'feedback.js', 'roundup.js', 'location.js', 'corrections.js', 'barcode.js', 'orders.js', 'noisegate.js', 'show.js', 'ai.js', 'pay.js', 'legal-common.js', 'vcmd-i18n.js', 'vcmd.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/apple-touch-icon.png', 'icons/logo-512.png'];
self.addEventListener('install', function (e) { e.waitUntil(caches.open(V).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); })); });
self.addEventListener('activate', function (e) { e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== V; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); })); });
self.addEventListener('fetch', function (e) {
  var u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.indexOf('/api/') === 0 || u.pathname.indexOf('/admin') === 0) return;
  e.respondWith(caches.open(V).then(function (c) {
    return fetch(e.request).then(function (r) { if (r && r.ok) c.put(e.request, r.clone()); return r; })
      .catch(function () { return c.match(e.request, { ignoreSearch: true }).then(function (hit) { return hit || c.match('./'); }); });
  }));
});
