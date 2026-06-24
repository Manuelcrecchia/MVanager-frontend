import { HttpClient } from '@angular/common/http';
import { Component, HostListener } from '@angular/core';
import { Router } from '@angular/router';
import { Location } from '@angular/common';
import { GlobalService } from '../../service/global.service';
import { TenantFieldMappingFieldConfig } from '../../service/global.service';
import { QuoteModelService } from '../../service/quote-model.service';
import { PopupServiceService } from '../../componenti/popup/popup-service.service';
import {
  MappedFieldValidationError,
  mappedFieldKey,
  validateMappedFields,
} from '../mapped-field-validation';

interface QuoteRoom {
  id: number;
  nome: string;
  tipoPreventivo: string;
  fieldKey: string;
}

interface QuotePhrase {
  id: number;
  testo: string;
  roomId: number | null;
  fieldKey: string;
  quoteType: string;
  position: number;
}

interface QuoteFieldSection {
  key: string;
  label: string;
  fields: TenantFieldMappingFieldConfig[];
}

@Component({
  selector: 'app-add-quote',
  templateUrl: './add-quote.component.html',
  styleUrls: ['./add-quote.component.css'],
})
export class AddQuoteComponent {
  quoteRooms: QuoteRoom[] = [];
  quotePhrases: QuotePhrase[] = [];
  selectedObjectPhraseByRow: Record<string, number | null> = {};
  selectedPhraseByField: Record<string, number | null> = {};
  selectedRoomByField: Record<string, number | null> = {};
  selectedRoomTextByField: Record<string, string> = {};
  visibleQuoteFields: TenantFieldMappingFieldConfig[] = [];
  visibleQuoteSections: QuoteFieldSection[] = [];
  validationErrors: Record<string, string> = {};

  constructor(
    public globalService: GlobalService,
    public quoteModelService: QuoteModelService,
    private http: HttpClient,
    private router: Router,
    private popup: PopupServiceService,
    private location: Location,
  ) {}

  ngOnInit() {
    this.globalService
      .loadTenantConfig(false, { showError: false })
      .then(() => {
        this.globalService.applyFieldDefaults(
          'quote',
          this.quoteModelService as unknown as Record<string, any>,
        );
        this.globalService.applyCalculatedFields(
          'quote',
          this.quoteModelService as unknown as Record<string, any>,
        );
        this.refreshVisibleQuoteFields();
        this.loadQuoteRooms();
        this.loadQuotePhrases();
      });
  }

  addQuote() {
    const source = this.quoteModelService as unknown as Record<string, any>;
    this.validationErrors = {};
    const missingFields = this.globalService.getMissingRequiredFields('quote', source);
    if (missingFields.length) {
      this.popup.text = `COMPILA I CAMPI OBBLIGATORI: ${missingFields.join(', ')}`;
      this.popup.openPopup('Campi obbligatori', 'warning');
      return;
    }

    const formatErrors = validateMappedFields(this.visibleQuoteFields, source);
    if (formatErrors.length) {
      this.showValidationErrors(formatErrors);
      return;
    }

    const body = this.globalService.applyFieldMappingToPayload(
      'quote',
      {
        codiceOperatore: this.globalService.userCode,
        tipoPreventivo: source['tipoPreventivo'] || this.globalService.getDefaultQuoteType(''),
        data: source['data'] || '',
      },
      source,
    );

    this.http
      .post(this.globalService.url + 'quotes/add', body, {
        headers: this.globalService.headers,
        responseType: 'text',
      })
      .subscribe({
        next: () => {
          this.quoteModelService.resetQuoteModel();
          this.router.navigateByUrl('/quotesHome', { replaceUrl: true });
        },
        error: (err) => {
          this.popup.text = this.parseError(err).toUpperCase();
          this.popup.openPopup();
        },
      });
  }

