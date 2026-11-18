// Shared conversation module (test copy only): NO live searches, NO network.
// Tests site/conversation.js with stubbed speechSynthesis / BAIN_APP /
// BAIN_AI / AIN_SHOW. Run: node tests/test-conversation.mjs
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(dir, '..', 'site', 'conversation.js'), 'utf8');

// ---- stubs ----
let spoken = [];       // { text, voice, lang } via speechSynthesis
let realtimeSaid = []; // lines handed to the Realtime voice
let nativeSaid = [];   // lines via BAIN_APP.sayNative
let voices = [
  { name: 'Alex', lang: 'en-US', default: false },
  { name: 'Samantha', lang: 'en-US', default: true },
  { name: 'Daniel', lang: 'en-GB', default: false },
  { name: 'Google US English', lang: 'en-US', default: false },
  { name: 'Karen', lang: 'en-AU', default: false },
];
let inCall = false;
class FakeUtterance { constructor(t) { this.text = t; this.lang = ''; this.voice = null; } }
globalThis.SpeechSynthesisUtterance = FakeUtterance;
globalThis.speechSynthesis = {
  getVoices: () => voices.slice(),
  speak: (u) => { spoken.push({ text: u.text, voice: u.voice ? u.voice.name : null, lang: u.lang }); },
  cancel: () => {},
};
globalThis.BAIN_I18N = { speech: () => 'en-US', lang: 'en' };
globalThis.BAIN_APP = {
  S: { lang: 'en' },
  shortName: (p) => String(p.title || '').slice(0, 60),
  status: () => {}, announce: () => {},
  sayNative: (t) => { nativeSaid.push(t); },
};
globalThis.BAIN_AI = { active: () => inCall, sayLine: (t) => { realtimeSaid.push(t); } };
globalThis.AIN_SHOW = { current: () => null };

eval(src);
const C = globalThis.BAIN_CONVO;

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? ' — ' + extra : '')); }
}
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

const PRODUCTS = [
  { title: 'Nike Air Zoom Running Shoes Blue', store: 'Walmart', price: 49.99, currency: 'USD' },
  { title: 'Adidas Ultraboost Running Shoes Black', store: 'Target', price: 89.99, currency: 'USD' },
  { title: 'New Balance Fresh Foam Running Shoes Blue Large', store: 'Walmart', price: 29.99, currency: 'USD' },
  { title: 'Puma RS-X Sneakers Red', store: 'Amazon', price: '$59.50', currency: 'USD' },
];

// ---- rememberSearch / lastResults ----
check('lastResults empty before any search', eq(C.lastResults(), []));
check('rememberSearch stores products', C.rememberSearch('running shoes', PRODUCTS) === 4);
check('lastResults returns the stored list', C.lastResults().length === 4 && C.lastResults()[0].store === 'Walmart');
check('lastQuery returns the query', C.lastQuery() === 'running shoes');
check('resolveReference null with no results after reset', (() => { C.rememberSearch('', []); return C.resolveReference('the first one') === null; })());
C.rememberSearch('running shoes', PRODUCTS);

// ---- reference resolution: ordinals ----
check('first one -> index 0', (() => { const r = C.resolveReference('the first one'); return r && r.index === 0 && r.product.store === 'Walmart'; })());
check('second one -> index 1', (() => { const r = C.resolveReference('the second one'); return r && r.index === 1; })());
check('third one -> index 2', (() => { const r = C.resolveReference('I want the third one'); return r && r.index === 2; })());
check('number 4 -> index 3', (() => { const r = C.resolveReference('number 4'); return r && r.index === 3; })());
check('fifth one out of range -> null', C.resolveReference('the fifth one') === null);
check('last one -> index 3', (() => { const r = C.resolveReference('the last one'); return r && r.index === 3; })());

// ---- reference resolution: price ----
check('cheaper one -> cheapest ($29.99, index 2)', (() => { const r = C.resolveReference('the cheaper one'); return r && r.index === 2; })());
check('cheapest one -> cheapest', (() => { const r = C.resolveReference('the cheapest one'); return r && r.index === 2; })());
check('most expensive one -> $89.99, index 1', (() => { const r = C.resolveReference('the most expensive one'); return r && r.index === 1; })());
check('cheapest ignores string price parsing ($59.50 parsed)', (() => { const r = C.resolveReference('the cheapest one'); return r && r.product.price !== '$59.50'; })());

// ---- reference resolution: store / colour / size / brand ----
check('one from Walmart -> first Walmart item', (() => { const r = C.resolveReference('the one from Walmart'); return r && r.index === 0; })());
check('one from Target -> index 1', (() => { const r = C.resolveReference('the one from Target'); return r && r.index === 1; })());
check('one from a store with no results -> null', C.resolveReference('the one from Costco') === null);
check('blue one -> first blue item', (() => { const r = C.resolveReference('the blue one'); return r && r.index === 0; })());
check('red one -> index 3', (() => { const r = C.resolveReference('the red one'); return r && r.index === 3; })());
check('large one -> index 2 (size word in title)', (() => { const r = C.resolveReference('the large one'); return r && r.index === 2; })());
check('Nike one -> index 0 (brand word)', (() => { const r = C.resolveReference('the Nike one'); return r && r.index === 0; })());
check('unknown word -> null, no guessing', C.resolveReference('the purple one') === null);

// ---- "that one" ----
check('that one with several results and nothing lit -> null (no guessing)', C.resolveReference('that one') === null);
check('that one with a single result -> that result', (() => {
  C.rememberSearch('milk', [{ title: 'Whole Milk 1 Gallon', store: 'Target', price: 3.5 }]);
  const r = C.resolveReference('that one');
  C.rememberSearch('running shoes', PRODUCTS);
  return r && r.index === 0;
})());
check('that one follows the lit item (AIN_SHOW)', (() => {
  globalThis.AIN_SHOW = { current: () => ({ item: 2, short_name: 'Adidas', store: 'Target', in_results: true }) };
  const r = C.resolveReference('that one');
  globalThis.AIN_SHOW = { current: () => null };
  return r && r.index === 1;
})());

