/* AIN Shop — coupons (v36).
   Find a coupon or deal code for a store or product and read it out. A code is only ever spoken when it appears
   literally in a search result — the code word next to the code itself. No code is ever invented, and when none is
   found the app says so plainly. The search runs through the normal search (it never touches the on-screen results).
   window.BAIN_COUPONS */
(function (root) {
  'use strict';
  var APP = function () { return root.BAIN_APP; };
  // pull coupon codes out of result titles/snippets — pure, unit-tested. A code only counts when the words
  // "code", "coupon" or "promo" sit right next to it; a bare word in a title is never treated as a code.
  function extract(texts) {
    var codes = [], deals = [];
    (Array.isArray(texts) ? texts : []).forEach(function (raw) {
      var s = String(raw || '');
      var m, re = /(?:coupon(?:\s+code)?|promo(?:tion)?(?:\s+code)?|code)[^A-Za-z0-9]{0,25}([A-Za-z0-9][A-Za-z0-9-]{3,19})/gi;
      while ((m = re.exec(s)) !== null) {
        var c = m[1].replace(/-+$/, '').toUpperCase();
        if (/^(THE|AND|FOR|WITH|OFF|SAVE|GET|USE|SHOP|FROM|CODE|COUPON|PROMO)$/.test(c)) continue;
        if (codes.indexOf(c) < 0) codes.push(c);
      }
      var d, re2 = /(\d{1,2})\s*%\s*off/gi;
      while ((d = re2.exec(s)) !== null) { var p = +d[1]; if (p > 0 && p < 100 && deals.indexOf(p) < 0) deals.push(p); }
    });
    return { codes: codes.slice(0, 3), deals: deals.slice(0, 3) };
  }
  function find(store, item) {
    var A = APP(); if (!A || !A.searchRaw) return Promise.resolve({ error: 'search not available' });
    var q = [(store || ''), 'coupon code', (item || '')].filter(Boolean).join(' ').trim();
    return Promise.resolve(A.searchRaw({ query: q, fresh: true })).then(function (res) {
      var texts = [];
      ((res && res.products) || []).forEach(function (p) { if (p.title) texts.push(p.title); if (p.description) texts.push(p.description); if (p.snippet) texts.push(p.snippet); });
      var ex = extract(texts);
      if (!ex.codes.length && !ex.deals.length) return { found: false, store: store || null, item: item || null, note: 'I could not find a coupon code for ' + [item || '', store ? 'at ' + store : ''].filter(Boolean).join(' ') + ' — the store may not have one right now.' };
      return { found: true, store: store || null, item: item || null, codes: ex.codes, deals: ex.deals,
        text: (ex.codes.length ? 'I found a coupon code' + (ex.codes.length > 1 ? 's' : '') + ': ' + ex.codes.join(', ') + '. ' : '') + (ex.deals.length ? 'There is also ' + ex.deals.map(function (p) { return p + ' percent off'; }).join(' and ') + ' mentioned. ' : '') + 'I read these exactly as the search results showed them — the store page will confirm them at checkout.' };
    }).catch(function () { return { error: 'could not search for coupons just now' }; });
  }
  function forAI() { return 'Coupons: "is there a coupon for this?" — only a code that literally appears in a search result is ever read out; say plainly when none is found.'; }
  root.BAIN_COUPONS = { extract: extract, find: find, forAI: forAI };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.BAIN_COUPONS;
})(typeof window !== 'undefined' ? window : globalThis);
