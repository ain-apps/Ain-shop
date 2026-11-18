// Reorder shortcuts (test copy only): NO live searches, NO purchases.
// Tests site/reorder.js with stubbed history records (BAIN_HIST.all),
// a stub BAIN_HIST.reorder, and a stub BAIN_CONVO.
// Run: node tests/test-reorder.mjs
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const STR = {
  priceUnknown: 'Price unknown',
  reorderAsk: 'Last time you bought {name}, {price} at {store}. Shall I find it again?',
  reorderTimes: 'bought {n} times',
  reorderWhich: 'Which {what} — {items}?',
  reorderItem: 'item',
  reorderList: 'You bought before: {items}.',
  reorderNone: "You haven't bought anything before.",
  reorderNoMatch: "I don't see a {what} in what you've bought before. Want me to search for one?",
  reorderStopped: "No problem, I won't reorder the {name}.",
  reorderSearching: 'Looking for the {name} again.',
  reorderGone: "I couldn't find the {name} at {store} just now.",
  reorderNoCheck: "I couldn't check the {name} just now.",
  reorderFound: 'Found the {name} at {store} again.',
  reorderWhichUnclear: "I'm not sure which one you meant. Could you say the name again?",
};
function tt(k, v) { var s = STR[k] != null ? STR[k] : k; return String(s).replace(/\{(\w+)\}/g, function (_, n) { return v && v[n] != null ? v[n] : ''; }); }

// ---- stubs ----
const spoken = [], asked = [], statuses = [];
let answers = []; // scripted answers for BAIN_CONVO.ask, in order
let convoResolve = null; // optional (answer, list) => item | null
globalThis.BAIN_I18N = { speech: () => 'en-US', t: tt, lang: 'en', LANGS: { en: { s: {} } } };
globalThis.BAIN_APP = {
  t: tt, shortName: (p) => String(p.title || '').slice(0, 60),
  sayNative: (s) => spoken.push(s), announce: () => {}, status: (s) => statuses.push(s), render: () => {},
};
const reorderCalls = [];
let records = [];
globalThis.BAIN_HIST = {
  all: () => records.slice(),
  money: (p, cur) => '$' + Number(p).toFixed(2),
  reorder: (i) => { reorderCalls.push(i); const e = records[i]; return Promise.resolve({ entry: e, index: i, checked: true, change: 'same', price: e ? e.price : null, currency: 'USD' }); },
  reorderSentence: (r) => 'Still $' + Number(r.price).toFixed(2) + '.',
};
globalThis.BAIN_CONVO = {
  speak: (s) => spoken.push('convo:' + s),
  ask: (q, cb) => { asked.push(q); const a = answers.length ? answers.shift() : 'no'; cb(a); },
  resolveReference: (a, list) => (convoResolve ? convoResolve(a, list) : null),
};

// ---- load reorder.js ----
const src = fs.readFileSync(path.join(dir, '..', 'site', 'reorder.js'), 'utf8');
eval(src);
const R = globalThis.BAIN_REORDER;

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? ' — ' + extra : '')); }
}
const tick = () => new Promise((r) => setTimeout(r, 0));
function reset() { spoken.length = 0; asked.length = 0; statuses.length = 0; reorderCalls.length = 0; answers = []; convoResolve = null; }

const coffeeCol = { title: 'Colombian Coffee Beans 12 oz', name: 'Colombian coffee', store: 'Walmart', url: 'https://www.walmart.com/ip/coffee-col', price: 12.99, currency: 'USD', count: 2, last: 3000, first: 1000 };
const coffeeDecaf = { title: 'Decaf Coffee Ground 10 oz', name: 'Decaf coffee', store: 'Target', url: 'https://www.target.com/p/coffee-decaf', price: 9.99, currency: 'USD', count: 1, last: 2000, first: 2000 };
const toothpaste = { title: 'Colgate Toothpaste 6 oz', name: 'Colgate toothpaste', store: 'CVS', url: 'https://www.cvs.com/p/toothpaste', price: 4.49, currency: 'USD', count: 3, last: 4000, first: 500 };

// 1. lastBought matching: most recent match wins; no match is null
records = [toothpaste, coffeeCol, coffeeDecaf];
check('lastBought: coffee -> most recent coffee', R.lastBought('coffee') === coffeeCol);
check('lastBought: decaf -> the decaf', R.lastBought('decaf') === coffeeDecaf);
check('lastBought: toothpaste', R.lastBought('toothpaste') === toothpaste);
check('lastBought: shoes never bought -> null', R.lastBought('shoes') === null);

// 2. candidates: most recent first, same name+store collapsed
records = [toothpaste, coffeeCol, coffeeDecaf, { title: 'Colombian Coffee Beans 12 oz', name: 'Colombian coffee', store: 'Walmart', url: 'https://www.walmart.com/ip/coffee-col-2', price: 12.99, currency: 'USD', count: 1, last: 100 }];
const cands = R.reorderCandidates();
check('candidates: most recent first', cands[0] === toothpaste && cands[1] === coffeeCol && cands[2] === coffeeDecaf);
check('candidates: same name+store deduped', cands.length === 3, JSON.stringify(cands.map((c) => c.name)));

