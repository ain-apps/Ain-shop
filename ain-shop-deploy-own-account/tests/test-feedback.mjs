// Voice feedback on search results (test copy only): NO live searches.
// Tests site/feedback.js with a stubbed localStorage, a stub BAIN_APP
// (results on screen) and a stub BAIN_CONVO. Run: node tests/test-feedback.mjs
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const dir = path.dirname(fileURLToPath(import.meta.url));
function tt(k, v) { // no feedback keys exist in i18n.js yet: t() must fall back to English
  return k;
}

// ---- stubs ----
const store = {};
globalThis.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
globalThis.BAIN_I18N = { speech: () => 'en-US', t: tt, lang: 'en', LANGS: { en: { s: {} } } };
const S = { results: [], query: { query: 'running shoes' }, shown: 0, chosen: -1, spot: -1, details: {}, searchedAt: 0 };
globalThis.BAIN_APP = {
  S, t: tt, shortName: (p) => String(p.title || '').slice(0, 60),
  sayNative: () => {}, announce: () => {}, status: () => {}, render: () => {},
};
let teachCalls = [];
globalThis.BAIN_TEACH = { record: (c) => { teachCalls.push(c); return { id: 't-test', ...c }; } };
// A stub BAIN_CONVO: speaks into `spoken`, resolves "that one" to the
// result being read (index 1), "number N" to N-1.
let spoken = [];
globalThis.BAIN_CONVO = {
  speak: (text) => { spoken.push(text); },
  lastResults: () => S.results,
  lastQuery: () => (S.query && S.query.query) || '',
  resolveReference: (text) => {
    if (/that one|that result|this one/.test(text)) return 1;
    const m = /number (\d+)/.exec(text);
    if (m) return parseInt(m[1], 10) - 1;
    return null;
  },
};

// ---- load feedback.js ----
const src = fs.readFileSync(path.join(dir, '..', 'site', 'feedback.js'), 'utf8');
eval(src);
const F = globalThis.BAIN_FEED;

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? ' — ' + extra : '')); }
}
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

const shoe1 = { title: 'Nike Running Shoes', store: 'Walmart', url: 'https://www.walmart.com/ip/123', price: 50 };
const shoe2 = { title: 'Adidas Running Shoes', store: 'Target', url: 'https://www.target.com/p/9', price: 45 };
const suit = { title: 'Blue Bathing Suit', store: 'Walmart', url: 'https://www.walmart.com/ip/999', price: 20 };
S.results = [shoe1, shoe2, suit];

// 1. record + helpfulness counts
let e1 = F.record(shoe1, 'helpful', 'running shoes');
check('record: helpful stored', !!e1 && e1.verdict === 'helpful' && e1.key.indexOf('url:') === 0, JSON.stringify(e1));
F.record(shoe1, 'helpful', 'running shoes');
F.record(shoe1, 'not_helpful', 'running shoes');
let h = F.helpfulness(shoe1);
check('helpfulness: counts', h.helpful === 2 && h.not_helpful === 1 && h.wrong === 0 && h.total === 3, JSON.stringify(h));
check('helpfulness: same item by key string', F.helpfulness(F.productKey(shoe1)).total === 3);
check('helpfulness: unknown product is zero', eq(F.helpfulness(suit), { helpful: 0, not_helpful: 0, wrong: 0, total: 0, net: 0, boost: 0 }));
check('record: bad verdict rejected', F.record(shoe1, 'meh', 'running shoes') === null);
check('record: no product rejected', F.record(null, 'helpful', 'running shoes') === null);

