// v35 place choice (test copy only, no live searches):
// 1. Worker: a country named in near sets the country (England -> GB), so the
//    search runs the open web for that place instead of the US store list.
// 2. Typed path: parseTyped pulls "in <country>" out of the query as near,
//    and never mistakes "in blue" / "in stock" for a place.
// Run: node tests/test-search-place.mjs
import * as W from '../site/_worker.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

let pass = 0, fail = 0;
function check(name, ok, extra) {
  if (ok) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? ' — ' + extra : '')); }
}

// ---------- 1. worker: country from a named place ----------
{
  const q = W.cleanQuery({ query: 'shoes', near: 'England' });
  check('cleanQuery: near England -> country GB', q.country === 'GB' && q.near === 'England', JSON.stringify(q));
  check('cleanQuery: near "London, England" -> GB', W.cleanQuery({ query: 'shoes', near: 'London, England' }).country === 'GB');
  check('cleanQuery: near "Toronto, Canada" -> CA', W.cleanQuery({ query: 'shoes', near: 'Toronto, Canada' }).country === 'CA');
  check('cleanQuery: near "Tel Aviv, Israel" -> IL', W.cleanQuery({ query: 'shoes', near: 'Tel Aviv, Israel' }).country === 'IL');
  check('cleanQuery: near "the UK" -> GB', W.cleanQuery({ query: 'shoes', near: 'the UK' }).country === 'GB');
  check('cleanQuery: near "U.K." -> GB', W.cleanQuery({ query: 'shoes', near: 'U.K.' }).country === 'GB');
  check('cleanQuery: near "New South Wales" -> AU, not GB', W.cleanQuery({ query: 'shoes', near: 'New South Wales' }).country === 'AU');
  check('cleanQuery: near "Northern Ireland" -> GB, not IE', W.cleanQuery({ query: 'shoes', near: 'Northern Ireland' }).country === 'GB');
  check('cleanQuery: near "London" alone stays US (city, not country)', W.cleanQuery({ query: 'shoes', near: 'London' }).country === 'US');
  check('cleanQuery: no near stays US', W.cleanQuery({ query: 'shoes' }).country === 'US');
  check('cleanQuery: near "Sydney, Australia" -> AU', W.cleanQuery({ query: 'shoes', near: 'Sydney, Australia' }).country === 'AU');
  const plan = W.searchPlan({ query: 'shoes', country: 'GB', near: 'England', stores: [] });
  check('searchPlan: GB -> one open web search only (no US store list)', plan.length === 1 && plan[0].big === true, JSON.stringify(plan));
  const planUS = W.searchPlan({ query: 'shoes', country: 'US', near: '', stores: [] });
  check('searchPlan: US unchanged (deep store searches + open web)', planUS.length > 1 && planUS.some(p => p.deep), JSON.stringify(planUS));
}

// ---------- 2. typed path: parseTyped ----------
{
  globalThis.window = globalThis;
  const dir = path.dirname(fileURLToPath(import.meta.url));
  eval(fs.readFileSync(path.join(dir, '..', 'site', 'textkit.js'), 'utf8'));
  const P = globalThis.AIN_TEXT.parseTyped;
  let r = P('buy shoes in England');
  check('parseTyped: "buy shoes in England" -> shoes / England', r.query === 'shoes' && r.near === 'England', JSON.stringify(r));
  r = P("I'm looking to buy shoes in England");
  check('parseTyped: "I\'m looking to buy shoes in England" -> shoes / England', r.query === 'shoes' && r.near === 'England', JSON.stringify(r));
  r = P('looking to buy shoes in Canada');
  check('parseTyped: "looking to buy shoes in Canada" -> shoes / Canada', r.query === 'shoes' && r.near === 'Canada', JSON.stringify(r));
  r = P('shoes in Canada for men');
  check('parseTyped: "shoes in Canada for men" -> shoes for men / Canada', r.query === 'shoes for men' && r.near === 'Canada', JSON.stringify(r));
  r = P('shoes at walmart in England');
  check('parseTyped: "shoes at walmart in England" -> shoes / Walmart / England', r.query === 'shoes' && r.stores && r.stores[0].toLowerCase() === 'walmart' && r.near === 'England', JSON.stringify(r));
  r = P('shoes in blue');
  check('parseTyped: "shoes in blue" -> no place taken', r.query === 'shoes in blue' && !r.near, JSON.stringify(r));
  r = P('dress in stock');
  check('parseTyped: "dress in stock" -> no place taken', r.query === 'dress in stock' && !r.near, JSON.stringify(r));
  r = P('shoes in London');
  check('parseTyped: "shoes in London" -> no place (city, not country)', r.query === 'shoes in London' && !r.near, JSON.stringify(r));
  r = P('grey couch under 500');
  check('parseTyped: "grey couch under 500" unchanged', r.query === 'grey couch' && r.max_price === 500 && !r.near, JSON.stringify(r));
  r = P('search in England');
  check('parseTyped: "search in England" -> no product, no place kept', !r.near && r.query === 'search in England', JSON.stringify(r));
  r = P('winter coat in Canada under 50');
  check('parseTyped: "winter coat in Canada under 50" -> coat / Canada / 50', r.query === 'winter coat' && r.near === 'Canada' && r.max_price === 50, JSON.stringify(r));
}

