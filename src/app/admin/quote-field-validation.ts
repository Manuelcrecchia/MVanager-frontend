import { TenantFieldMappingFieldConfig } from '../service/global.service';

export interface QuoteFieldValidationError {
  fieldKey: string;
  label: string;
  message: string;
}

function normalize(value: unknown): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function fieldIdentity(field: TenantFieldMappingFieldConfig): string {
  return [
    field.key,
    field.dbColumn,
    field.label,
    field.pdfFieldKey,
    field.displayRole,
  ].map(normalize).filter(Boolean).join(' ');
}

export function quoteFieldKey(field: TenantFieldMappingFieldConfig): string {
  return String(field.dbColumn || field.key || '').trim();
}

export function quoteFieldLabel(field: TenantFieldMappingFieldConfig): string {
  return String(field.label || field.dbColumn || field.key || 'Campo').trim();
}

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0 || value.every((row) => isEmpty(row));
  return String(value).trim() === '';
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(value.trim());
}

function isPhone(value: string): boolean {
  const cleaned = value.replace(/[\s()./-]/g, '');
  return /^\+?\d{7,15}$/.test(cleaned);
}

function isItalianFiscalCode(value: string): boolean {
  return /^[A-Z]{6}\d{2}[A-EHLMPRST]\d{2}[A-Z]\d{3}[A-Z]$/i.test(value.trim());
}

function isVatNumber(value: string): boolean {
  return /^\d{11}$/.test(value.replace(/\s/g, ''));
}

function isPostalCode(value: string): boolean {
  return /^\d{5}$/.test(value.trim());
}

function isReasonableName(value: string): boolean {
  const cleaned = value.trim().replace(/\s+/g, ' ');
  return cleaned.length >= 2 && /^[\p{L}\p{M}' .-]+$/u.test(cleaned);
}

export function validateQuoteField(
  field: TenantFieldMappingFieldConfig,
  value: unknown,
): QuoteFieldValidationError | null {
  if (isEmpty(value)) return null;

  const key = quoteFieldKey(field);
  const label = quoteFieldLabel(field);
  const type = String(field.type || '').trim().toLowerCase();
  const identity = fieldIdentity(field);
  const text = String(value ?? '').trim();

  const fail = (message: string): QuoteFieldValidationError => ({ fieldKey: key, label, message });

  if (type === 'number' && Number.isNaN(Number(text.replace(',', '.')))) {
    return fail('deve essere un numero valido.');
  }

  if (type === 'date' && Number.isNaN(Date.parse(text))) {
    return fail('deve essere una data valida.');
  }

  if (type === 'email' || identity.includes('email') || identity.includes('mail')) {
    return isEmail(text) ? null : fail('deve contenere una email valida, es. nome@azienda.it.');
  }

  if (type === 'tel' || identity.includes('telefono') || identity.includes('cellulare') || identity.includes('phone')) {
    return isPhone(text) ? null : fail('deve contenere un numero di telefono valido.');
  }

  if (identity.includes('codicefiscale') || identity.includes('fiscalcode')) {
    return isItalianFiscalCode(text) ? null : fail('deve contenere un codice fiscale valido.');
  }

  if (identity.includes('partitaiva') || identity.includes('piva') || identity.includes('vat')) {
    return isVatNumber(text) ? null : fail('deve contenere una partita IVA di 11 cifre.');
  }

  if (identity.includes('cap') || identity.includes('postalcode')) {
    return isPostalCode(text) ? null : fail('deve contenere un CAP di 5 cifre.');
  }

  if (
    identity.includes('nominativo') ||
    identity.includes('referente') ||
    identity.includes('nomecliente') ||
    identity.includes('cognome')
  ) {
    return isReasonableName(text) ? null : fail('deve contenere un nome valido, senza numeri o simboli strani.');
  }

  return null;
}

export function validateQuoteFields(
  fields: TenantFieldMappingFieldConfig[],
  source: Record<string, unknown>,
): QuoteFieldValidationError[] {
  return fields
    .map((field) => validateQuoteField(field, source[field.dbColumn] ?? source[field.key]))
    .filter((error): error is QuoteFieldValidationError => !!error);
}
