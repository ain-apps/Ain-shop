// Price-drop watchlist (test copy only): NO live searches.
// Tests site/watchlist.js with a stubbed localStorage and a fake fresh
// search (BAIN_APP.searchRaw). Run: node tests/test-watchlist.mjs
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const STR = {
  priceUnknown: 'Price unknown',
  watchNone: "You're not watching any items yet.",
  watchList: "You're watching: {items}.",
  watchDrop: '{name} at {store} dropped from {old} to {price}.',
  watchUp: '{name} at {store} went up from {old} to {price}.',
  watchSame: '{name} at {store} is still {price}.',
  watchFound: 'Found {name} at {store} for {price}.',
  watchTargetHit: "That's already at or below your target of {price}.",
  watchGone: "I couldn't find {name} at {store} in a fresh search just now.",
  watchNoCheck: "I couldn't check {name} just now.",
  watchNotFresh: "I didn't get a fresh price for {name}, so I won't guess.",
  watchLimit: 'The daily search limit is reached.',
  watchAdded: 'Watching {name} at {store}, first seen at {price}.',
  watchTargetSet: "I'll tell you when it is {price} or less.",
};
function tt(k, v) { var s = STR[k] != null ? STR[k] : k; return String(s).replace(/\{(\w+)\}/g, function (_, n) { return v && v[n] != null ? v[n] : ''; }); }

// ---- stubs ----
const store = {};
globalThis.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
globalThis.BAIN_I18N = { speech: () => 'en-US', t: tt, lang: 'en', LANGS: { en: { s: {} } } };
const S = { results: [], query: null, shown: 0, chosen: -1, spot: -1, details: {}, searchedAt: 0 };
let fakeMode = 'live'; // 'live' | 'cached'
globalThis.BAIN_APP = {
  S, t: tt, shortName: (p) => String(p.title || '').slice(0, 60),
  sayNative: () => {}, announce: () => {}, status: () => {}, render: () => {},
  searchRaw: (args) => {
    if (fakeMode === 'cached') return Promise.resolve({ cached: true, fresh: false, products: [], searched_at: Date.now() });
    const q = String(args.query || '').toLowerCase();
    if (q.indexOf('nike') >= 0) return Promise.resolve({ fresh: true, products: [{ title: 'Nike Running Shoes', store: 'Walmart', url: 'https://www.walmart.com/ip/123', price: 40, currency: 'USD' }], searched_at: Date.now() });
    if (q.indexOf('milk') >= 0) return Promise.resolve({ fresh: true, products: [{ title: 'Whole Milk 1 Gallon', store: 'Target', url: 'https://www.target.com/p/milk-1', price: 3.50, currency: 'USD' }], searched_at: Date.now() });
    return Promise.resolve({ fresh: true, products: [], searched_at: Date.now() });
  },
};

// ---- load watchlist.js ----
const src = fs.readFileSync(path.join(dir, '..', 'site', 'watchlist.js'), 'utf8');
eval(src);
const W = globalThis.BAIN_WATCH;

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? ' — ' + extra : '')); }
}
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

const shoe = { title: 'Nike Running Shoes', store: 'Walmart', url: 'https://www.walmart.com/ip/123', price: 50, currency: 'USD' };

// 1. add records the first price; re-adding the same URL does not duplicate
let w1 = W.add(shoe, { query: 'nike running shoes' });
check('add: first_price recorded', w1 && w1.first_price === 50, JSON.stringify(w1));
check('add: one watch', W.all().length === 1);
W.add(shoe, { query: 'nike running shoes' });
check('add: same URL does not duplicate', W.all().length === 1);

// 2. watch by words with a target price
let w2 = W.addByQuery('whole milk', 3);
check('addByQuery: target stored', w2 && w2.target_price === 3 && w2.first_price === null, JSON.stringify(w2));
check('addByQuery: two watches', W.all().length === 2);

// 3. matching: same item at the same store only
check('sameItem: URL match', W.sameItem(w1, { title: 'Nike Running Shoes', store: 'Walmart', url: 'https://www.walmart.com/ip/123' }));
check('sameItem: store+title match', W.sameItem(w1, { title: 'Nike Running Shoes', store: 'Walmart', url: 'https://www.walmart.com/ip/999' }));
check('sameItem: other store same title is NOT the item', !W.sameItem(w1, { title: 'Nike Running Shoes', store: 'Target', url: 'https://www.target.com/p/9' }));
check('sameItem: same store other title is NOT the item', !W.sameItem(w1, { title: 'Nike Running Shorts', store: 'Walmart', url: 'https://www.walmart.com/ip/124' }));

