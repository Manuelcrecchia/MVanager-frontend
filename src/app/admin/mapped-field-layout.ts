/** Visual grouping only: values, validation and repeatable lists remain independent. */
export interface LayoutField {
  key: string;
  dbColumn: string;
  section?: string;
  rowGroup?: string;
  rowLayout?: string;
}

export interface MappedFieldRow<T extends LayoutField = LayoutField> {
  key: string;
  grouped: boolean;
  fields: T[];
}

export function buildMappedFieldRows<T extends LayoutField>(fields: T[]): MappedFieldRow<T>[] {
  const rows: MappedFieldRow<T>[] = [];
  const groups = new Map<string, MappedFieldRow<T>>();
  for (const field of fields) {
    const group = String(field.rowGroup || '').trim();
    const section = String(field.section || 'generale').trim().toLowerCase()
      .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'generale';
    const key = group ? JSON.stringify([section, group]) : `field:${field.dbColumn || field.key}`;
    const existing = group ? groups.get(key) : undefined;
    if (existing) {
      existing.fields.push(field);
    } else {
      const row = { key, grouped: !!group, fields: [field] };
      rows.push(row);
      if (group) groups.set(key, row);
    }
  }
  return rows;
}

export function trackByMappedFieldRow(_index: number, row: MappedFieldRow): string {
  return row.key;
}

/** The first configured member defines the mode for the entire group. */
export function isLinkedFieldRow<T extends LayoutField>(row: MappedFieldRow<T>, isList: (field: T) => boolean): boolean {
  return row.grouped && row.fields[0]?.rowLayout === 'linked' && row.fields.every(isList);
}

export function linkedFieldValues<T>(fields: T[], read: (field: T) => string[]): string[][] {
  const lists = fields.map(read);
  const length = Math.max(0, ...lists.map(list => list.length));
  return lists.map(list => Array.from({ length }, (_, index) => list[index] ?? ''));
}

export function changeLinkedValues<T>(fields: T[], read: (field: T) => string[], action: 'add' | 'remove' | 'update', index = 0, fieldIndex = 0, value = ''): string[][] {
  const lists = linkedFieldValues(fields, read);
  if (action === 'add') return lists.map(list => [...list, '']);
  if (index < 0 || index >= (lists[0]?.length || 0)) return lists;
  if (action === 'remove') return lists.map(list => list.filter((_, rowIndex) => rowIndex !== index));
  if (lists[fieldIndex]) lists[fieldIndex][index] = value;
  return lists;
}