  updateField(field: TenantFieldMappingFieldConfig, value: any): void {
    const target = this.quoteModelService as unknown as Record<string, any>;
    target[field.dbColumn] = value;
    if (field.key && field.key !== field.dbColumn) {
      target[field.key] = value;
    }
    this.globalService.clearHiddenFieldValues('quote', target);
    this.globalService.applyFieldDefaults('quote', target);
    this.globalService.applyCalculatedFields('quote', target);
    this.quoteModelService = Object.assign(this.quoteModelService, target);
    delete this.validationErrors[mappedFieldKey(field)];
    this.refreshVisibleQuoteFields();
  }

  getFieldError(field: TenantFieldMappingFieldConfig): string {
    return this.validationErrors[mappedFieldKey(field)] || '';
  }

  private showValidationErrors(errors: MappedFieldValidationError[]): void {
    this.validationErrors = errors.reduce<Record<string, string>>((acc, error) => {
      acc[error.fieldKey] = error.message;
      return acc;
    }, {});
    this.popup.text = errors
      .map((error) => `${error.label}: ${error.message}`)
      .join('\n')
      .toUpperCase();
    this.popup.openPopup('Correggi i campi', 'warning');
  }

  refreshVisibleQuoteFields(): void {
    this.visibleQuoteFields = this.globalService.getVisibleFieldMappingFields(
      'quote',
      this.quoteModelService as unknown as Record<string, any>,
    );
    this.visibleQuoteSections = this.groupQuoteFieldsBySection(this.visibleQuoteFields);
  }

  private groupQuoteFieldsBySection(fields: TenantFieldMappingFieldConfig[]): QuoteFieldSection[] {
    const sections = new Map<string, QuoteFieldSection>();

    fields.forEach((field) => {
      const sectionName = String(field.section || 'generale').trim() || 'generale';
      const sectionKey = this.normalizeSectionKey(sectionName);
      if (!sections.has(sectionKey)) {
        sections.set(sectionKey, {
          key: sectionKey,
          label: this.formatSectionLabel(sectionName),
          fields: [],
        });
      }
      sections.get(sectionKey)?.fields.push(field);
    });

    return Array.from(sections.values());
  }

  private normalizeSectionKey(value: string): string {
    return String(value || 'generale')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'generale';
  }

  private formatSectionLabel(value: string): string {
    const cleaned = String(value || 'generale')
      .trim()
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ');
    return cleaned
      .split(' ')
      .map((word) => word ? word.charAt(0).toUpperCase() + word.slice(1) : '')
      .join(' ') || 'Generale';
  }

  isWideQuoteField(field: TenantFieldMappingFieldConfig): boolean {
    const type = String(field?.type || '').trim().toLowerCase();
    const role = String(field?.displayRole || '').trim();
    return role === 'quoteRooms' || ['textarea', 'list', 'json'].includes(type);
  }

  getEditableFieldType(field: TenantFieldMappingFieldConfig): string {
    const type = String(field?.type || '').trim().toLowerCase();
    if (type === 'json' && (this.isLegacyServicesField(field) || this.hasRepeatableOptions(field))) {
      return 'list';
    }
    return type;
  }

  trackByQuoteSection(_: number, section: QuoteFieldSection): string {
    return section.key;
  }

  trackByQuoteField(index: number, field: TenantFieldMappingFieldConfig): string {
    return String(field?.dbColumn || field?.key || index);
  }

  loadQuoteRooms(): void {
    this.http
      .get<QuoteRoom[]>(this.globalService.url + 'admin/quote-settings/rooms', {
        headers: this.globalService.headers,
      })
      .subscribe({
        next: (rooms) => {
          this.quoteRooms = rooms || [];
        },
        error: (err) => {
          console.error('Errore caricamento gruppi preventivo:', err);
          this.quoteRooms = [];
        },
      });
  }

  loadQuotePhrases(): void {
    this.http
      .get<QuotePhrase[]>(this.globalService.url + 'admin/quote-settings/phrases', {
        headers: this.globalService.headers,
      })
      .subscribe({
        next: (phrases) => {
          this.quotePhrases = phrases || [];
        },
        error: (err) => {
          console.error('Errore caricamento frasi preventivo:', err);
          this.quotePhrases = [];
        },
      });
  }

