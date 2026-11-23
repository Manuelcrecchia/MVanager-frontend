type Scope = 'customer' | 'quote';
interface BillingAliasField {
  key: string; dbColumn?: string; displayRole?: string; billingAliasOf?: string;
  calculation?: {mode?: string};
}
interface BillingAliasLink {
  version?: number;
  billing: Record<Scope, Partial<Record<string,string>>>;
  sources: {scopes?: Partial<Record<Scope,boolean>>;customer?: object;quote?: object}[];
}
const names: Record<string,string[]> = {
  prefix:['selettorePrefissoViaDiFatturazione','prefissoFatturazione','tipoViaFatturazione'],
  address:['viaDiFatturazione','indirizzoDiFatturazione','indirizzoFatturazione'],
  number:['numeroCivicoDiFatturazione','numeroCivicoFatturazione','civicoFatturazione'],
  city:['cittaDiFatturazione','comuneDiFatturazione','comuneFatturazione','cittaFatturazione'],
  province:['provinciaDiFatturazione','provinciaFatturazione'],zip:['capDiFatturazione','capFatturazione'],country:['nazioneDiFatturazione','nazioneFatturazione'],
};
const roles: Record<string,string> = {address:'customerBillingAddress',city:'customerBillingCity',province:'customerBillingProvince',zip:'customerBillingZip',country:'customerBillingCountry'};
const normalized = (value?: string) => String(value || '').replace(/_/g,'').toLowerCase();
export function legacyBillingPart(field: BillingAliasField): string {
  return Object.keys(names).find(part => roles[part] && field.displayRole === roles[part] || names[part].some(name => [field.key,field.dbColumn].some(key => normalized(key) === normalized(name)))) || '';
}
export function billingWorkReferences(link: BillingAliasLink,scope: Scope,work: object = {}): Set<string> {
  return new Set([...Object.values(work),...link.sources.filter(source => source.scopes?.[scope] !== false).flatMap(source => Object.values(source[scope] || {}))].filter((value): value is string => typeof value === 'string' && !!value));
}
export function isWorkField(field: BillingAliasField,references: Set<string>): boolean {
  return references.has(field.key) || references.has(field.dbColumn || '') || String(field.displayRole || '').startsWith('customerWork');
}
export function prepareBillingAliases(link: BillingAliasLink,mapping: Record<Scope,{fields:BillingAliasField[]}> & {quoteToCustomer?: {from:string;to:string;quoteType?:string}[]},work: object = {}): void {
  if (link.version !== 2) return;
  for (const scope of ['customer','quote'] as const) {
    const fields = mapping[scope].fields, references = billingWorkReferences(link,scope,work), targets = Object.values(link.billing[scope]);
    for (const field of fields) {
      delete field.billingAliasOf;
      const part = legacyBillingPart(field), targetKey = link.billing[scope][part];
      const target = fields.find(item => item.key === targetKey || item.dbColumn === targetKey);
      if (!part || !target || targets.includes(field.key) || targets.includes(field.dbColumn) || isWorkField(field,references) || field.calculation?.mode) continue;
      field.billingAliasOf = target.dbColumn || target.key;
    }
  }
  if (mapping.quoteToCustomer) {
    const resolve = (scope: Scope,key: string): string => {
      const field = mapping[scope].fields.find(field => field.key === key || field.dbColumn === key);
      if (!field?.billingAliasOf) return key;
      return mapping[scope].fields.find(item => item.dbColumn === field.billingAliasOf || item.key === field.billingAliasOf)?.key || field.billingAliasOf;
    };
    const seen = new Set<string>();
    mapping.quoteToCustomer = mapping.quoteToCustomer.map(item => ({...item,from:resolve('quote',item.from),to:resolve('customer',item.to)})).filter(item => {
      const key = JSON.stringify([item.from,item.to,String(item.quoteType || '').toLowerCase()]);
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
  }
}
export function projectBillingAliases(record: Record<string,any>,fields: BillingAliasField[]): Record<string,any> {
  const result = {...record};
  for (const field of fields) {
    if (!field.billingAliasOf) continue;
    const target = fields.find(item => item.key === field.billingAliasOf || item.dbColumn === field.billingAliasOf);
    const key = [target?.dbColumn,target?.key,field.billingAliasOf].find(key => key && Object.prototype.hasOwnProperty.call(record,key));
    if (key) result[field.key] = result[field.dbColumn || field.key] = record[key];
  }
  return result;
}
