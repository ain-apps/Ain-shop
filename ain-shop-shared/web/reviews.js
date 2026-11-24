/* AIN Shop — read reviews aloud (v36).
   "What do buyers say about this?" — a short spoken summary of the good and the bad, from the written reviews the
   store itself publishes in its product data (the worker reads up to 6 into details.reviews_text). Only real reviews
   are ever read: if the store shows a star rating and a count but no written reviews could be read, the app says so
   instead of inventing any. Some stores never let their pages be read (Amazon, eBay, Best Buy and the other NO_FETCH
   stores), so for those only the rating and the count are ever known.
   window.BAIN_REVIEWS */
(function (root) {
  'use strict';
  var APP = function () { return root.BAIN_APP; };
  function clip(s, n) { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  // split written reviews into good (>=4 stars) / bad (<=2) / mixed (3 or no stars) — pure, unit-tested
  function split(list) {
    var good = [], bad = [], mixed = [];
    (Array.isArray(list) ? list : []).forEach(function (r) {
      if (!r || !r.text) return;
      var t = clip(r.text, 160);
      if (r.rating != null && r.rating >= 4) good.push(t);
      else if (r.rating != null && r.rating <= 2) bad.push(t);
      else mixed.push(t);
    });
    return { good: good, bad: bad, mixed: mixed };
  }
  // one spoken paragraph from a details object {rating, reviews, reviews_text} — never invents a review
  function describe(d) {
    d = d || {};
    var rating = (d.rating != null && isFinite(d.rating)) ? d.rating : null;
    var count = (d.reviews != null && isFinite(d.reviews)) ? d.reviews : null;
    var parts = split(d.reviews_text);
    var head = rating != null ? 'Buyers rate it ' + rating + ' out of 5' + (count != null ? ' from ' + count + ' reviews' : '') + '.' : (count != null ? 'The store shows ' + count + ' reviews, with no average rating.' : '');
    if (!parts.good.length && !parts.bad.length && !parts.mixed.length) {
      if (rating != null || count != null) return { has_text: false, rating: rating, count: count, text: head + ' I could not read the written reviews for this one, so I cannot tell you what buyers actually said.' };
      return { has_text: false, rating: null, count: null, text: 'I could not find any reviews for this one.' };
    }
    var out = head;
    if (parts.good.length) out += ' The good: ' + parts.good.slice(0, 3).join(' — ');
    if (parts.bad.length) out += ' The bad: ' + parts.bad.slice(0, 3).join(' — ');
    if (!parts.good.length && !parts.bad.length && parts.mixed.length) out += ' What buyers said: ' + parts.mixed.slice(0, 3).join(' — ');
    return { has_text: true, rating: rating, count: count, good: parts.good.slice(0, 3), bad: parts.bad.slice(0, 3), text: out };
  }
  // the AI's "what do buyers say about this?" — details for result n (1-based), or the current item
  function summaryFor(n) {
    var A = APP(); if (!A || !A.details) return Promise.resolve({ error: 'details not available' });
    var i = (typeof n === 'number' && n >= 1) ? n - 1 : (A.S && A.S.chosen >= 0 ? A.S.chosen : 0);
    return Promise.resolve(A.details(i)).then(function (d) {
      if (!d) return { error: 'no product details yet' };
      return describe(d);
    }).catch(function () { return { error: 'could not read the reviews just now' }; });
  }
  function forAI() { return 'Reviews: "what do buyers say about this?" — a short spoken summary of the good and the bad, only from reviews the store itself published; say plainly when only the rating and count are known.'; }
  root.BAIN_REVIEWS = { split: split, describe: describe, summaryFor: summaryFor, forAI: forAI };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.BAIN_REVIEWS;
})(typeof window !== 'undefined' ? window : globalThis);