// 2. boost bounds — feedback can never bury or promote much
let b1 = F.boostForRanking(shoe1); // 2 helpful, 1 not helpful -> +0.025
check('boost: 2 helpful 1 not-helpful is +0.025', b1 === 0.025, String(b1));
for (let i = 0; i < 10; i++) F.record(shoe1, 'helpful', 'running shoes');
check('boost: many helpful on a mixed record stays at net +0.025', F.boostForRanking(shoe1) === 0.025, String(F.boostForRanking(shoe1)));
const fresh = { title: 'Fresh Running Shoes', store: 'Target', url: 'https://www.target.com/p/fresh', price: 30 };
for (let i = 0; i < 5; i++) F.record(fresh, 'helpful', 'running shoes');
check('boost: five helpful on a fresh product caps at +0.05', F.boostForRanking(fresh) === 0.05, String(F.boostForRanking(fresh)));
F.record(suit, 'wrong', 'running shoes');
check('boost: one wrong is -0.05', F.boostForRanking(suit) === -0.05, String(F.boostForRanking(suit)));
F.record(suit, 'wrong', 'running shoes');
check('boost: repeated wrong still -0.05', F.boostForRanking(suit) === -0.05, String(F.boostForRanking(suit)));
check('boost: |boost| never over 0.05', Math.abs(F.boostForRanking(shoe1)) <= 0.05 && Math.abs(F.boostForRanking(suit)) <= 0.05);

// 3. ranked() never flips relevance — a clearly relevant item stays first
const scoreOf = (p) => (p === shoe1 ? 0.9 : p === shoe2 ? 0.4 : 0.1);
// shoe2 has no feedback, suit is -0.05, shoe1 is +0.05: gap 0.5, order must hold
let r1 = F.ranked([shoe2, shoe1, suit], scoreOf);
check('ranked: 0.5 relevance gap is never flipped by feedback', r1[0] === shoe1 && r1[1] === shoe2 && r1[2] === suit, JSON.stringify(r1.map((p) => p.title)));
// near-tie: gap 0.02 — helpful feedback (+0.025 net on shoe1) may move it up
const nearTie = (p) => (p === shoe1 ? 0.63 : p === shoe2 ? 0.65 : 0.1);
F.record(shoe1, 'helpful', 'running shoes'); // shoe1 now max +0.05
let r2 = F.ranked([shoe2, shoe1], nearTie);
check('ranked: near-tie (0.02 gap) lets helpful feedback move an item up', r2[0] === shoe1, JSON.stringify(r2.map((p) => p.title)));
// ranked does not mutate the input list
let input = [shoe2, shoe1];
F.ranked(input, nearTie);
check('ranked: input list untouched', input[0] === shoe2 && input[1] === shoe1);

// 4. voice commands with the stub BAIN_CONVO
spoken = [];
let c1 = F.command('that one was helpful');
check('command: "that one was helpful" resolves via BAIN_CONVO to result 2', c1 && c1.action === 'feedback' && c1.verdict === 'helpful' && c1.product === shoe2, JSON.stringify(c1));
check('command: helpful spoken in a full sentence', spoken.length === 1 && /Got it/.test(spoken[0]) && /more like/.test(spoken[0]), JSON.stringify(spoken));
check('command: helpful recorded on the product', F.helpfulness(shoe2).helpful === 1, JSON.stringify(F.helpfulness(shoe2)));
spoken = [];
let c2 = F.command("that one wasn't helpful");
check('command: "that one wasn\'t helpful" is not_helpful, not helpful', c2 && c2.verdict === 'not_helpful' && c2.product === shoe2, JSON.stringify(c2));
check('command: not-helpful sentence promises fewer like it', /fewer like that one/.test(c2.sentence), c2.sentence);
let c3 = F.command('number 2 was great');
check('command: "number 2 was great" is helpful for result 2', c3 && c3.verdict === 'helpful' && c3.product === shoe2, JSON.stringify(c3));
let c4 = F.command('the first one was great');
check('command: "the first one was great" is helpful for result 1', c4 && c4.verdict === 'helpful' && c4.product === shoe1, JSON.stringify(c4));
check('command: not feedback returns null', F.command('show me running shoes') === null);
check('command: "number 9 was wrong" with only 3 results asks again', (() => { const r = F.command('number 9 was wrong'); return r && r.action === 'none' && /which result/.test(r.sentence); })());

