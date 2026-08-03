import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';

const root = process.cwd();
const appRoot = join(root, 'src', 'app');
const output = join(appRoot, 'shared', 'generated-responsive-page-fixtures.ts');

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  }));
  return nested.flat();
}

const files = await walk(appRoot);
const htmlFiles = files
  .filter(file => file.endsWith('.component.html'))
  .sort((left, right) => left.localeCompare(right));

const fixtures = await Promise.all(htmlFiles.map(async htmlFile => {
  const base = htmlFile.replace(/\.component\.html$/, '.component');
  const cssFile = `${base}.css`;
  const scssFile = `${base}.scss`;
  const styleFile = files.includes(cssFile)
    ? cssFile
    : files.includes(scssFile)
      ? scssFile
      : null;

  return {
    name: relative(appRoot, htmlFile).replace(/\.component\.html$/, ''),
    // Angular sostituisce le interpolazioni prima del rendering. Lasciarne il
    // codice sorgente nel DOM del fixture falserebbe soprattutto icone e badge.
    html: (await readFile(htmlFile, 'utf8')).replace(/{{[\s\S]*?}}/g, 'Valore'),
    css: styleFile ? await readFile(styleFile, 'utf8') : '',
  };
}));

const source = [
  '/* File generato da scripts/generate-responsive-page-fixtures.mjs. */',
  `export const RESPONSIVE_PAGE_FIXTURES = ${JSON.stringify(fixtures)} as const;`,
  '',
].join('\n');

await mkdir(dirname(output), { recursive: true });
await writeFile(output, source, 'utf8');
console.log(`Generate ${fixtures.length} fixture responsive.`);
