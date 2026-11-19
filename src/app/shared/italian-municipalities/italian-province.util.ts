import { ITALIAN_MUNICIPALITIES } from './municipalities.data';

const normalize = (value: unknown): string => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const provinces = new Map<string, Set<string>>();
for (const [city, province] of ITALIAN_MUNICIPALITIES) {
  const key = normalize(city);
  if (!provinces.has(key)) provinces.set(key, new Set<string>());
  provinces.get(key)!.add(province);
}

export function italianProvinceForCity(city: unknown, country: unknown = 'IT'): string | null {
  if (String(country || 'IT').trim().toUpperCase() !== 'IT') return null;
  const supplied = String(city || '').trim();
  const suffix = supplied.match(/^(.*?)\s*\(([A-Za-z]{2})\)$/);
  const matches = provinces.get(normalize(suffix ? suffix[1] : supplied));
  if (suffix) return matches?.has(suffix[2].toUpperCase()) ? suffix[2].toUpperCase() : null;
  return matches?.size === 1 ? [...matches][0] : null;
}
