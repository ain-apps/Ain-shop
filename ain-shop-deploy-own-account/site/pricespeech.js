/* AIN Shop — clearer spoken prices and stock (TEST COPY ONLY).
   Feature 2 of 8 (approved 2026-11-17 morning): every spoken result
   says the exact price and whether it is in stock, in full sentences,
   never a bare name or a bare number — because the app is a voice
   conversation, like a person talking back.
   Pure functions, no storage, no network. Standalone module: it does
   NOT edit any existing file and is not wired in yet — the coordinator
   wires it into ai.js / app.js later (see the integration snippet in
   the delivery report).
   Speaking goes through the shared conversation module when it exists:
   window.BAIN_CONVO.speak(text). BAIN_CONVO is being built in parallel
   and may not exist yet, so this module codes defensively: if it is
   absent, speak() just returns the plain text and the caller can say
   it another way (e.g. BAIN_APP.sayNative). */
(function (root) {
  'use strict';

  function C() { return root.BAIN_CONVO || null; }

  function clean(s, max) {
    var t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
    return max ? t.slice(0, max) : t;
  }

  // A real price is a finite number greater than zero. Accepts a number
  // (59.99) or a string ("$59.99", "1,299.00"). 0, negative, NaN, empty
  // or non-numeric input is NOT a price — it is "price not listed".
  function parsePrice(v) {
    if (v == null || v === '') return null;
    var n;
    if (typeof v === 'number') n = v;
    else {
      var s = String(v).replace(/[^0-9.,-]/g, '').replace(/,(?=\d{3}\b)/g, '').replace(',', '.');
      if (s === '' || s === '-' || s === '.') return null;
      n = parseFloat(s);
    }
    return (isFinite(n) && n > 0) ? n : null;
  }

  // The old / sale price, from whichever field the feed used. Only a
  // price HIGHER than the current one counts as a "was" price.
  function oldPrice(p) {
    if (!p) return null;
    var cands = [p.was_price, p.old_price, p.list_price, p.compare_at_price];
    for (var i = 0; i < cands.length; i++) {
      var n = parsePrice(cands[i]);
      if (n != null) return n;
    }
    return null;
  }

  function currencyOf(p) {
    var c = p && p.currency ? String(p.currency).trim().toUpperCase() : '';
    return /^[A-Z]{3}$/.test(c) ? c : 'USD';
  }

  // Exact digits, spoken as dollars: "$59.99". Never rounded, never
  // guessed — a missing price is said out loud as missing.
  function formatPrice(n, currency) {
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(n);
    } catch (e) {
      return '$' + Number(n).toFixed(2);
    }
  }

  function pricePhrase(p) {
    var n = p ? parsePrice(p.price) : null;
    if (n == null) return 'price not listed';
    return formatPrice(n, currencyOf(p));
  }

  // in_stock true -> in stock; false -> out of stock; anything else
  // (null, missing) -> stock not stated. Also understands the
  // string/boolean spellings other feeds use (available, stock).
  function stockPhrase(p) {
    if (!p) return 'stock not stated';
    var v = p.in_stock;
    if (v == null && p.available != null) v = p.available;
    if (typeof v === 'boolean') return v ? 'in stock' : 'out of stock';
    if (typeof v === 'string') {
      var s = v.toLowerCase();
      if (/out|unavailable|sold/.test(s)) return 'out of stock';
      if (/in stock|available|limited/.test(s)) return 'in stock';
      return 'stock not stated';
    }
    if (typeof p.stock === 'string') {
      var t = p.stock.toLowerCase();
      if (/out|unavailable|sold/.test(t)) return 'out of stock';
      if (/in stock|available|limited/.test(t)) return 'in stock';
    }
    return 'stock not stated';
  }

  function titleOf(p) {
    if (!p) return 'an item with no name listed';
    var t = clean(p.title || p.short_name || p.name, 140);
    return t || 'an item with no name listed';
  }

  // "blue, size 10" — only the details the listing actually has.
  function detailPhrase(p) {
    if (!p) return '';
    var bits = [];
    var color = clean(p.color, 40);
    if (color) bits.push(color);
    var size = clean(p.size || p.variant, 40);
    if (size) bits.push('size ' + size);
    return bits.join(', ');
  }

  // One spoken line for product p as item i of n, e.g.
  // "1. Nike running shoes, blue, size 10, $59.99, in stock at Walmart."
  // Sale: "… $49.99, down from $69.99, in stock at Walmart."
  function speakProduct(p, i, n) {
    var num = (typeof i === 'number' && isFinite(i) && i >= 1) ? i : 1;
    var parts = [num + '. ' + titleOf(p)];
    var det = detailPhrase(p);
    if (det) parts.push(det);
    var price = p ? parsePrice(p.price) : null;
    if (price == null) {
      parts.push('price not listed');
    } else {
      var cur = currencyOf(p);
      var line = formatPrice(price, cur);
      var old = oldPrice(p);
      if (old != null && old > price) line += ', down from ' + formatPrice(old, cur);
      parts.push(line);
    }
    parts.push(stockPhrase(p));
    var store = p ? clean(p.store, 60) : '';
    var text = parts.join(', ') + (store ? ' at ' + store : '') + '.';
    return text;
  }

  // The full spoken list, numbered, in sentences, ending with an offer
  // so the conversation keeps going like a person would.
  // products: array of product objects. offset: number of items already
  // read before this batch (so "read the next three" keeps counting).
  function speakList(products, offset) {
    var list = Array.isArray(products) ? products : [];
    var start = (typeof offset === 'number' && isFinite(offset) && offset >= 0) ? Math.floor(offset) : 0;
    if (!list.length) return "I didn't find any items to read out. Want me to try a different search?";
    var lines = [];
    for (var i = 0; i < list.length; i++) lines.push(speakProduct(list[i], start + i + 1, start + list.length));
    return lines.join(' ') + ' Want details on any of these, or shall I read the next three?';
  }

  // Say it through the shared conversation voice when it exists;
  // otherwise just hand the plain text back so the caller can say it
  // another way. Always returns the text.
  function speak(text) {
    var convo = C();
    if (convo && typeof convo.speak === 'function') {
      try { convo.speak(text); } catch (e) { /* fall through: text is still returned */ }
    }
    return text;
  }

  function readProduct(p, i, n) { return speak(speakProduct(p, i, n)); }
  function readList(products, offset) { return speak(speakList(products, offset)); }

  root.BAIN_PRICESPEECH = {
    speakProduct: speakProduct,
    speakList: speakList,
    pricePhrase: pricePhrase,
    stockPhrase: stockPhrase,
    formatPrice: formatPrice,
    parsePrice: parsePrice,
    speak: speak,
    readProduct: readProduct,
    readList: readList
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.BAIN_PRICESPEECH;
})(typeof window !== 'undefined' ? window : globalThis);
