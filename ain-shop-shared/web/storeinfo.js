/* AIN Shop — "tell me about the store" (v36).
   Everything about a store, spoken aloud: nearest location, how many locations, hours, phone, delivery, online-only.
   Facts come from two places only: this verified directory (phone numbers and location counts checked against the
   stores' own pages) and a live lookup (/api/shop/storeinfo) for the nearest store and the hours. Online-only stores
   (Amazon, eBay, Etsy, Wayfair) are never given a street address. Anything unknown is said plainly ("I don't know
   the hours for this one") — never guessed. Hours vary by location, so the directory never holds hours; the live
   lookup returns the nearest store's hours.
   window.BAIN_STOREINFO */
(function (root) {
  'use strict';
  // Verified 2026-11-20 against the stores' own contact pages and public counts. null = not verified (the live lookup fills it).
  // All of these deliver (online-only stores ship by definition; the rest offer delivery or pickup).
  var DIRECTORY = {
    'walmart': { name: 'Walmart', phone: '1-800-925-6278', locations_us: 4700, locations_worldwide: 10900, online_only: false, delivers: true },
    'target': { name: 'Target', phone: '1-800-440-0680', locations_us: 2000, locations_worldwide: 2000, online_only: false, delivers: true },
    'amazon': { name: 'Amazon', phone: '1-888-280-4331', locations_us: null, locations_worldwide: null, online_only: true, delivers: true },
    'best buy': { name: 'Best Buy', phone: '1-888-237-8289', locations_us: null, locations_worldwide: null, online_only: false, delivers: true },
    'costco': { name: 'Costco', phone: '1-800-774-2678', locations_us: null, locations_worldwide: 800, online_only: false, delivers: true },
    'home depot': { name: 'Home Depot', phone: '1-800-466-3337', locations_us: null, locations_worldwide: 2300, online_only: false, delivers: true },
    'lowes': { name: "Lowe's", phone: '1-800-445-6937', locations_us: 1700, locations_worldwide: null, online_only: false, delivers: true },
    'cvs': { name: 'CVS', phone: '1-800-746-7287', locations_us: 9950, locations_worldwide: null, online_only: false, delivers: true },
    'walgreens': { name: 'Walgreens', phone: '1-800-925-4733', locations_us: null, locations_worldwide: null, online_only: false, delivers: true },
    'kroger': { name: 'Kroger', phone: '1-800-576-4377', locations_us: 2700, locations_worldwide: null, online_only: false, delivers: true },
    'meijer': { name: 'Meijer', phone: '1-877-363-4537', locations_us: 240, locations_worldwide: null, online_only: false, delivers: true },
    'ikea': { name: 'IKEA', phone: '1-888-888-4532', locations_us: null, locations_worldwide: null, online_only: false, delivers: true },
    'macys': { name: "Macy's", phone: '1-800-289-6229', locations_us: null, locations_worldwide: null, online_only: false, delivers: true },
    'ebay': { name: 'eBay', phone: null, locations_us: null, locations_worldwide: null, online_only: true, delivers: true },
    'etsy': { name: 'Etsy', phone: null, locations_us: null, locations_worldwide: null, online_only: true, delivers: true },
    'wayfair': { name: 'Wayfair', phone: null, locations_us: null, locations_worldwide: null, online_only: true, delivers: true },
    'kohls': { name: "Kohl's", phone: null, locations_us: null, locations_worldwide: null, online_only: false, delivers: true }
  };
  var ALIASES = { 'wal-mart': 'walmart', 'wallmart': 'walmart', 'bestbuy': 'best buy', 'home-depot': 'home depot', 'homedepot': 'home depot', 'macys': 'macys', "macy's": 'macys', 'kohls': 'kohls', "kohl's": 'kohls', 'cvs pharmacy': 'cvs', 'walgreens pharmacy': 'walgreens' };
  function norm(s) { try { return String(s == null ? '' : s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim(); } catch (e) { return String(s || '').toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim(); } }
  function find(name) {
    var n = norm(name); if (!n) return null;
    if (DIRECTORY[n]) return DIRECTORY[n];
    var al = ALIASES[n] || ALIASES[n.replace(/ /g, '-')] || ALIASES[n.replace(/ /g, '')];   // norm() turns hyphens into spaces, so try the hyphenated and joined spellings too
    if (al && DIRECTORY[al]) return DIRECTORY[al];
    var keys = Object.keys(DIRECTORY);
    for (var i = 0; i < keys.length; i++) if (keys[i].indexOf(n) === 0 || n.indexOf(keys[i]) === 0) return DIRECTORY[keys[i]];
    return null;
  }
  function telOf(display) {
    if (!display) return null;
    var d = String(display).replace(/\D/g, '');
    if (d.length === 10) return '+1' + d;
    if (d.length === 11 && d[0] === '1') return '+' + d;
    return null;
  }
  // {display, tel} for a store name, or null — used by the call feature; never a made-up number
  function phoneFor(name) {
    var f = find(name); if (!f || !f.phone) return null;
    var tel = telOf(f.phone); if (!tel) return null;
    return { display: f.phone, tel: tel };
  }
  function liveLookup(name, zip, city) {
    var body = { store: name }; if (zip) body.zip = zip; if (city) body.city = city;
    return fetch('/api/shop/storeinfo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return { error: 'bad_answer' }; }); })
      .catch(function () { return { error: 'offline' }; });
  }
  // directory + live lookup merged (live wins where it has a value; the directory fills the gaps)
  function about(name, zip, city) {
    var dir = find(name);
    return liveLookup(name, zip, city).then(function (live) {
      var facts = {
        name: (live && live.store) || (dir && dir.name) || name,
        online_only: (live && live.online_only != null) ? live.online_only : (dir ? dir.online_only : null),
        locations_us: (live && live.locations_us != null) ? live.locations_us : (dir ? dir.locations_us : null),
        locations_worldwide: (live && live.locations_worldwide != null) ? live.locations_worldwide : (dir ? dir.locations_worldwide : null),
        phone: (live && live.phone) || (dir && dir.phone) || null,
        phone_tel: (live && live.phone_tel) || (dir && dir.phone ? telOf(dir.phone) : null),
        hours_note: (live && live.hours_note) || null,
        delivers: (live && live.delivers != null) ? live.delivers : (dir ? dir.delivers : null),
        delivery_note: (live && live.delivery_note) || null,
        return_days: (live && live.return_days != null) ? live.return_days : null,
        return_note: (live && live.return_note) || null,
        nearest: (live && live.nearest) || null,
        source: live && !live.error ? 'live lookup' : 'directory'
      };
      if (!dir && (!live || live.error)) return { error: 'unknown_store', name: name };
      return { facts: facts };
    });
  }
  // one spoken paragraph from merged facts — every unknown is said plainly, never guessed (pure, unit-tested)
  function describe(f) {
    if (!f) return 'I do not know that store.';
    var p = [];
    p.push(f.name + '.');
    if (f.online_only === true) p.push('It is online-only — there are no walk-in stores, so there is no street address for it.');
    else {
      if (f.locations_us != null) p.push('About ' + f.locations_us.toLocaleString() + ' stores in the US' + (f.locations_worldwide != null && f.locations_worldwide > f.locations_us ? ', about ' + f.locations_worldwide.toLocaleString() + ' worldwide' : '') + '.');
      else if (f.locations_worldwide != null) p.push('About ' + f.locations_worldwide.toLocaleString() + ' stores worldwide.');
      else p.push('I do not know how many locations it has.');
    }
    if (f.nearest && f.nearest.address) p.push('The nearest one to you is at ' + f.nearest.address + (f.nearest.distance_miles != null ? ', about ' + f.nearest.distance_miles + ' miles away' : '') + (f.nearest.hours ? ', open ' + f.nearest.hours : '') + '.');
    else if (f.online_only !== true) p.push('I do not know where the nearest one to you is.');
    if (f.hours_note) p.push('Hours: ' + f.hours_note + '.');
    else if (f.nearest && f.nearest.hours) p.push('Hours: ' + f.nearest.hours + '.');
    else p.push('I do not know the hours for this one.');
    if (f.phone) p.push('Phone: ' + f.phone + '.');
    else p.push('I do not have a public phone number for this store.');
    if (f.delivers === true) p.push('It delivers' + (f.delivery_note ? ' — ' + f.delivery_note : '') + '.');
    else if (f.delivers === false) p.push('It does not deliver.');
    else p.push('I do not know whether it delivers.');
    if (f.return_days != null) p.push('Returns: ' + f.return_days + ' days for most items' + (f.return_note ? ' (' + f.return_note + ')' : '') + '.');
    return p.join(' ');
  }
  // typed "tell me about Walmart" / "about Target" — the AI tool store_info is the main path; this is the typed twin
  function command(raw) {
    var text = String(raw || '').toLowerCase().trim(); if (!text) return false;
    var m = text.match(/^(?:tell me about|about)\s+(.+)$/);
    if (!m) return false;
    var A = root.BAIN_APP; if (!A) return false;
    var loc = root.BAIN_LOC && BAIN_LOC.get ? BAIN_LOC.get() : null;
    about(m[1].trim(), loc && loc.zip, loc && loc.city).then(function (o) {
      var s = o && o.facts ? describe(o.facts) : 'I do not know that store.';
      A.status(s); A.announce(s); if (!(root.BAIN_AI && root.BAIN_AI.active && root.BAIN_AI.active())) A.sayNative(s);
    });
    return true;
  }
  function forAI() { return 'Tell me about the store: "tell me about Walmart" — nearest location, how many locations, hours, phone, delivery, online-only. Only verified facts; say plainly when something is unknown.'; }
  root.BAIN_STOREINFO = { DIRECTORY: DIRECTORY, find: find, phoneFor: phoneFor, about: about, describe: describe, liveLookup: liveLookup, forAI: forAI, command: command };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.BAIN_STOREINFO;
})(typeof window !== 'undefined' ? window : globalThis);
