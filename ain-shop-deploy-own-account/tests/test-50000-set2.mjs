// AIN Shop — 50,000-item local test, SET 2 (TEST COPY ONLY, v31e).
// A DIFFERENT 50,000: new product types, new seed, plus gender-flip
// confusers ("Milk for Women" for a "milk for men" query) that directly
// test the Gap 4 whole-word "men" fix. Same structure as set 1 otherwise.
// NO live searches. Imports the real fixed functions from site/_worker.js
// (relevant, filterSearchResults, sortSearchResults) and runs them in Node
// against a generated synthetic catalogue.
// Method: 100 product types x 5 query variants = 500 queries.
// Each query gets a list of 100 items (25 relevant by construction, 75 wrong
// by construction) = 500 x 100 = 50,000 item-checks (relevant() evaluations
// in the filter step). Ground truth is the construction label, NOT the
// function under test: relevant items are Brand + the query (or its synonym /
// singular-plural variant) + a neutral detail; wrong items are wrong-category
// titles, mention-noun confusers ("Milk Scented Candle"), accessory titles
// ("Bike Helmet" for "bicycle"), or partial word matches.
// Seed is fixed, so re-running reproduces the same lists.
import * as W from '../../ain-shop-shared/web/_worker.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
let seed = 135792468;
function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
function pick(a) { return a[Math.floor(rnd() * a.length)]; }
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const cap = s => s.replace(/\b\w/g, c => c.toUpperCase());
const singular = w => w.replace(/ies$/, 'y').replace(/s$/, '');
const plural = w => w.endsWith('s') ? w : (w.endsWith('y') ? w.slice(0, -1) + 'ies' : w + 's');
function flipNumber(q) { const ws = q.split(' '); const last = ws[ws.length - 1]; ws[ws.length - 1] = last.endsWith('s') ? singular(last) : plural(last); return ws.join(' '); }

const BRANDS = ['Nike', 'Amazon Basics', 'Great Value', 'Samsung', 'Sony', 'Kirkland', 'Hanes', 'Levi', 'Dove', 'Purina', 'Trek', 'Colgate', 'Dell', 'Apple'];
const DETAILS = ['for Men', 'for Women', 'for Kids', 'Lightweight', 'Premium', '2 Pack', 'Size Large', 'Black', 'White', 'New'];
const CONFUSERS = ['Scented Candle', 'Bath Soak', 'Flavored Lip Balm', 'Print Tote Bag', 'Shaped Cookie Cutter'];
const PARTIAL_NOUNS = ['Shorts', 'Jacket', 'Blanket', 'Table', 'Case', 'Cream', 'Socks', 'Hat', 'Lamp', 'Chair', 'Stand', 'Cover'];

