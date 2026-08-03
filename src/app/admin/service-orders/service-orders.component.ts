import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { PopupServiceService } from '../../componenti/popup/popup-service.service';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { GlobalService } from '../../service/global.service';
import { AutomaticAddInspectionToCalendarService } from '../../service/automatic-add-inspection-to-calendar.service';

@Component({
  selector: 'app-service-orders',
  templateUrl: './service-orders.component.html',
  styleUrls: ['./service-orders.component.css'],
})
export class ServiceOrdersComponent implements OnInit, OnDestroy {
  orders: any[] = [];
  search = '';
  loading = false;
  generatingSignatureId = 0;
  showArchived = false;
  private openOrders = new Set<number>();
  private refreshTimer?: ReturnType<typeof setInterval>;
  private loadInFlight = false;

  constructor(
    private http: HttpClient,
    private router: Router,
    public global: GlobalService,
    private appDialog: PopupServiceService,
    private calendarDraft: AutomaticAddInspectionToCalendarService,
  ) {}

  ngOnInit(): void {
    this.loadOrders();
    this.refreshTimer = setInterval(() => {
      if (document.visibilityState === 'visible') this.loadOrders(true);
    }, 30000);
  }

  ngOnDestroy(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
  }

  @HostListener('window:focus')
  refreshWhenWindowRegainsFocus(): void {
    this.loadOrders(true);
  }

  loadOrders(silent = false): void {
    if (this.loadInFlight) return;
    this.loadInFlight = true;
    if (!silent) this.loading = true;
    const params: string[] = [];
    if (this.search.trim()) params.push(`q=${encodeURIComponent(this.search.trim())}`);
    if (this.showArchived) params.push('includeArchived=true');
    const url = this.global.url + `service-orders${params.length ? `?${params.join('&')}` : ''}`;

    this.http.get<any[]>(url).subscribe({
      next: (orders) => {
        this.orders = orders || [];
        this.loadInFlight = false;
        this.loading = false;
      },
      error: (err) => {
        console.error('Errore caricamento ordini di servizio:', err);
        this.loadInFlight = false;
        this.loading = false;
        if (!silent) alert('Errore nel caricamento degli ordini di servizio.');
      },
    });
  }

  addOrder(): void {
    this.router.navigateByUrl('/homeAdmin/service-orders/add');
  }

  editOrder(orderId: number): void {
    this.router.navigate(['/homeAdmin', 'service-orders', 'edit', orderId]);
  }

  toggleShowArchived(): void {
    this.showArchived = !this.showArchived;
    this.openOrders.clear();
    this.loadOrders();
  }

  toggleOrder(orderId: number): void {
    if (this.openOrders.has(orderId)) this.openOrders.delete(orderId);
    else this.openOrders.add(orderId);
  }

  isOrderOpen(orderId: number): boolean {
    return this.openOrders.has(Number(orderId));
  }

  openOrderSheet(order: any): void {
    this.router.navigate(['/homeAdmin/service-orders/view', order.id]);
  }

  openCustomerNotes(order: any): void {
    this.router.navigate(['/homeAdmin/customerNotes'], {
      queryParams: {
        numeroCliente: order.numeroCliente,
        displayName: this.customerName(order),
        returnTo: '/homeAdmin/service-orders',
      },
    });
  }

  canUseCalendar(order: any): boolean {
    if (!this.global.hasTenantFeature('calendar')) return false;
    if (order?.appointmentId) return this.global.hasPermission('CALENDAR_VIEW');
    return order?.status !== 'ARCHIVED' &&
      this.global.hasPermission('CALENDAR_EVENT_MANAGE') &&
      this.global.hasPermission('SERVICE_ORDERS_MANAGE');
  }

  calendarTooltip(order: any): string {
    return order?.appointmentId ? 'Apri nel calendario' : 'Crea appuntamento';
  }

