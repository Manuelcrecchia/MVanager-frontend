import { Component, HostListener } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Location } from '@angular/common';
import { CustomerModelService } from '../../service/customer-model.service';
import { GlobalService } from '../../service/global.service';
import { PopupServiceService } from '../../componenti/popup/popup-service.service';

@Component({
  selector: 'app-edit-customer',
  templateUrl: './edit-customer.component.html',
  styleUrl: './edit-customer.component.css',
})
export class EditCustomerComponent {
  constructor(
    public customerModelService: CustomerModelService,
    private http: HttpClient,
    public globalService: GlobalService,
    private router: Router,
    private location: Location,
    private popup: PopupServiceService,
  ) {}

  ngOnInit(): void {
    this.globalService.loadTenantConfig(true, { showError: false });
    const numeroCliente = this.customerModelService.numeroCliente;
    if (numeroCliente) {
      this.caricaClienteFromDb(numeroCliente);
    }
  }

  private caricaClienteFromDb(numeroCliente: string): void {
    this.http
      .post(this.globalService.url + 'customers/getCustomer', { numeroCliente }, {
        headers: this.globalService.headers,
      })
      .subscribe({
        next: (res: any) => {
          if (res && res[0]) {
            this.customerModelService.reset();
            Object.assign(this.customerModelService as any, res[0]);
          }
        },
        error: (err) => {
          console.error('Errore caricamento cliente:', err);
        },
      });
  }

  editCustomer(): void {
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
        numeroCliente: String(source['numeroCliente'] || '').trim(),
        codiceOperatore: source['codiceOperatore'] || this.globalService.userCode,
        tipoCliente: source['tipoCliente'] || '',
        data: source['data'] || '',
      },
      source,
    );

    this.http
      .post(this.globalService.url + 'customers/edit', body, {
        headers: this.globalService.headers,
        responseType: 'text',
      })
      .subscribe({
        next: () => {
          this.customerModelService.reset();
          this.router.navigateByUrl('/listCustomer');
        },
        error: (err) => {
          this.popup.showError(this.parseServerError(err));
        },
      });
  }

  back(): void {
    this.customerModelService.reset();
    this.router.navigateByUrl('/listCustomer');
  }

  private parseServerError(err: any): string {
    try {
      const body = typeof err.error === 'string' ? JSON.parse(err.error) : err.error;
      if (body?.error) return body.error;
    } catch {}
    if (err.status === 0) return 'Impossibile connettersi al server';
    return 'Errore durante il salvataggio. Riprova.';
  }

  @HostListener('window:popstate', ['$event'])
  onBrowserBackBtnClose(event: Event): void {
    event.preventDefault();
    this.customerModelService.reset();
    this.location.replaceState('/listCustomer');
    this.router.navigateByUrl('/listCustomer');
  }
}
