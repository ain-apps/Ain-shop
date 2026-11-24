// verify-shared.mjs — the one check after any change to the shared layer.
// Usage: node tools/verify-shared.mjs
// Checks, all offline, nothing deployed, no keys or tokens:
//   1. api-contract.json matches web/_worker.js (both directions)
//   2. config.json matches what Android, iOS and wrangler.toml use
//   3. the generated Android ApiEndpoints.kt is up to date
//   4. every path in features.json exists on disk
// Exit 0 when everything matches, 1 with a list when it does not.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkContract, sharedDir } from './extract-contract.mjs';
import { generateApiEndpoints, androidApiPath } from './generate-android-api.mjs';

const dir = sharedDir();
const filesDir = path.join(dir, '..');
let fail = 0;
function check(name, ok, extra) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' :: ' + extra : ''));
  if (!ok) fail++;
}

// 1. Contract vs worker
const c = checkContract();
check('contract matches worker', c.problems.length === 0,
  c.problems.length ? c.problems.join('; ') : `${c.workerCount} worker routes, ${c.contractCount} contract routes`);

// 2. Config consistency
const config = JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8'));
const host = new URL(config.site_url).host;
const apiKt = fs.readFileSync(androidApiPath(dir), 'utf8');
check('Android ApiEndpoints.BASE_URL matches config', apiKt.includes(`BASE_URL = "${config.api_base_url}"`));
const webView = fs.readFileSync(path.join(filesDir, 'ain-shop-ios-wrapper', 'AINShop', 'WebView.swift'), 'utf8');
check('iOS wrapper siteURL matches config', webView.includes(`"${config.site_url}/"`) || webView.includes(`"${config.site_url}"`));
const wrangler = fs.readFileSync(path.join(filesDir, 'ain-shop-deploy-own-account', 'wrangler.toml'), 'utf8');
check('wrangler main points at shared web core', wrangler.includes('main = "../ain-shop-shared/web/_worker.js"'));
check('wrangler assets point at shared web core', wrangler.includes('directory = "../ain-shop-shared/web"'));

// 3. Generated file freshness
const fresh = generateApiEndpoints(dir);
const onDisk = fs.readFileSync(androidApiPath(dir), 'utf8');
// The date line changes daily; compare everything except that line.
const strip = (s) => s.split('\n').filter((l) => !l.startsWith('// Generated: ')).join('\n');
check('generated ApiEndpoints.kt is up to date', strip(fresh) === strip(onDisk),
  strip(fresh) === strip(onDisk) ? '' : 're-run node tools/generate-android-api.mjs');

// 4. Feature registry paths exist
const features = JSON.parse(fs.readFileSync(path.join(dir, 'features.json'), 'utf8'));
let missing = [];
for (const f of features.features) {
  for (const p of f.website || []) {
    if (!fs.existsSync(path.join(dir, p))) missing.push(`${f.id}: website ${p}`);
  }
  for (const p of f.android || []) {
    if (!fs.existsSync(path.join(filesDir, 'ain-shop-android-app', 'app', 'src', 'main', 'java', 'com', 'ainshop', 'app', p))) {
      missing.push(`${f.id}: android ${p}`);
    }
  }
}
check('features.json paths exist', missing.length === 0, missing.join('; '));

console.log(fail === 0 ? 'ALL SHARED CHECKS PASS' : `${fail} CHECK(S) FAILED`);
process.exitCode = fail === 0 ? 0 : 1;
