import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import process from 'node:process';

const projectRoot = process.cwd();
const sourceRoot = join(projectRoot, 'src', 'app');
const allowedDefinitions = new Set([
  'src/app/componenti/popup/popup-component/popup-component.component.ts',
  'src/app/componenti/popup/popup-service.service.ts',
]);
const violations = [];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath);
      continue;
    }
    if (extname(entry.name) !== '.ts') continue;

    const projectPath = relative(projectRoot, fullPath).replaceAll('\\', '/');
    const source = await readFile(fullPath, 'utf8');
    const lines = source.split(/\r?\n/);

    lines.forEach((line, index) => {
      const usesWindowDialog =
        /\b(?:window|globalThis)\s*\.\s*(?:confirm|prompt)\s*\(/.test(line);
      const usesBareDialog =
        /(^|[^\w.])(?:confirm|prompt)\s*\(/.test(line);

      if (
        (usesWindowDialog || usesBareDialog) &&
        !allowedDefinitions.has(projectPath)
      ) {
        violations.push(`${projectPath}:${index + 1}: ${line.trim()}`);
      }
    });
  }
}

await walk(sourceRoot);

if (violations.length) {
  console.error(
    'Trovati popup nativi del browser. Usa PopupServiceService.confirm() o .prompt():',
  );
  violations.forEach((violation) => console.error(`- ${violation}`));
  process.exitCode = 1;
} else {
  console.log('Controllo popup superato: nessun confirm/prompt nativo.');
}
