import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const root = process.cwd();
const appRoot = join(root, 'src', 'app');

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  }));
  return nested.flat();
}

const files = await walk(appRoot);
const htmlFiles = files.filter(file => file.endsWith('.html'));
const cssFiles = files.filter(file => file.endsWith('.css'));
const failures = [];
let tableTemplateCount = 0;

for (const htmlFile of htmlFiles) {
  const html = await readFile(htmlFile, 'utf8');
  if (!/<table\b/i.test(html)) continue;

  tableTemplateCount += 1;
  const cssFile = htmlFile.replace(/\.html$/, '.css');
  const css = cssFiles.includes(cssFile) ? await readFile(cssFile, 'utf8') : '';
  const adaptiveContract =
    /data-label\s*=/.test(html) ||
    /mobile-only/.test(html) ||
    /summary-compact-view/.test(html) ||
    /table-layout\s*:\s*fixed/.test(css);

  if (!adaptiveContract) {
    failures.push(
      `${relative(root, htmlFile)} contiene una tabella senza vista adattiva, data-label o layout fisso.`
    );
  }
}

const regressionChecks = [
  {
    file: join(appRoot, 'admin/accounting/accounting.component.css'),
    forbidden: /(?:\.accounting-page[\s\S]{0,180}|\.entries-layout[\s\S]{0,180})min-width\s*:\s*1120px/,
    message: 'La contabilità non deve reintrodurre una larghezza pagina minima di 1120px.'
  },
  {
    file: join(appRoot, 'admin/calendar/calendar-home/calendar-home.component.css'),
    forbidden: /(?:month-dow-row|month-week|month-body)[\s\S]{0,180}min-width\s*:\s*1400px/,
    message: 'Il calendario mensile non deve reintrodurre la griglia minima da 1400px.'
  },
  {
    file: join(appRoot, 'admin/calendar/calendar-home/calendar-home.component.css'),
    forbidden: /\.month-cell\s*\{[^}]*min-width\s*:\s*200px/,
    message: 'Le celle del calendario devono potersi restringere.'
  },
  {
    file: join(appRoot, 'admin/homeadmin/homeadmin.component.html'),
    forbidden: /\.home-desktop-content\s*\{[^}]*overflow-x\s*:\s*auto/,
    message: 'Il contenuto principale non deve diventare una pagina a scorrimento orizzontale.'
  }
];

for (const check of regressionChecks) {
  const source = await readFile(check.file, 'utf8');
  if (check.forbidden.test(source)) failures.push(check.message);
}

if (failures.length > 0) {
  console.error('Audit responsive fallito:\n');
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(
    `Audit responsive superato: ${tableTemplateCount} template con tabelle e 4 regressioni di larghezza controllate.`
  );
}
