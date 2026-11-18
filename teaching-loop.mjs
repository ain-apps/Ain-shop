// AIN Shop — teaching loop runner (TEST COPY ONLY, v31).
// Usage:
//   node teaching-loop.mjs                 re-run 509 tests + all teaching cases, write review list
//   node teaching-loop.mjs add --query shoes --wrong "Women One Piece Bathing Suit" [--correct "Nike Shoes"]
//                                          add a case, then re-run everything and report that case
//   node teaching-loop.mjs suggest         print the review list (suggestions, all pending-review)
// What it does NOT do: it never edits _worker.js or intent.js, never applies
// a suggested rule, never touches the live app, and never runs a live search.
// A rule reaches everyone only when the user says yes to THAT correction,
// one by one, in chat (spoken and written: what was said, what was wrong,
// the exact rule) — nothing is shared automatically. After his yes, a
// person edits the code by hand, re-runs this script, and the change
// ships in a future approved update (version 1.0.1).
import * as W from './site/_worker.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CASES_FILE = path.join(ROOT, 'site', 'teaching-cases.json');
const REVIEW_FILE = path.join(ROOT, 'teaching-review.json');
const RESULTS_FILE = path.join(ROOT, 'teaching-loop-results.json');

function loadCases() {
  try { const v = JSON.parse(fs.readFileSync(CASES_FILE, 'utf8')); return Array.isArray(v) ? v : []; } catch (e) { return []; }
}
function saveCases(list) { fs.writeFileSync(CASES_FILE, JSON.stringify(list, null, 2) + '\n'); }
function idFor(query, wrong) { return 't-' + String(query + '|' + wrong).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80); }

// Draft the exact rule that would fix this case, checked against the real
// worker functions. Suggestion only — this function never edits any code.
function suggestRule(c) {
  const q = c.query, wrong = c.wrong_title;
  const qc = W.categoryOfQuery(q), tc = W.categoryOfTitle(wrong);
  if (qc && tc && qc !== tc) {
    return { type: 'category-exclusion', file: 'site/_worker.js', status: 'pending-review',
      rule: `filterSearchResults() must remove "${wrong}" for query "${q}": title category is "${tc}", query category is "${qc}". ` +
        `Check CATEGORIES / categoryMatches() in _worker.js covers this pair; if not, add the missing trigger phrase. ` +
        `Already handled by the v31 category gate: ${!W.relevant(wrong, q)}` };
  }
  const after = String(wrong).toLowerCase();
  const mention = ['scented', 'flavored', 'print', 'shaped', 'soak', 'bath', 'candle'].find(w => after.includes(w));
  if (mention) {
    return { type: 'mention-noun', file: 'site/_worker.js', status: 'pending-review',
      rule: `MENTION_NOUNS in _worker.js: the query word in "${wrong}" is only mentioned, not the product itself ` +
        `(word after the head noun: "${mention}"). Add it to MENTION_NOUNS if not already there, so relevant() rejects it. ` +
        `Already handled by the v31 fix: ${!W.relevant(wrong, q)}` };
  }
  if (c.correct_title && !W.relevant(c.correct_title, q)) {
    return { type: 'synonym', file: 'site/_worker.js', status: 'pending-review',
      rule: `SYNONYM_GROUPS in _worker.js: "${c.correct_title}" should count for query "${q}" but relevant() says no. ` +
        `Add the missing synonym / word form to SYNONYM_GROUPS.` };
  }
  if (c.heard_as && c.heard_as !== c.query) {
    return { type: 'intent-mishearing', file: 'site/intent.js', status: 'pending-review',
      rule: `intent.js fix(): speech-to-text heard "${c.heard_as}" for "${c.query}". Add a whole-phrase entry to FIX ` +
        `(e.g. /\\b${c.heard_as.replace(/ /g, ' ?')}\\b/ → "${c.query}"), then re-run this script.` };
  }
  // The wrong title is still counted as relevant. The most common reason
  // left is an accessory: the query is the thing itself (bicycle, shoes)
  // and the title is something worn/used WITH it (helmet, rack, lock).
  if (W.relevant(wrong, q)) {
    return { type: 'accessory-exclusion', file: 'site/_worker.js', status: 'pending-review',
      rule: `"${wrong}" still counts as relevant for "${q}" (same category, head word present). ` +
        `It is an accessory, not the thing asked for. Suggested rule for a human to approve: add an accessory list ` +
        `in _worker.js (helmet, rack, lock, pump, tire, light, repair kit for bicycles; polish, rack for shoes) ` +
        `and reject a title whose head product is only an accessory when the query names the main product. ` +
        `Do NOT apply without the user's yes — it changes what is shown for every bicycle/shoe search.` };
  }
  return { type: 'already-handled', file: 'site/_worker.js', status: 'pending-review',
    rule: `No new rule needed: relevant("${wrong}", "${q}") is already false under the v31 fix (checked). ` +
      `Keep this case as a regression test so a future change cannot bring the mix-up back.` };
}

