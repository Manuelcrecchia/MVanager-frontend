import { HttpClient } from '@angular/common/http';
import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { GlobalService } from '../../service/global.service';
import { CustomerModelService } from '../../service/customer-model.service';
import { PopupServiceService } from '../../componenti/popup/popup-service.service';
import { AutomaticAddInspectionToCalendarService } from '../../service/automatic-add-inspection-to-calendar.service';
import { TenantFieldMappingFieldConfig } from '../../service/global.service';

@Component({
  selector: 'app-add-customer',
  templateUrl: './add-customer.component.html',
  styleUrl: './add-customer.component.css',
})
export class AddCustomerComponent {
  constructor(
    public globalService: GlobalService,
    public customerModelService: CustomerModelService,
    private http: HttpClient,
    private router: Router,
    private popup: PopupServiceService,
    private autoInspectionService: AutomaticAddInspectionToCalendarService,
  ) {}

  ngOnInit(): void {
    this.globalService.loadTenantConfig(false, { showError: false });
  }

  updateField(field: TenantFieldMappingFieldConfig, value: any): void {
    const target = this.customerModelService as unknown as Record<string, any>;
    target[field.dbColumn] = value;
    if (field.key && field.key !== field.dbColumn) {
      target[field.key] = value;
    }
  }

  getRepeatableTextRows(field: { dbColumn: string; key?: string }): string[] {
    const source = this.customerModelService as unknown as Record<string, any>;
    const rawValue = source[field.dbColumn] ?? (field.key ? source[field.key] : undefined);
    if (Array.isArray(rawValue)) {
      return rawValue.map((row) => String(row ?? ''));
    }
    if (typeof rawValue === 'string' && rawValue.trim()) {
      try {
        const parsed = JSON.parse(rawValue);
        if (Array.isArray(parsed)) {
          return parsed.map((row) => String(row ?? ''));
        }
      } catch {}
      return [rawValue];
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

  private setRepeatableTextRows(field: { dbColumn: string; key?: string }, rows: string[]): void {
    const target = this.customerModelService as unknown as Record<string, any>;
    target[field.dbColumn] = rows;
    if (field.key && field.key !== field.dbColumn) {
      target[field.key] = rows;
    }
  }

  addCustomer(): void {
    const source = this.customerModelService as unknown as Record<string, any>;
    const missingFields = this.globalService.getMissingRequiredFields('customer', source);
    if (missingFields.length) {
      this.popup.show(
        `Compila i campi obbligatori: ${missingFields.join(', ')}`,
        'Campi obbligatori',
      );
      return;
    }

    const body = this.globalService.applyFieldMappingToPayload(
      'customer',
      {
        codiceOperatore: this.globalService.userCode,
        numeroCliente: source['numeroCliente'] || source['numeroPreventivo'] || undefined,
        tipoCliente: source['tipoCliente'] ||
          source['tipoPreventivo'] ||
          this.globalService.getDefaultQuoteType(''),
        data: source['data'] || '',
      },
      source,
    );

    const numeroPreventivo = source['numeroPreventivo'];
    const sourceCustomerType = String(
      source['tipoCliente'] ||
        source['tipoPreventivo'] ||
        this.globalService.getDefaultQuoteType(''),
    ).trim();
    const sourceCustomerName = this.globalService.getRecordDisplayName('customer', source);
    const sourceCustomerPhone = String(
      this.globalService.getRecordValueByRole('customer', source, 'customerPhone') || '',
    );
    const sourceCustomerEmail = String(
      this.globalService.getRecordValueByRole('customer', source, 'customerEmail') || '',
    );

    this.http
      .post<{
        message: string;
        numeroCliente: string;
        signedQuoteArchived?: boolean;
        signedQuoteArchivePath?: string | null;
        signedQuoteArchiveError?: string | null;
      }>(this.globalService.url + 'customers/add', body, { headers: this.globalService.headers })
      .subscribe({
        next: (res) => {
          const numeroCliente = res?.numeroCliente;
          const finalizeCustomerCreation = () => {
            if (res?.signedQuoteArchiveError) {
              this.popup.showError(
                `Cliente creato, ma non siamo riusciti ad archiviare il preventivo firmato: ${res.signedQuoteArchiveError}`,
                'Archiviazione preventivo',
              );
            } else if (res?.signedQuoteArchived) {
              this.popup.show(
                `Cliente creato e preventivo firmato archiviato in Documenti cliente > ${res.signedQuoteArchivePath || 'Preventivi Firmati'}`,
                'Cliente creato',
                'success',
              );
            }

            if (numeroPreventivo && numeroCliente && this.globalService.canCreateCalendarEvents()) {
              const customerEventCategory =
                this.globalService.getCustomerLinkedAppointmentCategory(sourceCustomerType);
              if (!customerEventCategory) {
                this.router.navigateByUrl('/listCustomer', { replaceUrl: true });
                return;
              }
              this.autoInspectionService.pendingCustomerEvent = true;
              this.autoInspectionService.numeroCliente = numeroCliente;
              this.autoInspectionService.customerType = sourceCustomerType;
              this.autoInspectionService.customerEventCategory = customerEventCategory;
              this.autoInspectionService.displayName = sourceCustomerName;
              this.autoInspectionService.telefono = sourceCustomerPhone;
              this.autoInspectionService.customerEventDescription = [
                sourceCustomerName ? `Cliente ${sourceCustomerName}` : '',
                sourceCustomerPhone ? `Telefono: ${sourceCustomerPhone}` : '',
                sourceCustomerEmail ? `Email: ${sourceCustomerEmail}` : '',
              ].filter(Boolean).join('   ');
              this.router.navigateByUrl('/homeAdmin/calendarHome', { replaceUrl: true });
              return;
            }

            this.router.navigateByUrl('/listCustomer', { replaceUrl: true });
          };

          this.customerModelService.reset();

          if (numeroPreventivo && numeroCliente) {
            this.http
              .post(
                this.globalService.url + 'customers/notes/copyFromQuote',
                { numeroPreventivo, numeroCliente },
                { headers: this.globalService.headers },
              )
              .subscribe({
                next: () => finalizeCustomerCreation(),
                error: () => finalizeCustomerCreation(),
              });
          } else {
            finalizeCustomerCreation();
          }
        },
        error: (err) => {
          this.popup.showError(this.parseServerError(err));
        },
      });
  }

  back() {
    this.customerModelService.reset();
    this.router.navigateByUrl('/listCustomer');
  }

  private parseServerError(err: any): string {
    try {
      const body =
        typeof err.error === 'string' ? JSON.parse(err.error) : err.error;
      if (body?.error) return body.error;
    } catch {}
    if (err.status === 0) return 'Impossibile connettersi al server';
    return 'Errore durante il salvataggio. Riprova.';
  }
}
