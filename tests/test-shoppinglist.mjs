// Voice shopping list (test copy only): NO live searches, NO network.
// Tests site/shoppinglist.js with a stubbed localStorage, a stub
// BAIN_CONVO, and stubbed watchlist modules. Run: node tests/test-shoppinglist.mjs
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
function resetStore() { for (const k of Object.keys(store)) delete store[k]; }

const spoken = [];          // everything the module "said"
let asked = [];             // questions asked via BAIN_CONVO.ask
let autoAnswer = null;      // when set, ask() answers at once with this
function installConvo() {
  globalThis.BAIN_CONVO = {
    speak: (t) => { spoken.push(t); },
    ask: (q, fn) => { asked.push(q); if (autoAnswer !== null) fn(autoAnswer); },
  };
}
function removeConvo() { delete globalThis.BAIN_CONVO; }
installConvo();

let watchlistCalls = [];
function installWatchlist() {
  globalThis.BAIN_WATCHLIST = { addWatch: (item) => { watchlistCalls.push(item); } };
}
function removeWatchlist() { delete globalThis.BAIN_WATCHLIST; }
let watchCalls = [];
function installWatch() {
  globalThis.BAIN_WATCH = { addByQuery: (q) => { watchCalls.push(q); } };
}
function removeWatch() { delete globalThis.BAIN_WATCH; }

// ---- load shoppinglist.js ----
const src = fs.readFileSync(path.join(dir, '..', 'site', 'shoppinglist.js'), 'utf8');
eval(src);
const L = globalThis.BAIN_SHOPLIST;

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? ' — ' + extra : '')); }
}
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function reset() { resetStore(); spoken.length = 0; asked.length = 0; watchlistCalls = []; watchCalls = []; autoAnswer = null; }

// 1. add / list / count — item shape { name, qty, addedAt }
reset();
let it = L.add('milk', 1);
check('add: item shape', it && it.name === 'milk' && it.qty === 1 && typeof it.addedAt === 'number', JSON.stringify(it));
check('list: one item', L.list().length === 1);
check('count: 1', L.count() === 1);
check('add: spoken confirmation', spoken.some((s) => /Added 1 milk/.test(s)), JSON.stringify(spoken));

// 2. duplicate bumps qty instead of duplicating
L.add('milk', 2);
check('duplicate: qty bumped, still one row', L.list().length === 1 && L.list()[0].qty === 3, JSON.stringify(L.list()));
L.add('milks', 1);
check('duplicate: "milks" is the same item as "milk"', L.list().length === 1 && L.list()[0].qty === 4, JSON.stringify(L.list()));

// 3. quantity parsing
check('parseQuantity: "2 milks"', eq(L.parseQuantity('2 milks'), { qty: 2, name: 'milks' }));
check('parseQuantity: "two milks"', eq(L.parseQuantity('two milks'), { qty: 2, name: 'milks' }));
check('parseQuantity: "a dozen eggs"', eq(L.parseQuantity('a dozen eggs'), { qty: 12, name: 'eggs' }));
check('parseQuantity: "milk" has no qty', eq(L.parseQuantity('milk'), { qty: null, name: 'milk' }));
check('parseQuantity: "3 bottles of milk"', eq(L.parseQuantity('3 bottles of milk'), { qty: 3, name: 'bottles of milk' }));
check('qtyOf: "seven"', L.qtyOf('seven') === 7);
check('qtyOf: "dozen"', L.qtyOf('dozen') === 12);

// 4. remove (direct API) / remove missing / clear
let gone = L.remove('milk');
check('remove: returns the removed item', !!gone && gone.name === 'milk' && gone.qty === 4, JSON.stringify(gone));
check('remove: list empty', L.count() === 0);
check('remove: missing item returns null', L.remove('bread') === null);
L.add('bread', 1); L.add('eggs', 12);
check('clear: empties the list', L.clear() === true && L.count() === 0);

// 5. list sentence — full sentences, exact format from the spec
reset();
L.add('milk', 2); L.add('bread', 1); L.add('eggs', 1);
check('listSentence: exact format', L.listSentence() === 'Your list has 3 items: milk, 2; bread, 1; eggs, 1.', L.listSentence());
reset();
check('listSentence: empty list', L.listSentence() === 'Your shopping list is empty.', L.listSentence());

// 6. voice command: add with quantity
reset();
check('command: add 2 milks', L.command('add 2 milks to my shopping list') === 'add');
check('command: add stored it', L.list().length === 1 && L.list()[0].qty === 2, JSON.stringify(L.list()));
check('command: "put bread on my shopping list" (no qty, answers "1" to How many?)', (() => { autoAnswer = '1'; return L.command('put bread on my shopping list') === 'ask' && L.list().some((x) => x.name === 'bread' && x.qty === 1); })());

// 7. voice command: add with NO quantity asks "How many?" and adds on answer
reset();
autoAnswer = '3';
let r = L.command('add milk to my shopping list');
check('command: unclear qty asks first', r === 'ask' && asked.some((q) => /How many milk/.test(q)), JSON.stringify(asked));
check('command: answer "3" adds 3 milks', L.list().length === 1 && L.list()[0].qty === 3, JSON.stringify(L.list()));