  openOrCreateCalendarEvent(order: any): void {
    if (!this.canUseCalendar(order)) return;
    if (order?.appointmentId) {
      this.router.navigate(['/homeAdmin/calendarHome'], {
        queryParams: { appointmentId: order.appointmentId },
      });
      return;
    }

    const category = this.global.getAppointmentCategoryDetails()
      .find((item) => item?.serviceOrder === true)?.key || '';
    if (!category) {
      this.appDialog.showError('Categoria calendario per gli ordini di servizio non configurata in MVControl.');
      return;
    }

    this.calendarDraft.pendingCustomerEvent = true;
    this.calendarDraft.pendingServiceOrderEvent = true;
    this.calendarDraft.serviceOrderId = Number(order.id);
    this.calendarDraft.serviceOrderDisplayId = String(order.displayId || order.numeroCliente || '');
    this.calendarDraft.serviceOrderStartDate = '';
    this.calendarDraft.serviceOrderEndDate = '';
    this.calendarDraft.numeroCliente = String(order.numeroCliente || '');
    this.calendarDraft.displayName = this.customerName(order);
    this.calendarDraft.customerType = '';
    this.calendarDraft.customerEventCategory = category;
    this.calendarDraft.customerEventDescription = String(order.descrizione || '');
    this.router.navigateByUrl('/homeAdmin/calendarHome');
  }

  openOrderWhatsApp(order: any): void {
    const phone = String(
      this.global.getRecordValueByRole('customer', order?.customer || {}, 'customerPhone') || '',
    );
    let normalized = phone.replace(/[^\d+]/g, '');
    if (normalized.startsWith('+')) normalized = normalized.slice(1);
    if (normalized.startsWith('00')) normalized = normalized.slice(2);
    if (normalized && !normalized.startsWith('39') && normalized.length <= 10) normalized = `39${normalized}`;
    if (!normalized) {
      this.appDialog.showError('Numero di telefono non disponibile per questo cliente.');
      return;
    }
    window.open(`https://wa.me/${normalized}`, '_blank', 'noopener,noreferrer');
  }

