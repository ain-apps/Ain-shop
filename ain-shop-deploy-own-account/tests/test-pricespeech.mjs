// Clearer spoken prices and stock (test copy only): NO live searches.
// Tests site/pricespeech.js. Run: node tests/test-pricespeech.mjs
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(dir, '..', '..', 'ain-shop-shared', 'web', 'pricespeech.js'), 'utf8');
eval(src);
const P = globalThis.BAIN_PRICESPEECH;

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? ' — ' + extra : '')); }
}

const shoe = { title: 'Nike running shoes', color: 'blue', size: '10', price: 59.99, currency: 'USD', in_stock: true, store: 'Walmart' };

// 1. normal product: title, colour, size, exact price, stock, store — one full sentence
let s1 = P.speakProduct(shoe, 1, 3);
check('normal product', s1 === '1. Nike running shoes, blue, size 10, $59.99, in stock at Walmart.', s1);

// 2. missing price: said out loud, never guessed
let s2 = P.speakProduct({ title: 'Winter coat', store: 'Target', in_stock: true }, 2, 3);
check('missing price', s2 === '2. Winter coat, price not listed, in stock at Target.', s2);
check('pricePhrase: missing', P.pricePhrase({}) === 'price not listed');
check('pricePhrase: null price', P.pricePhrase({ price: null }) === 'price not listed');

// 3. price 0 / invalid: also "price not listed", never "$0.00"
check('price 0', P.speakProduct({ title: 'Socks', price: 0, in_stock: true, store: 'Walmart' }, 1, 1).indexOf('price not listed') >= 0);
check('price negative', P.pricePhrase({ price: -5 }) === 'price not listed');
check('price junk string', P.pricePhrase({ price: 'call for price' }) === 'price not listed');
check('parsePrice: "$59.99" string', P.parsePrice('$59.99') === 59.99);
check('parsePrice: "1,299.00"', P.parsePrice('1,299.00') === 1299);

// 4. out of stock / unknown stock
let s4 = P.speakProduct({ title: 'Milk', price: 3.5, in_stock: false, store: 'Target' }, 1, 1);
check('out of stock', s4 === '1. Milk, $3.50, out of stock at Target.', s4);
let s5 = P.speakProduct({ title: 'Milk', price: 3.5, store: 'Target' }, 1, 1);
check('unknown stock', s5 === '1. Milk, $3.50, stock not stated at Target.', s5);
check('stockPhrase: null', P.stockPhrase({ in_stock: null }) === 'stock not stated');
check('stockPhrase: missing product', P.stockPhrase(null) === 'stock not stated');

// 5. sale price: both prices, current first
let s6 = P.speakProduct({ title: 'Headphones', price: 49.99, was_price: 69.99, in_stock: true, store: 'Best Buy' }, 1, 1);
check('sale price (was_price)', s6 === '1. Headphones, $49.99, down from $69.99, in stock at Best Buy.', s6);
let s6b = P.speakProduct({ title: 'Headphones', price: 49.99, old_price: 69.99, in_stock: true, store: 'Best Buy' }, 1, 1);
check('sale price (old_price)', s6b.indexOf('down from $69.99') >= 0, s6b);
let s6c = P.speakProduct({ title: 'Headphones', price: 49.99, was_price: 39.99, in_stock: true, store: 'Best Buy' }, 1, 1);
check('was_price below current price is ignored', s6c.indexOf('down from') === -1, s6c);

// 6. missing store / missing title: graceful, still a sentence
let s7 = P.speakProduct({ title: 'Notebook', price: 2.99, in_stock: true }, 1, 1);
check('missing store', s7 === '1. Notebook, $2.99, in stock.', s7);
let s8 = P.speakProduct({ price: 9.99, in_stock: true, store: 'Amazon' }, 3, 3);
check('missing title', s8 === '3. an item with no name listed, $9.99, in stock at Amazon.', s8);
let s9 = P.speakProduct(null, 1, 1);
check('null product', s9 === '1. an item with no name listed, price not listed, stock not stated.', s9);

// 7. non-USD currency keeps its own symbol; no currency defaults to USD
check('formatPrice EUR', P.formatPrice(49.99, 'EUR') === '€49.99', P.formatPrice(49.99, 'EUR'));
check('currency default USD', P.speakProduct({ title: 'Pen', price: 1.5, in_stock: true, store: 'Target' }, 1, 1).indexOf('$1.50') >= 0);

// 8. full list: numbered, sentences, ends with the offer
let list = P.speakList([shoe, { title: 'Milk', price: 3.5, in_stock: false, store: 'Target' }]);
check('speakList: numbered lines', list.indexOf('1. Nike running shoes') === 0 && list.indexOf('2. Milk, $3.50, out of stock at Target.') >= 0, list);
check('speakList: ends with offer', list.endsWith('Want details on any of these, or shall I read the next three?'), list);

// 9. empty list: honest, asks what next
let empty = P.speakList([]);
check('empty list', empty === "I didn't find any items to read out. Want me to try a different search?", empty);
check('empty list (null input)', P.speakList(null).indexOf("didn't find any items") >= 0);

// 10. offset numbering for "read the next three"
let next = P.speakList([{ title: 'Bread', price: 2.5, in_stock: true, store: 'Walmart' }], 3);
check('offset numbering', next.indexOf('4. Bread, $2.50, in stock at Walmart.') === 0, next);

// 11. speak(): no BAIN_CONVO yet — returns the plain text, does not throw
delete globalThis.BAIN_CONVO;
let t11 = P.speak('Hello.');
check('speak: no BAIN_CONVO returns text', t11 === 'Hello.');

// 12. speak(): with BAIN_CONVO present — routes through C.speak
let heard = [];
globalThis.BAIN_CONVO = { speak: (t) => { heard.push(t); } };
let t12 = P.speak('1. Milk, $3.50, in stock at Target.');
check('speak: uses BAIN_CONVO.speak', t12 === '1. Milk, $3.50, in stock at Target.' && heard.length === 1 && heard[0] === t12, JSON.stringify(heard));
let t13 = P.readList([shoe]);
check('readList: speaks and returns text', t13.indexOf('1. Nike running shoes') === 0 && heard.length === 2, t13);
delete globalThis.BAIN_CONVO;

// 13. module is pure: no storage or network touched (no localStorage needed, no fetch)
check('no localStorage use', src.indexOf('localStorage') === -1 && src.indexOf('fetch(') === -1);

console.log(JSON.stringify({ total: pass + fail, passed: pass, failed: fail }));
if (fail) process.exit(1);