  getCurrentQuoteType(): string {
    const source = this.quoteModelService as unknown as Record<string, any>;
    return String(
      this.globalService.getRecordValueByRole('quote', source, 'quoteType') ||
      source['tipoPreventivo'] ||
      this.globalService.getDefaultQuoteType(''),
    ).trim();
  }

  getRoomsForCurrentQuoteType(field?: { dbColumn: string; key?: string }): QuoteRoom[] {
    const normalizedQuoteType = this.getCurrentQuoteType().toLowerCase();
    const fieldKeys = [
      String(field?.key || '').trim().toLowerCase(),
      String(field?.dbColumn || '').trim().toLowerCase(),
    ].filter(Boolean);
    return this.quoteRooms.filter((room) => (
      this.quoteTypeMatches(room.tipoPreventivo, normalizedQuoteType) &&
      (
        !fieldKeys.length ||
        !String(room.fieldKey || '').trim() ||
        fieldKeys.includes(String(room.fieldKey || '').trim().toLowerCase())
      )
    ));
  }

  getPhrasePresetsForField(field: { dbColumn: string; key?: string }): QuotePhrase[] {
    const normalizedQuoteType = this.getCurrentQuoteType().toLowerCase();

    return this.quotePhrases.filter((phrase) => {
      const phraseType = String(phrase.quoteType || '').trim().toLowerCase();
      return this.matchesPhraseField(field, phrase) &&
        (!phraseType || phraseType === normalizedQuoteType);
    });
  }

  getListOptionsForField(field: TenantFieldMappingFieldConfig): string[] {
    return Array.from(new Set([
      ...this.globalService.getEnumOptions(field),
      ...this.getPhrasePresetsForField(field).map((phrase) => phrase.testo),
    ].map((value) => String(value || '').trim()).filter(Boolean)));
  }

  private hasRepeatableOptions(field: TenantFieldMappingFieldConfig): boolean {
    return this.globalService.getEnumOptions(field).length > 0 || this.hasPhrasePresets(field);
  }

  hasPhrasePresets(field: { dbColumn: string; key?: string }): boolean {
    return this.getPhrasePresetsForField(field).length > 0;
  }

  shouldShowStandalonePhrasePreset(field: TenantFieldMappingFieldConfig): boolean {
    return !this.globalService.isCalculatedField(field) &&
      this.getEditableFieldType(field) !== 'list' &&
      !this.isLegacyServicesField(field) &&
      this.hasPhrasePresets(field);
  }

  applyPhrasePreset(field: TenantFieldMappingFieldConfig): void {
    const selectedId = this.selectedPhraseByField[field.dbColumn];
    const phrase = this.getPhrasePresetsForField(field).find((item) => item.id === Number(selectedId));
    if (!phrase) return;

    if (field.type === 'list') {
      this.setRepeatableTextRows(field, [...this.getRepeatableTextRows(field), phrase.testo]);
    } else {
      this.updateField(field, phrase.testo);
    }

    this.selectedPhraseByField[field.dbColumn] = null;
  }

  getRepeatableRoomRows(field: { dbColumn: string; key?: string }): any[] {
    const source = this.quoteModelService as unknown as Record<string, any>;
    const rawValue = source[field.dbColumn] ?? (field.key ? source[field.key] : undefined);
    if (Array.isArray(rawValue)) return rawValue;
    if (typeof rawValue === 'string' && rawValue.trim()) {
      try {
        const parsed = JSON.parse(rawValue);
        const rows = Array.isArray(parsed) ? parsed : [];
        this.setRepeatableRoomRows(field, rows);
        return rows;
      } catch {
        return [];
      }
    }
    return [];
  }

  addRoomRow(field: { dbColumn: string; key?: string }): void {
    const roomText = String(this.selectedRoomTextByField[field.dbColumn] || '').trim();
    const room = this.findRoomByTypedText(field, roomText);
    if (!roomText) {
      this.popup.text = 'SCRIVI O SCEGLI UN GRUPPO DA AGGIUNGERE';
      this.popup.openPopup('Gruppo mancante', 'warning');
      return;
    }

    this.setRepeatableRoomRows(field, [
      ...this.getRepeatableRoomRows(field),
      { stanza: room?.nome || roomText, roomId: room?.id || null, oggetti: '' },
    ]);
    this.selectedRoomByField[field.dbColumn] = null;
    this.selectedRoomTextByField[field.dbColumn] = '';
  }

