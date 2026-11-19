export const ADDRESS_PARTS = ['prefix', 'address', 'number', 'city', 'province', 'zip', 'country', 'latitude', 'longitude'] as const;
export type AddressFields = Partial<Record<typeof ADDRESS_PARTS[number], string>>;
export interface BillingAddressLinkConfig {
  enabled: boolean;
  billing: { customer: AddressFields; quote: AddressFields };
  sources: { id: string; label: string; customer: AddressFields; quote: AddressFields }[];
}
export function applyBillingAddressLink(link: BillingAddressLinkConfig, scope: 'customer' | 'quote', record: Record<string, any>, fields: {key?: string; dbColumn?: string}[]): void {
  if (!link?.enabled || !record) return;
  const selection = String(record['billingAddressSource'] || 'independent');
  const source = link.sources.find(item => item.id === selection);
  if (!source) { record['billingAddressSource'] = 'independent'; return; }
  const column = (key: string) => fields.find(item => item.key === key || item.dbColumn === key)?.dbColumn || key;
  const read = (key?: string) => key ? record[column(key)] ?? record[key] ?? '' : '';
  const target = link.billing[scope];
  for (const part of ADDRESS_PARTS) {
    const key = target[part];
    if (!key) continue;
    let value = part === 'country' && !source[scope][part] ? 'IT' : read(source[scope][part]);
    if (part === 'address') value = [!target.prefix ? read(source[scope].prefix) : '', value, !target.number ? read(source[scope].number) : ''].map(item => String(item ?? '').trim()).filter(Boolean).join(' ');
    record[column(key)] = value;
    record[key] = value;
  }
}
