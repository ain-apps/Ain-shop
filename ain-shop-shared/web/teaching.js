/* AIN Shop — teaching loop (TEST COPY ONLY, v31).
   One person's correction can improve search for everyone — safely.
   How it works, in order:
     1. CAPTURE (automatic): when someone reports a mistake, a teaching
        record is saved ON THIS PHONE ONLY (localStorage, no server, no
        personal data) — the query they said and the wrong product shown.
        The email to ainshop.corrections@mail.tab.bot still goes out
        exactly as before; this only adds the local record.
     2. TEST (automatic): each record becomes a test case. Running
        teaching-loop.mjs re-runs the 509 local tests plus every teaching
        case and reports pass/fail for each one. No live searches.
     3. SUGGEST (automatic), APPLY (human only): suggest() drafts the
        exact rule that would fix a case (synonym, category exclusion,
        mention-noun, or intent.js mishearing fix) and puts it on the
        review list with status "pending-review". NOTHING here changes
        _worker.js, intent.js, or what any other user sees. A person
        approves the rule, edits the code, re-runs the tests, and the
        rule only reaches everyone in a future approved update (1.0.1).
   What is never stored: names, emails, addresses, ZIPs, card details,
   order history, or anything the user typed besides the search query
   and the product title shown. Records are capped at 200; oldest drop. */
(function () {
  'use strict';
  var KEY = 'ainshop.teaching.cases.v1';
  var MAX_CASES = 200;
  var MAX_TITLE = 160;

  function clean(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE); }
  function load() {
    try { var v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
  }
  function saveAll(list) { try { localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX_CASES))); return true; } catch (e) { return false; } }
  function idFor(query, wrongTitle) { return 't-' + String(query + '|' + wrongTitle).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80); }

  // Build a teaching record from what the app already knows: the current
  // search (BAIN_CORR.context() prints "Search: …" / "Product: …").
  function recordFromCorrection() {
    try {
      var ctx = (window.BAIN_CORR && BAIN_CORR.context) ? BAIN_CORR.context() : '';
      var q = '', wrong = '';
      ctx.split('\n').forEach(function (line) {
        if (line.indexOf('Search: ') === 0) q = clean(line.slice(8));
        if (line.indexOf('Product: ') === 0) wrong = clean(line.slice(9).split(' — ')[0]);
      });
      if (!q || !wrong) return null;
      return record({ query: q, wrong_title: wrong, source: 'report-a-mistake' });
    } catch (e) { return null; }
  }

  function record(c) {
    var rec = {
      id: idFor(c.query, c.wrong_title),
      date: new Date().toISOString().slice(0, 10),
      query: clean(c.query),
      wrong_title: clean(c.wrong_title),
      correct_title: clean(c.correct_title || ''),
      source: c.source || 'report-a-mistake',
      status: 'pending-review'
    };
    if (!rec.query || !rec.wrong_title) return null;
    var list = load();
    if (list.some(function (r) { return r.id === rec.id; })) return rec; // already captured: do not duplicate
    list.push(rec); saveAll(list);
    return rec;
  }

  // Draft the rule that would fix this case. This is a SUGGESTION only —
  // it is text on the review list, never applied by this file.
  // USER RULE: nothing from a correction is ever shared to anyone else
  // automatically. Each correction is brought to him in chat, spoken and
  // written — what was said, what was wrong, the exact rule — for a
  // yes/no on that one correction. The corrections email alone is not
  // how he sees them. A rule reaches everyone only after his yes on
  // that correction AND a future approved update (1.0.1).
  // The same logic lives in teaching-loop.mjs (Node), which can check it
  // against the real worker functions; this browser copy is a best guess
  // from the words alone, so a human always checks it.
  function suggest(rec) {
    var q = String(rec.query || '').toLowerCase();
    var w = String(rec.wrong_title || '').toLowerCase();
    if (!q || !w) return null;
    // Wrong product is a different kind of thing than the query asked for.
    var wrongKind = /bathing suit|swimsuit|swim suit/.test(w) ? 'swimwear'
      : /dog food|cat litter|pet food/.test(w) ? 'pets'
      : /water pump|garden hose|car tire/.test(w) ? 'tools'
      : /candle/.test(w) ? 'home (candle)'
      : /coffee mug|mug/.test(w) ? 'kitchen'
      : /laptop stand|desk lamp|chair/.test(w) ? 'home'
      : null;
    if (wrongKind) {
      return { type: 'category-exclusion', file: 'site/_worker.js', status: 'pending-review',
        rule: 'filterSearchResults() must remove "' + rec.wrong_title + '" for query "' + rec.query +
          '" — title category is ' + wrongKind + ', query category is different. ' +
          'Check CATEGORIES / categoryMatches() in _worker.js covers this pair; if not, add the trigger phrase.' };
    }
    if (/scented|flavored|print|shaped|soak|bath/.test(w)) {
      return { type: 'mention-noun', file: 'site/_worker.js', status: 'pending-review',
        rule: 'MENTION_NOUNS in _worker.js: the query word is only mentioned in "' + rec.wrong_title +
          '" — add the word after the head noun to MENTION_NOUNS so relevant() rejects it.' };
    }
    return { type: 'synonym', file: 'site/_worker.js', status: 'pending-review',
      rule: 'SYNONYM_GROUPS in _worker.js: add the synonym / word form that makes "' + rec.query +
        '" match the right product and not "' + rec.wrong_title + '". Verify with relevant() first.' };
  }

  function reviewList() { return load().map(function (r) { return { id: r.id, date: r.date, query: r.query, wrong_title: r.wrong_title, suggestion: suggest(r), status: r.status }; }); }
  function exportJSON() { return JSON.stringify(load(), null, 2); }

  window.BAIN_TEACH = { record: record, recordFromCorrection: recordFromCorrection, suggest: suggest, reviewList: reviewList, exportJSON: exportJSON, load: load };
})();