// 8. voice command: add with no quantity and NO conversation module adds one
reset(); removeConvo();
check('add without qty and no BAIN_CONVO: adds one, no crash', L.add('milk') && L.list()[0].qty === 1, JSON.stringify(L.list()));
check('command without qty and no BAIN_CONVO: adds one', L.command('add bread to my shopping list') === 'add' && L.list().some((x) => x.name === 'bread'));
installConvo();

// 9. voice command: remove asks first; "yes" removes, "no" keeps
reset();
L.add('eggs', 1); L.add('milk', 1);
autoAnswer = 'yes';
check('command: remove asks', L.command('remove eggs from my shopping list') === 'ask' && asked.some((q) => /Remove eggs/.test(q)), JSON.stringify(asked));
check('command: "yes" removes it', L.list().length === 1 && L.list()[0].name === 'milk', JSON.stringify(L.list()));
autoAnswer = 'no';
check('command: remove asks again', L.command('remove milk from my shopping list') === 'ask');
check('command: "no" keeps it', L.list().length === 1 && L.list()[0].name === 'milk', JSON.stringify(L.list()));
check('remove: nothing removed without a yes', spoken.some((s) => /left milk on/.test(s)), JSON.stringify(spoken));

// 10. remove "it" means the last item talked about
reset();
L.add('milk', 1); L.add('eggs', 1);
autoAnswer = 'yes';
check('command: remove it', L.command('remove it from my shopping list') === 'ask');
check('command: "it" was eggs (last added)', L.list().length === 1 && L.list()[0].name === 'milk', JSON.stringify(L.list()));

// 11. voice command: clear asks first; "yes" clears, "no" keeps
reset();
L.add('milk', 1);
autoAnswer = 'no';
check('command: clear asks', L.command('clear my shopping list') === 'ask' && asked.some((q) => /clear your whole shopping list/.test(q)), JSON.stringify(asked));
check('command: "no" keeps the list', L.count() === 1);
autoAnswer = 'yes';
check('command: clear asks again', L.command('clear my shopping list') === 'ask');
check('command: "yes" clears it', L.count() === 0);

// 12. voice command: read the list back; unknown sentences stay searches
reset();
L.add('milk', 2); L.add('bread', 1);
check('command: what is on my shopping list', L.command("what's on my shopping list?") === 'list');
check('command: list is spoken as a sentence', spoken.some((s) => s === 'Your list has 2 items: milk, 2; bread, 1.'), JSON.stringify(spoken));
check('command: a search is not a list command', L.command('milk') === null);
check('command: "buy milk" is not a list command', L.command('buy milk') === null);

// 13. remove/clear with NO asker removes nothing (never deletes unconfirmed)
reset(); removeConvo();
L.add('milk', 1);
check('requestRemove with no asker: keeps the item', L.requestRemove('milk') === null && L.count() === 1);
check('requestClear with no asker: keeps the list', L.requestClear() === null && L.count() === 1);
installConvo();

// 14. watch handoff: BAIN_WATCHLIST.addWatch when it exists
reset(); installWatchlist();
L.add('milk', 2); L.add('bread', 1);
let items = L.watchListItems();
check('watchListItems: shape the watchlist can use', eq(items, [
  { query: 'milk', title: 'milk', name: 'milk', qty: 2 },
  { query: 'bread', title: 'bread', name: 'bread', qty: 1 },
]), JSON.stringify(items));
let w = L.watchAll();
check('watchAll: hands each item to BAIN_WATCHLIST', w.watched === 2 && w.queued === false && w.via === 'BAIN_WATCHLIST.addWatch' && watchlistCalls.length === 2, JSON.stringify(w));
check('watchAll: spoken confirmation', spoken.some((s) => /watch your shopping list for deals/.test(s)), JSON.stringify(spoken));
removeWatchlist();

// 15. watch handoff: falls back to the watchlist already in this test copy
reset(); installWatch();
L.add('eggs', 12);
let w2 = L.watchAll();
check('watchAll: falls back to BAIN_WATCH.addByQuery', w2.watched === 1 && w2.queued === false && w2.via === 'BAIN_WATCH.addByQuery' && watchCalls[0] === 'eggs', JSON.stringify(w2));
removeWatch();

// 16. watch handoff: neither module exists -> queued on the phone, not lost
reset();
L.add('milk', 1);
let w3 = L.watchAll();
check('watchAll: no watchlist module -> queued', w3.watched === 0 && w3.queued === true && w3.via === null, JSON.stringify(w3));
check('watchAll: queued intent remembered', L.pendingWatch() === true);
check('watchAll: queue survives in localStorage', store['ain.shoppinglist.watchQueued'] === '1');
installWatch();
let w4 = L.flushQueuedWatch();
check('flushQueuedWatch: hands queued items over once the module exists', w4.watched === 1 && w4.queued === false && L.pendingWatch() === false, JSON.stringify(w4));
removeWatch();

// 17. watchAll on an empty list watches nothing and queues nothing
reset();
let w5 = L.watchAll();
check('watchAll: empty list watches nothing', w5.watched === 0 && w5.queued === false && L.pendingWatch() === false, JSON.stringify(w5));

// 18. on-phone only: nothing but the list and the queue flag is stored
reset();
L.add('milk', 1);
check('storage: only the list key is written', Object.keys(store).length === 1 && store['ain.shoppinglist'] !== undefined, JSON.stringify(Object.keys(store)));

console.log(JSON.stringify({ total: pass + fail, passed: pass, failed: fail }));
if (fail) process.exit(1);
