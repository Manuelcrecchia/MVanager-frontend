export function calendarDirectionsUrl(address: string): string {
  const destination = String(address || '').trim();
  return destination
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving`
    : '';
}

export function calendarPhoneUrl(phone: string): string {
  const number = String(phone || '').trim().replace(/[\s().-]/g, '');
  // A single phone number only; do not pass arbitrary schemes or dial codes.
  return /^\+?\d{3,20}$/.test(number) ? `tel:${number}` : '';
}
