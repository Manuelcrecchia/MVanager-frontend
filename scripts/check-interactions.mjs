import fs from 'node:fs';
import path from 'node:path';
import { parseTemplate } from '@angular/compiler';

const appRoot = path.resolve('src/app');
const nativeInteractiveTags = new Set([
  'a',
  'button',
  'input',
  'option',
  'select',
  'summary',
  'textarea',
]);
const interactiveContainerTags = new Set([
  'a',
  'button',
  'summary',
]);
const interactiveDescendantTags = new Set([
  'a',
  'button',
  'input',
  'select',
  'summary',
  'textarea',
]);
const gestureEvents = new Set([
  'pointercancel',
  'pointerdown',
  'pointermove',
  'pointerup',
  'touchcancel',
  'touchend',
  'touchmove',
  'touchstart',
]);
const issues = [];
let templateCount = 0;
let buttonCount = 0;
let clickTargetCount = 0;
let detailsCount = 0;

function htmlFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return htmlFiles(entryPath);
    return entry.name.endsWith('.html') ? [entryPath] : [];
  });
}

function typeScriptFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return typeScriptFiles(entryPath);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts') ? [entryPath] : [];
  });
}

function addIssue(file, node, message) {
  issues.push({
    file: path.relative(process.cwd(), file),
    line: node.sourceSpan.start.line + 1,
    message,
  });
}

function hasName(items, name) {
  return (items || []).some((item) => item.name === name);
}

function attributeValue(node, name) {
  return (node.attributes || []).find((attribute) => attribute.name === name)?.value || '';
}

function hasAttributeOrInput(node, name) {
  return hasName(node.attributes, name) || hasName(node.inputs, name);
}

function hasInteractiveDescendant(node) {
  if (node.name && interactiveContainerTags.has(node.name)) return true;
  return (node.children || []).some(hasInteractiveDescendant);
}

