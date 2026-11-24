// v36 functional tests — pure logic of the new modules + the changed watchlist/barcode paths.
// Run: node /tmp/v36-test.mjs
// Run from anywhere: node tests/test-v36-features.mjs (paths are relative to this file)
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const SITE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'ain-shop-shared', 'web') + '/';
let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra !== undefined ? ' :: ' + extra : '')); }
}

// ---- minimal browser stubs ----
const store = {};
globalThis.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
  clear: () => { for (const k of Object.keys(store)) delete store[k]; },
};
function fakeEl() {
  return { style: {}, className: '', textContent: '', innerHTML: '', hidden: false, dataset: {},
    appendChild() {}, addEventListener() {}, removeEventListener() {}, setAttribute() {}, getAttribute() { return null; },
    querySelector() { return null; }, querySelectorAll() { return []; }, focus() {}, click() {}, remove() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 }; }, classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} } };
}
globalThis.document = {
  readyState: 'complete', hidden: false, title: '',
  createElement: () => fakeEl(),
  getElementById: () => null,
  querySelector: () => null, querySelectorAll: () => [],
  addEventListener() {}, removeEventListener() {},
  body: fakeEl(), documentElement: fakeEl(),
};
Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15', sendBeacon: null }, configurable: true, writable: true });
globalThis.window = globalThis;
const fetchCalls = [];
globalThis.fetch = async (u, o) => { fetchCalls.push({ u, o }); return { ok: true, status: 200, json: async () => ({ ok: true }) }; };

// ---- imports ----
// web/*.js are ESM (ain-shop-shared/web/package.json has "type": "module"): import them and read the BAIN_* globals
await import(SITE + 'reviews.js');
await import(SITE + 'coupons.js');
await import(SITE + 'pricehistory.js');
await import(SITE + 'storeinfo.js');
await import(SITE + 'returns.js');
await import(SITE + 'sizes.js');
await import(SITE + 'memory.js');
await import(SITE + 'callpause.js');
await import(SITE + 'usage.js');
await import(SITE + 'i18n.js');
const reviews = globalThis.BAIN_REVIEWS;
const coupons = globalThis.BAIN_COUPONS;
const ph = globalThis.BAIN_PRICEHIST;
const si = globalThis.BAIN_STOREINFO;
const ret = globalThis.BAIN_RETURNS;
const sizes = globalThis.BAIN_SIZES;
const mem = globalThis.BAIN_MEMORY;
const callpause = globalThis.BAIN_CALLPAUSE;
const usage = globalThis.BAIN_USAGE;
const i18n = globalThis.BAIN_I18N;
const worker = await import(SITE + '_worker.js');

// 1. reviews
{
  const sp = reviews.split([
    { rating: 5, text: 'Great shoes' }, { rating: 1, text: 'Fell apart' }, { rating: 3, text: 'Okay' }, { rating: 4, text: 'Good value' }, { rating: 2, text: 'Too tight' },
  ]);
  check('reviews split good/bad/mixed', sp.good.length === 2 && sp.bad.length === 2 && sp.mixed.length === 1, JSON.stringify(sp));
  const d = reviews.describe({ title: 'Shoes', store: 'Walmart', rating: 4.5, reviews: 120, reviews_text: [{ rating: 5, text: 'Very comfortable' }, { rating: 1, text: 'Sole came off' }] }).text;
  check('reviews describe mentions good and bad', /comfortable/i.test(d) && /Sole came off/i.test(d) && /4\.5/.test(d), d);
  const d2 = reviews.describe({ title: 'Shoes', store: 'Amazon', rating: 4.2, reviews: 88, reviews_text: [] }).text;
  check('reviews describe no written reviews says so', /could not read the written reviews/i.test(d2), d2);
  const d3 = reviews.describe({ title: 'Shoes', store: 'X' }).text;
  check('reviews describe no rating says so', /could not find any reviews/i.test(d3), d3);
}

// 2. coupons — the fixed regex must capture the real code, never the word "code"
{
  const e = coupons.extract(['Use coupon code SAVE20 for 20% off', 'Promo code FREESHIP on orders over $25', 'code: WELCOME10']);
  check('coupons extract finds real codes', e.codes.includes('SAVE20') && e.codes.includes('FREESHIP') && e.codes.includes('WELCOME10'), JSON.stringify(e));
  check('coupons extract never captures the word code', !e.codes.some((c) => c.toLowerCase() === 'code'), JSON.stringify(e.codes));
  const e2 = coupons.extract(['The code is hard to find', 'No deals here']);
  check('coupons extract finds nothing when no code', e2.codes.length === 0 && !e2.found, JSON.stringify(e2));
  const e3 = coupons.extract(['Save 20% off with code HOLIDAY20 at checkout']);
  check('coupons extract percent deal', e3.deals.length >= 1 || e3.codes.includes('HOLIDAY20'), JSON.stringify(e3));
}

