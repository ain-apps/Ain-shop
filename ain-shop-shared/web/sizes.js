/* AIN Shop — remember my size (v36).
   The app remembers the person's clothing sizes (men's clothing first — shirt, pants, shoes), saved on this phone
   only (localStorage), and uses them when shopping for clothes ("show me shirts in my size"). The person can change
   a size by voice any time. Sizes are personal: they never leave the phone, never go to the shared memory, and are
   wiped by "delete my data".
   window.BAIN_SIZES */
(function (root) {
  'use strict';
  var KEY = 'ainshop.sizes.v1';
  var KINDS = ['shirt', 'pants', 'shoes', 'jacket', 'hat', 'dress', 'skirt'];
  function load() { try { var o = JSON.parse(localStorage.getItem(KEY) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }
  function save(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} }
  function normKind(k) {
    var s = String(k || '').toLowerCase().trim();
    if (/shirt|top|tee|t-shirt|blouse/.test(s)) return 'shirt';
    if (/pant|trouser|jean|short/.test(s)) return 'pants';
    if (/shoe|sneaker|boot|sandal|footwear/.test(s)) return 'shoes';
    if (/jacket|coat/.test(s)) return 'jacket';
    if (/hat|cap/.test(s)) return 'hat';
    if (/dress/.test(s)) return 'dress';
    if (/skirt/.test(s)) return 'skirt';
    return null;
  }
  // "my shirt size is large" / "shoe size 10" / "my pants are 32" — pure, unit-tested
  function parse(text) {
    var t = String(text || '').toLowerCase();
    var m = t.match(/\b(shirt|pants|shoes?|jacket|hat|dress|skirt|top|tee|t-shirt|blouse|trousers?|jeans?|shorts|sneakers?|boots?|sandals?|footwear|coat|cap)\b[^a-z0-9]{0,12}(?:size\s*(?:is\s*|to\s*)?|is\s+|are\s+|to\s+|:\s*)?([a-z0-9][a-z0-9 .\/-]{0,12})/);
    if (!m) return null;
    var kind = normKind(m[1]); if (!kind) return null;
    var v = m[2].replace(/^(size|is|are)\s+/, '').trim().replace(/[.\s]+$/, '');
    if (!v || v.length > 16) return null;
    return { kind: kind, value: v };
  }
  function set(kind, value) {
    var k = normKind(kind); if (!k) return null;
    var v = String(value == null ? '' : value).trim().slice(0, 16); if (!v) return null;
    var all = load(); all[k] = v; save(all); return { kind: k, value: v };
  }
  function get(kind) { var k = normKind(kind); return k ? (load()[k] || null) : null; }
  function all() { return load(); }
  function forget(kind) { var k = normKind(kind); if (!k) return false; var o = load(); if (!(k in o)) return false; delete o[k]; save(o); return true; }
  function listText() {
    var o = load(), ks = Object.keys(o);
    if (!ks.length) return 'No sizes saved yet.';
    return ks.map(function (k) { return k + ' ' + o[k]; }).join(', ') + '.';
  }
  // the instruction line for the voice assistant: sizes are added to clothing searches, asked for once when missing
  // typed "my shirt size is large" / "my shoe size is 10" / "my pants are 32" / "set my shoe size to 10" — a teaching, not a search.
  // Narrow on purpose: "show me shirts in my size" (a search) must NOT land here.
  function command(raw) {
    var t = String(raw || '').toLowerCase().trim(); if (!t) return false;
    if (!/^my\b/.test(t) && !/\bsize\s*(is|to|:|=)/.test(t) && !/^set\b/.test(t)) return false;
    var p = parse(raw); if (!p) return false;
    var r = set(p.kind, p.value); if (!r) return false;
    var A = root.BAIN_APP; if (A) { var s = 'Saved — your ' + r.kind + ' size is ' + r.value + '.'; A.status(s); A.announce(s); if (!(root.BAIN_AI && root.BAIN_AI.active && root.BAIN_AI.active())) A.sayNative(s); }
    return true;
  }
  function sizesRule() {
    var o = load(), ks = Object.keys(o);
    if (!ks.length) return 'SIZES: no clothing sizes are saved on this phone yet. When the person shops for clothes or shoes, ask once for the size ("What size shirt do you wear?"), then call set_size with what they say, and use it in the search.';
    return 'SIZES (saved on this phone only, never shared): ' + ks.map(function (k) { return k + ' ' + o[k]; }).join(', ') + '. When the person shops for clothes or shoes, add the saved size to the search_products query (e.g. "men\'s shirts size large"). If they say a different size, use that one for this search and call set_size to update it. They can change a size any time by saying so.';
  }
  function forAI() { return 'Sizes: "show me shirts in my size" — sizes saved on this phone only; set_size saves one, get_sizes lists them.'; }
  root.BAIN_SIZES = { KINDS: KINDS, parse: parse, set: set, get: get, all: all, forget: forget, listText: listText, sizesRule: sizesRule, normKind: normKind, forAI: forAI, command: command };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.BAIN_SIZES;
})(typeof window !== 'undefined' ? window : globalThis);
