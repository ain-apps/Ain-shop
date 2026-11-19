// Spoken deals summary (test copy only): NO live searches.
// Tests site/dealssummary.js with stubbed favorites, shopping list,
// fresh search (BAIN_APP.searchRaw) and a stub BAIN_CONVO.
// Run: node tests/test-dealssummary.mjs
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const dir = path.dirname(fileURLToPath(import.meta.url));

// ---- stubs ----
globalThis.BAIN_I18N = { speech: () => 'en-US', t: (k, v) => k, lang: 'en', LANGS: { en: { s: {} } } };
const S = { results: [], query: null, shown: 0, chosen: -1, spot: -1, details: {}, searchedAt: 0 };
let searchCalls = [];
let searchMode = 'live'; // 'live' | 'cached'
globalThis.BAIN_APP = {
  S, t: (k) => k, shortName: (p) => String(p.title || '').slice(0, 60),
  sayNative: () => {}, announce: () => {}, status: () => {}, render: () => {},
  searchRaw: (args) => {
    searchCalls.push(args);
    if (searchMode === 'cached') return Promise.resolve({ cached: true, fresh: false, products: [], searched_at: Date.now() });
    const q = String(args.query || '').toLowerCase();
    const store = (args.stores && args.stores[0]) || '';
    if (/walmart/.test(store.toLowerCase())) return Promise.resolve({ fresh: true, products: [
      { title: 'Folgers Classic Roast Coffee 30 oz', store: 'Walmart', url: 'https://www.walmart.com/ip/1', price: 9.99, was_price: 12.99, currency: 'USD' },
      { title: 'Great Value Paper Towels', store: 'Walmart', url: 'https://www.walmart.com/ip/2', price: 5.00, currency: 'USD' },
      { title: 'Mystery Item With No Price', store: 'Walmart', url: 'https://www.walmart.com/ip/3', price: null, currency: 'USD' },
    ], searched_at: Date.now() });
    if (/target/.test(store.toLowerCase())) return Promise.resolve({ fresh: true, products: [
      { title: 'Whole Milk 1 Gallon', store: 'Target', url: 'https://www.target.com/p/1', price: 3.50, currency: 'USD' },
    ], searched_at: Date.now() });
    return Promise.resolve({ fresh: true, products: [], searched_at: Date.now() });
  },
};
let spoken = [];
let remembered = [];
globalThis.BAIN_CONVO = {
  speak: (text) => { spoken.push(text); },
  rememberSearch: (info) => { remembered.push(info); },
};
globalThis.BAIN_FAVORITES = ['Walmart', 'Target', 'Amazon', 'Best Buy', 'IKEA', 'Costco', 'Kroger'];
globalThis.BAIN_SHOPPINGLIST = [
  { title: 'Folgers coffee', price: 12.99, currency: 'USD', store: 'Walmart' },
  { title: 'whole milk', price: 3.99, currency: 'USD', store: 'Target' },
];

// ---- load dealssummary.js ----
const src = fs.readFileSync(path.join(dir, '..', 'site', 'dealssummary.js'), 'utf8');
eval(src);
const D = globalThis.BAIN_DEALS;

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? ' — ' + extra : '')); }
}

// 1. plan capping: 7 favorites -> at most 5 jobs, one per store
let jobs = D.planSummary(['Walmart', 'Target', 'Amazon', 'Best Buy', 'IKEA', 'Costco', 'Kroger'], []);
check('plan: max 5 jobs', jobs.length === 5, JSON.stringify(jobs.map((j) => j.store)));
check('plan: one job per store', jobs.every((j) => j.stores.length === 1 && j.stores[0] === j.store));
check('plan: first 5 favorites kept', jobs.map((j) => j.store).join(',') === 'Walmart,Target,Amazon,Best Buy,IKEA');

