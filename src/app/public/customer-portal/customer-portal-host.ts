export function localCustomerPortalTenant(hostname: string): string {
  const host = String(hostname || '').trim().toLowerCase().replace(/\.$/, '');
  const match = /^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\.customer\.(?:local|localhost)$/.exec(host);
  return match?.[1] || '';
}

export function isCustomerPortalHost(hostname: string): boolean {
  return String(hostname || '').toLowerCase().includes('.clienti.') || !!localCustomerPortalTenant(hostname);
}
