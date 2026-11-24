// Favorite stores (test copy only): NO live searches.
// Tests site/favorites.js with a stubbed localStorage and a stub
// BAIN_CONVO. Run: node tests/test-favorites.mjs
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const dir = path.dirname(fileURLToPath(import.meta.url));

// ---- stubs ----
const store = {};
globalThis.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
let spoken = [];
let confirmMode = 'yes'; // 'yes' | 'no' | 'silent' (askConfirm never answers)
let confirmCalls = [];
globalThis.BAIN_CONVO = {
  speak: (t) => { spoken.push(t); },
  askConfirm: (q, onYes, onNo) => {
    confirmCalls.push(q);
    if (confirmMode === 'yes') onYes();
    else if (confirmMode === 'no') onNo();
    // 'silent': neither — the question stays open
  },
};
globalThis.BAIN_APP = {
  t: (k) => k, sayNative: (t) => { spoken.push('[native] ' + t); },
  announce: () => {}, status: () => {},
};

// ---- load favorites.js ----
const src = fs.readFileSync(path.join(dir, '..', '..', 'ain-shop-shared', 'web', 'favorites.js'), 'utf8');
eval(src);
const F = globalThis.BAIN_FAVORITES;

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? ' — ' + extra : '')); }
}
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function reset() { delete store['ain.favorites']; spoken = []; confirmCalls = []; confirmMode = 'yes'; }
function lastSpoken() { return spoken[spoken.length - 1] || ''; }

// 1. add + list + normalization
reset();
let r = F.add('walmart');
check('add: walmart -> Walmart', r && r.added && r.name === 'Walmart', JSON.stringify(r));
check('add: list has Walmart', eq(F.list(), ['Walmart']));
check('add: speaks a full sentence', /Walmart is now one of your favorites/.test(lastSpoken()), lastSpoken());
check('normalize: BEST BUY -> Best Buy', F.normalize('BEST BUY') === 'Best Buy');
check('normalize: home depot -> The Home Depot', F.normalize('home depot') === 'The Home Depot');
check('normalize: target.com -> Target', F.normalize('target.com') === 'Target');
check("normalize: lowe's -> Lowe's", F.normalize("lowe's") === "Lowe's");
check('normalize: unknown store kept as said', F.normalize('Aldi') === 'Aldi');
check('normalize: macys -> Macy\'s', F.normalize('macys') === "Macy's");
check('isFavorite: case-insensitive', F.isFavorite('WALMART') && F.isFavorite('Walmart') && !F.isFavorite('Target'));

// 2. duplicate add does not duplicate
F.add('Walmart');
F.add('WALMART');
check('duplicate-add: still one entry', eq(F.list(), ['Walmart']));
check('duplicate-add: speaks already-a-favorite', /already one of your favorites/.test(lastSpoken()), lastSpoken());

