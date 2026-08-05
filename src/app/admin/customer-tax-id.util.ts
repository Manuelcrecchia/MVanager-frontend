export type CustomerRecipientType = 'business' | 'pa' | 'private';

export interface CustomerTaxIdentifiers {
  vatNumber: string;
  fiscalCode: string;
}

function clean(value: unknown): string {
  return String(value ?? '').trim().toUpperCase().replace(/\s+/g, '');
}

export function inferRecipientTypeFromTaxIds(
  vatNumber: unknown,
  fiscalCode: unknown,
  combinedTaxId: unknown,
): CustomerRecipientType {
  if (clean(vatNumber)) return 'business';
  const fiscal = clean(fiscalCode);
  if (fiscal) return fiscal.length === 16 ? 'private' : 'business';
  const combined = clean(combinedTaxId).replace(/^IT(?=\d{11}$)/, '');
  return /^[A-Z0-9]{16}$/.test(combined) ? 'private' : 'business';
}

export function resolveCustomerTaxIdentifiers(options: {
  recipientType: CustomerRecipientType;
  country?: unknown;
  vatNumber?: unknown;
  fiscalCode?: unknown;
  combinedTaxId?: unknown;
}): CustomerTaxIdentifiers {
  const explicitVat = clean(options.vatNumber);
  const explicitFiscal = clean(options.fiscalCode);
  if (explicitVat || explicitFiscal) {
    return { vatNumber: explicitVat, fiscalCode: explicitFiscal };
  }

  const combined = clean(options.combinedTaxId);
  if (!combined) return { vatNumber: '', fiscalCode: '' };
  if (options.recipientType === 'private') return { vatNumber: '', fiscalCode: combined };

  const country = clean(options.country || 'IT');
  if (country !== 'IT') return { vatNumber: combined, fiscalCode: '' };
  const withoutItalianPrefix = combined.replace(/^IT(?=\d{11}$)/, '');
  if (/^[A-Z0-9]{16}$/.test(withoutItalianPrefix) && !/^\d{11}$/.test(withoutItalianPrefix)) {
    return { vatNumber: '', fiscalCode: withoutItalianPrefix };
  }
  return { vatNumber: withoutItalianPrefix, fiscalCode: '' };
}
