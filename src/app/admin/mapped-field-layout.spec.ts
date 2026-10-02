import { Component, ViewEncapsulation } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { buildMappedFieldRows, LayoutField, trackByMappedFieldRow, linkedFieldValues, changeLinkedValues, isLinkedFieldRow } from './mapped-field-layout';

function field(key: string, rowGroup = '', section = 'generale'): LayoutField {
  return { key, dbColumn: key, rowGroup, section };
}

describe('Configured field rows', () => {
  it('keeps the original order and automatic layout when no groups are configured', () => {
    const fields = [field('a'), field('b')];
    const rows = buildMappedFieldRows(fields);
    expect(rows.map(row => row.fields)).toEqual([[fields[0]], [fields[1]]]);
    expect(rows.every(row => !row.grouped)).toBeTrue();
  });

  it('places separated group members at the first member, without altering field data', () => {
    const fields = [field('servizi', ' Servizi '), field('note'), field('interventi', 'Servizi')];
    const original = JSON.stringify(fields);
    const rows = buildMappedFieldRows(fields);
    expect(rows.map(row => row.fields.map(item => item.key))).toEqual([['servizi', 'interventi'], ['note']]);
    expect(rows[0].grouped).toBeTrue();
    expect(rows[0].fields[0]).toBe(fields[0]);
    expect(JSON.stringify(fields)).toBe(original);
  });

  it('does not join identically named groups from different sections', () => {
    const rows = buildMappedFieldRows([field('a', 'Servizi', 'interno'), field('b', 'Servizi', 'esterno')]);
    expect(rows.length).toBe(2);
    expect(rows[0].key).not.toBe(rows[1].key);
  });

  it('handles visibility changes and preserves the group identity when its first field is hidden', () => {
    const fields = [field('a', 'Servizi'), field('b', 'Servizi')];
    const before = buildMappedFieldRows(fields);
    const after = buildMappedFieldRows(fields.slice(1));
    expect(after[0].fields).toEqual([fields[1]]);
    expect(trackByMappedFieldRow(0, before[0])).toBe(trackByMappedFieldRow(0, after[0]));
    expect(buildMappedFieldRows([])).toEqual([]);
  });

  it('keeps independent list values and groups more than two fields', () => {
    const a = { ...field('servizi', 'Servizi'), value: ['Pulizia scale', 'Cortile'] };
    const b = { ...field('interventi', 'Servizi'), value: ['1S'] };
    const c = { ...field('note', 'Servizi'), value: [] as string[] };
    const rows = buildMappedFieldRows([a, b, c]);
    expect(rows.length).toBe(1);
    expect(rows[0].fields.map(item => item.value.length)).toEqual([2, 1, 0]);
  });
});


@Component({
  standalone: true,
  template: '',
  styleUrls: ['../../bootstrap.scss'],
  encapsulation: ViewEncapsulation.None,
})
class LayoutBootstrapStyles {}

describe('Configured row responsive layout', () => {
  let host: HTMLDivElement;
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [LayoutBootstrapStyles] }).compileComponents();
    TestBed.createComponent(LayoutBootstrapStyles).detectChanges();
    host = document.createElement('div');
    host.style.cssText = 'width: 680px; max-width: calc(100vw - 40px); margin: 20px;';
    document.body.appendChild(host);
  });
  afterEach(() => host.remove());

  it('uses adjacent equal columns on desktop and stacks them on mobile', () => {
    host.innerHTML = `<div class="row g-3"><div class="mapped-field-row mapped-field-row-grouped">
      <div class="col-md-6">Servizi: pulizia scale</div>
      <div class="col-md-6">Interventi: 1S</div>
    </div></div>`;
    const group = host.querySelector('.mapped-field-row') as HTMLElement;
    const a = group.children[0].getBoundingClientRect();
    const b = group.children[1].getBoundingClientRect();
    if (window.innerWidth > 700) {
      expect(Math.abs(a.top - b.top)).toBeLessThan(1);
      expect(b.left).toBeGreaterThan(a.right);
      expect(Math.abs(a.width - b.width)).toBeLessThan(1);
    } else {
      expect(b.top).toBeGreaterThan(a.bottom);
      expect(Math.abs(a.left - b.left)).toBeLessThan(1);
    }
    expect(b.right).toBeLessThanOrEqual(group.getBoundingClientRect().right + 1);
  });

  it('preserves the Bootstrap column widths and gutters for ungrouped fields', () => {
    host.innerHTML = `<div class="row g-3" id="baseline"><div class="col-md-6">A</div><div class="col-md-6">B</div></div>
      <div class="row g-3" id="configured">
        <div class="mapped-field-row row"><div class="col-md-6">A</div></div>
        <div class="mapped-field-row row"><div class="col-md-6">B</div></div>
      </div>`;
    const baseline = Array.from(host.querySelectorAll('#baseline .col-md-6')) as HTMLElement[];
    const configured = Array.from(host.querySelectorAll('#configured .col-md-6')) as HTMLElement[];
    configured.forEach((cell, index) => {
      const expected = baseline[index];
      expect(Math.abs(cell.getBoundingClientRect().width - expected.getBoundingClientRect().width)).toBeLessThan(1);
      expect(Math.abs(cell.getBoundingClientRect().left - expected.getBoundingClientRect().left)).toBeLessThan(1);
      expect(getComputedStyle(cell).paddingLeft).toBe(getComputedStyle(expected).paddingLeft);
    });
  });
});


describe('Linked list values', () => {
  const fields = [field('servizi', 'Lavori'), field('interventi', 'Lavori')];
  const stored = [['Scale', 'Cortile'], ['1S']];
  const read = (item: LayoutField) => stored[fields.indexOf(item)];
  it('keeps every existing value and pads missing cells without changing stored arrays', () => {
    expect(linkedFieldValues(fields, read)).toEqual([['Scale', 'Cortile'], ['1S', '']]);
    expect(stored).toEqual([['Scale', 'Cortile'], ['1S']]);
  });
  it('adds and removes a complete row across all fields', () => {
    expect(changeLinkedValues(fields, read, 'add')).toEqual([['Scale', 'Cortile', ''], ['1S', '', '']]);
    expect(changeLinkedValues(fields, read, 'remove', 0)).toEqual([['Cortile'], ['']]);
  });
  it('fills a missing cell without shifting the associated service', () => {
    expect(changeLinkedValues(fields, read, 'update', 1, 1, '2S')).toEqual([['Scale', 'Cortile'], ['1S', '2S']]);
  });
  it('keeps visual-only groups independent and requires list-compatible fields', () => {
    const row = buildMappedFieldRows(fields)[0];
    expect(isLinkedFieldRow(row, () => true)).toBeFalse();
    const linked = buildMappedFieldRows(fields.map(item => ({...item, rowLayout: 'linked'})))[0];
    expect(isLinkedFieldRow(linked, () => true)).toBeTrue();
    expect(isLinkedFieldRow(linked, item => item.key !== 'interventi')).toBeFalse();
  });
});