// 3. price history
{
  localStorage.clear();
  ph.record('Running Shoes', 'Walmart', 29.99);
  ph.record('Running Shoes', 'Walmart', 19.99);
  ph.record('Running Shoes', 'Walmart', 24.99);
  const h = ph.history('Running Shoes', 'Walmart');
  check('pricehistory lowest/highest/last', h && h.lowest === 19.99 && h.highest === 29.99 && h.last === 24.99, JSON.stringify(h));
  check('pricehistory verdict cheaper before', /cheaper before/i.test(ph.verdict(h, 24.99).text), ph.verdict(h, 24.99).text);
  check('pricehistory verdict lowest', /lowest price/i.test(ph.verdict(h, 19.99).text), ph.verdict(h, 19.99).text);
  check('pricehistory verdict never seen', /never seen/i.test(ph.verdict(null, 9.99).text), ph.verdict(null, 9.99).text);
  for (let i = 0; i < 305; i++) ph.record('Item ' + i, 'Walmart', 1 + i);
  const keys = JSON.parse(localStorage.getItem('ainshop.pricehist.v1') || '{}');
  check('pricehistory cap 300', Object.keys(keys).length <= 300, String(Object.keys(keys).length));
}

// 4. store info
{
  check('storeinfo find alias wal-mart', si.find('wal-mart') && si.find('wal-mart').name === 'Walmart');
  check('storeinfo find bestbuy', si.find('bestbuy') && si.find('bestbuy').name === 'Best Buy');
  const w = si.phoneFor('Walmart');
  check('storeinfo walmart phone', w && w.tel === '+18009256278' && w.display === '1-800-925-6278', JSON.stringify(w));
  check('storeinfo ebay has no phone', si.phoneFor('eBay') === null);
  check('storeinfo unknown store null', si.find('No Such Store XYZ') === null);
  const am = si.describe({ name: 'Amazon', online_only: true, phone: '1-888-280-4331', locations_us: null, locations_worldwide: null, hours_note: null, delivers: true, delivery_note: null, return_days: 30, return_note: 'from delivery', nearest: null, sources: [] });
  check('storeinfo amazon online-only, no address', /online-only/i.test(am) && /no street address/i.test(am), am);
  const kr = si.describe({ name: 'Kroger', online_only: false, phone: '1-800-576-4377', locations_us: 2700, locations_worldwide: null, hours_note: null, delivers: true, delivery_note: null, return_days: null, return_note: null, nearest: null, sources: [] });
  check('storeinfo unknown hours/returns said plainly', /do not know the hours/i.test(kr) && /do not know where the nearest/i.test(kr), kr);
}

// 5. returns
{
  check('returns walmart 90 days', ret.find('Walmart') && ret.find('Walmart').days === 90);
  check('returns ikea 365', ret.find('IKEA') && ret.find('IKEA').days === 365);
  check('returns kroger unknown', ret.find('Kroger') && ret.find('Kroger').days === null);
  check('returns ebay depends on seller', /depends on the seller/i.test(ret.describe('eBay', { days: null, note: 'depends on the seller' }, 'directory')));
  check('returns describe 90 days', /90 days/i.test(ret.describe('Walmart', { days: 90, note: 'electronics 30 days' }, 'directory')));
  check('returns describe unknown says so', /do not know the return window/i.test(ret.describe('Kroger', null, 'directory')));
}

