/* AIN Shop — spoken deals summary (TEST COPY ONLY, v32).
   Feature 5 of 8: "what deals do my stores have today?" — a spoken
   summary of deals across the person's favorite stores, ON DEMAND ONLY.
   Nothing runs in the background, nothing auto-runs, nothing is cached:
   every summary is fresh searches, right now, because the person asked.

   HARD CAPS (the app's own limits — see MEMORY.md / _worker.js):
     - 60 searches per phone per day, $25/day site-wide.
     - One summary uses AT MOST ONE fresh search per favorite store,
       and at most 5 searches total (MAX_STORES_PER_SUMMARY = 5).
       A 6th favorite store is simply not checked this time — the
       summary says which stores it checked.
     - Every check carries fresh:true, so the server skips its cache
       read AND its cache write. A cached answer is refused, exactly
       like the watchlist does: no price from it is ever spoken.
     - A remembered / list price is never spoken as today's price:
       it is always "down from" / "was".

   How it works, in order:
     1. ASK (by voice): "what deals do my stores have today?",
        "any deals on my list?", "what's on sale at Walmart?"
     2. PLAN: planSummary(favorites, listItems) makes one search job
        per favorite store (max 5). The shopping-list items are folded
        into each store's query (up to 4 item names), so the search
        looks for deals on the things the person already wants.
     3. CHECK: runSummary() runs one fresh live search per job, one
        after another, right now. No background loop, no push.
     4. SPEAK: summarizeResults() turns the results into full spoken
        sentences — "Walmart has the coffee on your list on sale for
        $9.99, down from $12.99. Target has no deals on your list
        today." — and ends by asking what the person wants next:
        "Want me to read the Walmart deals first, or the Target ones?"
        Spoken through window.BAIN_CONVO (site/conversation.js) when
        it exists, else plain spoken text on this phone.
     5. REMEMBER: after speaking, C.rememberSearch() is called (when
        BAIN_CONVO has it) so "the second one" / "read the first one"
        follow-ups work.

   A "deal" is a product whose page says a higher old price
   (was / was_price) than its price today, or a shopping-list item
   found today for less than the price on the list. A product with
   no price is reported honestly ("no price shown") — never guessed.
   If there are no favorite stores and no list items, the app asks
   which store to check instead of guessing.

   Sources (read-only, defensive — all three may not exist yet):
     - favorites: window.BAIN_FAVORITES (site/favorites.js, parallel
       work). Accepted shapes: array of names, array of {name/store}
       objects, or an object with .list / .favorites / .stores array,
       or a .names() function. Absent → the ~30 default US stores
       (the STORE_NAMES list in site/_worker.js). Present but EMPTY
       (the person cleared their favorites) → no favorites: ask.
     - list items: window.BAIN_SHOPPINGLIST (parallel work), else the
       on-phone shopping list in window.BAIN_CO.groups(). Accepted
       shapes: array of strings, array of {title/name/query, price,
       store} objects, or an object with .items / .all() / .list.
     - conversation: window.BAIN_CONVO (site/conversation.js,
       parallel work). Used only as `var C = window.BAIN_CONVO || null`
       with typeof checks; everything falls back to plain speech.

   Strings are plain English inline here on purpose: site/i18n.js is
   being edited by another agent right now, so no new i18n keys were
   added. The coordinator should move these strings into i18n.js
   (deals* keys) for the 50 languages before this ships. */