// 3. spoken line: full sentence with name, price, store, and the confirm question
records = [coffeeCol];
const line = R.speakReorder(coffeeCol);
check('speakReorder: full sentence', line === 'Last time you bought Colombian coffee, $12.99 at Walmart. Shall I find it again?', line);

// 4. disambiguation text names both options with prices
const q = R.disambiguationQuestion('coffee', [coffeeCol, coffeeDecaf]);
check('disambiguation: asks which, both options priced', q === 'Which coffee — the Colombian coffee for $12.99 at Walmart, or the Decaf coffee for $9.99 at Target?', q);

// 5. no-history case: plain honest sentence, nothing reordered
records = []; reset();
check('command: empty history -> none', R.command('reorder my coffee') === 'none');
check('no-history: says so plainly', spoken.join(' ').indexOf("I don't see a coffee in what you've bought before") >= 0, spoken.join(' | '));
check('no-history: nothing reordered', reorderCalls.length === 0);

// 6. single match: asks to confirm, "yes" re-runs the fresh check via BAIN_HIST.reorder
records = [toothpaste]; reset(); answers = ['yes'];
check('command: single match -> ask', R.command('reorder my toothpaste') === 'ask');
check('single: confirm question spoken via BAIN_CONVO', asked.length === 1 && asked[0].indexOf('Shall I find it again?') >= 0, asked.join(' | '));
await tick(); await tick();
check('single: yes -> BAIN_HIST.reorder called for that item', reorderCalls.length === 1 && reorderCalls[0] === 0, JSON.stringify(reorderCalls));

// 7. single match: "no" stops everything — no reorder, no purchase
records = [toothpaste]; reset(); answers = ['no'];
R.command('buy my toothpaste again');
await tick(); await tick();
check('single: no -> nothing reordered', reorderCalls.length === 0);
check('single: no -> polite stop spoken', spoken.join(' ').indexOf("won't reorder") >= 0, spoken.join(' | '));

// 8. several matches: asks which one, "the second one" picks it, then confirms it
records = [toothpaste, coffeeCol, coffeeDecaf]; reset(); answers = ['the second one', 'yes'];
check('command: several matches -> ask', R.command('reorder my coffee') === 'ask');
check('several: disambiguation question asked first', asked.length >= 1 && asked[0].indexOf('Which coffee') === 0, asked.join(' | '));
await tick(); await tick();
check('several: second one -> decaf reordered', reorderCalls.length === 1 && reorderCalls[0] === 2, JSON.stringify(reorderCalls));

// 9. "reorder the cheaper one" after a list was read
records = [toothpaste, coffeeCol, coffeeDecaf]; reset(); answers = ['yes'];
check('list: what did I buy before -> list', R.command('what did I buy before?') === 'list');
check('list: spoken list names items', spoken.join(' ').indexOf('Colombian coffee') >= 0 && spoken.join(' ').indexOf('Decaf coffee') >= 0, spoken.join(' | '));
check('reference: reorder the cheaper one -> ask', R.command('reorder the cheaper one') === 'ask');
await tick(); await tick();
check('reference: cheaper one is the $4.49 toothpaste', reorderCalls.length === 1 && reorderCalls[0] === 0, JSON.stringify(reorderCalls));

// 10. resolveAnswer units: ordinals, numbers, cheapest, and the convo resolver first
check('resolveAnswer: "the second one"', R.resolveAnswer('the second one', [coffeeCol, coffeeDecaf]) === coffeeDecaf);
check('resolveAnswer: "2"', R.resolveAnswer('2', [coffeeCol, coffeeDecaf]) === coffeeDecaf);
check('resolveAnswer: "the cheaper one"', R.resolveAnswer('the cheaper one', [coffeeCol, coffeeDecaf]) === coffeeDecaf);
check('resolveAnswer: "the first one"', R.resolveAnswer('the first one', [coffeeCol, coffeeDecaf]) === coffeeCol);
convoResolve = (a, list) => (a === 'the second one' ? list[1] : null);
check('resolveAnswer: BAIN_CONVO.resolveReference used when it answers', R.resolveAnswer('the second one', [coffeeCol, coffeeDecaf]) === coffeeDecaf);
convoResolve = null;
check('resolveAnswer: nonsense -> null', R.resolveAnswer('the purple one', [coffeeCol, coffeeDecaf]) === null);

// 11. "what did I buy before?" with no history at all
records = []; reset();
check('list: empty history -> none', R.command('what did I buy before?') === 'none');
check('list: empty history says so', spoken.join(' ').indexOf("haven't bought anything") >= 0, spoken.join(' | '));

// 12. no match for a named item: offers a fresh search instead, reorders nothing
records = [toothpaste]; reset();
check('command: shoes never bought -> none', R.command('reorder my shoes') === 'none');
check('no match: offers a fresh search', spoken.join(' ').indexOf('Want me to search for one?') >= 0, spoken.join(' | '));
check('no match: nothing reordered', reorderCalls.length === 0);

// 13. not a reorder command at all
records = [toothpaste]; reset();
check('command: plain search is not a reorder', R.command('find me coffee') === null);
check('command: reorder detector', R.isReorderCommand('reorder my coffee') && R.isReorderCommand('buy my toothpaste again') && !R.isReorderCommand('find me coffee'));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
