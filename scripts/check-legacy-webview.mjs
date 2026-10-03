import { readdir, readFile } from 'node:fs/promises';
import { parse } from 'acorn';

// Check emitted chunks, including lazy chunks. Use ES2018 grammar (including object
// spread) plus native import(), emitted for Chrome 63 / Safari 11.1 / iOS 11.3.
// This checks syntax and chunk loading; native smoke tests still verify APIs.
const directory = process.argv[2] || 'dist/y/browser';
const files = (await readdir(directory)).filter(file => file.endsWith('.js'));
if (!files.length) throw new Error('Build JavaScript assente: eseguire ng build.');
for (const file of files) {
  try {
    const code = await readFile(`${directory}/${file}`, 'utf8');
    const tree = parse(code, { ecmaVersion: 'latest', sourceType: 'module' });
    const imports = [];
    const pending = [tree];
    while (pending.length) {
      const node = pending.pop();
      if (node.type === 'ImportExpression') imports.push(node.start);
      // esbuild can lower import() to an aliased require() with old targets.
      // These calls parse correctly but always fail in a browser at runtime.
      if (node.type === 'CallExpression' &&
          typeof node.arguments[0]?.value === 'string' &&
          /^\.\/chunk-[^/]+\.js$/.test(node.arguments[0].value)) {
        throw new Error(`Caricamento chunk senza import() nativo: ${node.arguments[0].value}`);
      }
      for (const value of Object.values(node)) {
        if (Array.isArray(value)) {
          pending.push(...value.filter(child => child && typeof child.type === 'string'));
        } else if (value && typeof value.type === 'string') {
          pending.push(value);
        }
      }
    }
    // Mask only actual import keywords, leaving strings/comments untouched.
    // Keep checking all other syntax against ES2018 instead of accepting ES2020.
    let legacyCode = code;
    for (const start of imports.sort((a, b) => b - a)) {
      legacyCode = legacyCode.slice(0, start) + 'imporT' + legacyCode.slice(start + 6);
    }
    parse(legacyCode, { ecmaVersion: 2018, sourceType: 'module' });
  } catch (error) {
    throw new Error(`Bundle incompatibile con WebView in ${file}: ${error.message}`);
  }
}
console.log(`Compatibilità sintattica e caricamento chunk: OK (${files.length} bundle).`);