(function (root) {
  'use strict';
  var MAX_STORES_PER_SUMMARY = 5;   // also the max searches per summary: one per store
  var MAX_LIST_ITEMS_PER_QUERY = 4; // item names folded into one store's query
  var DAILY_SEARCH_LIMIT = 60;      // per phone per day (server-enforced; stated here so the cap is visible)
  var DAILY_SITE_CAP_USD = 25;      // site-wide per day (server-enforced)

  // The ~30 default US stores (STORE_NAMES in site/_worker.js), read-only.
  // Only the first MAX_STORES_PER_SUMMARY are ever checked in one summary.
  var DEFAULT_STORES = ['Walmart', 'Target', 'Amazon', 'Best Buy', 'IKEA', 'Wayfair', 'The Home Depot', "Lowe's", 'Costco', "Macy's", "Kohl's", 'eBay', 'Etsy', "Sam's Club", 'Overstock', 'CVS', 'Walgreens', 'Gardner White', "Bob's Discount Furniture", 'Rooms To Go', 'Ashley', 'Meijer', 'Kroger', 'Apple', 'Nike', 'Allbirds', 'Zappos', 'Chewy', 'Staples', 'Dollar General'];

  function APP() { return root.BAIN_APP; }
  function C() { return root.BAIN_CONVO || null; }   // the shared conversation module, when it exists
  function I() { return root.BAIN_I18N; }

  function clean(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
  function num(p) { if (p == null || p === '') return null; var n = typeof p === 'number' ? p : parseFloat(String(p).replace(/[^0-9.,-]/g, '').replace(/,(?=\d{3}\b)/g, '').replace(',', '.')); return isFinite(n) ? n : null; }
  function money(price, cur) {
    if (price == null) return 'price unknown';
    try { return new Intl.NumberFormat(I() && I().speech ? I().speech() : 'en-US', { style: 'currency', currency: cur || 'USD' }).format(price); } catch (e) { return '$' + price; }
  }
  function nice(name) {   // "walmart" -> "Walmart"; names already written with capitals stay as written
    var n = clean(name).replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/.*$/, '').replace(/\.(com|net|org|shop|store|co\.il|co\.uk|us)$/i, '').slice(0, 40);
    return n === n.toLowerCase() ? n.replace(/(^|[\s-])(\p{Ll})/gu, function (m, a, b) { return a + b.toUpperCase(); }) : n;
  }
  function normTitle(s) { try { return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim(); } catch (e) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); } }
  function words(s) { return normTitle(s).split(' ').filter(function (w) { return w.length >= 3; }); }

  // ---- reading favorites + list items (defensive: any of these may not exist yet) ----
  function asNameArray(v) {
    if (!v) return null;
    var a = null;
    if (Array.isArray(v)) a = v;
    else if (typeof v === 'function') { try { a = v(); } catch (e) { a = null; } }
    else if (Array.isArray(v.list)) a = v.list;
    else if (Array.isArray(v.favorites)) a = v.favorites;
    else if (Array.isArray(v.stores)) a = v.stores;
    else if (typeof v.names === 'function') { try { a = v.names(); } catch (e) { a = null; } }
    if (!Array.isArray(a)) return null;
    var out = [];
    a.forEach(function (x) {
      var n = typeof x === 'string' ? x : (x && (x.name || x.store || x.title));
      n = clean(n); if (n) out.push(nice(n));
    });
    return out;
  }
  // Returns { stores: [...], fromDefaults: bool }. Present-but-empty favorites
  // mean "the person has no favorites" (ask), NOT "use the defaults".
  function getFavorites() {
    if (root.BAIN_FAVORITES !== undefined && root.BAIN_FAVORITES !== null) {
      var f = asNameArray(root.BAIN_FAVORITES);
      if (f !== null) return { stores: f, fromDefaults: false };
    }
    // No favorites module yet: the ~30 default stores. Still capped to 5 per summary by planSummary.
    return { stores: DEFAULT_STORES.slice(), fromDefaults: true };
  }
  function asItemArray(v) {
    if (!v) return null;
    var a = null;
    if (Array.isArray(v)) a = v;
    else if (Array.isArray(v.items)) a = v.items;
    else if (Array.isArray(v.list)) a = v.list;
    else if (typeof v.all === 'function') { try { a = v.all(); } catch (e) { a = null; } }
    else if (typeof v.items === 'function') { try { a = v.items(); } catch (e) { a = null; } }
    if (!Array.isArray(a)) return null;
    var out = [];
    a.forEach(function (x) {
      if (typeof x === 'string') { if (clean(x)) out.push({ name: clean(x).slice(0, 90), price: null, currency: null, store: null }); return; }
      if (x && (x.title || x.name || x.query)) {
        out.push({ name: clean(x.title || x.name || x.query).slice(0, 90), price: num(x.price != null ? x.price : (x.first_price != null ? x.first_price : x.last_price)), currency: x.currency || null, store: x.store ? clean(x.store) : null });
      }
    });
    return out;
  }
  function getListItems() {
    var items = asItemArray(root.BAIN_SHOPPINGLIST);
    if (items !== null) return items;
    // Fall back to the on-phone shopping list (checkout.js groups, one per store).
    try {
      var co = root.BAIN_CO;
      if (co && typeof co.groups === 'function') {
        var all = [];
        co.groups().forEach(function (g) {
          (g.items || []).forEach(function (x) { all.push({ name: clean(x.title || x.name || '').slice(0, 90), price: num(x.price), currency: x.currency || null, store: g.store || null }); });
        });
        return all.filter(function (x) { return x.name; });
      }
    } catch (e) {}
    return [];
  }

  // ---- planning: one search job per favorite store, max 5 ----
  // favorites: array of names/objects (or null/undefined = read from the phone).
  // listItems: array of strings/objects (or null/undefined = read from the phone).
  // opts.singleStore: a store the person named ("what's on sale at Walmart?") — one job only.
  // Returns an array of jobs: [{ query, stores: [storeName], store: storeName }].
  // Returns [] when there is nothing to check (no favorites and no list items).
  function planSummary(favorites, listItems, opts) {
    opts = opts || {};
    var favs, fromDefaults = false;
    if (opts.singleStore) {
      favs = [nice(opts.singleStore)];
    } else if (favorites === undefined || favorites === null) {
      var g = getFavorites(); favs = g.stores; fromDefaults = g.fromDefaults;
    } else {
      var f = asNameArray(favorites);
      favs = f === null ? [] : f;
    }
    var items = (listItems === undefined || listItems === null) ? getListItems() : (asItemArray(listItems) || []);
    if (!favs.length && !items.length) return [];
    // No favorites at all (and not the defaults): check the stores the
    // list items themselves came from, if any — otherwise nothing to plan.
    var stores = favs.slice(0, MAX_STORES_PER_SUMMARY);
    if (!stores.length) {
      var seen = {};
      items.forEach(function (it) { if (it.store && !seen[it.store]) { seen[it.store] = true; stores.push(it.store); } });
      stores = stores.slice(0, MAX_STORES_PER_SUMMARY);
      if (!stores.length) return [];
    }
    var folded = items.slice(0, MAX_LIST_ITEMS_PER_QUERY).map(function (it) { return it.name; });
    return stores.map(function (store) {
      var q = folded.length
        ? 'deals and sale prices at ' + store + ' for ' + folded.join(', ')
        : 'deals and sale prices at ' + store + ' today';
      return { query: q, stores: [store], store: store, list_items: folded.slice(), from_defaults: fromDefaults };
    });
  }

  // ---- matching a fresh result to a list item, and spotting a deal ----
  function matchesItem(product, item) {
    var pw = words(product.title || ''), iw = words(item.name || '');
    if (!iw.length) return false;
    // Every word of a short item name must be in the title; for a long
    // name, most words are enough (titles add sizes and colours).
    var hit = iw.filter(function (w) { return pw.indexOf(w) >= 0; }).length;
    return iw.length <= 3 ? hit === iw.length : hit >= Math.ceil(iw.length * 0.75);
  }
  function oldPriceOf(p) { var v = num(p.was_price != null ? p.was_price : (p.was != null ? p.was : p.original_price)); return v; }
  function dealOf(product, listItems) {
    var price = num(product.price);
    var was = oldPriceOf(product);
    var item = null;
    (listItems || []).forEach(function (it) { if (!item && matchesItem(product, it)) item = it; });
    if (price == null) return { kind: 'no_price', price: null, was: was, item: item };
    if (was != null && was > price) return { kind: 'drop', price: price, was: was, item: item };
    if (item && item.price != null && price < item.price) return { kind: 'drop', price: price, was: item.price, item: item };
    return { kind: 'none', price: price, was: was, item: item };
  }

  // ---- what the person hears ----
  // results: one entry per job — { store, products: [...], error?, cached? }
  // (a raw search reply { products: [...] } is also accepted; its store
  //  is taken from the job order / the products themselves).
  // listItems: the shopping-list items, for "on your list" wording.
  // Returns one spoken paragraph, ending with a question about what next.
  function summarizeResults(results, listItems) {
    results = results || [];
    listItems = listItems || [];
    var lines = [], dealStores = [], checked = [];
    results.forEach(function (r) {
      var store = nice((r && r.store) || (r && r.products && r.products[0] && r.products[0].store) || 'that store');
      checked.push(store);
      if (!r || r.error === 'not_fresh') { lines.push("I didn't get a fresh answer from " + store + ", so I won't guess about its deals. Try asking again."); return; }
      if (r.error) { lines.push("I couldn't check " + store + " just now."); return; }
      var products = r.products || [];
      if (!products.length) { lines.push(store + ' has no deals on your list today.'); return; }
      var drops = [], noPrice = [], onList = 0;
      products.forEach(function (p) {
        var d = dealOf(p, listItems);
        if (d.kind === 'drop') { drops.push({ product: p, deal: d }); if (d.item) onList++; }
        else if (d.kind === 'no_price') noPrice.push(p);
      });
      if (!drops.length) {
        lines.push(store + ' has no deals on your list today.');
        if (noPrice.length) lines.push(store + ' showed ' + noPrice.length + (noPrice.length === 1 ? ' item' : ' items') + ' with no price, so I can\'t say if ' + (noPrice.length === 1 ? 'it is' : 'they are') + ' a deal.');
        return;
      }
      dealStores.push(store);
      drops.slice(0, 3).forEach(function (d) {
        var p = d.product, name = clean(p.title || '').slice(0, 90) || 'something';
        var onListWords = d.deal.item ? ' on your list' : '';
        lines.push(store + ' has ' + name + onListWords + ' on sale for ' + money(d.deal.price, p.currency) + ', down from ' + money(d.deal.was, p.currency) + '.');
      });
      if (drops.length > 3) lines.push(store + ' has ' + (drops.length - 3) + ' more ' + (drops.length - 3 === 1 ? 'deal' : 'deals') + ' too.');
      if (noPrice.length) lines.push(store + ' also showed ' + noPrice.length + (noPrice.length === 1 ? ' item' : ' items') + ' with no price, so I can\'t say if ' + (noPrice.length === 1 ? 'it is' : 'they are') + ' a deal.');
    });
    if (!results.length) return "I don't have any stores to check. Which store's deals do you want — or tell me your favorite stores first?";
    if (dealStores.length >= 2) lines.push('Want me to read the ' + dealStores[0] + ' deals first, or the ' + dealStores[1] + ' ones?');
    else if (dealStores.length === 1) lines.push('Want me to read those ' + dealStores[0] + ' deals out in full, or check another store?');
    else lines.push('Want me to check a different store, or look for something else on sale?');
    return lines.join(' ');
  }

  // ---- speaking (through BAIN_CONVO when it exists, else plain speech) ----
  function speakSummary(text) {
    var convo = C();
    if (convo && typeof convo.speak === 'function') { try { convo.speak(text); return text; } catch (e) {} }
    var A = APP();
    try { if (A) { A.status(text); A.announce(text); if (!(root.BAIN_AI && root.BAIN_AI.active && root.BAIN_AI.active())) A.sayNative(text); } } catch (e) {}
    return text;
  }
  function remember(text, jobs, results) {
    var convo = C();
    if (convo && typeof convo.rememberSearch === 'function') {
      try {
        var products = [];
        (results || []).forEach(function (r) { (r.products || []).forEach(function (p) { products.push(p); }); });
        convo.rememberSearch({ query: 'deals summary', stores: jobs.map(function (j) { return j.store; }), products: products, text: text });
      } catch (e) {}
    }
  }

  // ---- the on-demand run: plan, one fresh search per store, speak ----
  // opts: { favorites, listItems, singleStore } — all optional (read from the phone).
  // searchFn: optional override for tests; default is BAIN_APP.searchRaw.
  // Returns a promise of { jobs, results, text, searches_used, asked }.
  // asked=true means no search ran: the person was asked which store to check.
  function runSummary(opts, searchFn) {
    opts = opts || {};
    var favs = opts.favorites !== undefined ? opts.favorites : undefined;
    var items = opts.listItems !== undefined ? opts.listItems : undefined;
    var jobs = planSummary(favs, items, { singleStore: opts.singleStore });
    var list = (items === undefined || items === null) ? getListItems() : (asItemArray(items) || []);
    if (!jobs.length) {
      var ask = "Which store's deals do you want — or tell me your favorite stores first?";
      speakSummary(ask);
      return Promise.resolve({ jobs: [], results: [], text: ask, searches_used: 0, asked: true });
    }
    var A = APP();
    var search = searchFn || (A && A.searchRaw ? function (args) { return A.searchRaw(args); } : null);
    if (!search) {
      var noSearch = "I can't check the stores right now — search isn't available. Try again in a moment.";
      speakSummary(noSearch);
      return Promise.resolve({ jobs: jobs, results: [], text: noSearch, searches_used: 0, asked: false });
    }
    var results = [], used = 0;
    var chain = Promise.resolve();
    jobs.forEach(function (job) {
      chain = chain.then(function () {
        if (results.some(function (r) { return r.error === 'rate_limited'; })) return null;   // daily limit hit: stop, don't burn more searches
        return search({ query: job.query, stores: job.stores, fresh: true }).then(function (j) {
          used++;
          var out = { store: job.store, job: job };
          if (!j || j.error) { out.error = j && j.error ? j.error : 'search failed'; }
          else if (j.cached) { out.error = 'not_fresh'; }   // HARD RULE: a cached answer is refused
          else out.products = j.products || [];
          results.push(out);
        }).catch(function () { used++; results.push({ store: job.store, job: job, error: 'search failed' }); });
      });
    });
    return chain.then(function () {
      var text = summarizeResults(results, list);
      // The found deals become the current list, drops first — so
      // "read the first one" / "open the second one" works by voice.
      var found = [];
      results.forEach(function (r) {
        (r.products || []).forEach(function (p) { var d = dealOf(p, list); if (d.kind === 'drop') found.push(p); });
      });
      if (A && A.S && found.length) {
        A.S.results = found; A.S.query = { query: 'deals summary', stores: jobs.map(function (j) { return j.store; }) };
        A.S.shown = 0; A.S.chosen = -1; A.S.spot = -1; A.S.details = {}; A.S.searchedAt = Date.now();
        try { A.render(); } catch (e) {}
      }
      speakSummary(text);
      remember(text, jobs, results);
      return { jobs: jobs, results: results, text: text, searches_used: used, asked: false };
    });
  }

  // ---- typed (no voice call) commands ----
  // "what deals do my stores have today?" / "any deals on my list?" /
  // "what's on sale at Walmart?" / "deals today" / "what deals are there?"
  function command(raw) {
    var text = clean(raw).toLowerCase(); if (!text) return null;
    var m = /(?:what(?:'s| is)? on sale at|deals at|sales at|on sale at)\s+(.+?)\s*[?.!]*$/.exec(text);
    if (m && m[1] && m[1].length <= 40) {
      var store = clean(m[1]).replace(/^(the|my)\s+/, '');
      if (store && store.split(/\s+/).length <= 4) {
        runSummary({ singleStore: store });
        return 'summary';
      }
    }
    if (/deals?\b/.test(text) && /(my stores|my list|today|this week|any deals|what.*deals|deals.*today|show.*deals|tell me.*deals)/.test(text)) {
      runSummary({});
      return 'summary';
    }
    if (/^(any deals|deals today|what'?s on sale|what is on sale|show me (the )?deals|deals)$/.test(text)) {
      runSummary({});
      return 'summary';
    }
    return null;
  }

  function forAI() {
    var g = getFavorites(), items = getListItems();
    return { favorite_stores: g.stores.slice(0, MAX_STORES_PER_SUMMARY), favorites_from_defaults: g.fromDefaults, list_items: items.slice(0, MAX_LIST_ITEMS_PER_QUERY).map(function (it) { return it.name; }), max_searches_per_summary: MAX_STORES_PER_SUMMARY, daily_search_limit: DAILY_SEARCH_LIMIT, note: 'On demand only: one fresh search per favorite store, at most ' + MAX_STORES_PER_SUMMARY + ' searches per summary. Ask which store to check if there are no favorites and no list items.' };
  }

  root.BAIN_DEALS = { planSummary: planSummary, summarizeResults: summarizeResults, runSummary: runSummary, speakSummary: speakSummary, command: command, getFavorites: getFavorites, getListItems: getListItems, matchesItem: matchesItem, dealOf: dealOf, forAI: forAI,
    MAX_STORES_PER_SUMMARY: MAX_STORES_PER_SUMMARY, MAX_LIST_ITEMS_PER_QUERY: MAX_LIST_ITEMS_PER_QUERY, DAILY_SEARCH_LIMIT: DAILY_SEARCH_LIMIT, DAILY_SITE_CAP_USD: DAILY_SITE_CAP_USD, DEFAULT_STORES: DEFAULT_STORES.slice() };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.BAIN_DEALS;
})(typeof window !== 'undefined' ? window : globalThis);
