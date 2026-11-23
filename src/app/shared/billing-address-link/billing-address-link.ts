import { italianProvinceForCity } from '../italian-municipalities/italian-province.util';
import {projectBillingAliases} from './billing-address-fields';
export const ADDRESS_PARTS = ['prefix', 'address', 'number', 'city', 'province', 'zip', 'country', 'latitude', 'longitude'] as const;
export type AddressFields = Partial<Record<typeof ADDRESS_PARTS[number], string>>;
export interface BillingAddressLinkConfig {
  enabled: boolean;
  version?: number;
  legacySources?: {customer: AddressFields[];quote: AddressFields[]} | null;
  manualLabels?: { customer: string; quote: string };
  billing: { customer: AddressFields; quote: AddressFields };
  sources: { id: string; label: string; labels?:{customer:string;quote:string}; scopes?:{customer:boolean;quote:boolean}; customer: AddressFields; quote: AddressFields }[];
}
export function applyBillingAddressLink(link: BillingAddressLinkConfig, scope: 'customer' | 'quote', record: Record<string, any>, fields: {key: string; dbColumn?: string;billingAliasOf?:string}[]): void {
  if (!link?.enabled || !record) return;
  const selection = String(record['billingAddressSource'] || 'independent');
  const source = link.sources.find(item => item.id === selection && item.scopes?.[scope] !== false);
  if (!source) { record['billingAddressSource'] = 'independent'; Object.assign(record,projectBillingAliases(record,fields)); return; }
  const column = (key: string) => fields.find(item => item.key === key || item.dbColumn === key)?.dbColumn || key;
  const read = (key?: string) => key ? record[column(key)] ?? record[key] ?? '' : '';
  const target = link.billing[scope];
  for (const part of ADDRESS_PARTS) {
    const key = target[part];
    if (!key) continue;
    let value = part === 'country' && !source[scope][part] ? 'IT' : read(source[scope][part]);
    if (link.version === 2 && part === 'province' && !source[scope].province) value = italianProvinceForCity(read(source[scope].city),read(source[scope].country) || 'IT');
    if (part === 'address') value = [!target.prefix ? read(source[scope].prefix) : '', value, !target.number ? read(source[scope].number) : ''].map(item => String(item ?? '').trim()).filter(Boolean).join(' ');
    record[column(key)] = value;
    record[key] = value;
  }
  Object.assign(record,projectBillingAliases(record,fields));
}
