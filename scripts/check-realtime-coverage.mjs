import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

// Every routed component must opt into in-place data updates or have an
// explicit reason for retaining its snapshot/draft. New routes fail this audit.
const retainedViews = {
  AddQuoteComponent: 'unsaved quote draft',
  EditQuoteComponent: 'unsaved quote draft',
  AddCustomerComponent: 'unsaved customer draft',
  EditCustomerComponent: 'unsaved customer draft',
  AddServiceOrderComponent: 'unsaved service-order draft',
  CustomerAssetsGuidedUpdateComponent: 'multi-step draft and uploaded files',
  GestioneTagClienteComponent: 'editable tag layout',
  SettingsEmployeesComponent: 'employee/category editor; avoid reapplying focused action',
  EmailSendingSettingsComponent: 'editable transport configuration',
  NotificationSettingsComponent: 'editable notification preferences',
  LeaveSettingsComponent: 'editable leave limit',
  CambiapasswordComponent: 'password form',
  CreateShiftComponent: 'existing granular shift socket handler; preserve planning draft',
  ViewPdfComponent: 'document snapshot; preserve zoom and scroll',
  QuoteAcceptComponent: 'public signature workflow',
  ContractAcceptComponent: 'public signature workflow',
  WorkCompletionAcceptComponent: 'public signature workflow',
  ServiceOrderAcceptComponent: 'public signature workflow',
  PassworddimenticataComponent: 'authentication',
  PrivateAreaComponent: 'authentication',
};
const routingPath = 'src/app/app-routing.module.ts';
const routing = fs.readFileSync(routingPath, 'utf8');
const imports = new Map([...routing.matchAll(/import\s*\{\s*(\w+)\s*\}\s*from\s*['"]([^'"]+)/g)]
  .map(([, name, source]) => [name, path.resolve(path.dirname(routingPath), source + '.ts')]));
const components = new Set([...routing.matchAll(/component:\s*(\w+)/g)].map(match => match[1]));
let live = 0;
for (const name of components) {
  assert(imports.has(name), `Cannot resolve routed component ${name}`);
  const source = fs.readFileSync(imports.get(name), 'utf8');
  if (/readonly realtimeResources\s*=/.test(source) && /refreshRealtimeData\(/.test(source)) live++;
  else assert(retainedViews[name], `Missing realtime policy: ${name}`);
}
const service = fs.readFileSync('src/app/service/realtime-sync.service.ts', 'utf8');
assert(!/navigateByUrl|location\.reload|skipLocationChange/.test(service), 'Realtime must not recreate routes');
console.log(`Realtime coverage: ${components.size} routed components; ${live} in-place handlers; ${components.size - live} explicitly retained draft/public/snapshot views.`);
