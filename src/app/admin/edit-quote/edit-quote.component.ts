import { HttpClient } from '@angular/common/http';
import { Component, HostListener } from '@angular/core';
import { Router } from '@angular/router';
import { Location } from '@angular/common';
import { GlobalService } from '../../service/global.service';
import { TenantFieldMappingFieldConfig } from '../../service/global.service';
import { QuoteModelService } from '../../service/quote-model.service';
import { PopupServiceService } from '../../componenti/popup/popup-service.service';

interface QuoteRoom {
  id: number;
  nome: string;
  tipoPreventivo: string;
}

@Component({
  selector: 'app-edit-quote',
  templateUrl: './edit-quote.component.html',
  styleUrls: ['./edit-quote.component.css'],
})
export class EditQuoteComponent {
  quoteRooms: QuoteRoom[] = [];
  selectedRoomByField: Record<string, number | null> = {};
  visibleQuoteFields: TenantFieldMappingFieldConfig[] = [];

  constructor(
    public quoteModelService: QuoteModelService,
    public globalService: GlobalService,
    private http: HttpClient,
    private router: Router,
    private popup: PopupServiceService,
    private location: Location,
  ) {}

  ngOnInit() {
    this.globalService.loadTenantConfig(true, { showError: false }).then(() => {
      this.refreshVisibleQuoteFields();
      this.loadQuoteRooms();
    });
  }

  editQuote() {
    const source = this.quoteModelService as unknown as Record<string, any>;
    const missingFields = this.globalService.getMissingRequiredFields('quote', source);
    if (missingFields.length) {
      this.popup.text = `COMPILA I CAMPI OBBLIGATORI: ${missingFields.join(', ')}`;
      this.popup.openPopup('Campi obbligatori', 'warning');
      return;
    }

    const body = this.globalService.applyFieldMappingToPayload(
      'quote',
      {
        numeroPreventivo: source['numeroPreventivo'],
        codiceOperatore: source['codiceOperatore'] || this.globalService.userCode,
        tipoPreventivo: source['tipoPreventivo'] || this.globalService.getDefaultQuoteType(''),
        data: source['data'] || '',
      },
      source,
    );

    this.http
      .post(this.globalService.url + 'quotes/edit', body, {
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

  updateField(field: { dbColumn: string; key?: string }, value: any): void {
    const target = this.quoteModelService as unknown as Record<string, any>;
    target[field.dbColumn] = value;
    if (field.key && field.key !== field.dbColumn) {
      target[field.key] = value;
    }
    this.globalService.clearHiddenFieldValues('quote', target);
    this.globalService.applyFieldDefaults('quote', target);
    this.quoteModelService = Object.assign(this.quoteModelService, target);
    this.refreshVisibleQuoteFields();
  }

  refreshVisibleQuoteFields(): void {
    this.visibleQuoteFields = this.globalService.getVisibleFieldMappingFields(
      'quote',
      this.quoteModelService as unknown as Record<string, any>,
    );
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
          console.error('Errore caricamento stanze preventivo:', err);
          this.quoteRooms = [];
        },
      });
  }

  getRoomsForCurrentQuoteType(): QuoteRoom[] {
    const source = this.quoteModelService as unknown as Record<string, any>;
    const quoteType =
      this.globalService.getRecordValueByRole('quote', source, 'quoteType') ||
      source['tipoPreventivo'] ||
      this.globalService.getDefaultQuoteType('');
    const normalizedQuoteType = String(quoteType || '').trim().toLowerCase();
    return this.quoteRooms.filter((room) => (
      String(room.tipoPreventivo || '').trim().toLowerCase() === normalizedQuoteType
    ));
  }

  getRepeatableRoomRows(field: { dbColumn: string; key?: string }): any[] {
    const source = this.quoteModelService as unknown as Record<string, any>;
    const rawValue = source[field.dbColumn] ?? (field.key ? source[field.key] : undefined);
    if (Array.isArray(rawValue)) return rawValue;
    if (typeof rawValue === 'string' && rawValue.trim()) {
      try {
        const parsed = JSON.parse(rawValue);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  }

  addRoomRow(field: { dbColumn: string; key?: string }): void {
    const selectedId = this.selectedRoomByField[field.dbColumn];
    const room = this.quoteRooms.find((item) => item.id === Number(selectedId));
    if (!room) {
      this.popup.text = 'SELEZIONA UNA STANZA DA AGGIUNGERE';
      this.popup.openPopup('Stanza mancante', 'warning');
      return;
    }

    this.setRepeatableRoomRows(field, [
      ...this.getRepeatableRoomRows(field),
      { stanza: room.nome, oggetti: '' },
    ]);
    this.selectedRoomByField[field.dbColumn] = null;
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

  private setRepeatableRoomRows(field: { dbColumn: string; key?: string }, rows: any[]): void {
    const target = this.quoteModelService as unknown as Record<string, any>;
    target[field.dbColumn] = rows;
    if (field.key && field.key !== field.dbColumn) {
      target[field.key] = rows;
    }
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
      return err.error?.error || 'Errore durante il salvataggio delle modifiche';
    }
    return 'Errore durante il salvataggio delle modifiche';
  }
}
