// Natural-language commands, AI fallback (test copy only): NO live searches,
// NO network — fetch is stubbed. Tests site/langfallback.js against the
// real i18n / vcmd-i18n tables + intent.js. Run: node tests/test-langfallback.mjs
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.join(dir, '..', 'site');

// ---- load the real tables + intent (read-only) into this process ----
globalThis.window = globalThis;
for (const f of ['i18n.js', 'vcmd-i18n.js', 'intent.js']) {
  eval(fs.readFileSync(path.join(SITE, f), 'utf8'));
}
const LANGS = globalThis.BAIN_I18N.LANGS;
const N = globalThis.BAIN_INTENT.normalize;

// ---- a small exact matcher standing in for AIN_VCMD (whole-sentence only) ----
function buildExact() {
  const exact = {};
  for (const code of ['en', 'es', 'he']) {
    const v = LANGS[code].v;
    for (const id of Object.keys(v.w)) for (const ph of v.w[id]) {
      if (/\{/.test(ph)) continue;
      const n = N(ph);
      if (n) (exact[n] = exact[n] || []).push(id);
    }
  }
  return exact;
}
const EXACT = buildExact();
function stubMatch(text) {
  let t = N(text);
  // strip the fill words (lead/tail) the way vcmd does, then collapse repeats
  for (const code of ['en', 'es', 'he']) {
    const fill = (LANGS[code].v.fill || []).map(N).sort((a, b) => b.length - a.length);
    let prev;
    do { prev = t; for (const f of fill) {
      if (t === f) t = '';
      else if (t.indexOf(f + ' ') === 0) t = t.slice(f.length + 1);
      else if (t.slice(-(f.length + 1)) === ' ' + f) t = t.slice(0, -(f.length + 1));
    } t = t.trim(); } while (t && t !== prev);
  }
  t = t.split(' ').filter((w, i, a) => w !== a[i - 1]).join(' ');
  if (EXACT[t]) return { id: EXACT[t][0], arg: null };
  // slot phrasings with a plain number: "buy number 2", "תקנה מספר 2", "comprar número 2"
  for (const code of ['en', 'es', 'he']) {
    const v = LANGS[code].v;
    for (const id of Object.keys(v.w)) for (const ph of v.w[id]) {
      if (!/\{n\}/.test(ph)) continue;
      // Replace the slot BEFORE normalizing: N() would turn "{n}" into the word "n".
      const re = new RegExp('^' + N(ph.replace(/\{n\}/g, ' NUMTOKEN ')).replace(/numtoken/g, '(\\d{1,2})') + '$');
      const m = re.exec(t);
      if (m) return { id, arg: { n: +m[1] } };
    }
  }
  return null;
}
globalThis.AIN_VCMD = { match: (text) => stubMatch(text), phrase: (id) => (LANGS.en.v.w[id] || [id])[0].replace(/\{n\}/g, '2').replace(/\{ord\}/g, '2').replace(/\{lang\}/g, 'English').replace(/\{store\}/g, 'Walmart') };

// ---- load the module under test ----
eval(fs.readFileSync(path.join(SITE, 'langfallback.js'), 'utf8'));
const LF = globalThis.BAIN_LANGFALLBACK;

// ---- spoken output capture (BAIN_CONVO present, then absent) ----
const spoken = [];
globalThis.BAIN_CONVO = { speak: (t) => { spoken.push(t); } };

let pass = 0, fail = 0;
const pending = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? ' — ' + extra : '')); }
}
function tcheck(name, p) { pending.push(p.then(
  (ok) => check(name, ok === true, typeof ok === 'string' ? ok : ''),
  (e) => check(name, false, String(e && e.stack || e)))); }
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