// 6. sizes
{
  localStorage.clear();
  const p1 = sizes.parse('my shirt size is large');
  check('sizes parse shirt large', p1 && p1.kind === 'shirt' && p1.value === 'large', JSON.stringify(p1));
  const p2 = sizes.parse('my shoe size is 10');
  check('sizes parse shoe 10', p2 && p2.kind === 'shoes' && p2.value === '10', JSON.stringify(p2));
  const p3 = sizes.parse('my pants are 32');
  check('sizes parse pants 32', p3 && p3.kind === 'pants' && p3.value === '32', JSON.stringify(p3));
  globalThis.BAIN_APP = { status() {}, announce() {}, sayNative() {} };
  globalThis.BAIN_AI = { active: () => false };
  check('sizes command saves', sizes.command('my shirt size is large') === true && sizes.get('shirt') === 'large');
  check('sizes command ignores a search', sizes.command('show me shirts in my size') === false);
  check('sizes command pants', sizes.command('my pants are 32') === true && sizes.get('pants') === '32');
  check('sizes command set to', sizes.command('set my shoe size to 10') === true && sizes.get('shoes') === '10');
  check('sizes listText', /shirt.*large/i.test(sizes.listText()) && /pants.*32/i.test(sizes.listText()), sizes.listText());
  sizes.forget('shirt');
  check('sizes forget', sizes.get('shirt') === null);
}

// 7. shared memory (local aisle + last-taught)
{
  localStorage.clear();
  const a = mem.teachAisle('Heinz Tomato Ketchup', 'Walmart', 'aisle 7', 'shelf 2');
  check('memory teachAisle stores', a && a.aisle === 'aisle 7' && a.shelf === 'shelf 2', JSON.stringify(a));
  const l = mem.aisleLocal('heinz tomato ketchup', 'walmart');
  check('memory aisleLocal finds it', l && l.aisle === 'aisle 7');
  mem.setLastTaught({ what: 'aisle', entry: { name: 'Heinz Tomato Ketchup', store: 'Walmart', aisle: 'aisle 7', shelf: 'shelf 2' } });
  check('memory lastTaught round-trip', mem.lastTaught() && mem.lastTaught().what === 'aisle');
  const d = mem.describe({ found: true, facts: { name: 'Heinz Tomato Ketchup', brand: 'Heinz', price_cents: 349, price_seen_at: Date.now(), store: 'Walmart', aisle: 'aisle 7' }, source: 'shared memory' }, 'Heinz Tomato Ketchup', 'Walmart');
  check('memory describe aisle once + price', /aisle 7/i.test(d) && !/aisle aisle/i.test(d) && /\$3\.49/.test(d), d);
  const d2 = mem.describe({ found: false }, 'Unknown Thing', 'Walmart');
  check('memory describe not remembered says so', /not remembered|nobody/i.test(d2), d2);
}

// 8. callpause state machine
{
  const calls = [];
  globalThis.BAIN_AI = { active: () => true, pauseVoice: (r) => { calls.push('pause:' + r); return true; }, resumeVoice: (r) => { calls.push('resume:' + r); return true; } };
  Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'Mozilla/5.0 (iPhone) Safari/605.1.15' }, configurable: true, writable: true });
  check('callpause not wrapper', callpause.isWrapper() === false);
  callpause.onHidden();
  check('callpause hidden pauses', callpause.paused() === true && calls.some((c) => c.startsWith('pause:')), JSON.stringify(calls));
  callpause.onVisible();
  check('callpause visible resumes', callpause.paused() === false && calls.some((c) => c.startsWith('resume:')), JSON.stringify(calls));
  calls.length = 0;
  callpause.onInterruption(true);
  check('callpause call began pauses', callpause.paused() === true && calls[0] && calls[0].startsWith('pause:call'), JSON.stringify(calls));
  callpause.onInterruption(false);
  check('callpause call ended resumes', callpause.paused() === false && calls.some((c) => c.startsWith('resume:call')), JSON.stringify(calls));
  Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'Mozilla/5.0 (iPhone) AINShopiOS/1.0 Safari/605.1.15' }, configurable: true, writable: true });
  check('callpause wrapper detected', callpause.isWrapper() === true);
  calls.length = 0;
  callpause.onHidden();
  check('callpause wrapper hidden does NOT pause', callpause.paused() === false && calls.length === 0, JSON.stringify(calls));
  Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'Mozilla/5.0 (iPhone) Safari/605.1.15' }, configurable: true, writable: true });
}

// 9. usage beacon
{
  fetchCalls.length = 0;
  await usage.buyTap('Running Shoes', 'Walmart');
  check('usage buyTap posts beacon', fetchCalls.length === 1 && /\/api\/shop\/usage\/buy/.test(fetchCalls[0].u), JSON.stringify(fetchCalls));
  const body = JSON.parse(fetchCalls[0].o.body);
  check('usage buyTap sends words only', body.item === 'Running Shoes' && body.store === 'Walmart' && !('device' in body) && !('id' in body), JSON.stringify(body));
  globalThis.fetch = async () => { throw new Error('offline'); };
  let threw = false;
  try { await usage.buyTap('X', 'Y'); } catch (e) { threw = true; }
  check('usage buyTap never throws', threw === false);
  globalThis.fetch = async (u, o) => { fetchCalls.push({ u, o }); return { ok: true, status: 200, json: async () => ({ ok: true }) }; };
}

