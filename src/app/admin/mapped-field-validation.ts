import { TenantFieldMappingFieldConfig } from '../service/global.service';

export interface MappedFieldValidationError {
  fieldKey: string;
  label: string;
  message: string;
}

export function mappedFieldKey(field: TenantFieldMappingFieldConfig): string {
  return String(field.dbColumn || field.key || '').trim();
}

export function mappedFieldLabel(field: TenantFieldMappingFieldConfig): string {
  return String(field.label || field.dbColumn || field.key || 'Campo').trim();
}

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) {
    return value.length === 0 || value.every((row) => isEmpty(row));
  }
  return String(value).trim() === '';
}

function enumOptions(field: TenantFieldMappingFieldConfig): string[] {
  return String(field.enumValues || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(value.trim());
}

function isPhone(value: string): boolean {
  const cleaned = value.replace(/[\s()./-]/g, '');
  return /^\+?\d{7,15}$/.test(cleaned);
}

function isItalianFiscalCode(value: string): boolean {
  return /^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/i.test(value.trim());
}

function isItalianVat(value: string): boolean {
  return /^\d{11}$/.test(value.replace(/\D/g, ''));
}

function isItalianPostalCode(value: string): boolean {
  return /^\d{5}$/.test(value.trim());
}

function isPersonName(value: string): boolean {
  return /^[A-Za-zÀ-ÖØ-öø-ÿ' .-]{2,}$/.test(value.trim());
}

function parseNumericValue(value: string): number {
  let normalized = String(value)
    .trim()
    .replace(/\s/g, '')
    .replace(/[^\d,.-]/g, '');

  if (!normalized) return Number.NaN;

  const commaIndex = normalized.lastIndexOf(',');
  const dotIndex = normalized.lastIndexOf('.');
  if (commaIndex !== -1 && dotIndex !== -1) {
    normalized =
      commaIndex > dotIndex
        ? normalized.replace(/\./g, '').replace(',', '.')
        : normalized.replace(/,/g, '');
  } else if (commaIndex !== -1) {
    normalized = normalized.replace(',', '.');
  }

  return Number(normalized);
}

function isValidDate(value: string): boolean {
  if (!value.trim()) return false;
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return false;

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!isoMatch) return true;

  const [, yyyy, mm, dd] = isoMatch;
  const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  return (
    date.getFullYear() === Number(yyyy) &&
    date.getMonth() === Number(mm) - 1 &&
    date.getDate() === Number(dd)
  );
}

function isValidTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value.trim());
}

function normalizeValidationRule(value: unknown): string {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s.-]+/g, '_');
  const aliases: Record<string, string> = {
    fiscalcode: 'fiscal_code_it',
    fiscal_code: 'fiscal_code_it',
    codice_fiscale: 'fiscal_code_it',
    codicefiscale: 'fiscal_code_it',
    vat: 'vat_it',
    partita_iva: 'vat_it',
    partitaiva: 'vat_it',
    piva: 'vat_it',
    cf_piva: 'tax_or_vat_it',
    cfpi: 'tax_or_vat_it',
    tax_or_vat: 'tax_or_vat_it',
    cap: 'postal_code_it',
    postal_code: 'postal_code_it',
    postalcode: 'postal_code_it',
    name: 'person_name',
    nome: 'person_name',
    nominativo: 'person_name',
  };
  return aliases[normalized] || normalized;
}

export function validateMappedField(
  field: TenantFieldMappingFieldConfig,
  value: unknown,
): MappedFieldValidationError | null {
  if (isEmpty(value)) return null;

  const key = mappedFieldKey(field);
  const label = mappedFieldLabel(field);
  const type = String(field.type || '').trim().toLowerCase();
  const rule = normalizeValidationRule(field.validationRule);
  const text = String(value ?? '').trim();
  const fail = (message: string): MappedFieldValidationError => ({
    fieldKey: key,
    label,
    message,
  });

  if ((type === 'number' || type === 'money') && Number.isNaN(parseNumericValue(text))) {
    return fail('deve essere un numero valido.');
  }

  if (type === 'date' && !isValidDate(text)) {
    return fail('deve essere una data valida.');
  }

  if (type === 'time' && !isValidTime(text)) {
    return fail('deve essere un orario valido.');
  }

  if (type === 'email') {
    return isEmail(text) ? null : fail('deve contenere una email valida.');
  }

  if (type === 'phone') {
    return isPhone(text) ? null : fail('deve contenere un numero di telefono valido.');
  }

  if (type === 'enum') {
    const options = enumOptions(field);
    const normalizedText = text.toLowerCase();
    const isAllowed = options.some((option) => option.toLowerCase() === normalizedText);
    return isAllowed ? null : fail('deve essere uno dei valori configurati in MVControl.');
  }

  if (rule === 'email') {
    return isEmail(text) ? null : fail('deve contenere una email valida.');
  }

  if (rule === 'phone') {
    return isPhone(text) ? null : fail('deve contenere un numero di telefono valido.');
  }

  if (rule === 'fiscal_code_it') {
    return isItalianFiscalCode(text) ? null : fail('deve contenere un codice fiscale valido.');
  }

  if (rule === 'vat_it') {
    return isItalianVat(text) ? null : fail('deve contenere una partita IVA italiana valida.');
  }

  if (rule === 'tax_or_vat_it') {
    return isItalianFiscalCode(text) || isItalianVat(text)
      ? null
      : fail('deve contenere un codice fiscale o una partita IVA validi.');
  }

  if (rule === 'postal_code_it') {
    return isItalianPostalCode(text) ? null : fail('deve contenere un CAP valido.');
  }

  if (rule === 'person_name') {
    return isPersonName(text) ? null : fail('deve contenere un nome valido.');
  }

  return null;
}

export function validateMappedFields(
  fields: TenantFieldMappingFieldConfig[],
  source: Record<string, unknown>,
): MappedFieldValidationError[] {
  return fields
    .map((field) => validateMappedField(field, source[field.dbColumn] ?? source[field.key]))
    .filter((error): error is MappedFieldValidationError => !!error);
}
