import { italianProvinceForCity } from './italian-province.util';

type Field = { key?: string; dbColumn?: string; displayRole?: string };
interface MappingSource {
  getFieldMappingFields?: (scope: 'customer') => Field[];
  getEffectiveCustomerAddressFields?: (kind: 'work' | 'billing') => { city?: string; province?: string; country?: string };
}
const automatic = new WeakMap<object, Map<string, string>>();

export function fillMappedCustomerProvince(global: MappingSource, target: Record<string, any>, changed: Field): string[] {
  const fields = global.getFieldMappingFields?.('customer') || [];
  const find = (key?: string) => fields.find((field) => field.key === key || field.dbColumn === key);
  const role = (value: string) => fields.find((field) => field.displayRole === value);
  const read = (field?: Field) => field ? target[field.dbColumn || field.key || ''] ?? target[field.key || ''] : undefined;
  const key = (field?: Field) => field?.dbColumn || field?.key || '';
  const pairs: { city?: Field; province?: Field; country?: Field }[] = [
    { city: role('customerCity'), province: role('customerProvince'), country: role('customerCountry') },
  ];
  for (const kind of ['billing', 'work'] as const) {
    const config = global.getEffectiveCustomerAddressFields?.(kind);
    if (config?.city && config.province) pairs.push({ city: find(config.city), province: find(config.province), country: find(config.country) || role('customerCountry') });
  }
  const modified: string[] = [];
  const history = automatic.get(target) || new Map<string, string>();
  automatic.set(target, history);
  for (const pair of pairs) {
    if (!key(pair.city) || !key(pair.province) || ![key(pair.city), key(pair.country)].includes(key(changed))) continue;
    const province = italianProvinceForCity(read(pair.city), read(pair.country));
    const previousAutomatic = history.get(key(pair.province));
    if (!province && (!previousAutomatic || read(pair.province) !== previousAutomatic)) continue;
    const value = province || '';
    if (province) history.set(key(pair.province), province); else history.delete(key(pair.province));
    for (const column of new Set([pair.province?.dbColumn, pair.province?.key].filter(Boolean) as string[])) {
      target[column] = value;
      modified.push(column);
    }
  }
  return modified;
}