// [query, category, synonym-or-null, accessory titles (wrong for this query)]
const TYPES = [
  ['running sneakers', 'footwear', 'running shoes', ['Shoe Polish', 'Shoe Rack']],
  ['trainers', 'footwear', 'sneakers', ['Shoe Polish']],
  ['flip flops', 'footwear', null, ['Shoe Polish']],
  ['clogs', 'footwear', null, ['Shoe Polish']],
  ['moccasins', 'footwear', null, ['Shoe Polish']],
  ['rain boots', 'footwear', null, ['Shoe Polish', 'Boot Rack']],
  ['swim cap', 'swimwear', null, []],
  ['swim goggles', 'swimwear', null, []],
  ['rash guard', 'swimwear', null, []],
  ['blazer', 'clothing', null, []],
  ['cardigan', 'clothing', null, []],
  ['tracksuit', 'clothing', null, []],
  ['pajamas', 'clothing', null, []],
  ['scarf', 'clothing', null, []],
  ['gloves', 'clothing', null, []],
  ['belt', 'clothing', null, []],
  ['vest', 'clothing', null, []],
  ['leggings', 'clothing', null, []],
  ['oats', 'groceries', null, []],
  ['honey', 'groceries', null, []],
  ['salmon', 'groceries', null, []],
  ['spinach', 'groceries', null, []],
  ['almonds', 'groceries', null, []],
  ['peanut butter', 'groceries', null, []],
  ['ketchup', 'groceries', null, []],
  ['flour', 'groceries', null, []],
  ['sugar', 'groceries', null, []],
  ['tea', 'groceries', null, []],
  ['grapes', 'groceries', null, []],
  ['strawberries', 'groceries', null, []],
  ['monitor', 'electronics', null, []],
  ['keyboard', 'electronics', null, []],
  ['mouse', 'electronics', null, []],
  ['webcam', 'electronics', null, []],
  ['router', 'electronics', null, []],
  ['printer', 'electronics', null, []],
  ['smart speaker', 'electronics', null, []],
  ['game console', 'electronics', null, []],
  ['drone', 'electronics', null, []],
  ['soundbar', 'electronics', null, []],
  ['projector', 'electronics', null, []],
  ['notebook', 'electronics', 'laptop', ['Notebook Case', 'Notebook Stand', 'Notebook Charger', 'Notebook Bag']],
  ['earphones', 'electronics', 'headphones', ['Earphones Case', 'Earphones Cable']],
  ['tv', 'electronics', 'television', ['TV Stand', 'TV Mount', 'TV Remote']],
  ['cell phone', 'electronics', null, ['Cell Phone Case', 'Cell Phone Charger']],
  ['rug', 'home', null, []],
  ['curtain', 'home', null, []],
  ['mirror', 'home', null, []],
  ['bookshelf', 'home', null, []],
  ['nightstand', 'home', null, []],
  ['dresser', 'home', null, []],
  ['ottoman', 'home', null, []],
  ['recliner', 'home', null, []],
  ['towel', 'home', null, []],
  ['face wash', 'personal care', null, []],
  ['moisturizer', 'personal care', null, []],
  ['deodorant', 'personal care', null, []],
  ['razor', 'personal care', null, []],
  ['shaving cream', 'personal care', null, []],
  ['hair dryer', 'personal care', null, []],
  ['hair gel', 'personal care', null, []],
  ['nail polish', 'personal care', null, []],
  ['perfume', 'personal care', null, []],
  ['body wash', 'personal care', null, []],
  ['baby wipes', 'baby', null, []],
  ['baby food', 'baby', null, []],
  ['baby shampoo', 'baby', null, []],
  ['baby blanket', 'baby', null, []],
  ['baby monitor', 'baby', null, []],
  ['pacifier', 'baby', null, []],
  ['basketball', 'sports', null, []],
  ['soccer ball', 'sports', null, []],
  ['football', 'sports', null, []],
  ['baseball glove', 'sports', null, []],
  ['golf clubs', 'sports', null, []],
  ['ski boots', 'sports', null, ['Shoe Polish', 'Boot Rack']],
  ['electric bike', 'sports', null, ['Bike Helmet', 'Bike Lock', 'Bike Pump']],
  ['cat food', 'pets', null, []],
  ['dog treats', 'pets', null, []],
  ['bird seed', 'pets', null, []],
  ['fish food', 'pets', null, []],
  ['duffel bag', 'bags', null, []],
  ['messenger bag', 'bags', null, []],
  ['wallet', 'bags', null, []],
  ['suitcase', 'bags', null, []],
  ['toaster', 'kitchen', null, []],
  ['kettle', 'kitchen', null, []],
  ['microwave', 'kitchen', null, []],
  ['oven mitt', 'kitchen', null, []],
  ['cutting board', 'kitchen', null, []],
  ['knife set', 'kitchen', null, []],
  ['hammer', 'tools', null, []],
  ['screwdriver', 'tools', null, []],
  ['wrench', 'tools', null, []],
  ['pliers', 'tools', null, []],
  ['toolbox', 'tools', null, []],
  ['doll', 'toys', null, []],
  ['action figure', 'toys', null, []],
  ['puzzle', 'toys', null, []],
  ['toy car', 'toys', null, []],
];
if (TYPES.length !== 100) throw new Error('TYPES must be 100, got ' + TYPES.length);

