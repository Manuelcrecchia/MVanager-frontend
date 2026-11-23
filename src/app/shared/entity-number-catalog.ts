export type NumberedEntity = 'customer' | 'quote';
export function numberCatalogStorage(): Pick<Storage,'getItem'|'setItem'> | undefined {
  try {return typeof localStorage === 'undefined' ? undefined : localStorage;} catch {return undefined;}
}
export function businessDate(now = new Date()): string {
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(part=>[part.type,part.value]));
  return `${parts['year']}-${parts['month']}-${parts['day']}`;
}
export function compareBusinessNumbers(left: string, right: string): number {
  const a = String(left).match(/^(\d+)\/(\d{4})$/), b = String(right).match(/^(\d+)\/(\d{4})$/);
  if (a && b) return Number(a[2]) - Number(b[2]) || a[1].localeCompare(b[1], 'it', {numeric:true});
  return String(left).localeCompare(String(right), 'it', {numeric:true, sensitivity:'base'});
}
export class EntityNumberCatalog {
  private numbers = new Map<string, string>();
  private loaded = new Set<string>();
  constructor(private storage?: Pick<Storage,'getItem'|'setItem'>) {}
  private load(tenant: string): void {
    if (this.loaded.has(tenant)) return;
    this.loaded.add(tenant);
    try {
      const values=JSON.parse(this.storage?.getItem('mvanager.annualNumbers.v1.'+tenant) || '[]');
      for (const entry of Array.isArray(values) ? values : []) if (Array.isArray(entry) && entry.length===2 && typeof entry[0]==='string' && typeof entry[1]==='string' && entry[0].startsWith(tenant+':')) this.numbers.set(entry[0],entry[1]);
    } catch {}
  }
  observe(body: unknown, tenant: string): void {
    this.load(tenant);
    let changed=false;
    const visit = (value: any, depth = 0): void => {
      if (!value || typeof value !== 'object' || depth > 35) return;
      if (Array.isArray(value)) {value.forEach(item => visit(item, depth + 1)); return;}
      for (const [scope, key] of [['customer','numeroCliente'],['customer','customerId'],['quote','numeroPreventivo']]) {
        const display = value[key + 'Display'];
        if (value[key] !== undefined && typeof display === 'string' && display) {
          const index=`${tenant}:${scope}:${value[key]}`;
          if (this.numbers.get(index)!==display) {this.numbers.set(index,display);changed=true;}
        }
      }
      Object.values(value).forEach(item => {if (item && typeof item === 'object') visit(item, depth + 1);});
    };
    visit(body);
    if(changed)try {this.storage?.setItem('mvanager.annualNumbers.v1.'+tenant,JSON.stringify([...this.numbers].filter(([key])=>key.startsWith(tenant+':'))));} catch {}
  }
  format(scope: NumberedEntity, value: any, tenant: string): string {
    this.load(tenant);
    const key = scope === 'customer' ? 'numeroCliente' : 'numeroPreventivo';
    if (value && typeof value === 'object') return String(value[key + 'Display'] || value.publicNumber || this.format(scope, value[key], tenant));
    const id = String(value ?? '');
    return this.numbers.get(`${tenant}:${scope}:${id}`) || id;
  }
}
export function invoiceNumber(value: any): string {
  const number = [value?.series, value?.number].filter(part => part !== undefined && part !== null && part !== '').join('/');
  const rawNumber = String(value?.number ?? '');
  const alreadyAnnual = rawNumber.includes('/') && rawNumber.endsWith('/' + value?.year);
  return Number(value?.numberFormatVersion) === 1 && value?.direction !== 'inbound' && value?.year && !alreadyAnnual ? `${number}/${value.year}` : number;
}