// 5. wrong-verdict offer flow: ask first, teach only on yes
teachCalls = [];
spoken = [];
let c5 = F.command('number 3 was wrong');
check('command: "number 3 was wrong" asks to note a mistake', c5 && c5.action === 'ask_mistake' && c5.needsConfirm === true && /note that as a mistake to fix/.test(c5.sentence), JSON.stringify(c5));
check('wrong flow: teaching NOT called before the person answers', teachCalls.length === 0);
check('wrong flow: pending offer holds the bathing suit', F.pendingWrong() && F.pendingWrong().product === suit, JSON.stringify(F.pendingWrong()));
check('wrong flow: feedback itself was still recorded', F.helpfulness(suit).wrong === 3, JSON.stringify(F.helpfulness(suit))); // 2 earlier + this one
let yes = F.answerMistakeOffer('yes');
check('wrong flow: yes hands the case to BAIN_TEACH once', teachCalls.length === 1 && teachCalls[0].wrong_title === 'Blue Bathing Suit' && teachCalls[0].query === 'running shoes' && teachCalls[0].source === 'voice-feedback', JSON.stringify(teachCalls));
check('wrong flow: yes clears the pending offer', F.pendingWrong() === null);
check('wrong flow: yes sentence says on this phone only', /on this phone only/.test(yes.sentence), yes.sentence);
// no-path: a fresh wrong verdict, then "no"
F.command('number 3 was wrong');
teachCalls = [];
let no = F.answerMistakeOffer('no');
check('wrong flow: no does NOT call BAIN_TEACH', teachCalls.length === 0);
check('wrong flow: no clears the pending offer', F.pendingWrong() === null);
check('wrong flow: no sentence says it will not be noted', /won't note it/.test(no.sentence), no.sentence);
// a bare "yes" with nothing pending does nothing harmful
let stray = F.answerMistakeOffer('yes');
check('wrong flow: stray yes with no pending is a no-op', stray.action === 'none' && teachCalls.length === 0);
// the pending offer also answers through command("yes")
F.command('number 3 was wrong');
teachCalls = [];
let viaCmd = F.command('yes please');
check('wrong flow: answering "yes please" through command() notes the mistake', viaCmd && viaCmd.action === 'mistake_noted' && teachCalls.length === 1, JSON.stringify(viaCmd));

// 6. fallback when BAIN_CONVO does not exist yet (the parallel agent may not have built it)
const savedConvo = globalThis.BAIN_CONVO;
delete globalThis.BAIN_CONVO;
S.chosen = 0; S.spot = 0;
spoken = [];
let c6 = F.command('that result was helpful');
check('fallback: no BAIN_CONVO, "that result was helpful" still works on the lit-up result', c6 && c6.action === 'feedback' && c6.product === shoe1, JSON.stringify(c6));
check('fallback: sentence is still returned for the voice to speak', typeof c6.sentence === 'string' && /Got it/.test(c6.sentence), c6.sentence);
let c7 = F.command('the second one was wrong');
check('fallback: ordinal works without BAIN_CONVO', c7 && c7.action === 'ask_mistake' && c7.product === shoe2, JSON.stringify(c7));
F.answerMistakeOffer('no'); // clear the pending offer from c7
globalThis.BAIN_CONVO = savedConvo;

// 7. on-phone only: everything lives under the one localStorage key
check('storage: only the ain.feedback key is used', Object.keys(store).length === 1 && 'ain.feedback' in store, JSON.stringify(Object.keys(store)));
let recent = F.recentFeedback(3);
check('recentFeedback: newest first', recent.length === 3 && recent[0].verdict === 'wrong', JSON.stringify(recent.map((e) => e.verdict)));
check('summary: counts spoken back', /helpful/.test(F.summary()) && /wrong/.test(F.summary()), F.summary());
F.clear();
check('clear: empty afterwards', F.recentFeedback().length === 0 && !('ain.feedback' in store));
check('summary: empty after clear', F.summary() === "You haven't rated any results yet.", F.summary());

// 8. no results on screen: honest answer, nothing recorded
S.results = [];
let c8 = F.command('that one was helpful');
check('command: no results yet says so and records nothing', c8 && c8.action === 'none' && /haven't read any results/.test(c8.sentence) && F.recentFeedback().length === 0, JSON.stringify(c8));

console.log(JSON.stringify({ total: pass + fail, passed: pass, failed: fail }));
if (fail) process.exit(1);
