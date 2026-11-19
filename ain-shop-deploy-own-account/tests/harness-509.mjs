// Teaching loop: the 509-case harness from search-test-500 / search-fix-test-report,
// copied into this test copy so it can be re-run by teaching-loop.mjs.
// No live searches. Paths are relative to this file.
import * as W from '../site/_worker.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const INTENT = require('../../ain-shop-v30-source/site/intent.js');

const results = [];
function rec(section, id, query, detail, expected, actual, pass) {
  results.push({section, id, query, detail, expected, actual, pass});
}

// ---------- helpers ----------
let seed = 1234567;
function rnd(){ seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
function pick(a){ return a[Math.floor(rnd()*a.length)]; }
const cap = s => s.replace(/\b\w/g, c => c.toUpperCase());
const singular = w => w.replace(/ies$/,'y').replace(/s$/,'');
const plural = w => w.endsWith('s') ? w : (w.endsWith('y') ? w.slice(0,-1)+'ies' : w+'s');

// ---------- SECTION A: relevant() — 300 cases, 60 queries x 5 titles ----------
const QUERIES = [
 'shoes','running shoes','black shoes','pumps','slippers','bathing suit','winter coat','t-shirt','jeans','dress',
 'socks','sneakers','sandals','boots','hoodie','sweater','swimsuit','milk','bread','eggs',
 'coffee','bananas','chicken breast','rice','cheese','butter','cereal','phone charger','laptop','headphones',
 'television','tablet','smart watch','bluetooth speaker','camera','couch','sofa','lamp','pillow',
 'blanket','vacuum cleaner','desk','chair','bed sheets','toothpaste','shampoo','vitamins','sunscreen',
 'lipstick','baby diapers','baby stroller','baby bottle','tennis racket','yoga mat','bicycle','dumbbells',
 'dog food','batteries','backpack','water bottle','umbrella','sunglasses'
]; // 60
const SYN = { // query -> synonym phrase (same thing, different word)
 'shoes':'sneakers','running shoes':'running sneakers','sneakers':'trainers','television':'TV','couch':'sofa','sofa':'couch',
 'laptop':'notebook computer','headphones':'earphones','bicycle':'bike','vacuum cleaner':'vacuum','sunglasses':'shades',
 'baby diapers':'disposable nappies','smart watch':'smartwatch','phone charger':'phone charging cable','camera':'digital camera',
 'bathing suit':'swimsuit','swimsuit':'bathing suit','blanket':'throw blanket','dress':'gown','t-shirt':'tee shirt'
};
const WRONG_POOL = ['Women One Piece Bathing Suit','Stainless Steel Water Bottle 32oz','Wooden Dining Chair Set of 4','Dog Food Grain Free 15lb','AA Batteries Pack of 24','LED Desk Lamp Adjustable','Ceramic Coffee Mug Set','Garden Hose 50ft','Car Tire All Season','Fishing Rod and Reel Combo','Wall Clock Modern','Throw Pillow Covers 18x18','Baby Stroller Lightweight','Bluetooth Speaker Waterproof','Yoga Mat Non Slip','Toothpaste Whitening Mint','Laptop Stand Aluminum','Pet Cat Litter 20lb','Umbrella Windproof Travel','Vitamin C Tablets 500mg'];
const BRANDS = ['Nike','Amazon Basics','Great Value','Samsung','Sony','Kirkland','Hanes','Levi','Dove','Purina'];
const DETAILS = ['for Men','for Women','for Kids','Lightweight','Premium','2 Pack','Size Large','Black','White','New'];
function flipNumber(q){ // singular<->plural variant of the query
  const ws=q.split(' '); const last=ws[ws.length-1];
  ws[ws.length-1] = last.endsWith('s') ? singular(last) : plural(last);
  return ws.join(' ');
}
let aId=0;
for (const q of QUERIES) {
  const words=q.split(' ');
  const correct = `${pick(BRANDS)} ${cap(q)} ${pick(DETAILS)}`;
  const wrong = pick(WRONG_POOL.filter(t=>!t.toLowerCase().includes(words[words.length-1])));
  let partial;
  if (words.length>1) partial = `${cap(words[0])} ${pick(['Shorts','Jacket','Blanket','Table','Case','Cream','Socks','Hat'])} ${pick(DETAILS)}`;
  else partial = `${cap(q)} ${pick(['Scented Candle','Bath Soak','Flavored Lip Balm','Shaped Cookie Cutter','Print Tote Bag'])}`;
  const variant = `${pick(BRANDS)} ${cap(flipNumber(q))} ${pick(DETAILS)}`;
  const synTitle = SYN[q] ? `${pick(BRANDS)} ${cap(SYN[q])} ${pick(DETAILS)}` : `${pick(BRANDS)} ${cap(q)} Deluxe Edition`;
  const cases = [
    {title: correct, exp: true, kind:'correct'},
    {title: wrong, exp: false, kind:'wrong-category'},
    {title: partial, exp: false, kind:'partial-word-match'},
    {title: variant, exp: true, kind:'singular/plural variant'},
    {title: synTitle, exp: true, kind: SYN[q] ? 'synonym' : 'expanded correct'},
  ];
  for (const c of cases) {
    aId++;
    const got = W.relevant(c.title, q);
    rec('A-relevant', 'A'+aId, q, `${c.kind}: "${c.title}"`, c.exp, got, got===c.exp);
  }
}

// ---------- SECTION B: sort simulation — 100 lists ----------
// exact comparator from shopSearch (_worker.js ~line 811)
function sortList(list, query){
  // FIXED pipeline: filter wrong-category / not-relevant items OUT first,
  // then sort relevance first (relevanceScore), then stock, price, popularity.
  const kept = W.filterSearchResults(list, query);
  return W.sortSearchResults(kept, query);
}
function mkProd(title, rel, opts={}){
  return {title, store: pick(['Walmart','Target','Amazon','Best Buy']),
    price: opts.price ?? (5+rnd()*95), price_source: opts.src ?? (rnd()<0.5?'store_page':'search'),
    rating: opts.rating ?? (3+rnd()*2), reviews: opts.reviews ?? Math.floor(rnd()*5000),
    in_stock: opts.stock ?? true, color: opts.color ?? '', brand:''};
}
let bId=0;
for (let i=0;i<100;i++){
  bId++;
  const q = pick(QUERIES);
  const nRel = 1 + Math.floor(rnd()*4); // 1-4 relevant out of 8
  const list=[];
  for (let k=0;k<8;k++){
    if (k<nRel){
      const relHigh = rnd()<0.5;
      list.push(mkProd(`${pick(BRANDS)} ${cap(q)} ${pick(DETAILS)}`, true, {
        rating: relHigh? 4.5+rnd()*0.5 : 3.0+rnd()*0.8,
        reviews: relHigh? Math.floor(rnd()*200) : Math.floor(rnd()*50),
        stock: rnd()<0.85, src: rnd()<0.4?'store_page':'search'}));
    } else {
      const wrong = pick(WRONG_POOL.filter(t=>!t.toLowerCase().includes(q.split(' ').pop())));
      list.push(mkProd(wrong, false, {
        rating: 4.7+rnd()*0.3, reviews: Math.floor(2000+rnd()*20000),
        stock: true, src:'store_page'}));
    }
  }
  // shuffle
  for (let k=list.length-1;k>0;k--){ const j=Math.floor(rnd()*(k+1)); [list[k],list[j]]=[list[j],list[k]]; }
  const keptCount = W.filterSearchResults(list, q).length;
  const sorted = sortList(list, q);
  const top3 = sorted.slice(0,3);
  const top3Irrel = top3.filter(p=>!W.relevant(p.title,q)).length;
  const nRelInTop3 = top3.filter(p=>W.relevant(p.title,q)).length;
  const firstIsIrrel = !W.relevant(sorted[0].title,q);
  const relBelow = sorted.slice(3).filter(p=>W.relevant(p.title,q)).length;
  // PASS = no irrelevant item in top 3 while a relevant item sits below top 3
  const pass = !(top3Irrel>0 && relBelow>0);
  rec('B-sort', 'B'+bId, q, `8 items, ${nRel} relevant, kept after filter=${keptCount}; top3 irrelevant=${top3Irrel}, relevant below top3=${relBelow}, #1 irrelevant=${firstIsIrrel}; top3=[${top3.map(p=>p.title.slice(0,28)).join(' | ')}]`, 'no irrelevant in top3 while relevant exists below', `top3Irrel=${top3Irrel} relBelow=${relBelow}`, pass);
}

// ---------- SECTION C: intent.js command-swallowing — 100 cases ----------
let cId=0;
const PRODUCT_QUERIES = ['shoes','black shoes','stopwatch','backpack','back pain cream','next generation phone','pumps','gift cards','my cards','wall mart','target store','best buy tv','add to cart milk','checkout','fast shipping','slow cooker','normal milk','speed','stop','next','back','camera','barcode','open box tv','close up cream','faster delivery','wait longer','what is my speed','my cart','my carts','check out','walmart','costco','home depot','kroger','walgreens','meijer','switch to target','go to walmart'];
for (const q of PRODUCT_QUERIES.slice(0,40)) {
  cId++;
  const quick = INTENT.quick(q);
  const speed = INTENT.speed(q, false);
  const noise = INTENT.noise(q, null);
  // A bare product search must not be swallowed as a quick/speed command, and must not be treated as noise
  const pass = quick===null && speed===null && noise===false;
  rec('C-intent', 'C'+cId, q, `quick=${quick} speed=${speed} noise=${noise}`, 'quick=null speed=null noise=false', `quick=${quick} speed=${speed} noise=${noise}`, pass);
}
// fix() cases
const FIX_CASES = [
  ['gift cards', 'gift cards'], ['black shoes','black shoes'], ['my cards','my carts'], ['add to card','add to cart'],
  ['wall mart','walmart'], ['best buy tv','best buy tv'], ['check out','checkout'], ['my cart','my cart'],
  ['shoes for my kids','shoes for my kids'], ['card holder','card holder'], ['gift card','gift card'],
  ['tar get store','target store'], ['home depo','home depot'], ['cost co','costco'], ['kro ger','kroger'],
  ['wal greens','walgreens'], ['my er','meijer'], ['go too walmart','go to walmart'], ['switch two target','switch to target'],
  ['add it to my card','add it to my cart'],
];
for (const [inp, exp] of FIX_CASES) {
  cId++;
  const got = INTENT.fix(inp);
  rec('C-intent-fix', 'C'+cId, inp, `fix("${inp}")`, exp, got, got===exp);
}
// hit() must not match command phrases inside product words
const HIT_CASES = [
  ['black shoes', ['back'], null], ['stopwatch', ['stop'], null], ['backpack', ['back'], null],
  ['next generation phone', ['next'], null], ['pumps for a wedding', ['pumps'], null],
  ['stop talking', ['stop'], 'stop'], ['go back', ['back','go back'], 'go back'],
  ['next one', ['next','next one'], 'next one'], ['check out', ['checkout','check out'], 'check out'],
  ['my carts', ['my carts'], 'my carts'], ['open settings', ['open settings'], 'open settings'],
  ['fast shipping', ['fast'], null], ['slow cooker', ['slow'], null], ['camera', ['camera'], 'camera'],
  ['shoes', ['shoes'], 'shoes'], ['milk', ['milk'], 'milk'], ['what can you do', ['what can you do'], 'what can you do'],
  ['buy milk', ['buy milk'], 'buy milk'], ['add milk to cart', ['add to cart'], null],
  ['number two', ['number two'], 'number two'],
];
for (const [inp, phrases, exp] of HIT_CASES) {
  cId++;
  const h = INTENT.hit(inp, phrases);
  const got = h ? h.phrase : null;
  rec('C-intent-hit', 'C'+cId, inp, `hit("${inp}", [${phrases.join(', ')}])`, exp, got, got===exp);
}
// noise() cases
const NOISE_CASES = [
  ['', true], ['thank you', true], ['music', true], ['shoes', false], ['milk', false],
  ['buy running shoes size 10', false], ['umm', true], ['beep', true], ['hello', false], ['ok', true],
  ['black shoes for men', false], ['pumps', false], ['thanks for watching', true], ['silence', true],
  ['bathing suit', false], ['what is this', false], ['yeah', true], ['cough', true], ['phone charger', false], ['hmm', true],
];
for (const [inp, exp] of NOISE_CASES) {
  cId++;
  const got = INTENT.noise(inp, null);
  rec('C-intent-noise', 'C'+cId, inp, `noise("${inp}")`, exp, got, got===exp);
}

const total = results.length;
const passed = results.filter(r=>r.pass).length;
const bySection = {};
for (const r of results){ bySection[r.section]=bySection[r.section]||{total:0,pass:0}; bySection[r.section].total++; if(r.pass) bySection[r.section].pass++; }
console.log(JSON.stringify({total, passed, failed: total-passed, bySection}, null, 2));
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
fs.writeFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'harness-509-results.json'), JSON.stringify(results, null, 2));
console.log('wrote tests/harness-509-results.json');