// ================= 1. normalize: filler-stripping =================
check('normalize en strips please/could you', LF.normalize('please could you open the settings', 'en') === 'open settings', LF.normalize('please could you open the settings', 'en'));
check('normalize en strips i want to / can you', LF.normalize('I want to read my list please', 'en') === 'read list', LF.normalize('I want to read my list please', 'en'));
check('normalize en strips can you please', LF.normalize('can you please show me more', 'en') === 'show more', LF.normalize('can you please show me more', 'en'));
check('normalize es strips por favor', LF.normalize('por favor abre la configuración', 'es') === 'abre configuracion', LF.normalize('por favor abre la configuración', 'es'));
check('normalize es strips quiero', LF.normalize('quiero leer mi lista', 'es') === 'leer lista', LF.normalize('quiero leer mi lista', 'es'));
check('normalize he strips בבקשה', LF.normalize('בבקשה תפתח הגדרות', 'he') === 'תפתח הגדרות', LF.normalize('בבקשה תפתח הגדרות', 'he'));
check('normalize he strips אני רוצה', LF.normalize('אני רוצה לקרוא את הרשימה', 'he') === 'לקרוא הרשימה', LF.normalize('אני רוצה לקרוא את הרשימה', 'he'));
check('normalize keeps the command words', LF.normalize('open settings', 'en') === 'open settings');
check('normalize empty stays empty', LF.normalize('', 'en') === '' && LF.normalize('   ', 'en') === '');

// ================= 2. synonyms =================
check('synonym purchase -> buy', LF.normalize('purchase number two', 'en') === 'buy number two', LF.normalize('purchase number two', 'en'));
check('synonym erase -> delete', LF.normalize('erase my data', 'en') === 'delete data', LF.normalize('erase my data', 'en'));

// ================= 3. closestCommand ranking =================
{
  const r = LF.closestCommand('setings open', 'en');
  check('closest ranks settings first on typo', r[0] && r[0].command === 'settings', JSON.stringify(r.slice(0, 2)));
  const r2 = LF.closestCommand('opn setings', 'en');
  check('closest tolerates two small typos', r2[0] && r2[0].command === 'settings' && r2[0].score >= 0.75, JSON.stringify(r2.slice(0, 2)));
  const r3 = LF.closestCommand('chekout', 'en');
  check('closest ranks go_checkout for chekout', r3[0] && r3[0].command === 'go_checkout', JSON.stringify(r3.slice(0, 2)));
  const r4 = LF.closestCommand('close up cream', 'en');
  check('one-word close does not win on a long sentence', !(r4[0] && r4[0].command === 'close' && r4[0].score >= 0.75), JSON.stringify(r4.slice(0, 2)));
  const r5 = LF.closestCommand('buy number two', 'en');
  check('closest extracts n from a number word', r5[0] && r5[0].command === 'buy_n' && r5[0].args.n === 2, JSON.stringify(r5.slice(0, 2)));
  const r6 = LF.closestCommand('comprar número 2', 'es');
  check('closest es buy_n with n=2', r6[0] && r6[0].command === 'buy_n' && r6[0].args.n === 2, JSON.stringify(r6.slice(0, 2)));
}

// ================= 4. interpret — exact layer =================
tcheck('exact open settings, confidence 1, not sensitive', LF.interpret('open settings', 'en', { speakQuestion: false }).then((r) =>
  (r.command === 'settings' && r.confidence === 1 && r.source === 'exact' && r.needsConfirm === false && r.askedQuestion === null) || JSON.stringify(r)));
tcheck('exact buy number 2 needs confirmation even at confidence 1', LF.interpret('buy number 2', 'en', { speakQuestion: false }).then((r) =>
  Boolean(r.command === 'buy_n' && r.args && r.args.n === 2 && r.needsConfirm === true && r.confirmQuestion && /buy number 2/.test(r.confirmQuestion)) || JSON.stringify(r)));
tcheck('exact go to checkout needs confirmation', LF.interpret('go to checkout', 'en', { speakQuestion: false }).then((r) =>
  (r.command === 'go_checkout' && r.needsConfirm === true) || JSON.stringify(r)));
tcheck('exact delete my data needs confirmation', LF.interpret('delete my data', 'en', { speakQuestion: false }).then((r) =>
  (r.command === 'clear' && r.needsConfirm === true) || JSON.stringify(r)));
tcheck('exact cancel my subscription needs confirmation', LF.interpret('cancel my subscription', 'en', { speakQuestion: false }).then((r) =>
  (r.command === 'cancel_sub' && r.needsConfirm === true) || JSON.stringify(r)));

// ================= 5. interpret — local layer (no exact match) =================
delete globalThis.AIN_VCMD;   // from here on the local + AI layers work alone
tcheck('word order: settings open please -> settings', LF.interpret('settings open please', 'en', { speakQuestion: false }).then((r) =>
  (r.command === 'settings' && r.source === 'local' && r.confidence >= 0.75 && r.confidence < 1) || JSON.stringify(r)));
