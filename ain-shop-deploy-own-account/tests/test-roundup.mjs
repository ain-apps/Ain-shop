// Daily spoken roundup (test copy only): NO live searches.
// Tests site/roundup.js with a stubbed watchlist (BAIN_WATCH.checkAll),
// a stub BAIN_CONVO (captures spoken lines) and a stub BAIN_FEED.
// Run: node tests/test-roundup.mjs
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const R = (await import('../site/roundup.js')).default || globalThis.BAIN_ROUNDUP;

let pass = 0, fail = 0;
function check(name, ok) { if (ok) { pass++; } else { fail++; console.log('FAIL', name); } }

let spoken = [];
globalThis.BAIN_CONVO = { speak: (t) => { spoken.push(t); } };
globalThis.BAIN_APP = { status: () => {}, announce: () => {} };

function watchStub(results, watches) {
  return {
    all: () => watches,
    checkAll: () => Promise.resolve({ results, checked: results.length, searches_used: results.length }),
    checkSentence: (r) => {
      if (r.change === 'drop') return r.watch.name + ' at ' + (r.watch.store || '') + ' dropped from $' + r.old_price + ' to $' + r.price + '.';
      if (r.change === 'same') return r.watch.name + ' is still $' + r.price + '.';
      if (r.change === 'up') return r.watch.name + ' went up from $' + r.old_price + ' to $' + r.price + '.';
      return 'Could not find ' + r.watch.name + '.';
    },
  };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

// 1. No watchlist module at all
delete globalThis.BAIN_WATCH;
let out = await R.roundup();
check('no watchlist: says alerts are not available', /aren't available/.test(out.text) && out.drops === 0);

// 2. Empty watch list
globalThis.BAIN_WATCH = watchStub([], []);
spoken = [];
out = await R.roundup();
check('empty list: says nothing is watched yet', /not watching any items yet/.test(out.text));
check('empty list: speaks the line', spoken.length === 1 && spoken[0] === out.text);

// 3. Drops first, unchanged counted, not-found honest
const watches = [
  { name: 'Running shoes', store: 'Walmart', first_price: 59.99 },
  { name: 'Coffee', store: 'Target', first_price: 12.99 },
  { name: 'Milk', store: 'Walmart', first_price: 3.50 },
];
const results = [
  { watch: watches[1], change: 'same', price: 12.99 },
  { watch: watches[0], change: 'drop', price: 49.99, old_price: 59.99 },
  { watch: watches[2], change: 'not_found' },
];
globalThis.BAIN_WATCH = watchStub(results, watches);
globalThis.BAIN_FEED = { summary: () => 'So far you have said 2 things helpful.', recentFeedback: () => [{ verdict: 'helpful' }, { verdict: 'helpful' }] };
spoken = [];
out = await R.roundup();
check('drops: one drop counted', out.drops === 1 && out.checked === 3 && out.searches_used === 3);
check('drops: drop line comes before the unchanged count', out.text.indexOf('dropped from $59.99 to $49.99') < out.text.indexOf('still the same price'));
check('drops: not-found is honest, never "gone from the store"', /couldn.t find Milk in a fresh search/.test(out.text) && !/gone from the store/.test(out.text));
check('drops: feedback line is included when he rated something', /2 things helpful/.test(out.text));
check('drops: speaks once', spoken.length === 1);

// 4. Nothing dropped
globalThis.BAIN_WATCH = watchStub(
  [{ watch: watches[1], change: 'same', price: 12.99 }],
  [watches[1]],
);
globalThis.BAIN_FEED = { summary: () => 'x', recentFeedback: () => [] };
out = await R.roundup();
check('nothing dropped: says so', /^Nothing dropped today\./.test(out.text));
check('nothing dropped: no feedback line when nothing rated', !/x/.test(out.text));

// 5. A failed check is reported, not hidden
globalThis.BAIN_WATCH = watchStub([{ watch: watches[0], change: 'drop', price: 49.99, old_price: 59.99 }, { watch: watches[1], error: 'offline' }], [watches[0], watches[1]]);
out = await R.roundup();
check('failed check: says it could not check one item', /couldn.t check one item/.test(out.text));

// 6. Typed commands
globalThis.BAIN_WATCH = watchStub([], []);
check('command: what dropped today', R.command('what dropped today?') === true);
check('command: daily roundup', R.command('daily roundup') === true);
check('command: whats new on my list', R.command("what's new on my list?") === true);
check('command: any price drops today', R.command('any price drops today') === true);
check('command: find me running shoes is not a roundup', R.command('find me running shoes') === false);
check('command: check my watched items is the watchlist, not the roundup', R.command('check my watched items') === false);
check('command: empty text is not a roundup', R.command('') === false);
await tick();

// 7. No background work: no timers in the module
const src = fs.readFileSync(path.join(dir, '..', 'site', 'roundup.js'), 'utf8');
check('no background: no setInterval / setTimeout in the module', !/setInterval|setTimeout/.test(src));
check('no background: nothing stored (no localStorage)', !/localStorage/.test(src));

// 8. forAI describes the feature in one line
check('forAI: mentions what dropped today', /what dropped today/.test(R.forAI()));

console.log(JSON.stringify({ total: pass + fail, passed: pass, failed: fail }));
if (fail) process.exit(1);
