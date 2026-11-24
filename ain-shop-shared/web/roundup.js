/* AIN Shop — daily spoken roundup (TEST COPY ONLY, v33).
   Feature 8 of 8 (approved 2026-11-17 morning): "what dropped today?"
   — one spoken roundup of price drops on his list, ON DEMAND ONLY.
   No background loop, no push, no timer: nothing is checked unless he
   asks, because there is no live server access and the watchlist can
   only be checked while the app is open. Every check is a fresh live
   search through the watchlist module (BAIN_WATCH.checkAll), so a
   repeat roundup never serves a cached price.
   What it says: drops first (name, store, old price, new price), then
   how many are unchanged, then anything the fresh search could not
   find (honestly — "couldn't find it just now", never "it's gone"),
   then one line from the feedback module about what he has rated, if
   he has rated anything. Nothing is stored by this module at all.
   window.BAIN_ROUNDUP */
(function (root) {
  'use strict';

  function C() { try { return root.BAIN_CONVO || null; } catch (e) { return null; } }
  function W() { try { return root.BAIN_WATCH || null; } catch (e) { return null; } }
  function F() { try { return root.BAIN_FEED || null; } catch (e) { return null; } }

  function norm(s) {
    try { return String(s == null ? '' : s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim(); }
    catch (e) { return String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim(); }
  }

  function speak(text) {
    var c = C();
    if (c && c.speak) { try { c.speak(text); return; } catch (e) {} }
    var A = null;
    try { A = root.BAIN_APP || null; } catch (e) {}
    if (A) { try { A.status(text); } catch (e) {} try { A.announce(text); } catch (e) {} }
  }

  function nameOf(r) {
    var w = (r && r.watch) || {};
    return String(w.name || w.title || (r && r.product && r.product.title) || 'an item');
  }

  // One roundup, on demand. Returns a promise of { text, drops, checked,
  // searches_used }. Drops are read first; unchanged items are counted,
  // not read one by one, so a long list stays a short roundup.
  function roundup() {
    var w = W();
    if (!w) return Promise.resolve({ text: "Price-drop alerts aren't available on this phone right now.", drops: 0, checked: 0, searches_used: 0 });
    var list = [];
    try { list = w.all() || []; } catch (e) { list = []; }
    if (!list.length) {
      var none = "You're not watching any items yet. After a search, say “remember this item”, or say “remember I'm looking for shoes below 50 dollars”.";
      speak(none);
      return Promise.resolve({ text: none, drops: 0, checked: 0, searches_used: 0 });
    }
    return w.checkAll().then(function (res) {
      res = res || {};
      var results = res.results || [];
      var drops = [], backs = [], same = 0, up = 0, gone = [], failed = 0;
      results.forEach(function (r) {
        if (!r) { failed++; return; }
        if (r.error) { failed++; return; }
        if (r.stock === 'back_in_stock') { backs.push(r); return; }   // v36: the back-in-stock news is spoken first, and only once
        if (r.change === 'drop') drops.push(r);
        else if (r.change === 'same' || r.change === 'found') same++;
        else if (r.change === 'up') up++;
        else if (r.change === 'not_found') gone.push(r);
        else failed++;
      });
      var parts = [];
      if (backs.length) {   // v36
        parts.push(backs.length === 1 ? 'One item is back in stock.' : backs.length + ' items are back in stock.');
        backs.forEach(function (r) {
          var line = '';
          try { line = w.checkSentence ? w.checkSentence(r) : ''; } catch (e) { line = ''; }
          if (!line) line = nameOf(r) + ' is back in stock.';
          parts.push(line);
        });
      }
      if (drops.length) {
        parts.push(drops.length === 1 ? 'One price dropped today.' : drops.length + ' prices dropped today.');
        drops.forEach(function (r) {
          var line = '';
          try { line = w.checkSentence ? w.checkSentence(r) : ''; } catch (e) { line = ''; }
          if (!line) line = nameOf(r) + ' dropped.';
          parts.push(line);
        });
      } else {
        parts.push('Nothing dropped today.');
      }
      if (same) parts.push(same === 1 ? 'One item is still the same price.' : same + ' items are still the same price.');
      if (up) parts.push(up === 1 ? 'One item went up.' : up + ' items went up.');
      if (gone.length) parts.push('I couldn’t find ' + gone.map(nameOf).join(', ') + ' in a fresh search just now. It may be out of stock or gone.');
      if (failed) parts.push('I couldn’t check ' + (failed === 1 ? 'one item' : failed + ' items') + ' just now.');
      // One feedback line, only when he has rated anything.
      try {
        var f = F();
        if (f && f.summary) {
          var ev = f.recentFeedback ? f.recentFeedback(1000) : null;
          if (ev && ev.length) parts.push(f.summary());
        }
      } catch (e) {}
      var text = parts.join(' ');
      speak(text);
      return { text: text, drops: drops.length, backs: backs.length, checked: res.checked || results.length, searches_used: res.searches_used || 0 };
    });
  }

  // "what dropped today?" / "daily roundup" / "what's new on my list"
  function command(text) {
    var t = norm(text);
    if (!t) return false;
    if (/\b(roundup|round up)\b/.test(t)) return run();
    if (/\b(dropped|drop|drops|cheaper|down)\b/.test(t) && /\b(today|my list|watch|watched|watching)\b/.test(t)) return run();
    if (/\bwhat(?:'s| s)?\s+(new|dropped|down)\b/.test(t) && /\b(list|watch)/.test(t)) return run();
    if (/^any (price )?drops( today)?$/.test(t)) return run();
    return false;
    function run() { roundup(); return true; }
  }

  function forAI() {
    return 'Daily roundup: "what dropped today?" — one fresh check per watched item, drops read first, nothing checked unless asked.';
  }

  root.BAIN_ROUNDUP = { roundup: roundup, command: command, forAI: forAI };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.BAIN_ROUNDUP;
})(typeof window !== 'undefined' ? window : globalThis);
