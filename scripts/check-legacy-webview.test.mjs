import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const script = fileURLToPath(new URL('./check-legacy-webview.mjs', import.meta.url));
async function check(code) {
  const directory = await mkdtemp(join(tmpdir(), 'mv-chunk-check-'));
  try {
    await writeFile(join(directory, 'main.js'), code);
    return spawnSync(process.execPath, [script, directory], { encoding: 'utf8' });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('accepts native lazy imports and ES2017', async () => {
  const result = await check('export const load = async () => import("./chunk-ABC.js");');
  assert.equal(result.status, 0, result.stderr);
});

test('rejects the production Preferences failure with an aliased require', async () => {
  const result = await check('const web = () => Promise.resolve().then(() => Fc(xs("./chunk-TH723UU2.js")));');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Caricamento chunk senza import/);
});

test('still rejects unsupported syntax elsewhere', async () => {
  const result = await check('const value = window.config?.value; import("./chunk-ABC.js");');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unexpected token/);
});

test('does not rewrite import text in strings', async () => {
  const result = await check('const text = "import(hello)"; export const load = () => import("./chunk-ABC.js");');
  assert.equal(result.status, 0, result.stderr);
});