function queriesFor(t) {
  const q = t[0];
  return [q, `${q} for men`, `${q} for women`, `new ${q}`, `${q} 2 pack`];
}
function mkProd(title, expected, opts = {}) {
  return { title, store: pick(['Walmart', 'Target', 'Amazon', 'Best Buy']),
    price: opts.price ?? (5 + rnd() * 95), price_source: opts.src ?? (rnd() < 0.5 ? 'store_page' : 'search'),
    rating: opts.rating ?? (3 + rnd() * 2), reviews: opts.reviews ?? Math.floor(rnd() * 5000),
    in_stock: opts.stock ?? true, color: '', brand: '', _expected: expected };
}
function buildList(t, q) {
  const [base, cat, syn, accs] = t;
  const items = [];
  // 25 relevant — titles are built FROM the query, so they contain its words
  // (same method as the 509 harness): plain, synonym, singular/plural.
  // Synonym / plural variants keep the query's modifiers ("for men",
  // "2 pack") — a title that matches the product but omits the modifier
  // would otherwise fail the worker's word-coverage check, which is a
  // separate known gap, not what this test is measuring.
  const withBase = (repl) => q.includes(t[0]) ? q.replace(t[0], repl) : repl;
  for (let i = 0; i < 15; i++) items.push(mkProd(`${pick(BRANDS)} ${cap(q)} ${pick(DETAILS)}`, true, { rating: 3 + rnd() * 2, reviews: Math.floor(rnd() * 2000) }));
  for (let i = 0; i < 5; i++) items.push(mkProd(syn ? `${pick(BRANDS)} ${cap(withBase(syn))} ${pick(DETAILS)}` : `${pick(BRANDS)} ${cap(q)} Deluxe Edition`, true, { rating: 3 + rnd() * 2 }));
  for (let i = 0; i < 5; i++) items.push(mkProd(`${pick(BRANDS)} ${cap(withBase(flipNumber(t[0])))} ${pick(DETAILS)}`, true));
  // 75 wrong — wrong-category pool is a DIFFERENT category from the query's
  // (same method as the 509 harness). Same-category different products
  // (shoes vs sneakers, mountain bike vs bicycle) are synonyms/subtypes,
  // not wrong-category items — they are covered by the accessory / mention
  // / partial generators below instead.
  const otherTitles = [];
  for (const o of TYPES) if (o[1] !== cat) otherTitles.push(`${pick(BRANDS)} ${cap(o[0])} ${pick(DETAILS)}`);
  for (let i = 0; i < 20; i++) items.push(mkProd(pick(otherTitles), false, { rating: 4.7 + rnd() * 0.3, reviews: Math.floor(2000 + rnd() * 20000), src: 'store_page' }));
  for (let i = 0; i < 15; i++) items.push(mkProd(`${cap(q)} ${CONFUSERS[i % CONFUSERS.length]}`, false, { rating: 4.7 + rnd() * 0.3, reviews: Math.floor(2000 + rnd() * 20000), src: 'store_page' }));
  for (let i = 0; i < 10; i++) {
    const a = accs.length ? accs[i % accs.length] : pick(otherTitles);
    items.push(mkProd(`${pick(BRANDS)} ${a} ${pick(DETAILS)}`, false, { rating: 4.7 + rnd() * 0.3, reviews: Math.floor(2000 + rnd() * 20000), src: 'store_page' }));
  }
  // Partial-word-match confusers: the query's first product word + an
  // unrelated noun. The noun must not be the product itself again
  // ("Jacket Jacket", "Socks Socks"), must not be part of the query
  // ("New Socks" for "new socks" IS socks), and must not form a synonym
  // phrase with it ("Winter Jacket" IS a winter coat) — those are
  // generator mistakes, not worker failures, so they are skipped here.
  const baseFirst = t[0].split(' ')[0];
  for (let i = 0; i < 15; i++) {
    let noun = pick(PARTIAL_NOUNS), guard = 0;
    while (guard++ < 20 && (singular(noun.toLowerCase()) === singular(baseFirst) || q.split(' ').some(w => singular(noun.toLowerCase()) === singular(w)) ||
      (syn && (baseFirst + ' ' + noun).toLowerCase() === syn.toLowerCase()))) noun = pick(PARTIAL_NOUNS);
    items.push(mkProd(`${cap(baseFirst)} ${noun} ${pick(DETAILS)}`, false, { rating: 4.7 + rnd() * 0.3, reviews: Math.floor(2000 + rnd() * 20000), src: 'store_page' }));
  }
  // Gender-flip confusers (set 2 only): same product, opposite gender detail.
  // Only for one-word products, where the gender word is a hard requirement:
  // with 2 query words the 60% bar needs both, so "Milk for Women" must fail
  // a "milk for men" query — it only passed before because "men" matched
  // inside "women" (Gap 4). For multi-word products the 60% bar needs only
  // 2 of 3 words, so a flip item would pass on the threshold, not on Gap 4.
  const flip = q.endsWith(' for men') ? 'for Women' : q.endsWith(' for women') ? 'for Men' : null;
  const flipApplies = flip && t[0].split(' ').length === 1;
  for (let i = 0; i < 15; i++) {
    if (flipApplies && i < 5) items.push(mkProd(`${pick(BRANDS)} ${cap(t[0])} ${flip}`, false, { rating: 4.7 + rnd() * 0.3, reviews: Math.floor(2000 + rnd() * 20000), src: 'store_page' }));
    else items.push(mkProd(pick(otherTitles), false, { rating: 3 + rnd() * 2, reviews: Math.floor(rnd() * 5000) }));
  }
  return shuffle(items);
}

