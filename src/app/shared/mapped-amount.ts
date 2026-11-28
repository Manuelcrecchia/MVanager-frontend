import type { TenantFieldMappingFieldConfig } from '../service/global.service';

export const MAPPED_DECIMALS = 2;

const amountFormatter = new Intl.NumberFormat('it-IT', {
  minimumFractionDigits: MAPPED_DECIMALS,
  maximumFractionDigits: MAPPED_DECIMALS,
  useGrouping: false,
});

export function isMappedAmountField(field: TenantFieldMappingFieldConfig): boolean {
  return String(field.type || '').trim().toLowerCase() === 'money' ||
    field.displayRole === 'quoteTotal';
}

export function parseMappedNumericText(value: string): number {
  let normalized = value.replace(/[^\d,.-]/g, '');
  if (!normalized) return Number.NaN;

  const commaIndex = normalized.lastIndexOf(',');
  const dotIndex = normalized.lastIndexOf('.');
  if (commaIndex !== -1 && dotIndex !== -1) {
    normalized = commaIndex > dotIndex
      ? normalized.replace(/\./g, '').replace(',', '.')
      : normalized.replace(/,/g, '');
  } else if (commaIndex !== -1) {
    normalized = normalized.replace(',', '.');
  }

  return Number(normalized);
}

export function formatMappedDecimal(value: unknown): string {
  const text = String(value ?? '');
  if (typeof value !== 'number' && !/^[\d\s€+,.\-]+$/.test(text)) return text;

  const amount = typeof value === 'number' ? value : parseMappedNumericText(text);
  return Number.isFinite(amount) ? amountFormatter.format(amount) : text;
}