// 10. worker pure functions (re-verify after all edits)
{
  check('worker normName', worker.normName('Heinz Tomato Ketchup, 500g!') === 'heinz tomato ketchup 500g');
  check('worker memoryKey bc', worker.memoryKey('bc', '049000050103') === 'bc:049000050103');
  check('worker memoryKey ns', worker.memoryKey('ns', 'Heinz Ketchup', 'Walmart') === 'ns:heinz ketchup|walmart');
  const ok = worker.parseBarcodeWeb(JSON.stringify({ found: true, barcode: '049000050103', name: 'Coca-Cola', source_url: 'https://example.com/p' }), '049000050103');
  check('worker parseBarcodeWeb accepts valid', ok && ok.name === 'Coca-Cola', JSON.stringify(ok));
  check('worker parseBarcodeWeb rejects wrong barcode', worker.parseBarcodeWeb(JSON.stringify({ found: true, barcode: '111111111111', name: 'X', source_url: 'https://example.com/p' }), '049000050103') === null);
  check('worker parseBarcodeWeb rejects no URL', worker.parseBarcodeWeb(JSON.stringify({ found: true, barcode: '049000050103', name: 'X' }), '049000050103') === null);
  check('worker gtinCheckOk', worker.gtinCheckOk('049000050103') === true && worker.gtinCheckOk('049000050104') === false);
}

// 11. i18n en keys
{
  const en = i18n.LANGS.en.s;
  const needed = ['miniShrink', 'miniTalk', 'miniStop', 'miniMore', 'miniExpand', 'miniClose', 'miniLabel', 'miniListening', 'miniSearching', 'miniIdle', 'bcTaught', 'bcMemory', 'watchBackInStock', 'watchStockAdded', 'watchCmdStock', 'aboutStoreBtn'];
  check('i18n all new en keys exist', needed.every((k) => en[k] != null && en[k] !== ''), needed.filter((k) => !en[k]).join(','));
  const s = i18n.t('watchBackInStock', { name: 'Shoes', store: 'Walmart', price: '$19.99' });
  check('i18n watchBackInStock renders', /Shoes/.test(s) && /back in stock/i.test(s) && /\$19\.99/.test(s), s);
  const s2 = i18n.t('bcNotFound', { code: '0 4 9 0' });
  check('i18n bcNotFound mentions teaching', /this barcode is/i.test(s2), s2);
}

// 12. miniplayer (DOM stub)
{
  await import(SITE + 'miniplayer.js');
  const mini = globalThis.BAIN_MINI;
  globalThis.BAIN_APP = { S: { results: [{ title: 'Running Shoes', price: 19.99, price_text: '$19.99', store: 'Walmart' }], total: 1 }, t: (k) => k };
  globalThis.BAIN_AI = { active: () => true, toggle: () => {}, stop: () => {}, tell: () => {} };
  let threw = false;
  try { mini.show(); mini.update(); } catch (e) { threw = true; console.log('mini error', e); }
  check('miniplayer show/update do not throw', threw === false && mini.active() === true);
  mini.hide();
  check('miniplayer hide', mini.active() === false);
  // shrinkButton finds the Talk button by id "talk" (there is no "talkBtn" in the page)
  let created = null;
  const talkBtn = fakeEl(); talkBtn.parentNode = { insertBefore: (el) => { created = el; } };
  const origGet = globalThis.document.getElementById;
  globalThis.document.getElementById = (id) => (id === 'talk' ? talkBtn : null);
  mini.shrinkButton();
  check('miniplayer shrinkButton creates button after Talk', created !== null && created.id === 'miniShrinkBtn', created ? created.id : 'none');
  globalThis.document.getElementById = origGet;
}