const t0 = Date.now();
let itemChecks = 0, itemPass = 0, falsePos = 0, falseNeg = 0;
let queriesRun = 0, queriesTop3Clean = 0, queriesTop3Dirty = 0, top3WrongTotal = 0, top3Slots = 0;
let relevantLost = 0, wrongKept = 0;
const perCategory = {};
const failures = []; // {kind, query, title, expected, got, where}
const perQuery = [];
for (const t of TYPES) {
  const cat = t[1];
  perCategory[cat] = perCategory[cat] || { queries: 0, checks: 0, pass: 0, top3Dirty: 0 };
  for (const q of queriesFor(t)) {
    queriesRun++;
    perCategory[cat].queries++;
    const list = buildList(t, q);
    // item-checks: relevant() on every item (the filter does exactly this)
    for (const p of list) {
      itemChecks++; perCategory[cat].checks++;
      const got = W.relevant(p.title, q);
      if (got === p._expected) { itemPass++; perCategory[cat].pass++; }
      else if (got && !p._expected) { falsePos++; failures.push({ kind: 'false-positive-kept', query: q, title: p.title, expected: false, got: true, where: 'relevant()' }); }
      else { falseNeg++; failures.push({ kind: 'false-negative-lost', query: q, title: p.title, expected: true, got: false, where: 'relevant()' }); }
    }
    const kept = W.filterSearchResults(list, q);
    wrongKept += kept.filter(p => !p._expected).length;
    relevantLost += list.filter(p => p._expected && !kept.includes(p)).length;
    const sorted = W.sortSearchResults(kept, q);
    const top3 = sorted.slice(0, 3);
    top3Slots += top3.length;
    const top3Wrong = top3.filter(p => !p._expected).length;
    top3WrongTotal += top3Wrong;
    if (top3Wrong === 0) queriesTop3Clean++; else { queriesTop3Dirty++; perCategory[cat].top3Dirty++; }
    perQuery.push({ query: q, category: cat, listSize: list.length, kept: kept.length, top3Wrong, top3: top3.map(p => p.title) });
    if (queriesRun % 100 === 0) console.log(`... ${queriesRun}/500 queries, ${itemChecks} item-checks, pass ${(100 * itemPass / itemChecks).toFixed(2)}%`);
  }
}
const ms = Date.now() - t0;
const summary = {
  method: 'LOCAL only — 0 live searches. 100 product types x 5 query variants = 500 queries; each query a list of 100 items (25 relevant, 75 wrong by construction) = 50,000 relevant() item-checks, seed 135792468 (set 2 — different from set 1).',
  date: new Date().toISOString(),
  queriesRun, itemChecks,
  itemPass, itemFailed: itemChecks - itemPass,
  itemPassRate: itemPass / itemChecks,
  falsePositives: falsePos, falseNegatives: falseNeg,
  filterWrongKept: wrongKept, filterRelevantLost: relevantLost,
  top3: { slots: top3Slots, wrongInTop3: top3WrongTotal, wrongRate: top3Slots ? top3WrongTotal / top3Slots : 0, queriesClean: queriesTop3Clean, queriesDirty: queriesTop3Dirty },
  perCategory, ms, msPerQuery: ms / queriesRun, msPerItemCheck: ms / itemChecks,
  failuresRecorded: failures.length,
};
console.log(JSON.stringify(summary, null, 2));
fs.writeFileSync(path.join(ROOT, 'test-50000-set2-results.json'), JSON.stringify({ summary, perQuery, failures: failures.slice(0, 200) }, null, 2));
console.log('wrote tests/test-50000-set2-results.json');