// ---------- 3. voice-choice commands: location.js command() ----------
// The real file, loaded with stubbed browser globals (no DOM, no network).
{
  const dir = path.dirname(fileURLToPath(import.meta.url));
  globalThis.localStorage = { _m: {}, getItem(k) { return this._m[k] ?? null; }, setItem(k, v) { this._m[k] = String(v); }, removeItem(k) { delete this._m[k]; } };
  const makeEl = () => ({ hidden: false, open: false, disabled: false, value: '', textContent: '', innerHTML: '', style: {}, classList: { add() {}, remove() {} }, setAttribute() {}, removeAttribute() {}, addEventListener() {}, removeEventListener() {}, appendChild() {}, querySelector() { return null; }, focus() {}, click() {}, showModal() { this.open = true; }, close() { this.open = false; } });
  globalThis.document = { readyState: 'complete', getElementById() { return makeEl(); }, querySelector() { return null; }, addEventListener() {}, createElement() { return makeEl(); } };
  const S = {
    locCmdForget: 'forget my location, delete my location, remove my location, forget my zip',
    locCmdUse: 'use my location, set my location, my zip code is, my zip is',
    locCmdOpen: "what's open near me, whats open near me, what is open near me, open near me, stores near me, store near me, shops near me",
    locCmdFast: 'fastest delivery, fast delivery, quick delivery, quickest delivery, deliver today, delivered today, same day delivery, same-day delivery, next day delivery, arrive fast, comes faster',
    locCmdPickup: 'pickup near me, pick up near me, store pickup, in-store pickup, pick it up, pickup today',
    locCmdElsewhere: 'search somewhere else, somewhere else, a different place, change the place, search in a different place, buy somewhere else, shop somewhere else',
    locElsewhereWhat: 'Where would you like to search? Say the place — for example, search in England.',
    locPlaceWhat: 'What would you like to buy in {place}?',
    locQ: 'x', locAskHint: 'x', locYes: 'x', locNo: 'x', locLater: 'x', locZipLabel: 'x', locZipSave: 'x',
    locArea: 'x', locUse: 'x', locForget: 'x', locSaved: 'x', locForgot: 'x', locNoShare: 'x', locZipBad: 'x',
    locForgetQ: 'x', locFastWhat: 'x', locNone: 'x', nearNone: 'x', nearH: 'x', nearHours: 'x', nearPickup: 'x', nearSameDay: 'x',
    fastFound: 'x', fastNone: 'x', resultsCount: 'x', searching: 'x', noResults: 'x', offTopic: 'x', limit: 'x', offline: 'x',
  };
  globalThis.BAIN_I18N = { lang: 'en', LANGS: { en: { s: S } }, t(k, v) { const s = S[k] != null ? S[k] : k; return String(s).replace(/\{(\w+)\}/g, (_, n) => v && v[n] != null ? v[n] : ''); } };
  const statusLog = [], typedCalls = [];
  globalThis.BAIN_APP = {
    S: { results: [] },
    t: (k, v) => globalThis.BAIN_I18N.t(k, v),
    status: (s) => { statusLog.push(s); }, sayNative: () => {}, announce: () => {},
    typedSearch: (v, extra) => { typedCalls.push([v, extra]); return Promise.resolve({}); },
  };
  eval(fs.readFileSync(path.join(dir, '..', 'site', 'location.js'), 'utf8'));
  const LC = globalThis.BAIN_LOC;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  let r = LC.command('search somewhere else');
  check('command: "search somewhere else" asks where (voice choice offered)', r === 'ask' && statusLog.some((s) => /Where would you like to search/.test(s)), JSON.stringify([r, statusLog.slice(-1)]));
  r = LC.command('search in England');
  check('command: "search in England" keeps the place and asks what to buy', r === 'place' && LC.takePendingPlace() === 'England', JSON.stringify(r));
  check('command: pending place is used once, then gone', LC.takePendingPlace() === null);
  r = LC.command("I'm looking to buy in London");
  check('command: "I\'m looking to buy in London" keeps a city too', r === 'place' && LC.takePendingPlace() === 'London', JSON.stringify(r));
  typedCalls.length = 0;
  r = LC.command('fastest delivery shoes in England');
  await sleep(20);
  check('command: "fastest delivery shoes in England" searches there, no location question', r === 'fast' && typedCalls.length === 1 && typedCalls[0][0] === 'shoes in england' && typedCalls[0][1].near === 'england' && typedCalls[0][1].near_me === false, JSON.stringify([r, typedCalls]));
  typedCalls.length = 0;
  r = LC.command('shoes in blue');
  check('command: "shoes in blue" falls through (no misfire)', r === null && typedCalls.length === 0, JSON.stringify(r));
  r = LC.command('buy shoes in blue');
  check('command: "buy shoes in blue" falls through — blue is a colour, not a place', r === null && typedCalls.length === 0, JSON.stringify(r));
  r = LC.command('buy shoes in England');
  check('command: "buy shoes in England" falls through to the typed search (country path)', r === null && typedCalls.length === 0, JSON.stringify(r));
}

console.log(pass + '/' + (pass + fail) + ' passed');
process.exit(fail ? 1 : 0);