// 13. watchlist back-in-stock (needs APP + i18n t)
{
  globalThis.BAIN_APP = {
    S: { results: [], query: { query: 'shoes' }, chosen: -1, spot: -1 },
    searchRaw: async () => ({ products: [{ title: 'Running Shoes', price: 19.99, url: 'https://walmart.com/ip/123', store: 'Walmart', currency: 'USD' }] }),
    shortName: (p) => p.title, t: (k) => k, status() {}, announce() {}, sayNative() {},
  };
  globalThis.BAIN_AI = { active: () => false };
  // watchlist uses its own t() from BAIN_I18N — stub it
  globalThis.BAIN_I18N = { t: (k, v) => { const m = { watchBackInStock: '{name} at {store} is back in stock — {price}.', watchStockAdded: "I'll tell you when {name} is back in stock.", watchDrop: '{name} dropped.', watchFound: 'Found {name}.', watchSame: 'Same {name}.', watchUp: 'Up {name}.', watchGone: 'Gone {name}.', watchLimit: 'limit', watchNotFresh: 'not fresh', watchNoCheck: 'no check', watchTargetHit: 'target hit', watchAdded: 'watching {name}', watchCmdStock: 'back in stock, tell me when it is back in stock, watch for it coming back in stock', watchNone: 'none', watchList: 'list', watchSearching: 'searching', watchWhat: 'what' }; let s = m[k] || k; if (v) for (const kk of Object.keys(v)) s = s.split('{' + kk + '}').join(String(v[kk])); return s; }, lang: 'en', LANGS: { en: { s: {} }, he: { s: {} }, yi: { s: {} } } };
  localStorage.clear();
  globalThis.BAIN_APP.t = (k, v) => globalThis.BAIN_I18N.t(k, v);
  globalThis.BAIN_APP.money = (n, c) => '$' + Number(n).toFixed(2);
  await import(SITE + 'watchlist.js');
  const wl = globalThis.BAIN_WATCH;
  const w = wl.watchStock({ title: 'Running Shoes', price: 19.99, url: 'https://walmart.com/ip/123', store: 'Walmart', currency: 'USD', in_stock: false });
  check('watchlist watchStock creates stock watch', w && w.stock_watch === true && w.was_out === true, JSON.stringify(w));
  // first check: item found again -> back_in_stock (was_out was set by watchStock + last_checked was 0... 
  // actually watchStock sets was_out=true but last_checked=0, so the first find must NOT say back_in_stock
  const r1 = await wl.checkOne(wl.all()[0]);
  check('watchlist first find is not back_in_stock', r1.stock === 'in', JSON.stringify(r1.stock));
  check('watchlist first find clears was_out', wl.all()[0].was_out === false);
  // simulate it going out: next search finds nothing
  globalThis.BAIN_APP.searchRaw = async () => ({ products: [] });
  const r2 = await wl.checkOne(wl.all()[0]);
  check('watchlist gone sets was_out', r2.stock === 'out' && wl.all()[0].was_out === true, JSON.stringify(r2.stock));
  // and coming back:
  globalThis.BAIN_APP.searchRaw = async () => ({ products: [{ title: 'Running Shoes', price: 24.99, url: 'https://walmart.com/ip/123', store: 'Walmart', currency: 'USD' }] });
  const r3 = await wl.checkOne(wl.all()[0]);
  check('watchlist back_in_stock detected', r3.stock === 'back_in_stock', JSON.stringify(r3.stock));
  check('watchlist checkSentence back in stock', /back in stock/i.test(wl.checkSentence(r3)), wl.checkSentence(r3));
  const wl2 = wl.watchStock({ name: 'Blue Kettle' });
  check('watchlist watchStock by name', wl2 && wl2.stock_watch === true && wl2.was_out === true, JSON.stringify(wl2));
}

// 14. barcode taught store (needs DOM + APP stubs)
{
  globalThis.BAIN_APP = { status() {}, announce() {}, sayNative: () => {}, t: (k) => k };
  globalThis.BAIN_AI = { active: () => false };
  globalThis.BAIN_MEMORY = { setLastTaught() {} };
  localStorage.clear();
  await import(SITE + 'barcode.js');
  const bc = globalThis.BAIN_BC;
  const t1 = bc.teach('049000050103', 'Coca-Cola 500ml', 'Coca-Cola', '500ml');
  check('barcode teach stores', t1 && t1.name === 'Coca-Cola 500ml' && t1.code === '049000050103', JSON.stringify(t1));
  check('barcode taught reads back', bc.taught('049000050103') && bc.taught('049000050103').name === 'Coca-Cola 500ml');
  check('barcode teach rejects bad digits', bc.teach('123', 'X') === null);
  check('barcode teach rejects empty name', bc.teach('049000050103', '   ') === null);
  const t2 = bc.teachLast('Pepsi 500ml');
  check('barcode teachLast without a last scan returns null', t2 === null);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