  updateSelectedRoomText(field: { dbColumn: string; key?: string }, value: string): void {
    this.selectedRoomTextByField[field.dbColumn] = value;
    const room = this.findRoomByTypedText(field, value);
    this.selectedRoomByField[field.dbColumn] = room?.id || null;
  }

  private findRoomByTypedText(field: { dbColumn: string; key?: string }, value: string): QuoteRoom | undefined {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return undefined;
    return this.getRoomsForCurrentQuoteType(field).find((room) => (
      String(room.nome || '').trim().toLowerCase() === normalized
    ));
  }

  removeRoomRow(field: { dbColumn: string; key?: string }, index: number): void {
    this.setRepeatableRoomRows(
      field,
      this.getRepeatableRoomRows(field).filter((_, rowIndex) => rowIndex !== index),
    );
  }

  updateRoomRow(field: { dbColumn: string; key?: string }, index: number, key: string, value: string): void {
    const rows = this.getRepeatableRoomRows(field).map((row, rowIndex) => (
      rowIndex === index ? { ...row, [key]: value } : row
    ));
    this.setRepeatableRoomRows(field, rows);
  }

  getObjectPhrasesForRoom(row: any): QuotePhrase[] {
    const roomId = this.getRoomIdForRow(row);
    if (!roomId) return [];
    const normalizedQuoteType = this.getCurrentQuoteType().toLowerCase();
    return this.quotePhrases.filter((phrase) => (
      Number(phrase.roomId || 0) === roomId &&
      (!phrase.quoteType || String(phrase.quoteType).trim().toLowerCase() === normalizedQuoteType)
    ));
  }

  private getRoomIdForRow(row: any): number {
    const explicitId = Number(row?.roomId || 0);
    if (explicitId) return explicitId;
    const roomName = String(row?.stanza || '').trim().toLowerCase();
    const room = this.quoteRooms.find((item) => (
      String(item.nome || '').trim().toLowerCase() === roomName &&
      this.quoteTypeMatches(item.tipoPreventivo, this.getCurrentQuoteType())
    ));
    return Number(room?.id || 0);
  }

  getRoomDisplayName(row: any): string {
    const explicitId = Number(row?.roomId || 0);
    if (explicitId) {
      const room = this.quoteRooms.find((item) => Number(item.id || 0) === explicitId);
      if (room?.nome) return room.nome;
    }
    return String(row?.stanza || '').trim();
  }

  private quoteTypeMatches(roomType: string, currentType: string): boolean {
    const room = String(roomType || '').trim().toLowerCase();
    const current = String(currentType || '').trim().toLowerCase();
    return room === current || (current === 'a' && room === 'r');
  }

  getRoomRowKey(field: { dbColumn: string; key?: string }, index: number): string {
    return `${field.dbColumn || field.key || 'field'}_${index}`;
  }

  appendObjectPhrase(field: { dbColumn: string; key?: string }, index: number): void {
    const row = this.getRepeatableRoomRows(field)[index];
    const rowKey = this.getRoomRowKey(field, index);
    const selectedId = this.selectedObjectPhraseByRow[rowKey];
    const phrase = this.getObjectPhrasesForRoom(row).find((item) => item.id === Number(selectedId));
    if (!phrase) return;

    const current = String(row?.oggetti || '').trim();
    const next = current ? `${current}\n${phrase.testo}` : phrase.testo;
    this.updateRoomRow(field, index, 'oggetti', next);
    this.selectedObjectPhraseByRow[rowKey] = null;
  }

  private setRepeatableRoomRows(field: { dbColumn: string; key?: string }, rows: any[]): void {
    const target = this.quoteModelService as unknown as Record<string, any>;
    target[field.dbColumn] = rows;
    if (field.key && field.key !== field.dbColumn) {
      target[field.key] = rows;
    }
    this.globalService.applyCalculatedFields('quote', target);
  }