// ---- confirm flow ----
let yesRan = 0, noRan = 0;
spoken = [];
const p = C.askConfirm('Buy the Nike shoes for $49.99 at Walmart, shall I go ahead?', () => { yesRan++; }, () => { noRan++; });
check('askConfirm stores pending', C.pending() && C.pending().summary.indexOf('Nike shoes') >= 0);
check('askConfirm speaks the question', spoken.length === 1 && spoken[0].text.indexOf('Nike shoes') >= 0);
check('handleReply "maybe" returns null and leaves pending open', C.handleReply('maybe later') === null && C.pending() !== null && yesRan === 0 && noRan === 0);
check('handleReply "yes please" runs onYes and clears pending', C.handleReply('yes please') === 'yes' && yesRan === 1 && C.pending() === null);
check('answerYes with nothing pending returns false', C.answerYes() === false);
C.askConfirm('Remove the milk from your list?', () => { yesRan++; }, () => { noRan++; });
check('handleReply "no" runs onNo and clears pending', C.handleReply('no') === 'no' && noRan === 1 && C.pending() === null);
C.askConfirm('Go to checkout?', () => { yesRan++; }, () => { noRan++; });
check('answerNo runs onNo', C.answerNo() === true && noRan === 2 && C.pending() === null);
C.askConfirm('Go to checkout?', () => { yesRan++; }, () => { noRan++; });
check('answerYes runs onYes', C.answerYes() === true && yesRan === 2 && C.pending() === null);
check('askConfirm with no callbacks does not throw', (() => { C.askConfirm('Just checking?'); C.answerYes(); return C.pending() === null; })());
check('clearPending clears without running callbacks', (() => { const y = yesRan; C.askConfirm('X?', () => { yesRan++; }, () => { noRan++; }); C.clearPending(); return C.pending() === null && yesRan === y; })());

// ---- ask ----
spoken = [];
check('ask returns the question text', C.ask('Want more, details on one, or a comparison?') === 'Want more, details on one, or a comparison?');
check('ask speaks the question', spoken.length === 1 && spoken[0].text.indexOf('Want more') === 0);
check('lastQuestion remembers it', C.lastQuestion() === 'Want more, details on one, or a comparison?');

// ---- voice selection ----
check('pickVoice prefers a female voice in the same language (Samantha, en-US)', (() => { const v = C.pickVoice(voices, 'en-US'); return v && v.name === 'Samantha'; })());
check('pickVoice never returns a known male voice while a female exists', (() => {
  const v = C.pickVoice([{ name: 'Alex', lang: 'en-US' }, { name: 'Samantha', lang: 'en-US' }], 'en-US');
  return v && v.name === 'Samantha';
})());
check('pickVoice falls back to the default/first voice when no female name is known', (() => {
  const v = C.pickVoice([{ name: 'Some Voice', lang: 'en-US', default: true }], 'en-US');
  return v && v.name === 'Some Voice';
})());
check('pickVoice returns null for an empty voice list', C.pickVoice([], 'en-US') === null);
check('pickVoice returns null for no list', C.pickVoice(null, 'en-US') === null);
check('pickVoice returns the only voice even if male (nothing else to use)', (() => {
  const v = C.pickVoice([{ name: 'Alex', lang: 'en-US' }], 'en-US');
  return v && v.name === 'Alex';
})());
check('voiceInfo names the picked female voice', (() => { const i = C.voiceInfo(); return i.name === 'Samantha' && i.via === 'speechSynthesis'; })());
check('speak uses speechSynthesis with the female voice outside a call', (() => {
  inCall = false; spoken = [];
  const out = C.speak('I found 4 running shoes.');
  return out.via === 'speechSynthesis' && out.voice === 'Samantha' && spoken.length === 1 && spoken[0].voice === 'Samantha';
})());
check('speak hands the line to the Realtime voice in a call (no phone voice)', (() => {
  inCall = true; spoken = []; realtimeSaid = [];
  const out = C.speak('The cheapest is $29.99 at Walmart.');
  inCall = false;
  return out.via === 'realtime' && realtimeSaid.length === 1 && realtimeSaid[0].indexOf('cheapest') >= 0 && spoken.length === 0;
})());
check('speak with no voices still speaks (browser default) and reports no voice', (() => {
  const saved = voices; voices = []; spoken = [];
  const out = C.speak('Hello.');
  voices = saved;
  return out.via === 'speechSynthesis' && out.voice === null && spoken.length === 1 && spoken[0].voice === null;
})());

// ---- log: in-memory, capped, session-scoped ----
check('log records user and app turns', (() => {
  C.logUser('find running shoes'); C.logApp('I found 4 running shoes.');
  const l = C.log();
  return l.length >= 2 && l[l.length - 2].who === 'user' && l[l.length - 1].who === 'app';
})());
check('log caps at 20 turns', (() => {
  for (let i = 0; i < 30; i++) C.logUser('turn ' + i);
  return C.log().length === 20 && C.log()[19].text === 'turn 29';
})());
check('module stores nothing in localStorage and makes no network calls', !/localStorage\s*[\.\[]/.test(src) && !/fetch\s*\(/.test(src) && !/XMLHttpRequest/.test(src));
check('module never touches the live _worker.js voice constant', !/VOICE\s*=/.test(src.replace(/NOTE —[\s\S]*$/, '')));

// ---- summary ----
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