tcheck('word order: my list read -> list_read', LF.interpret('my list read', 'en', { speakQuestion: false }).then((r) =>
  (r.command === 'list_read' && r.source === 'local') || JSON.stringify(r)));
tcheck('extra words tolerated: open the settings page now please', LF.interpret('open the settings page now please', 'en', { speakQuestion: false }).then((r) =>
  (r.command === 'settings') || JSON.stringify(r)));
tcheck('synonym: purchase number two -> buy_n n=2, needs confirm', LF.interpret('purchase number two', 'en', { speakQuestion: false }).then((r) =>
  (r.command === 'buy_n' && r.args && r.args.n === 2 && r.needsConfirm === true) || JSON.stringify(r)));
tcheck('es word order + filler: la configuración abrir por favor -> settings', LF.interpret('la configuración abrir por favor', 'es', { speakQuestion: false }).then((r) =>
  (r.command === 'settings') || JSON.stringify(r)));
tcheck('es comprar número 2 -> buy_n n=2, needs confirm', LF.interpret('comprar número 2', 'es', { speakQuestion: false }).then((r) =>
  (r.command === 'buy_n' && r.args && r.args.n === 2 && r.needsConfirm === true) || JSON.stringify(r)));
tcheck('he תפתח הגדרות בבקשה -> settings', LF.interpret('תפתח הגדרות בבקשה', 'he', { speakQuestion: false }).then((r) =>
  (r.command === 'settings') || JSON.stringify(r)));
tcheck('he תקנה מספר 2 -> buy_n n=2, needs confirm', LF.interpret('תקנה מספר 2', 'he', { speakQuestion: false }).then((r) =>
  (r.command === 'buy_n' && r.args && r.args.n === 2 && r.needsConfirm === true) || JSON.stringify(r)));
tcheck('es quitar número 1 de mi lista -> list_remove, needs confirm', LF.interpret('quitar número 1 de mi lista', 'es', { speakQuestion: false }).then((r) =>
  (r.command === 'list_remove' && r.needsConfirm === true) || JSON.stringify(r)));

// ================= 6. low confidence -> question, NOT action =================
tcheck('garbled command asks a question, does not act', LF.interpret('chek my list pleez', 'en', { useAI: false, speakQuestion: false }).then((r) =>
  Boolean(r.command === null && r.askedQuestion && /Did you mean/.test(r.askedQuestion) && r.source === 'question') || JSON.stringify(r)));
tcheck('question is spoken through BAIN_CONVO when present', (async () => {
  const before = spoken.length;
  const r = await LF.interpret('chek my list pleez', 'en', { useAI: false });
  return Boolean(r.command === null && spoken[before] === r.askedQuestion) || JSON.stringify({ r, spoken });
})());
tcheck('silence asks to repeat, does not act or search', LF.interpret('', 'en', { speakQuestion: false }).then((r) =>
  Boolean(r.command === null && r.source === 'none' && r.askedQuestion) || JSON.stringify(r)));
tcheck('noise thank-you asks to repeat', LF.interpret('thank you', 'en', { speakQuestion: false }).then((r) =>
  Boolean(r.command === null && r.source === 'none' && r.askedQuestion) || JSON.stringify(r)));
tcheck('product search falls through with no question', LF.interpret('grey couch under 500 dollars', 'en', { speakQuestion: false }).then((r) =>
  (r.command === null && r.source === 'search' && r.askedQuestion === null) || JSON.stringify(r)));
tcheck('close up cream is a search, not the close command', LF.interpret('close up cream', 'en', { speakQuestion: false }).then((r) =>
  (r.command === null && r.source === 'search') || JSON.stringify(r)));

// ================= 7. AI layer (stubbed fetch) =================
const aiOk = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ command: 'go_checkout', args: {}, confidence: 0.9 }) });
const aiLow = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ command: 'go_checkout', args: {}, confidence: 0.5 }) });
const aiSearch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ command: 'search', args: {}, confidence: 0.9 }) });
const aiUnknown = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ command: 'fly_to_moon', args: {}, confidence: 0.99 }) });
const ai404 = () => Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
const aiThrow = () => Promise.reject(new Error('network down'));
const aiBadJson = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.reject(new Error('bad json')) });
const CMD_LIKE = 'take me to the paying place please';   // local score ~0.59: AI territory, not local-act
tcheck('AI confident -> acts via ai, still needs confirm for pay', LF.interpret(CMD_LIKE, 'en', { fetchFn: aiOk, speakQuestion: false }).then((r) =>
  (r.command === 'go_checkout' && r.source === 'ai' && r.confidence === 0.9 && r.needsConfirm === true) || JSON.stringify(r)));
