import { HttpClient } from '@angular/common/http';
import { Component, HostListener, Input, OnDestroy, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { NgxExtendedPdfViewerService } from 'ngx-extended-pdf-viewer';
import { GlobalService } from '../../service/global.service';
import { QuoteModelService } from '../../service/quote-model.service';
import { PopupServiceService } from '../../componenti/popup/popup-service.service';
import { DxSchedulerComponent } from 'devextreme-angular';
import { AutomaticAddInspectionToCalendarService } from '../../service/automatic-add-inspection-to-calendar.service';
import { Location } from '@angular/common';
import { CustomerModelService } from '../../service/customer-model.service';
import { TenantService } from '../../service/tenant.service';
import { SocketService } from '../../service/soket.service';
import { Subscription } from 'rxjs';
import { NoteUnreadService } from '../../service/note-unread.service';

@Component({
  selector: 'app-quotes-home',
  templateUrl: './quotes-home.component.html',
  styleUrl: './quotes-home.component.css',
})
export class QuotesHomeComponent implements OnDestroy {
  @Input() color: any;
  numeroClienteSelezionato = '';
  showCompletedQuotes = false;
  quoteSearch = '';
  highlightedQuoteFromNotification = '';
  private quoteAcceptanceSubscription?: Subscription;
  private openQuotes = new Set<string>();

  quotesFrEnd: {
    numeroPreventivo: string;
    displayName?: string;
    complete: string;
    isLocked?: boolean;
    acceptanceStatus?: string | null;
    signaturePresent?: boolean;
    needsOfficeReview?: boolean;
    officeConfirmedAt?: string | null;
    email?: string;
    telefono?: string;
  }[] = [];

  private allQuotes: {
    numeroPreventivo: string;
    displayName?: string;
    complete: string;
    isLocked?: boolean;
    acceptanceStatus?: string | null;
    signaturePresent?: boolean;
    needsOfficeReview?: boolean;
    officeConfirmedAt?: string | null;
    email?: string;
    telefono?: string;
  }[] = [];

  get totalQuotesCount(): number {
    return this.allQuotes.length;
  }

  pdfPrev!: string;
  pdfTsSelezionato = false;

  @ViewChild(DxSchedulerComponent, { static: false })
  scheduler!: DxSchedulerComponent;

  constructor(
    private http: HttpClient,
    private pdfService: NgxExtendedPdfViewerService,
    public globalService: GlobalService,
    private router: Router,
    private route: ActivatedRoute,
    private quoteModel: QuoteModelService,
    private popup: PopupServiceService,
    private automaticAddInspectionToCalendarService: AutomaticAddInspectionToCalendarService,
    private location: Location,
    private customerModelService: CustomerModelService,
    public tenantService: TenantService,
    private socketService: SocketService,
    public noteUnread: NoteUnreadService,
  ) {}

  addInspection(numeroPreventivo: string, displayName: string) {
    if (!this.canCreateCalendarEvents()) {
      return;
    }

    this.automaticAddInspectionToCalendarService.pass = true;
    this.automaticAddInspectionToCalendarService.displayName = displayName;
    this.automaticAddInspectionToCalendarService.numeroPreventivo =
      numeroPreventivo;

    const body = { numeroPreventivo };

    this.http
      .post<any[]>(this.globalService.url + 'quotes/getQuote', body, {
        headers: this.globalService.headers,
      })
      .subscribe({
        next: (response) => {
          const temp = Array.isArray(response) ? response : [];
          this.automaticAddInspectionToCalendarService.quoteType = String(
            this.globalService.getRecordValueByRole('quote', temp[0] || {}, 'quoteType') ||
            temp[0]?.tipoPreventivo ||
            '',
          ).trim();
          this.automaticAddInspectionToCalendarService.telefono =
            this.getQuotePhone(temp[0]) || '';
          this.router.navigateByUrl('/homeAdmin/calendarHome');
        },
        error: (err) => {
          console.error('Errore addInspection:', err);
          alert(this.parseServerError(err));
        },
      });
  }

  navigateToAddQuote() {
    this.router.navigateByUrl('/homeAdmin/addQuote');
  }

  navigateToNotes(numeroPreventivo: string, displayName: string) {
    this.router.navigate(['/homeAdmin/quoteNotes'], {
      queryParams: {
        numeroPreventivo,
        displayName,
        returnTo: '/homeAdmin/quotesHome',
      },
    });
  }

  ngOnInit() {
    this.noteUnread.start();
    this.applyNotificationQueryParams();
    this.globalService
      .loadTenantConfig(false, { showError: false })
      .finally(() => this.loadQuotes());
    this.bindQuoteAcceptanceUpdates();
  }

  ngOnDestroy(): void {
    this.quoteAcceptanceSubscription?.unsubscribe();
  }

  private loadQuotes() {
    this.http
      .get<any[]>(this.globalService.url + 'quotes/getAll', {
        headers: this.globalService.headers,
      })
      .subscribe({
        next: (response) => {
          const allQuotes = Array.isArray(response) ? response : [];

          const filteredQuotes = this.showCompletedQuotes
            ? allQuotes
            : allQuotes.filter((q) => !this.isQuoteCompleted(q));

          this.allQuotes = filteredQuotes.sort(
            (a, b) =>
              parseInt(b.numeroPreventivo) - parseInt(a.numeroPreventivo),
          );

          this.applyQuoteSearch();

          if (this.quotesFrEnd.length > 0) {
            this.pdfTsSelezionato = true;
            this.numeroClienteSelezionato =
              this.quotesFrEnd[0].numeroPreventivo;
          } else {
            this.pdfTsSelezionato = false;
            this.numeroClienteSelezionato = '';
          }

          this.focusQuoteFromNotificationIfNeeded();
        },
        error: (err) => {
          console.error('Errore caricamento preventivi:', err);
          alert('Errore durante il caricamento dei preventivi');
        },
      });
  }

  private applyNotificationQueryParams(): void {
    const queryParams = this.route.snapshot.queryParamMap;
    const review = queryParams.get('review');
    const showCompleted =
      queryParams.get('showCompleted') ||
      queryParams.get('showCompletedQuotes') ||
      queryParams.get('completed');

    if (review === '1' || showCompleted === '1' || showCompleted === 'true') {
      this.showCompletedQuotes = true;
    }
  }

  private focusQuoteFromNotificationIfNeeded(): void {
    const numeroPreventivo =
      this.route.snapshot.queryParamMap.get('numeroPreventivo');
    const review = this.route.snapshot.queryParamMap.get('review');

    if (!numeroPreventivo || review !== '1') {
      return;
    }

    this.highlightedQuoteFromNotification = numeroPreventivo;

    const quote = this.quotesFrEnd.find(
      (item) => item.numeroPreventivo === numeroPreventivo,
    );
    if (quote) {
      this.numeroClienteSelezionato = numeroPreventivo;
    }

    setTimeout(() => {
      document
        .getElementById(`quote-${numeroPreventivo}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  }

  private bindQuoteAcceptanceUpdates(): void {
    if (this.quoteAcceptanceSubscription) {
      return;
    }

    this.quoteAcceptanceSubscription = this.socketService
      .onQuoteAcceptanceUpdate()
      .subscribe((update: any) => {
        this.loadQuotes();

        const numeroPreventivo = update?.numeroPreventivo || '';
        if (update?.kind === 'accepted') {
          alert(`Preventivo ${numeroPreventivo} accettato dal cliente`);
        } else if (update?.kind === 'office_confirmed') {
          alert(`Preventivo ${numeroPreventivo} verificato e trasformato in cliente`);
        }
      });
  }

  viewPdf(
    quote:
      | string
      | {
          numeroPreventivo: string;
          acceptanceStatus?: string | null;
          signaturePresent?: boolean;
          needsOfficeReview?: boolean;
          officeConfirmedAt?: string | null;
        },
  ) {
    if (typeof quote === 'string') {
      this.router.navigate(['/view-pdf'], {
        queryParams: { numeroPreventivo: quote },
      });
      return;
    }

    const numeroPreventivo = quote.numeroPreventivo;
    const shouldOpenSignedPdf =
      !!quote.signaturePresent ||
      quote.acceptanceStatus === 'accepted' ||
      !!quote.officeConfirmedAt ||
      !!quote.needsOfficeReview;

    this.router.navigate(['/view-pdf'], {
      queryParams: shouldOpenSignedPdf
        ? { numeroPreventivo, signed: 1 }
        : { numeroPreventivo },
    });
  }

  reviewSignedQuoteAndCreateCustomer(quote: {
    numeroPreventivo: string;
    acceptanceStatus?: string | null;
    signaturePresent?: boolean;
    needsOfficeReview?: boolean;
    officeConfirmedAt?: string | null;
  }) {
    const numeroPreventivo = quote.numeroPreventivo;
    if (!this.canCreateCustomersFromQuote()) {
      this.router.navigate(['/view-pdf'], {
        queryParams: { numeroPreventivo, signed: 1 },
      });
      return;
    }

    this.router.navigate(['/view-pdf'], {
      queryParams: { numeroPreventivo, signed: 1, confirmCustomer: 1 },
    });
  }

  showAcceptanceEvidence(numeroPreventivo: string): void {
    this.http.post<any>(this.globalService.url + 'quotes/getAcceptanceStatus', {
      numeroPreventivo,
    }, { headers: this.globalService.headers }).subscribe({
      next: (evidence) => {
        const dateTime = (value: unknown) => value
          ? new Intl.DateTimeFormat('it-IT', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(String(value)))
          : 'Non disponibile';
        const value = (item: unknown) => String(item || '').trim() || 'Non disponibile';
        const audit = Array.isArray(evidence.auditTrail)
          ? evidence.auditTrail.map((entry: any) => `• ${dateTime(entry?.at)} — ${value(entry?.type)}`).join('\n')
          : 'Nessun evento registrato';

        const receipt = [
          `Preventivo: ${value(evidence.numeroPreventivo)}`,
          `Stato: ${value(evidence.status)}`,
          `Richiesta inviata: ${dateTime(evidence.requestedAt)}`,
          `Email destinatario/OTP: ${value(evidence.recipientEmail)}`,
          `Apertura link: ${dateTime(evidence.viewedAt)}`,
          `OTP inviata: ${dateTime(evidence.otpSentAt)}`,
          `OTP verificata: ${dateTime(evidence.otpVerifiedAt)}`,
          `Accettazione/firma: ${dateTime(evidence.acceptedAt)}`,
          `Firmatario: ${value(evidence.acceptedByName)}`,
          `Email firmatario: ${value(evidence.acceptedByEmail)}`,
          `Telefono firmatario: ${value(evidence.acceptedByPhone)}`,
          `IP invio: ${value(evidence.requestIp)}`,
          `IP accettazione: ${value(evidence.acceptanceIp)}`,
          `Dispositivo accettazione: ${value(evidence.acceptanceUserAgent)}`,
          `SHA-256 PDF: ${value(evidence.quoteHashSha256)}`,
          '',
          'Cronologia registrata:',
          audit,
        ].join('\n');
        this.popup.evidence(receipt).then((action) => {
          if (action === 'save') this.saveAcceptanceEvidence(numeroPreventivo, receipt);
          if (action === 'print') this.printAcceptanceEvidence(numeroPreventivo);
        });
      },
      error: (err) => this.popup.showHttpError(err, 'Impossibile recuperare i dati di prova della firma.'),
    });
  }

  private saveAcceptanceEvidence(numeroPreventivo: string, receipt: string): void {
    const blob = new Blob([`DATI DI PROVA DELLA FIRMA\n\n${receipt}\n`], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `dati-prova-firma-preventivo-${numeroPreventivo}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  printAcceptanceEvidence(numeroPreventivo: string): void {
    const printWindow = window.open('', '_blank', 'width=900,height=760');
    if (!printWindow) {
      this.popup.showError('Il browser ha bloccato la finestra di stampa. Consenti i popup e riprova.');
      return;
    }
    printWindow.opener = null;

    this.http.post<any>(this.globalService.url + 'quotes/getAcceptanceStatus', {
      numeroPreventivo,
    }, { headers: this.globalService.headers }).subscribe({
      next: (evidence) => {
        const dateTime = (item: unknown) => item
          ? new Intl.DateTimeFormat('it-IT', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(String(item)))
          : 'Non disponibile';
        const value = (item: unknown) => String(item || '').trim() || 'Non disponibile';
        const escape = (item: unknown) => value(item).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char));
        const rows = [
          ['Preventivo', value(evidence.numeroPreventivo)], ['Stato', value(evidence.status)],
          ['Richiesta inviata', dateTime(evidence.requestedAt)], ['Email destinatario/OTP', value(evidence.recipientEmail)],
          ['Apertura link', dateTime(evidence.viewedAt)], ['OTP inviata', dateTime(evidence.otpSentAt)],
          ['OTP verificata', dateTime(evidence.otpVerifiedAt)], ['Accettazione/firma', dateTime(evidence.acceptedAt)],
          ['Firmatario', value(evidence.acceptedByName)], ['Email firmatario', value(evidence.acceptedByEmail)],
          ['Telefono firmatario', value(evidence.acceptedByPhone)], ['IP invio', value(evidence.requestIp)],
          ['IP accettazione', value(evidence.acceptanceIp)], ['Dispositivo accettazione', value(evidence.acceptanceUserAgent)],
          ['Hash SHA-256 PDF', value(evidence.quoteHashSha256)],
        ];
        const audit = Array.isArray(evidence.auditTrail)
          ? evidence.auditTrail.map((entry: any) => `<li><strong>${escape(dateTime(entry?.at))}</strong> — ${escape(entry?.type)}</li>`).join('')
          : '<li>Nessun evento registrato</li>';

        printWindow.document.write(`<!doctype html><html lang="it"><head><title>Dati prova firma - ${escape(numeroPreventivo)}</title><style>body{font-family:Arial,sans-serif;color:#182235;margin:36px}h1{margin:0 0 6px}p{color:#526277}table{border-collapse:collapse;width:100%;margin:24px 0}th,td{border:1px solid #d8dee8;padding:10px;text-align:left;vertical-align:top}th{background:#f3f6fa;width:31%}td{word-break:break-word}h2{font-size:18px;margin-top:28px}li{margin:8px 0}@media print{body{margin:14mm}}</style></head><body><h1>Dati di prova della firma</h1><p>Documento generato il ${escape(dateTime(new Date()))}. Il codice OTP non viene conservato né stampato in chiaro.</p><table>${rows.map(([label, item]) => `<tr><th>${escape(label)}</th><td>${escape(item)}</td></tr>`).join('')}</table><h2>Cronologia registrata</h2><ul>${audit}</ul></body></html>`);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => printWindow.print(), 200);
      },
      error: (err) => {
        printWindow.close();
        this.popup.showHttpError(err, 'Impossibile recuperare i dati di prova della firma.');
      },
    });
  }

  private normalize(s: string): string {
    return (s || '')
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .trim();
  }

  toggleShowCompletedQuotes(): void {
    this.showCompletedQuotes = !this.showCompletedQuotes;
    this.loadQuotes();
  }

  applyQuoteSearch(): void {
    const q = this.normalize(this.quoteSearch);

    this.quotesFrEnd = q
      ? this.allQuotes.filter((quote) =>
          this.normalize(this.getQuoteSearchText(quote)).includes(q),
        )
      : [...this.allQuotes];
  }

  clearQuoteSearch(): void {
    this.quoteSearch = '';
    this.applyQuoteSearch();
  }

  isQuoteCompleted(quote: { complete?: string } | null | undefined): boolean {
    return quote?.complete === 'A' || quote?.complete === 'R';
  }

  private getQuoteSearchText(quote: Record<string, any>): string {
    return [
      quote?.['numeroPreventivo'],
      this.getQuoteDisplayName(quote),
      this.getQuoteEmail(quote),
      this.getQuotePhone(quote),
    ].join(' ');
  }

  getQuoteDisplayName(quote: Record<string, any>): string {
    return this.globalService.getRecordDisplayName('quote', quote);
  }

  getQuoteEmail(quote: Record<string, any>): string {
    return String(this.globalService.getRecordValueByRole('quote', quote, 'quoteEmail') || '').trim();
  }

  getQuotePhone(quote: Record<string, any>): string {
    return String(this.globalService.getRecordValueByRole('quote', quote, 'quotePhone') || '').trim();
  }

  navigateToEditQuote(numeroPreventivo: string) {
    const body = { numeroPreventivo };

    this.http
      .post<any[]>(this.globalService.url + 'quotes/getQuote', body, {
        headers: this.globalService.headers,
      })
      .subscribe({
        next: (response) => {
          const quoteJson = Array.isArray(response) ? response[0] : null;

          if (!quoteJson) {
            this.popup.text = 'Preventivo non trovato';
            this.popup.openPopup();
            return;
          }

          this.quoteModel.resetQuoteModel();
          Object.assign(this.quoteModel as any, quoteJson);

          this.router.navigateByUrl('/homeAdmin/editQuote');
        },
        error: (err) => {
          console.error('Errore navigateToEditQuote:', err);
          alert(this.parseServerError(err));
        },
      });
  }

  private parseMaybeJsonArray(value: any): any[] {
    if (Array.isArray(value)) return value;
    if (!value) return [];

    try {
      return JSON.parse(value);
    } catch {
      return [];
    }
  }

  private parseDateIT(value: any): Date | null {
    if (!value) return null;

    if (value instanceof Date && !isNaN(value.getTime())) {
      return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    }

    const raw = String(value).trim();
    if (!raw) return null;

    const italianDateMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
    if (italianDateMatch) {
      const [, dd, mm, yyyy] = italianDateMatch;
      return new Date(+yyyy, +mm - 1, +dd);
    }

    const isoDateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    if (isoDateOnlyMatch) {
      const [, yyyy, mm, dd] = isoDateOnlyMatch;
      return new Date(+yyyy, +mm - 1, +dd);
    }

    const parsed = new Date(raw);
    if (isNaN(parsed.getTime())) {
      return null;
    }

    return new Date(
      parsed.getFullYear(),
      parsed.getMonth(),
      parsed.getDate(),
    );
  }

  delete(numeroPreventivo: string) {
    const body = { numeroPreventivo };

    this.http
      .post(this.globalService.url + 'quotes/delete', body, {
        headers: this.globalService.headers,
        responseType: 'text',
      })
      .subscribe({
        next: () => {
          this.ngOnInit();
        },
        error: (err) => {
          console.error('Errore delete quote:', err);
          alert(this.parseServerError(err));
        },
      });
  }

  duplicateQuote(numeroPreventivo: string) {
    const body = { numeroPreventivo };

    this.http
      .post<{
        numeroPreventivo: string;
      }>(this.globalService.url + 'quotes/duplicate', body, {
        headers: this.globalService.headers,
      })
      .subscribe({
        next: (response) => {
          alert(`Creato nuovo preventivo ${response.numeroPreventivo}`);
          this.showCompletedQuotes = false;
          this.loadQuotes();
        },
        error: (err) => {
          console.error('Errore duplicate quote:', err);
          alert(this.parseServerError(err));
        },
      });
  }

  conferm(numeroPreventivo: string) {
    const body = { numeroPreventivo };
    const canCreateCustomer = this.canCreateCustomersFromQuote();

    this.http
      .post<any[]>(this.globalService.url + 'quotes/getQuote', body, {
        headers: this.globalService.headers,
      })
      .subscribe({
        next: (response) => {
          const quote = Array.isArray(response) ? response[0] : null;

          if (!quote) {
            this.popup.text = 'Preventivo non trovato';
            this.popup.openPopup();
            return;
          }

          if (canCreateCustomer) {
            this.customerModelService.populateFromQuote(quote, numeroPreventivo);
          }

          this.http
            .post(
              this.globalService.url + 'quotes/setComplete',
              { numeroPreventivo },
              {
                headers: this.globalService.headers,
                responseType: 'text',
              },
            )
            .subscribe({
              next: () => {
                if (canCreateCustomer) {
                  this.router.navigateByUrl('/homeAdmin/addCustomer');
                  return;
                }

                this.loadQuotes();
              },
              error: (err) => {
                console.error('Errore setComplete:', err);
                alert(this.parseServerError(err));
              },
            });
        },
        error: (err) => {
          console.error('Errore conferm quote:', err);
          alert(this.parseServerError(err));
        },
      });
  }

  canCreateCustomersFromQuote(): boolean {
    return this.globalService.canCreateCustomers();
  }

  canCreateCalendarEvents(): boolean {
    return this.globalService.canCreateCalendarEvents();
  }

  refuse(numeroPreventivo: string) {
    const body = { numeroPreventivo };

    this.http
      .post(this.globalService.url + 'quotes/setRefused', body, {
        headers: this.globalService.headers,
        responseType: 'text',
      })
      .subscribe({
        next: () => {
          this.ngOnInit();
        },
        error: (err) => {
          console.error('Errore refuse quote:', err);
          alert(this.parseServerError(err));
        },
      });
  }

  restore(numeroPreventivo: string) {
    const body = { numeroPreventivo };

    this.http
      .post(this.globalService.url + 'quotes/restore', body, {
        headers: this.globalService.headers,
        responseType: 'text',
      })
      .subscribe({
        next: () => {
          this.ngOnInit();
        },
        error: (err) => {
          console.error('Errore restore quote:', err);
          alert(this.parseServerError(err));
        },
      });
  }

  invio(numeroPreventivo: string) {
    const body = { numeroPreventivo };

    this.http
      .post(this.globalService.url + 'quotes/sendPdf', body, {
        headers: this.globalService.headers,
        responseType: 'text',
      })
      .subscribe({
        next: (response) => {
          if (response == 'NO') {
            this.popup.text = 'NEL PREVENTIVO NON E PRESENTE LA MAIL';
            this.popup.openPopup();
          } else {
            this.popup.text = 'INVIO DELLE MAIL RIUSCITO';
            this.popup.openPopup();
          }
        },
        error: (err) => {
          console.error('Errore invio PDF:', err);
          alert(this.parseServerError(err));
        },
      });
  }

  sendAcceptanceLink(numeroPreventivo: string) {
    const listedQuote = this.allQuotes.find((quote) => quote.numeroPreventivo === numeroPreventivo) as any;
    const email = this.getQuoteEmail(listedQuote || {});
    if (email) {
      this.selectAcceptanceDelivery(numeroPreventivo, email);
      return;
    }

    this.getQuoteContact(numeroPreventivo, (quote) => {
      this.selectAcceptanceDelivery(numeroPreventivo, this.getQuoteEmail(quote || {}));
    });
  }

  private async selectAcceptanceDelivery(numeroPreventivo: string, recipientEmail: string) {
    if (!recipientEmail) {
      this.popup.showError('Non puoi generare il link di accettazione: nel preventivo non è presente l’indirizzo email del cliente. Inseriscilo prima di procedere.', 'Email cliente mancante');
      return;
    }
    if (!this.isValidEmail(recipientEmail)) {
      this.popup.showError('Non puoi generare il link di accettazione: l’indirizzo email salvato nel preventivo non è valido.', 'Email cliente non valida');
      return;
    }

    const deliveryChoice = await this.popup.choose(
      'Scegli il canale di invio. Via email il cliente riceverà il link e il PDF allegato; su WhatsApp verrà aperta la chat con il messaggio pronto.',
      'Invia richiesta di accettazione',
      {
        primaryLabel: 'Invia via email',
        secondaryLabel: 'Invia su WhatsApp',
        cancelLabel: 'Annulla',
      },
    );
    if (!deliveryChoice) return;
    const sendByEmail = deliveryChoice === 'primary';
    const body = {
      numeroPreventivo,
      deliveryChannel: sendByEmail ? 'email' : 'whatsapp',
      expiresInDays: 14,
    };

    this.http
      .post<{
        whatsappUrl?: string;
        approvalUrl?: string;
      }>(this.globalService.url + 'quotes/sendAcceptanceRequest', body, {
        headers: this.globalService.headers,
      })
      .subscribe({
        next: (response) => {
          const targetUrl = sendByEmail
            ? ''
            : (response?.whatsappUrl || response?.approvalUrl);
          if (targetUrl) {
            window.open(targetUrl, '_blank');
          }

          alert(sendByEmail ? 'Email con link e PDF inviata al cliente.' : 'Link di accettazione generato');
          this.loadQuotes();
        },
        error: (err) => {
          console.error('Errore generazione link accettazione:', err);
          alert(this.parseServerError(err));
        },
      });
  }

  openQuoteWhatsApp(quote: { numeroPreventivo: string }) {
    const phone = this.getQuotePhone(quote as any);
    if (phone) {
      this.openWhatsApp(phone);
      return;
    }

    this.getQuoteContact(quote.numeroPreventivo, (detail) => {
      this.openWhatsApp(this.getQuotePhone(detail || {}));
    });
  }

  composeQuoteEmail(quote: {
    numeroPreventivo: string;
  }) {
    const displayName = this.getQuoteDisplayName(quote as any);
    const email = this.getQuoteEmail(quote as any);
    if (email) {
      this.openEmailComposer(
        email,
        `Preventivo ${quote.numeroPreventivo} - ${displayName}`,
      );
      return;
    }

    this.getQuoteContact(quote.numeroPreventivo, (detail) => {
      const detailDisplayName = this.getQuoteDisplayName(detail || quote as any) || displayName;
      this.openEmailComposer(
        this.getQuoteEmail(detail || {}),
        `Preventivo ${quote.numeroPreventivo} - ${detailDisplayName}`,
      );
    });
  }

  private getQuoteContact(
    numeroPreventivo: string,
    callback: (quote: any | null) => void,
  ): void {
    this.http
      .post<any[]>(
        this.globalService.url + 'quotes/getQuote',
        { numeroPreventivo },
        { headers: this.globalService.headers },
      )
      .subscribe({
        next: (response) => callback(Array.isArray(response) ? response[0] : null),
        error: (err) => {
          console.error('Errore recupero contatto preventivo:', err);
          alert(this.parseServerError(err));
        },
      });
  }

  private openWhatsApp(phone: string): void {
    const normalizedPhone = this.normalizePhoneForWhatsApp(phone);
    if (!normalizedPhone) {
      this.popup.text = 'Numero di telefono non disponibile.';
      this.popup.openPopup();
      return;
    }

    window.open(`https://wa.me/${normalizedPhone}`, '_blank', 'noopener,noreferrer');
  }

  private openEmailComposer(to: string, subject = ''): void {
    const email = String(to || '').trim();
    if (!email) {
      this.popup.text = 'Indirizzo email non disponibile per questo preventivo.';
      this.popup.openPopup();
      return;
    }

    if (!this.isValidEmail(email)) {
      this.popup.text = 'Indirizzo email preventivo non valido.';
      this.popup.openPopup();
      return;
    }

    this.router.navigate(['/homeAdmin/email'], {
      queryParams: { composeTo: email, composeSubject: subject },
    });
  }

  private normalizePhoneForWhatsApp(phone: string): string {
    let cleaned = String(phone || '').replace(/[^\d+]/g, '');
    if (!cleaned) return '';
    if (cleaned.startsWith('+')) cleaned = cleaned.slice(1);
    if (cleaned.startsWith('00')) cleaned = cleaned.slice(2);
    if (!cleaned.startsWith('39') && cleaned.length <= 10) {
      cleaned = `39${cleaned}`;
    }
    return cleaned;
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  back() {
    this.router.navigateByUrl('/homeAdmin');
  }

  toggleQuoteOpen(numeroPreventivo: string) {
    if (this.openQuotes.has(numeroPreventivo)) {
      this.openQuotes.delete(numeroPreventivo);
    } else {
      this.openQuotes.add(numeroPreventivo);
    }
  }

  isQuoteOpen(numeroPreventivo: string): boolean {
    return this.openQuotes.has(numeroPreventivo);
  }

  private parseServerError(err: any): string {
    try {
      const body =
        typeof err.error === 'string' ? JSON.parse(err.error) : err.error;
      if (body?.error) return body.error;
    } catch {}
    if (err.status === 0) return 'Impossibile connettersi al server';
    return 'Errore imprevisto. Riprova.';
  }

  @HostListener('window:popstate', ['$event'])
  onBrowserBackBtnClose(event: Event): void {
    event.preventDefault();
    this.location.replaceState('/homeAdmin');
    this.router.navigateByUrl('/homeAdmin');
  }
}
