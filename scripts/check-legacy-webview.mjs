import { readdir, readFile } from 'node:fs/promises';
import { parse } from 'acorn';

// Check every emitted app chunk, including lazy chunks, not TypeScript sources.
// This is a syntax regression check; native smoke tests still verify runtime APIs.
const directory = 'dist/y/browser';
const files = (await readdir(directory)).filter(file => file.endsWith('.js'));
if (!files.length) throw new Error('Build JavaScript assente: eseguire ng build.');
for (const file of files) {
  try {
    parse(await readFile(`${directory}/${file}`, 'utf8'), {
      ecmaVersion: 2017,
      sourceType: 'module',
    });
  } catch (error) {
    throw new Error(`Sintassi incompatibile con WebView legacy in ${file}: ${error.message}`);
  }
}
console.log(`Compatibilità sintattica WebView legacy: OK (${files.length} bundle).`);
