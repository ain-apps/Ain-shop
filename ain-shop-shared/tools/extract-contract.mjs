// extract-contract.mjs — check api-contract.json against the real worker.
// Usage: node tools/extract-contract.mjs
// Exit 0 when every concrete /api/ route in web/_worker.js is in the
// contract and every contract route (except pattern entries) is in the
// worker. Run from anywhere; paths are relative to this file.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function sharedDir() {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
}

export function workerApiPaths(workerSrc) {
  const found = new Set();
  for (const m of workerSrc.matchAll(/'(\/api\/[A-Za-z0-9_\-/]+)'/g)) {
    const p = m[1];
    if (p.endsWith('/')) continue; // routing prefixes like '/api/admin/'
    found.add(p);
  }
  return found;
}

export function checkContract() {
  const dir = sharedDir();
  const workerSrc = fs.readFileSync(path.join(dir, 'web', '_worker.js'), 'utf8');
  const contract = JSON.parse(fs.readFileSync(path.join(dir, 'api-contract.json'), 'utf8'));
  const workerPaths = workerApiPaths(workerSrc);
  const problems = [];
  for (const e of contract.endpoints) {
    if (e.pattern) {
      if (!workerSrc.includes('/api/pay/')) problems.push(`pattern route ${e.path} not found in worker`);
      continue;
    }
    // Drift routes are called by a client but deliberately NOT in the
    // worker yet — that is the mismatch, documented in the contract.
    if (e.status === 'drift') continue;
    if (!workerPaths.has(e.path)) problems.push(`contract route ${e.path} is NOT in web/_worker.js`);
  }
  for (const p of workerPaths) {
    if (!contract.endpoints.some((e) => e.path === p)) {
      problems.push(`worker route ${p} is NOT in api-contract.json`);
    }
  }
  return { problems, workerCount: workerPaths.size, contractCount: contract.endpoints.length };
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const { problems, workerCount, contractCount } = checkContract();
  console.log(`worker routes: ${workerCount}, contract routes: ${contractCount}`);
  if (problems.length === 0) console.log('OK: contract matches the worker.');
  else {
    for (const p of problems) console.log('MISMATCH: ' + p);
    process.exitCode = 1;
  }
}
