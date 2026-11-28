export function normalizeWhatsappPhone(phone: unknown): string {
  const raw = String(phone || '').trim();
  if (!/^\+?[0-9\s().-]+$/.test(raw)) return '';
  let number = raw.replace(/\D/g, '');
  if (raw.startsWith('00')) number = number.slice(2);
  else if (!raw.startsWith('+') && /^(?:3\d{8,9}|0\d{5,10})$/.test(number)) number = '39' + number;
  return /^[1-9]\d{6,14}$/.test(number) ? number : '';
}