// 4. price comparisons
check('priceChange: drop', eq(W.priceChange(50, 40, null), { change: 'drop', target_hit: false }));
check('priceChange: same', eq(W.priceChange(50, 50, null), { change: 'same', target_hit: false }));
check('priceChange: up', eq(W.priceChange(50, 55, null), { change: 'up', target_hit: false }));
check('priceChange: first sighting', eq(W.priceChange(null, 40, 50), { change: 'found', target_hit: true }));
check('priceChange: no price', eq(W.priceChange(50, null, null), { change: 'unknown', target_hit: false }));
check('priceChange: target hit on drop', W.priceChange(50, 40, 45).target_hit === true);
check('priceChange: no target hit above target', W.priceChange(50, 48, 45).target_hit === false);

// 5. target price parsing
check('parseTarget: below $50', eq(W.parseTarget('nike shoes below $50'), { target: 50, rest: 'nike shoes' }));
check('parseTarget: under 29.99 dollars', W.parseTarget('milk under 29.99 dollars').target === 29.99);
check('parseTarget: no price', W.parseTarget('nike shoes').target === null);

// 6. checkOne: a real drop is found and recorded; first price never moves
let r1 = await W.checkOne(W.all().find((w) => w.query === 'nike running shoes'));
check('checkOne: drop detected', r1.change === 'drop' && r1.price === 40 && r1.old_price === 50, JSON.stringify(r1));
let after = W.all().find((w) => w.query === 'nike running shoes');
check('checkOne: first_price stays 50, last_price is 40', after.first_price === 50 && after.last_price === 40, JSON.stringify(after));

// 7. HARD RULE: a cached answer is refused and records nothing
fakeMode = 'cached';
let before = W.all().find((w) => w.query === 'nike running shoes');
let r2 = await W.checkOne(before);
check('checkOne: cached answer refused', r2.error === 'not_fresh', JSON.stringify(r2));
let after2 = W.all().find((w) => w.query === 'nike running shoes');
check('checkOne: cached answer changed nothing', after2.last_price === 40 && after2.last_change === 'drop', JSON.stringify(after2));
fakeMode = 'live';

// 8. checkOne: item not found in a fresh search
let w3 = W.addByQuery('red winter coat', null);
let r3 = await W.checkOne(w3);
check('checkOne: not found reported honestly', r3.change === 'not_found' && r3.found === false, JSON.stringify(r3));

// 9. checkOne: first sighting by words (no URL yet) records the first price
let r4 = await W.checkOne(W.all().find((w) => w.query === 'whole milk'));
check('checkOne: first sighting found', r4.change === 'found' && r4.price === 3.5, JSON.stringify(r4));
let milk = W.all().find((w) => w.query === 'whole milk');
check('checkOne: first price recorded from search', milk.first_price === 3.5 && milk.store === 'Target' && !!milk.url, JSON.stringify(milk));

// 10. checkAll: checks every watch, one fresh search each; drops first in the current list
let res = await W.checkAll();
check('checkAll: checked all watches', res.checked === 3 && res.searches_used === 3, JSON.stringify({ checked: res.checked, searches_used: res.searches_used }));
check('checkAll: drops first in the current list', S.results.length >= 1 && String(S.results[0].title).toLowerCase().indexOf('nike') >= 0, JSON.stringify(S.results.map((p) => p.title)));

// 11. spoken lines
let dropLine = W.checkSentence({ watch: after, change: 'drop', price: 40, old_price: 50, product: { store: 'Walmart', currency: 'USD' }, target_hit: false });
check('checkSentence: drop line', dropLine.indexOf('dropped from') >= 0 && dropLine.indexOf('$40') >= 0, dropLine);
let listLine = W.listSentence();
check('listSentence: names watches', listLine.indexOf('Nike') >= 0 && listLine.toLowerCase().indexOf('milk') >= 0, listLine);

// 12. find / forget / clear
check('find: by name', W.find('nike shoes') >= 0);
check('find: by number', W.find('1') >= 0);
let gone = W.forget('milk');
check('forget: by name removes one', !!gone && W.all().length === 2, JSON.stringify(gone));
W.clear();
check('clear: empty', W.all().length === 0);

console.log(JSON.stringify({ total: pass + fail, passed: pass, failed: fail }));
if (fail) process.exit(1);
