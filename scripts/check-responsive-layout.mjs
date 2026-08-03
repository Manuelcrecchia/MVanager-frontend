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
let toolbarTemplateCount = 0;

for (const htmlFile of htmlFiles) {
  const html = await readFile(htmlFile, 'utf8');
  if (/mv-entity-toolbar/.test(html)) toolbarTemplateCount += 1;

  if (/mv-toolbar-back/.test(html) && !/mv-entity-toolbar/.test(html)) {
    failures.push(
      `${relative(root, htmlFile)} usa il ritorno condiviso fuori da un header responsive.`
    );
  }

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
    file: join(root, 'src', 'mv-design-system.css'),
    required: [
      /@media \(max-width: 680px\)[\s\S]*?\.mv-entity-toolbar__title,[\s\S]*?flex-wrap\s*:\s*wrap\s*!important/,
      /@media \(max-width: 520px\)[\s\S]*?\.mv-entity-toolbar__title\s*\{[\s\S]*?flex-direction\s*:\s*column/
    ],
    message: 'Gli header condivisi devono riordinare titolo e azioni senza overflow sui telefoni stretti.'
  },
  {
    file: join(appRoot, 'admin/invoices/invoices.component.css'),
    required: [
      /@media \(max-width: 600px\)[\s\S]*?\.invoice-title-group\s*\{[\s\S]*?flex-wrap\s*:\s*wrap/
    ],
    message: 'Fatture non deve disabilitare il wrapping mobile del pulsante Torna indietro.'
  },
  {
    file: join(appRoot, 'shared/responsive-toolbar.spec.ts'),
    required: [
      /keeps every audited header inside its bounds from 280px to 1920px/,
      /for \(let width = 280; width <= 1920; width \+= 1\)/,
      /rect\.right\)[\s\S]*?toBeLessThanOrEqual\(toolbarRect\.right \+ 1\)/
    ],
    message: 'Deve restare attivo il test geometrico mobile degli header condivisi.'
  },
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
  if (check.forbidden?.test(source)) failures.push(check.message);
  if (check.required?.some(pattern => !pattern.test(source))) {
    failures.push(check.message);
  }
}

if (failures.length > 0) {
  console.error('Audit responsive fallito:\n');
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(
    `Audit responsive superato: ${toolbarTemplateCount} template con header, ${tableTemplateCount} template con tabelle e ${regressionChecks.length} regressioni di larghezza controllate.`
  );
}