// One teaching case passes when the wrong product is rejected AND (when a
// correct product is given) the correct one is accepted.
function checkCase(c) {
  const wrongRejected = W.relevant(c.wrong_title, c.query) === false;
  const filteredOut = W.filterSearchResults([{ title: c.wrong_title }], c.query).length === 0;
  const correctAccepted = !c.correct_title || W.relevant(c.correct_title, c.query) === true;
  const pass = wrongRejected && filteredOut && correctAccepted;
  return { id: c.id, query: c.query, wrong_title: c.wrong_title, correct_title: c.correct_title || '',
    wrong_rejected: wrongRejected, filtered_out: filteredOut, correct_accepted: correctAccepted,
    suggestion: suggestRule(c), pass };
}

function runHarness509() {
  // Re-run the exact 509-case harness (seed 1234567). It prints a JSON
  // summary and writes tests/harness-509-results.json. No live searches.
  const out = execFileSync('node', [path.join(ROOT, 'tests', 'harness-509.mjs')], { encoding: 'utf8', cwd: ROOT });
  const json = out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1);
  return JSON.parse(json);
}

function main() {
  const args = process.argv.slice(2);
  let cases = loadCases();

  if (args[0] === 'add') {
    const get = f => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : ''; };
    const c = { id: idFor(get('--query'), get('--wrong')), date: new Date().toISOString().slice(0, 10),
      query: get('--query'), wrong_title: get('--wrong'), correct_title: get('--correct') || '',
      heard_as: get('--heard-as') || undefined, source: 'added via teaching-loop.mjs', status: 'pending-review' };
    if (!c.query || !c.wrong_title) { console.error('add needs --query and --wrong'); process.exit(2); }
    if (cases.some(r => r.id === c.id)) { console.log('Case already in teaching-cases.json (not duplicated): ' + c.id); }
    else { cases.push(c); saveCases(cases); console.log('Added teaching case: ' + c.id); }
  }

  const harness = runHarness509();
  const checked = cases.map(checkCase);
  const passed = checked.filter(c => c.pass).length;

  const review = checked.map(c => ({ id: c.id, date: '', query: c.query, wrong_title: c.wrong_title,
    // What Muse brings to the user in chat for his yes/no on this one correction:
    bring_to_user: { said: c.query, wrong: '"' + c.wrong_title + '" was shown for "' + c.query + '"',
      rule: c.suggestion.rule, question: 'Yes or no — apply this rule for everyone?' },
    suggestion: c.suggestion, status: (cases.find(r => r.id === c.id) || {}).status || 'pending-review' }));
  // keep the case dates on the review list
  checked.forEach((c, i) => { review[i].date = (cases.find(r => r.id === c.id) || {}).date || ''; });
  fs.writeFileSync(REVIEW_FILE, JSON.stringify(review, null, 2) + '\n');

  const results = { date: new Date().toISOString(), live_searches_run: 0,
    harness_509: harness, teaching_cases: { total: checked.length, passed, failed: checked.length - passed }, cases: checked };
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2) + '\n');

  console.log(JSON.stringify({ harness_509: harness, teaching_cases: { total: checked.length, passed, failed: checked.length - passed } }, null, 2));
  for (const c of checked) console.log((c.pass ? 'PASS' : 'FAIL') + '  ' + c.query + ' → "' + c.wrong_title + '"' + (c.correct_title ? '  (right answer: "' + c.correct_title + '")' : ''));
  if (args[0] === 'suggest') console.log(JSON.stringify(review, null, 2));
  console.log('Review list (applied rules keep their status; pending ones are not auto-applied): ' + REVIEW_FILE);
  console.log('Results: ' + RESULTS_FILE);
  if (harness.failed > 13 || passed < checked.length) process.exitCode = 1;
}
main();