// 2. list-item folding: item names go into each store's query (max 4)
let jobs2 = D.planSummary(['Walmart', 'Target'], [{ name: 'coffee' }, { name: 'milk' }, { name: 'bread' }, { name: 'eggs' }, { name: 'butter' }]);
check('plan: list items folded into query', jobs2.every((j) => /coffee/.test(j.query) && /milk/.test(j.query)), JSON.stringify(jobs2.map((j) => j.query)));
check('plan: at most 4 items folded', jobs2.every((j) => !/butter/.test(j.query)), JSON.stringify(jobs2.map((j) => j.query)));
check('plan: query names the store', jobs2[0].query.indexOf('Walmart') >= 0 && jobs2[1].query.indexOf('Target') >= 0);
let jobsNoList = D.planSummary(['Walmart'], []);
check('plan: no list items still plans a store check', jobsNoList.length === 1 && /deals and sale prices at Walmart/.test(jobsNoList[0].query), JSON.stringify(jobsNoList));

// 3. single store ("what's on sale at Walmart?")
let jobsOne = D.planSummary(undefined, undefined, { singleStore: 'Walmart' });
check('plan: single store is one job', jobsOne.length === 1 && jobsOne[0].store === 'Walmart', JSON.stringify(jobsOne));

// 4. no favorites and no list items -> no jobs (caller asks instead of guessing)
check('plan: no favorites + no list = no jobs', D.planSummary([], []).length === 0);
delete globalThis.BAIN_FAVORITES;
let jobsDefault = D.planSummary(undefined, [{ name: 'coffee' }]);
check('plan: absent favorites fall back to defaults (capped 5)', jobsDefault.length === 5 && jobsDefault[0].store === 'Walmart', JSON.stringify(jobsDefault.map((j) => j.store)));
globalThis.BAIN_FAVORITES = ['Walmart', 'Target', 'Amazon', 'Best Buy', 'IKEA', 'Costco', 'Kroger'];

// 5. deal detection
check('dealOf: was_price drop', D.dealOf({ title: 'Coffee', price: 9.99, was_price: 12.99 }, []).kind === 'drop');
check('dealOf: list price drop (no was_price)', D.dealOf({ title: 'Folgers Classic Roast Coffee 30 oz', price: 9.99 }, [{ name: 'Folgers coffee', price: 12.99 }]).kind === 'drop');
check('dealOf: no drop when price is the list price', D.dealOf({ title: 'Whole Milk 1 Gallon', price: 3.99 }, [{ name: 'whole milk', price: 3.99 }]).kind === 'none');
check('dealOf: missing price', D.dealOf({ title: 'Mystery Item', price: null }, []).kind === 'no_price');
check('matchesItem: short name needs every word', D.matchesItem({ title: 'Folgers Classic Roast Coffee 30 oz' }, { name: 'Folgers coffee' }));
check('matchesItem: wrong item does not match', !D.matchesItem({ title: 'Folgers Classic Roast Coffee 30 oz' }, { name: 'whole milk' }));

// 6. summary sentences: drops, no-deals, missing prices
const listItems = [{ name: 'Folgers coffee', price: 12.99 }, { name: 'whole milk', price: 3.99 }];
let text = D.summarizeResults([
  { store: 'Walmart', products: [
    { title: 'Folgers Classic Roast Coffee 30 oz', store: 'Walmart', price: 9.99, was_price: 12.99, currency: 'USD' },
    { title: 'Mystery Item With No Price', store: 'Walmart', price: null, currency: 'USD' },
  ] },
  { store: 'Target', products: [
    { title: 'Whole Milk 1 Gallon', store: 'Target', price: 3.50, currency: 'USD' },
  ] },
], listItems);
check('summary: drop sentence with prices + on your list', /Walmart has Folgers Classic Roast Coffee 30 oz on your list on sale for \$9\.99, down from \$12\.99/.test(text), text);
check('summary: milk drop vs list price also spoken', /Target has Whole Milk 1 Gallon on your list on sale for \$3\.50, down from \$3\.99/.test(text), text);
check('summary: missing price reported honestly', /no price/.test(text), text);
check('summary: ends by asking what next', /Want me to read the Walmart deals first, or the Target ones\?/.test(text), text);