function inspectComputedInteractiveLoop(file, node) {
  const attributes = node.templateAttrs || [];
  const loop = attributes.find((attribute) => attribute.name === 'ngForOf');
  if (!loop || attributes.some((attribute) => attribute.name === 'ngForTrackBy')) return;
  const expression = loop.value?.source || '';
  const callsFunction = /\w+\s*\(/.test(expression);
  const volatileCollection = /^(miniCalGrid|customerGroups)$/.test(expression.trim());
  if ((callsFunction || volatileCollection) && hasInteractiveDescendant(node)) {
    addIssue(
      file,
      node,
      `ngFor interattivo su raccolta calcolata "${expression}" senza trackBy stabile: il nodo può cambiare tra pointerdown e pointerup`,
    );
  }
}

function isIntentionalStructuralClick(node, clickEvent) {
  const handler = clickEvent.handler?.source?.replace(/\s+/g, '') || '';
  const className = attributeValue(node, 'class');
  const role = attributeValue(node, 'role');

  if (handler === '$event.stopPropagation()') return true;
  if (role === 'presentation') return true;
  if (/(^|[-_\s])(backdrop|overlay)([-_\s]|$)/i.test(className)) return true;

  const hasButtonRole =
    role === 'button' ||
    hasName(node.inputs, 'role');
  const hasTabStop = hasAttributeOrInput(node, 'tabindex');
  const hasKeyboardActivation =
    hasName(node.outputs, 'keydown.enter') &&
    hasName(node.outputs, 'keydown.space');
  return hasButtonRole && hasTabStop && hasKeyboardActivation;
}

function inspectNode(file, node, ancestors) {
  inspectComputedInteractiveLoop(file, node);
  if (!node.name) return;

  const outputs = node.outputs || [];
  const clickEvent = outputs.find((output) => output.name === 'click');
  const interactiveAncestor = [...ancestors]
    .reverse()
    .find((ancestor) => interactiveContainerTags.has(ancestor.name));
  const labelAncestor = [...ancestors]
    .reverse()
    .find((ancestor) => ancestor.name === 'label');

  if (interactiveAncestor && interactiveDescendantTags.has(node.name)) {
    addIssue(
      file,
      node,
      `<${node.name}> annidato dentro <${interactiveAncestor.name}>: separa i controlli interattivi`,
    );
  }

  if (labelAncestor && (node.name === 'button' || node.name === 'label')) {
    addIssue(
      file,
      node,
      `<${node.name}> annidato dentro <label>: separa etichetta e controlli interattivi`,
    );
  }

  if (node.name === 'button') {
    buttonCount += 1;
    if (!hasAttributeOrInput(node, 'type')) {
      addIssue(file, node, 'button senza type=\"button\" o type=\"submit\"');
    }
  }

  if (node.name === 'details') {
    detailsCount += 1;
    if (!hasAttributeOrInput(node, 'appReliableDetails')) {
      addIssue(file, node, 'details senza appReliableDetails: il primo tap mobile può essere assorbito');
    }
  }

  if (clickEvent) {
    clickTargetCount += 1;
    if (
      !nativeInteractiveTags.has(node.name) &&
      !isIntentionalStructuralClick(node, clickEvent)
    ) {
      addIssue(
        file,
        node,
        `azione click su <${node.name}>: usa un <button type="button"> oppure aggiungi semantica e tastiera`,
      );
    }
  }

  if (
    node.name === 'a' &&
    clickEvent &&
    !hasAttributeOrInput(node, 'href') &&
    !hasAttributeOrInput(node, 'routerLink')
  ) {
    addIssue(file, node, 'link con click ma senza href/routerLink: usa un button');
  }

  for (const output of outputs) {
    if (!gestureEvents.has(output.name)) continue;
    const isSignatureCanvas = node.name === 'canvas';
    const isDraggableAssistant = attributeValue(node, 'class')
      .split(/\s+/)
      .includes('ai-fab');
    if (!isSignatureCanvas && !isDraggableAssistant) {
      addIssue(
        file,
        node,
        `${output.name} personalizzato non autorizzato: le azioni ordinarie devono usare click`,
      );
    }
  }
}

function walk(file, nodes, ancestors = []) {
  for (const node of nodes) {
    inspectNode(file, node, ancestors);
    walk(file, node.children || [], node.name ? [...ancestors, node] : ancestors);
  }
}

for (const file of htmlFiles(appRoot)) {
  templateCount += 1;
  const source = fs.readFileSync(file, 'utf8');
  const parsed = parseTemplate(source, file, { preserveWhitespaces: false });
  for (const error of parsed.errors || []) {
    issues.push({
      file: path.relative(process.cwd(), file),
      line: error.span?.start?.line ? error.span.start.line + 1 : 1,
      message: `template non analizzabile: ${error.msg}`,
    });
  }
  walk(file, parsed.nodes);
}

const reliableTapSource = fs.readFileSync(
  path.join(appRoot, 'shared/reliable-tap.directive.ts'),
  'utf8',
);
for (const selector of ['button', 'a', '[role="button"]']) {
  if (!reliableTapSource.includes(selector)) {
    issues.push({
      file: 'src/app/shared/reliable-tap.directive.ts',
      line: 1,
      message: `il gestore touch globale non copre il selettore ${selector}`,
    });
  }
}

for (const file of typeScriptFiles(appRoot)) {
  const source = fs.readFileSync(file, 'utf8');
  if (!/standalone\s*:\s*true/.test(source)) continue;
  const templateName = source.match(/templateUrl\s*:\s*['"](.+?)['"]/)?.[1];
  if (!templateName) continue;
  const templatePath = path.resolve(path.dirname(file), templateName);
  const template = fs.existsSync(templatePath) ? fs.readFileSync(templatePath, 'utf8') : '';
  if (!/<(?:button|a)\b|role\s*=\s*['"]button['"]/.test(template)) continue;
  if (!source.includes('ReliableTapDirective')) {
    issues.push({
      file: path.relative(process.cwd(), file),
      line: 1,
      message: 'componente standalone interattivo senza ReliableTapDirective negli imports',
    });
  }
}

if (issues.length) {
  console.error(`Audit interazioni fallito: ${issues.length} problemi.`);
  for (const issue of issues) {
    console.error(`${issue.file}:${issue.line} ${issue.message}`);
  }
  process.exit(1);
}

console.log(
  `Audit interazioni superato: ${templateCount} template, ${buttonCount} button, ${clickTargetCount} target click, ${detailsCount} details affidabili.`,
);
