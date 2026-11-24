/* AIN Shop — return windows read aloud (v36).
   "How long do I have to return this?" — the return window for the store or the item, spoken aloud.
   Order of truth: (1) this verified directory of standard windows (instant); (2) the item's own page, read by
   checkout_prepare (schema.org merchantReturnDays — the freshest source, used when the directory has no answer);
   (3) the live store lookup (storeinfo return_days).
   Policies change and vary by item, so the spoken answer always says which source it came from, and when nothing is
   verified it says so plainly instead of guessing.
   window.BAIN_RETURNS */
(function (root) {
  'use strict';
  // Verified 2026-11-20 against the stores' own return pages and current guides. days = the standard window for most
  // items; note = the exceptions that matter. days null = not verified (the live lookup answers it instead).
  var DIRECTORY = {
    'walmart': { days: 90, note: 'electronics 30 days, wireless phones 14 days' },
    'target': { days: 90, note: 'electronics 30 days, Apple and mobile phones 14 days, Target-owned brands 1 year' },
    'amazon': { days: 30, note: 'from delivery; third-party sellers set their own' },
    'best buy': { days: 15, note: 'Plus and Total members 60 days, activatable devices 14 days' },
    'costco': { days: null, note: 'no time limit on most items; electronics and major appliances 90 days' },
    'home depot': { days: 90, note: '365 days on a Home Depot credit account; major appliances 48 hours' },
    'lowes': { days: 90, note: '365 days on select Lowe’s credit accounts; major appliances shorter' },
    'cvs': { days: 60, note: 'most items, with receipt' },
    'walgreens': { days: 30, note: 'most items' },
    'kroger': { days: null, note: null },
    'meijer': { days: null, note: null },
    'ikea': { days: 365, note: 'unopened; 180 days opened' },
    'macys': { days: 30, note: 'most items; some items differ' },
    'kohls': { days: 180, note: 'premium electronics 30 days' },
    'ebay': { days: null, note: 'depends on the seller — most allow 30 days' },
    'etsy': { days: null, note: 'depends on the seller — each shop sets its own returns' },
    'wayfair': { days: 30, note: 'rugs over $299: 90 days' }
  };
  function norm(s) { try { return String(s == null ? '' : s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim(); } catch (e) { return String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim(); } }
  function find(store) {
    var n = norm(store); if (!n) return null;
    if (DIRECTORY[n]) return DIRECTORY[n];
    if (DIRECTORY[n.replace(/ /g, '')]) return DIRECTORY[n.replace(/ /g, '')];   // "wal mart" → "walmart", "home depot" → "homedepot"
    var keys = Object.keys(DIRECTORY);
    for (var i = 0; i < keys.length; i++) if (keys[i].indexOf(n) === 0 || n.indexOf(keys[i]) === 0) return DIRECTORY[keys[i]];
    return null;
  }
  // the spoken window from {days, note} + a source label — pure, unit-tested
  function describe(store, win, source) {
    var name = store || 'this store';
    if (!win) return 'I do not know the return window for ' + name + '.';
    if (win.days != null) return 'You have ' + win.days + ' days to return most items at ' + name + (win.note ? ' (' + win.note + ')' : '') + ', ' + (source || 'from the store’s standard policy') + '.';
    if (win.note) return 'For ' + name + ': ' + win.note + ', ' + (source || 'from the store’s standard policy') + '.';
    return 'I do not know the return window for ' + name + '.';
  }
  function currentIndex() {
    try {
      var A = root.BAIN_APP; if (A && A.S && A.S.chosen >= 0) return A.S.chosen;
      var CO = root.BAIN_CO, cur = CO && CO.current ? CO.current() : null;
      if (cur && typeof cur.i === 'number') return cur.i;
    } catch (e) {}
    return null;
  }
  function liveOrUnknown(store) {
    var SI = root.BAIN_STOREINFO;
    if (SI && SI.about) return SI.about(store).then(function (o) {
      if (o && o.facts && o.facts.return_days != null) return { text: describe(store, { days: o.facts.return_days, note: o.facts.return_note }, 'from a live lookup'), days: o.facts.return_days, source: 'live lookup' };
      return { text: describe(store, null), days: null, source: 'unknown' };
    }).catch(function () { return { text: describe(store, null), days: null, source: 'unknown' }; });
    return Promise.resolve({ text: describe(store, null), days: null, source: 'unknown' });
  }
  // the window for the current item / store: the store directory first (instant), then the item's own page
  // (prepare with quiet:true, so asking does not touch the Buy-again history), then the live lookup
  function window(store, itemIndex) {
    var dir = find(store);
    if (dir && (dir.days != null || dir.note)) return Promise.resolve({ text: describe(store, dir, 'from the store’s standard policy'), days: dir.days, source: 'directory' });
    var CO = root.BAIN_CO, idx = (typeof itemIndex === 'number') ? itemIndex : currentIndex();
    if (CO && CO.prepare && idx != null) {
      return Promise.resolve(CO.prepare(idx, 1, '', { quiet: true })).then(function (co) {
        var ret = co && co.info && co.info.returns;
        if (ret && (ret.days != null || ret.text)) return { text: describe(store, { days: ret.days != null ? ret.days : null, note: ret.text || null }, 'the store page says so for this item'), days: ret.days != null ? ret.days : null, source: 'item page' };
        return liveOrUnknown(store);
      }).catch(function () { return liveOrUnknown(store); });
    }
    return liveOrUnknown(store);
  }
  // typed "how long do I have to return this?" / "return window" — never the orders "return policy" command
  function command(raw) {
    var text = String(raw || '').toLowerCase().trim(); if (!text) return false;
    if (!/return/.test(text)) return false;
    if (!/how long|how many days|return window|how much time/.test(text)) return false;
    var A = root.BAIN_APP; if (!A) return false;
    var S = A.S || {}, cur = (S.results && S.chosen >= 0) ? S.results[S.chosen] : null;
    var store = (cur && cur.store) || (root.BAIN_CO && root.BAIN_CO.current() && root.BAIN_CO.current().info && root.BAIN_CO.current().info.store) || null;
    window(store, S.chosen >= 0 ? S.chosen : null).then(function (o) { A.status(o.text); A.announce(o.text); if (!(root.BAIN_AI && root.BAIN_AI.active())) A.sayNative(o.text); });
    return true;
  }
  function forAI() { return 'Return windows: "how long do I have to return this?" — the item page first, then the store’s standard window, then a live lookup; say plainly when it is not known.'; }
  root.BAIN_RETURNS = { DIRECTORY: DIRECTORY, find: find, describe: describe, window: window, command: command, forAI: forAI };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.BAIN_RETURNS;
})(typeof window !== 'undefined' ? window : globalThis);