  composeOrderEmail(order: any): void {
    const email = String(
      this.global.getRecordValueByRole('customer', order?.customer || {}, 'customerEmail') || '',
    ).trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.appDialog.showError(email
        ? 'Indirizzo email del cliente non valido.'
        : 'Indirizzo email non disponibile per questo cliente.');
      return;
    }
    this.router.navigate(['/homeAdmin/email'], {
      queryParams: {
        composeTo: email,
        composeSubject: `Ordine di servizio ${order?.displayId || order?.numeroOrdine || ''}`.trim(),
      },
    });
  }

  async archiveOrder(orderId: number): Promise<void> {
    const confirmed = await this.appDialog.confirm(
      "Vuoi archiviare questo ordine di servizio? Verrà archiviato anche l'appuntamento collegato nel calendario.",
    );
    if (!confirmed) {
      return;
    }

    this.http.post(this.global.url + `service-orders/${orderId}/delete`, {}).subscribe({
      next: () => {
        this.loadOrders();
      },
      error: (err) => {
        console.error("Errore archiviazione ordine di servizio:", err);
        alert(err?.error?.error || "Errore nell'archiviazione dell'ordine di servizio.");
      },
    });
  }

  async requestRemoteSignature(order: any): Promise<void> {
    const choice = await this.appDialog.choose(
      'Il cliente visualizzerà l’ordine, verificherà la propria email tramite OTP e firmerà dal suo dispositivo.',
      'Richiedi firma ordine di servizio',
      {
        primaryLabel: 'Invia via email',
        secondaryLabel: 'Invia su WhatsApp',
        cancelLabel: 'Annulla',
      },
    );
    if (!choice) return;
    const email = choice === 'primary';
    this.generatingSignatureId = Number(order.id);
    this.http.post<any>(this.global.url + `service-orders/${order.id}/signature-request`, {
      deliveryChannel: email ? 'email' : 'manual',
    }).subscribe({
      next: (result) => {
        this.generatingSignatureId = 0;
        if (!email && (result?.whatsappUrl || result?.approvalUrl)) {
          window.open(result.whatsappUrl || result.approvalUrl, '_blank');
        }
        this.appDialog.show(
          email ? 'Email con link e PDF inviata al cliente.' : 'Messaggio WhatsApp aperto.',
          'Richiesta creata',
          'success',
        );
        this.loadOrders();
      },
      error: (err) => {
        this.generatingSignatureId = 0;
        this.appDialog.showHttpError(err, 'Impossibile generare la richiesta di firma.');
      },
    });
  }

  showSignatureEvidence(order: any): void {
    this.http.get<any>(this.global.url + `service-orders/${order.id}/signature-proof`).subscribe({
      next: async (evidence) => {
        const date = (item: any) => item ? new Date(item).toLocaleString('it-IT') : 'Non disponibile';
        const value = (item: any) => String(item || 'Non disponibile');
        const audit = Array.isArray(evidence.auditTrail)
          ? evidence.auditTrail.map((entry: any) => `• ${date(entry?.at)} — ${value(entry?.type)}`).join('\n')
          : 'Non disponibile';
        const receipt = [
          `Ordine di servizio: ${value(order.numeroOrdine || order.id)}`,
          `Cliente: ${value(evidence.numeroCliente)}`,
          `Stato: ${value(evidence.status)}`,
          `Origine firma: ${evidence.sourceType === 'employee_app' ? 'App dipendenti / caposquadra' : 'Richiesta remota MVanager'}`,
          `Richiesta da: ${value(evidence.requestedByEmployeeName || evidence.requestedByAdminName || evidence.requestedByAdminEmail)}`,
          `Email destinatario/OTP: ${value(evidence.recipientEmail)}`,
          `Richiesta: ${date(evidence.requestedAt)}`,
          `Apertura link: ${date(evidence.viewedAt)}`,
          `OTP inviata: ${date(evidence.otpSentAt)}`,
          `OTP verificata: ${date(evidence.otpVerifiedAt)}`,
          `Firma: ${date(evidence.acceptedAt)}`,
          `IP invio: ${value(evidence.requestIp)}`,
          `IP verifica OTP: ${value(evidence.otpVerifiedIp)}`,
          `IP firma: ${value(evidence.acceptanceIp)}`,
          `Dispositivo: ${value(evidence.acceptanceUserAgent)}`,
          `SHA-256 PDF preliminare: ${value(evidence.documentSnapshotHashSha256)}`,
          `SHA-256 PDF finale: ${value(evidence.pdfHashSha256)}`,
          `SHA-256 firma: ${value(evidence.signatureHashSha256)}`,
          '', 'Cronologia registrata:', audit,
        ].join('\n');
        const action = await this.appDialog.evidence(receipt);
        if (action === 'save') this.saveSignatureEvidence(receipt, order);
        if (action === 'print') this.printSignatureEvidence(receipt);
      },
      error: (err) => this.appDialog.showHttpError(err, 'Impossibile recuperare i dati di prova.'),
    });
  }

  private filenameFromDisposition(disposition: string | null): string {
    const match = String(disposition || '').match(/filename="?([^"]+)"?/i);
    return match?.[1] || '';
  }

  private saveSignatureEvidence(receipt: string, order: any): void {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([receipt], { type: 'text/plain;charset=utf-8' }));
    link.download = `dati-prova-ordine-servizio-${order.numeroOrdine || order.id}.txt`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  private printSignatureEvidence(receipt: string): void {
    const printWindow = window.open('', '_blank', 'width=850,height=700');
    if (!printWindow) {
      this.appDialog.showError('Il browser ha bloccato la finestra di stampa.');
      return;
    }
    const escaped = receipt.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    printWindow.document.write(`<html><head><title>Dati prova firma</title><style>body{font-family:Arial;padding:32px;color:#182235}pre{white-space:pre-wrap;word-break:break-word;line-height:1.55}</style></head><body><h1>Dati di prova della firma</h1><pre>${escaped}</pre><script>window.onload=()=>window.print()</script></body></html>`);
    printWindow.document.close();
  }

  goBack(): void {
    this.router.navigateByUrl('/homeAdmin');
  }

  customerName(order: any): string {
    const customer = order?.customer || {};
    return this.global.getRecordDisplayName('customer', customer) || '-';
  }
}
