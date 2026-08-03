import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const sourceRoot = fileURLToPath(new URL("../src/app/", import.meta.url));
const extensions = new Set([".css", ".scss", ".html", ".ts"]);
const allowedTemplateStyleTags = new Set([
  "componenti/login/private-area/private-area.component.html",
  "componenti/login/passworddimenticata/passworddimenticata.component.html",
  "admin/create-shift/create-shift.component.html",
  "admin/gestione-permessi/gestione-permessi.component.html",
  "admin/homeadmin/homeadmin.component.html",
  "admin/riepilogo-ore-clienti/riepilogo-ore-clienti.component.html",
  "admin/riepilogo-presenze-editabile/riepilogo-presenze-editabile.component.html",
]);

const visualImportant = /\b(?:color|background(?:-color|-image)?|border(?:-[a-z-]+)?|box-shadow|text-shadow|font-(?:family|size|weight)|fill|stroke|outline(?:-[a-z-]+)?|opacity|accent-color|caret-color)\s*:[^;{}]*!important/gi;
const reservedToken = /--mv-(?:orange|blue|ink|text|muted|canvas|surface|border|success|warning|danger|info|radius|shadow|focus|transition)[a-z0-9-]*\s*:/gi;
const legacyPalette = /#(?:ec407a|d81b60|fce4ec|f8bbd0|ff7a00|ff8a00|ff9a3c|2fb7ff|0d6efd|2563eb|1a73e8|0066cc|2f6fe4|4da3f7|8ec5ff|81d4fa|0288d1)(?![0-9a-f])/gi;
const localFont = /font-family\s*:(?![ \t]*inherit\b)[^;{}]+/gi;
const unsafeEncapsulation = /ViewEncapsulation\.(?:None|ShadowDom)|encapsulation\s*:/g;

const files = [];
function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (extensions.has(extname(entry.name))) files.push(path);
  }
}
walk(sourceRoot);

const problems = [];
for (const file of files) {
  const text = readFileSync(file, "utf8");
  const name = relative(sourceRoot, file);
  const checks = extname(file) === ".ts"
    ? [[unsafeEncapsulation, "incapsulamento CSS non sicuro"]]
    : [
        [visualImportant, "override visivo con !important"],
        [reservedToken, "ridefinizione locale di un token --mv-* riservato"],
        [legacyPalette, "colore principale hardcoded fuori dal design system"],
        [localFont, "font locale diverso dal font globale"],
      ];

  for (const [pattern, message] of checks) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text))) {
      const line = text.slice(0, match.index).split("\n").length;
      problems.push(`${name}:${line} ${message}`);
    }
  }

  if (extname(file) === ".html" && /<style[ >]/i.test(text) && !allowedTemplateStyleTags.has(name)) {
    problems.push(`${name}: nuovo blocco <style> nel template`);
  }
}

if (problems.length) {
  console.error(`Audit design system fallito: ${problems.length} problemi.`);
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log(`Audit design system superato: ${files.length} file controllati.`);
