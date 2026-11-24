// generate-android-api.mjs — generate the Android endpoint constants
// from the shared config + contract. Never edit the generated file by hand.
// Usage: node tools/generate-android-api.mjs
// Writes: ../ain-shop-android-app/app/src/main/java/com/ainshop/app/data/ApiEndpoints.kt
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function generateApiEndpoints(sharedDir) {
  const config = JSON.parse(fs.readFileSync(path.join(sharedDir, 'config.json'), 'utf8'));
  const contract = JSON.parse(fs.readFileSync(path.join(sharedDir, 'api-contract.json'), 'utf8'));
  const used = contract.endpoints.filter(
    (e) => !e.pattern && e.used_by.includes('android'),
  );
  const constName = (p) =>
    p.replace(/^\/api\//, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/_$/, '').toUpperCase();
  const lines = [];
  lines.push('package com.ainshop.app.data');
  lines.push('');
  lines.push('// GENERATED — DO NOT EDIT BY HAND.');
  lines.push('// Generated from ain-shop-shared/config.json + api-contract.json by');
  lines.push('// ain-shop-shared/tools/generate-android-api.mjs. To change an address');
  lines.push('// or an endpoint, change the shared files and re-run the generator.');
  lines.push(`// Generated: ${new Date().toISOString().slice(0, 10)}`);
  lines.push('');
  lines.push('/** One address and one endpoint list for the whole app, from the shared contract. */');
  lines.push('object ApiEndpoints {');
  lines.push(`    const val BASE_URL = "${config.api_base_url}"`);
  for (const e of used) {
    const drift = e.status === 'drift' ? ' // DRIFT: server does not have this path yet (see api-contract.json)' : '';
    lines.push(`    const val ${constName(e.path)} = "${e.path}"${drift}`);
  }
  lines.push('}');
  lines.push('');
  return lines.join('\n');
}

export function androidApiPath(sharedDir) {
  return path.join(
    sharedDir, '..', 'ain-shop-android-app', 'app', 'src', 'main', 'java',
    'com', 'ainshop', 'app', 'data', 'ApiEndpoints.kt',
  );
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const sharedDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const out = androidApiPath(sharedDir);
  fs.writeFileSync(out, generateApiEndpoints(sharedDir));
  console.log('Wrote ' + out);
}