tcheck('AI low confidence -> question naming the command, no action', LF.interpret(CMD_LIKE, 'en', { fetchFn: aiLow, speakQuestion: false }).then((r) =>
  (r.command === null && r.askedQuestion && /checkout|pay/i.test(r.askedQuestion)) || JSON.stringify(r)));
tcheck('AI says search -> falls through to search', LF.interpret(CMD_LIKE, 'en', { fetchFn: aiSearch, speakQuestion: false }).then((r) =>
  (r.command === null && r.source === 'search' && r.askedQuestion === null) || JSON.stringify(r)));
tcheck('AI unknown command -> question, no action', LF.interpret(CMD_LIKE, 'en', { fetchFn: aiUnknown, speakQuestion: false }).then((r) =>
  Boolean(r.command === null && r.askedQuestion) || JSON.stringify(r)));
tcheck('AI route missing (404) -> question with closest command', LF.interpret(CMD_LIKE, 'en', { fetchFn: ai404, speakQuestion: false }).then((r) =>
  Boolean(r.command === null && r.askedQuestion && /checkout/i.test(r.askedQuestion)) || JSON.stringify(r)));
tcheck('AI network failure -> question, no action', LF.interpret(CMD_LIKE, 'en', { fetchFn: aiThrow, speakQuestion: false }).then((r) =>
  Boolean(r.command === null && r.askedQuestion) || JSON.stringify(r)));
tcheck('AI bad JSON -> question, no action', LF.interpret(CMD_LIKE, 'en', { fetchFn: aiBadJson, speakQuestion: false }).then((r) =>
  Boolean(r.command === null && r.askedQuestion) || JSON.stringify(r)));
tcheck('classifyViaAI parses a good answer', LF.classifyViaAI('x', 'en', aiOk).then((r) =>
  (r.ok === true && r.command === 'go_checkout' && r.confidence === 0.9) || JSON.stringify(r)));
tcheck('classifyViaAI drops out-of-range args', LF.classifyViaAI('x', 'en', () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ command: 'buy_n', args: { n: 99, lang: 'xx' }, confidence: 0.8 }) })).then((r) =>
  (r.ok === true && r.command === 'buy_n' && !('n' in r.args) && !('lang' in r.args)) || JSON.stringify(r)));
tcheck('classifyViaAI reports 404 as not-ok', LF.classifyViaAI('x', 'en', ai404).then((r) =>
  (r.ok === false && r.error === 'http_404') || JSON.stringify(r)));

// ================= 8. speak fallback + helpers =================
tcheck('speak works with no BAIN_CONVO and no VCMD (no throw)', (async () => {
  delete globalThis.BAIN_CONVO;
  globalThis.BAIN_APP = { sayNative: (t) => { spoken.push('native:' + t); } };
  const ok = LF.speak('hello there', 'en');
  delete globalThis.BAIN_APP;
  globalThis.BAIN_CONVO = { speak: (t) => { spoken.push(t); } };
  return ok === true || 'speak returned ' + ok;
})());
check('describe gives a readable command', /settings/i.test(LF.describe('settings', 'en')));
check('buildQuestion names the command', /settings/i.test(LF.buildQuestion('en', { command: 'settings', args: {} })));
check('buildQuestion with no candidate asks to repeat', /didn.t catch/i.test(LF.buildQuestion('en', null)));
check('SENSITIVE covers buy/pay/delete', ['buy_n', 'go_checkout', 'subscribe', 'cancel_sub', 'list_remove', 'forget_n', 'hist_clear', 'loc_forget', 'clear'].every((c) => LF.SENSITIVE[c]));
check('thresholds leave room for doubt (never 1.0 locally)', LF.THRESHOLDS.ACT_LOCAL === 0.75 && LF.THRESHOLDS.ACT_AI === 0.70);

Promise.all(pending).then(() => {
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
});