let textNoDeals = D.summarizeResults([
  { store: 'Target', products: [{ title: 'Whole Milk 1 Gallon', store: 'Target', price: 3.50, currency: 'USD' }] },
], []);
check('summary: no-deals sentence', /Target has no deals on your list today/.test(textNoDeals), textNoDeals);
check('summary: no-deals still asks what next', /Want me to check a different store/.test(textNoDeals), textNoDeals);

let textError = D.summarizeResults([{ store: 'Amazon', error: 'search failed' }], []);
check('summary: failed store reported honestly', /couldn't check Amazon/.test(textError), textError);
let textStale = D.summarizeResults([{ store: 'Amazon', error: 'not_fresh' }], []);
check('summary: cached answer refused in words', /didn't get a fresh answer from Amazon/.test(textStale), textStale);
let textEmpty = D.summarizeResults([], []);
check('summary: empty results ask which store', /Which store's deals do you want/.test(textEmpty), textEmpty);

// 7. runSummary end-to-end with the stub search: fresh, capped, spoken, remembered
searchCalls = []; spoken = []; remembered = []; S.results = [];
let res = await D.runSummary({ favorites: ['Walmart', 'Target'], listItems: [{ name: 'Folgers coffee', price: 12.99 }, { name: 'whole milk', price: 3.99 }] });
check('run: used 2 searches (one per store)', res.searches_used === 2 && searchCalls.length === 2, JSON.stringify({ used: res.searches_used, calls: searchCalls.length }));
check('run: every search was fresh:true', searchCalls.every((c) => c.fresh === true), JSON.stringify(searchCalls));
check('run: spoke the summary through BAIN_CONVO', spoken.length === 1 && spoken[0] === res.text && /Walmart has/.test(spoken[0]), JSON.stringify(spoken));
check('run: summary names the coffee drop', /\$9\.99, down from \$12\.99/.test(res.text), res.text);
check('run: rememberSearch called so follow-ups work', remembered.length === 1 && remembered[0].query === 'deals summary' && remembered[0].stores.length === 2, JSON.stringify(remembered));
check('run: drops become the current list, drops first', S.results.length >= 1 && /Coffee/.test(S.results[0].title), JSON.stringify(S.results.map((p) => p.title)));

// 8. runSummary: cached answers are refused, no prices spoken from them
searchMode = 'cached'; searchCalls = []; spoken = [];
let resCached = await D.runSummary({ favorites: ['Walmart'], listItems: [] });
check('run: cached answer refused', resCached.results[0] && resCached.results[0].error === 'not_fresh', JSON.stringify(resCached.results));
check('run: cached summary says no fresh answer', /didn't get a fresh answer/.test(resCached.text), resCached.text);
searchMode = 'live';

// 9. runSummary: no favorites + no list -> asks, zero searches
searchCalls = []; spoken = [];
let resNone = await D.runSummary({ favorites: [], listItems: [] });
check('run: no favorites/list asks instead of searching', resNone.asked === true && resNone.searches_used === 0 && searchCalls.length === 0, JSON.stringify(resNone));
check('run: ask names favorites or a store', /Which store's deals do you want/.test(resNone.text), resNone.text);

// 10. speakSummary falls back to plain speech when BAIN_CONVO is absent
const convo = globalThis.BAIN_CONVO;
delete globalThis.BAIN_CONVO;
let fallback = D.speakSummary('Hello, deals here.');
check('speak: fallback returns the text without BAIN_CONVO', fallback === 'Hello, deals here.');
globalThis.BAIN_CONVO = convo;

// 11. typed commands match the three voice commands
check('command: what deals do my stores have today', D.command("what deals do my stores have today?") === 'summary');
check('command: any deals on my list', D.command('any deals on my list?') === 'summary');
check('command: whats on sale at Walmart', D.command("what's on sale at Walmart?") === 'summary');
check('command: unrelated text is not a deals command', D.command('find me running shoes') === null);

console.log(JSON.stringify({ total: pass + fail, passed: pass, failed: fail }));
if (fail) process.exit(1);