// 3. remove (direct API) + remove of a non-favorite
F.add('Target');
check('remove: returns removed name', F.remove('target') === 'Target');
check('remove: list shrinks', eq(F.list(), ['Walmart']));
check('remove: speaks removal sentence', /no longer one of your favorites/.test(lastSpoken()), lastSpoken());
check('remove: non-favorite returns null', F.remove('Costco') === null);
check('remove: non-favorite speaks honestly', /isn't one of your favorites/.test(lastSpoken()), lastSpoken());

// 4. ordering: favorites first in named order, rest in original order
reset();
F.setFavorites(['Target', 'Walmart']);
const all = ['Amazon', 'Walmart', 'Best Buy', 'Target', 'Costco'];
check('orderedStores: favorites first, named order', eq(F.orderedStores(all), ['Target', 'Walmart', 'Amazon', 'Best Buy', 'Costco']), JSON.stringify(F.orderedStores(all)));
check('orderedStores: empty favorites = original order', (() => { F.clear(); return eq(F.orderedStores(all), all); })());
check('orderedStores: favorite missing from list still first', (() => { F.setFavorites(['Target', 'Aldi']); return eq(F.orderedStores(['Amazon', 'Target']), ['Target', 'Aldi', 'Amazon']); })());
check('orderedStores: domain entries keep their shape', (() => { F.setFavorites(['Walmart']); return eq(F.orderedStores(['target.com', 'walmart.com', 'amazon.com']), ['walmart.com', 'target.com', 'amazon.com']); })());
check('orderedStores: object entries keep their shape', (() => { F.setFavorites(['Target']); const o = { name: 'Target', id: 1 }; const out = F.orderedStores([o, { name: 'Amazon' }]); return out[0] === o && out[1].name === 'Amazon'; })());

// 5. voice: "my favorite stores are Walmart and Target" (set, in order)
reset();
check('command set: returns set', F.command('my favorite stores are Walmart and Target') === 'set');
check('command set: list in named order', eq(F.list(), ['Walmart', 'Target']));
check('command set: speaks full list', /Your favorite stores are Walmart and Target/.test(lastSpoken()), lastSpoken());

// 6. voice: "add Target to my favorites" / duplicate via voice
reset();
check('command add: returns add', F.command('add Target to my favorites') === 'add');
check('command add: Target saved', eq(F.list(), ['Target']));
F.command('add target to my favorites');
check('command add duplicate: no duplicate', eq(F.list(), ['Target']));

// 7. voice: "what are my favorite stores?"
reset();
F.setFavorites(['Walmart', 'Costco']);
spoken = [];
check('command list: returns list', F.command('what are my favorite stores?') === 'list');
check('command list: speaks the list', /Your favorite stores are Walmart and Costco/.test(lastSpoken()), lastSpoken());

// 8. voice: "check Target first" moves it to the front
reset();
F.setFavorites(['Walmart', 'Target', 'Amazon']);
check('command check-first: returns check', F.command('check Target first') === 'check');
check('command check-first: Target now first', eq(F.list(), ['Target', 'Walmart', 'Amazon']));
check('command check-first: speaks it', /check Target first/.test(lastSpoken()), lastSpoken());
F.command('check Costco first');
check('command check-first: new store added at front', eq(F.list(), ['Costco', 'Target', 'Walmart', 'Amazon']));

// 9. voice: remove asks first — yes removes, no keeps
reset();
F.setFavorites(['Walmart', 'Target']);
confirmMode = 'yes'; confirmCalls = [];
check('command remove: returns ask', F.command('remove Walmart from my favorites') === 'ask');
check('command remove: asked the question', confirmCalls.length === 1 && /Remove Walmart from your favorites/.test(confirmCalls[0]), JSON.stringify(confirmCalls));
check('command remove yes: Walmart gone', eq(F.list(), ['Target']));
reset();
F.setFavorites(['Walmart', 'Target']);
confirmMode = 'no'; confirmCalls = [];
F.command('remove Walmart from my favorites');
check('command remove no: Walmart stays', eq(F.list(), ['Walmart', 'Target']));
check('command remove no: speaks it stays', /stays one of your favorites/.test(lastSpoken()), lastSpoken());

// 10. no favorites saved: "check my favorite stores" asks, does not fail silently
reset();
spoken = [];
check('command check empty: returns ask', F.command('check my favorite stores') === 'ask');
check('command check empty: asks which stores', /Which stores do you want as favorites/.test(lastSpoken()), lastSpoken());
spoken = [];
check('command list empty: returns ask', F.command('what are my favorite stores?') === 'ask');
check('command list empty: asks which stores', /Which stores do you want as favorites/.test(lastSpoken()), lastSpoken());
check('command unrelated: returns null', F.command('find me running shoes') === null);

// 11. no BAIN_CONVO: falls back to plain spoken text, removal waits for yes/no
reset();
F.setFavorites(['Walmart', 'Target']);
delete globalThis.BAIN_CONVO;
spoken = [];
check('fallback remove: returns ask', F.command('remove Target from my favorites') === 'ask');
check('fallback remove: question spoken', /Remove Target from your favorites/.test(lastSpoken()), lastSpoken());
check('fallback remove: nothing removed yet', eq(F.list(), ['Walmart', 'Target']));
F.command('yes');
check('fallback yes: Target removed', eq(F.list(), ['Walmart']));
F.command('remove Walmart from my favorites');
F.command('no');
check('fallback no: Walmart kept', eq(F.list(), ['Walmart']));
globalThis.BAIN_CONVO = { speak: (t) => { spoken.push(t); }, askConfirm: (q, onYes, onNo) => { confirmCalls.push(q); if (confirmMode === 'yes') onYes(); else if (confirmMode === 'no') onNo(); } };

// 12. persistence across reload (same localStorage) + corrupt data tolerated
reset();
F.add('Walmart'); F.add('Target');
eval(src); // reload the module: it must re-read localStorage
check('persistence: list survives reload', eq(globalThis.BAIN_FAVORITES.list(), ['Walmart', 'Target']));
store['ain.favorites'] = 'not json{';
eval(src);
check('corrupt storage: loads empty, does not throw', eq(globalThis.BAIN_FAVORITES.list(), []));

// 13. cap + forAI
reset();
for (let i = 0; i < 10; i++) F.add('Store' + i);
check('cap: at most 10 favorites', F.list().length === 10);
check('cap: 11th refused', F.add('Extra') && F.add('Extra').added === false && F.list().length === 10);
check('forAI: names favorites', F.forAI().indexOf('Store0') >= 0);
F.clear();
check('forAI empty: says none saved', /No favorite stores/.test(F.forAI()));
check('storesForSearch: returns favorites', (() => { F.setFavorites(['Target']); return eq(F.storesForSearch(), ['Target']); })());

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
