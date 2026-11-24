// v34 whole-web + speed tests (test copy only, no live searches):
// 1. collectTimed — the cap that lets the first 3 be spoken fast.
// 2. normUrl — us/smile.amazon.com is the same store as www.amazon.com.
// 3. The drone case: the Amazon drone the live site dropped must survive the
//    real pipeline (processSearchResults + the real enrich) and the total
//    must match the items on the phone.
// Run: node tests/test-speed-first3.mjs
import * as W from '../site/_worker.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

let pass = 0, fail = 0;
function check(name, ok, extra) {
  if (ok) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? ' — ' + extra : '')); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- 1. collectTimed ----------
{
  const fast = () => sleep(10).then(() => 'a');
  const slow = () => sleep(400).then(() => 'b');
  let r = await W.collectTimed([fast(), fast()], 100);
  check('collectTimed: all fast jobs done before the cap', r.done.length === 2 && r.pending.length === 0, JSON.stringify(r));
  r = await W.collectTimed([fast(), slow(), fast()], 100);
  check('collectTimed: fast jobs done, slow job still pending at the cap', r.done.length === 2 && r.pending.length === 1, JSON.stringify({ done: r.done.length, pending: r.pending.length }));
  r = await W.collectTimed([slow(), fast()], 0);
  check('collectTimed: no cap waits for all', r.done.length === 2 && r.pending.length === 0, JSON.stringify(r));
  r = await W.collectTimed([Promise.resolve('x'), Promise.reject(new Error('boom')), Promise.resolve('y')], 100);
  check('collectTimed: a rejected job is dropped, the rest are kept in order', JSON.stringify(r.done) === JSON.stringify(['x', 'y']) && r.pending.length === 0, JSON.stringify(r.done));
  // the pending promise still finishes on its own — nothing is lost
  const p = (async () => { const rr = await W.collectTimed([slow()], 50); return rr.pending.length === 1 ? await rr.pending[0] : null; })();
  check('collectTimed: the pending job completes later with its value', (await p) === 'b');
}

// ---------- 2. normUrl: Amazon hosts are one store ----------
{
  const a = W.normUrl('https://us.amazon.com/DJI-Vlogger-Combo-Drone-Renewed/dp/B0DNZXS4FN');
  const b = W.normUrl('https://www.amazon.com/DJI-Vlogger-Combo-Drone-Renewed/dp/B0DNZXS4FN');
  const c = W.normUrl('https://smile.amazon.com/DJI-Vlogger-Combo-Drone-Renewed/dp/B0DNZXS4FN');
  check('normUrl: us/smile/www.amazon.com are the same', a === b && b === c && a === 'amazon.com/dji-vlogger-combo-drone-renewed/dp/b0dnzxs4fn', a + ' vs ' + b);
  check('normUrl: other hosts unchanged', W.normUrl('https://www.walmart.com/ip/12345') === 'walmart.com/ip/12345');
}

// ---------- 3. the drone case, through the real pipeline ----------
// A tiny in-memory D1 for store(env): only the SQL the worker actually uses.
function fakeDb() {
  const kv = new Map();
  return {
    prepare(sql) {
      const st = { _args: [] };
      st.bind = (...a) => { st._args = a; return st; };
      st.first = async () => {
        if (/^SELECT/i.test(sql)) {
          const e = kv.get(st._args[0]);
          if (!e) return null;
          if (e.exp && e.exp < Date.now()) { kv.delete(st._args[0]); return null; }
          return { v: e.v, exp: e.exp };
        }
        return null;
      };
      st.run = async () => {
        if (/^INSERT/i.test(sql)) kv.set(st._args[0], { v: st._args[1], exp: st._args[2] });
        return {};
      };
      return st;
    }
  };
}
{
  const dbg = require('/tmp/search-drone-debug.json');
  const env = { BAIN_DB: fakeDb() };
  const L = { maxResults: 8, pageTimeoutMs: 3500 };
  const q = { query: 'drone', stores: [], min_price: null, max_price: null, fast: null };
  // The live debug run cited 80 URLs but saved only the first 60; the Micro
  // Center page was among the cited ones (its why entry had isCited true), so
  // it belongs in the cited list for a faithful replay.
  const cited = (dbg.cited_urls || []).concat(['https://www.microcenter.com/site/products/drones.aspx']);
  const web = { items: dbg.raw, urls: cited };
  const out = await W.processSearchResults(env, web, null, q, L);
  const titles = out.list.map(p => p.title + ' @ ' + p.store);
  const hasAmazon = out.list.some(p => /amazon\.com/.test(p.url || '') && /mini 3 pro/i.test(p.title || ''));
  check('drone: the Amazon drone survives to the final list', hasAmazon, JSON.stringify(titles));
  check('drone: total equals the items on the phone (the count the voice speaks is true)', out.total === out.list.length, 'total=' + out.total + ' list=' + out.list.length);
  check('drone: the final list is the top results, not shrunk to one', out.list.length >= 2, 'list=' + out.list.length + ' ' + JSON.stringify(titles));
  console.log('  stats:', JSON.stringify(out.stats), '| titles:', JSON.stringify(titles));
  // And the mechanism: with NO cited Amazon URL at all, the same item is
  // still dropped — the fix is the cited match, not keeping everything.
  const web2 = { items: dbg.raw, urls: (dbg.cited_urls || []).filter(u => !/amazon\.com/.test(u)) };
  const out2 = await W.processSearchResults(env, web2, null, q, L);
  const hasAmazon2 = out2.list.some(p => /amazon\.com/.test(p.url || ''));
  check('drone: without any cited Amazon link the Amazon item is still dropped (cited check intact)', !hasAmazon2, JSON.stringify(out2.list.map(p => p.title)));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