  getRepeatableTextRows(field: { dbColumn: string; key?: string }): string[] {
    const source = this.quoteModelService as unknown as Record<string, any>;
    const rawValue = source[field.dbColumn] ?? (field.key ? source[field.key] : undefined);
    if (Array.isArray(rawValue)) {
      if (rawValue.every((row) => typeof row === 'string')) {
        return rawValue;
      }
      const rows = rawValue.map((row) => String(row ?? ''));
      this.setRepeatableTextRows(field, rows);
      return rows;
    }
    if (typeof rawValue === 'string' && rawValue.trim()) {
      try {
        const parsed = JSON.parse(rawValue);
        if (Array.isArray(parsed)) {
          const rows = parsed.map((row) => String(row ?? ''));
          this.setRepeatableTextRows(field, rows);
          return rows;
        }
      } catch {}
      const rows = [rawValue];
      this.setRepeatableTextRows(field, rows);
      return rows;
    }
    return [];
  }

  addTextRow(field: { dbColumn: string; key?: string }): void {
    this.setRepeatableTextRows(field, [...this.getRepeatableTextRows(field), '']);
  }

  removeTextRow(field: { dbColumn: string; key?: string }, index: number): void {
    this.setRepeatableTextRows(
      field,
      this.getRepeatableTextRows(field).filter((_, rowIndex) => rowIndex !== index),
    );
  }

  updateTextRow(field: { dbColumn: string; key?: string }, index: number, value: string): void {
    const rows = this.getRepeatableTextRows(field).map((row, rowIndex) => (
      rowIndex === index ? value : row
    ));
    this.setRepeatableTextRows(field, rows);
  }

  trackByTextRowIndex(index: number): number {
    return index;
  }

  trackByRoomRow(index: number, row: any): string {
    return String(row?.roomId || row?.stanza || index);
  }

  private matchesPhraseField(field: { dbColumn: string; key?: string; label?: string; section?: string; pdfFieldKey?: string; displayRole?: string }, phrase: QuotePhrase): boolean {
    const phraseField = this.normalizePhraseFieldKey(phrase.fieldKey);
    if (!phraseField) {
      return this.isLegacyServicesField(field);
    }

    return this.getPhraseFieldCandidates(field).includes(phraseField);
  }

  private getPhraseFieldCandidates(field: { dbColumn: string; key?: string; label?: string; section?: string; pdfFieldKey?: string; displayRole?: string }): string[] {
    return [
      field.key,
      field.dbColumn,
      field.label,
      field.pdfFieldKey,
      field.displayRole,
    ].map((value) => this.normalizePhraseFieldKey(value)).filter(Boolean);
  }

  private isLegacyServicesField(field: { dbColumn: string; key?: string; label?: string; section?: string }): boolean {
    return [
      field.key,
      field.dbColumn,
      field.label,
      field.section,
    ].some((value) => this.normalizePhraseFieldKey(value).includes('servizi'));
  }

  private normalizePhraseFieldKey(value: unknown): string {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');
  }

  private setRepeatableTextRows(field: { dbColumn: string; key?: string }, rows: string[]): void {
    const target = this.quoteModelService as unknown as Record<string, any>;
    target[field.dbColumn] = rows;
    if (field.key && field.key !== field.dbColumn) {
      target[field.key] = rows;
    }
    this.globalService.clearHiddenFieldValues('quote', target);
    this.globalService.applyCalculatedFields('quote', target);
  }

  back() {
    this.quoteModelService.resetQuoteModel();
    this.router.navigateByUrl('/quotesHome');
  }

  @HostListener('window:popstate', ['$event'])
  onBrowserBackBtnClose(event: Event): void {
    event.preventDefault();
    this.quoteModelService.resetQuoteModel();
    this.location.replaceState('/quotesHome');
    this.router.navigateByUrl('/quotesHome');
  }

  private parseError(err: any): string {
    if (err?.error) {
      if (typeof err.error === 'string') {
        try {
          return JSON.parse(err.error)?.error || err.error;
        } catch {
          return err.error;
        }
      }
      return err.error?.error || 'Errore durante il salvataggio del preventivo';
    }
    return 'Errore durante il salvataggio del preventivo';
  }
}
