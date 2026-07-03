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

@Component({
  selector: 'app-quotes-home',
  templateUrl: './quotes-home.component.html',
  styleUrl: './quotes-home.component.css',
})
export class QuotesHomeComponent implements OnDestroy {
  @Input() color: any;
  numeroClienteSelezionato = '';
  showCompletedQuotes = false;
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
      queryParams: { numeroPreventivo, displayName },
    });
  }

  ngOnInit() {
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
            ? allQuotes.filter((q) => q.complete === 'A' || q.complete === 'R')
            : allQuotes.filter((q) => !q.complete || q.complete === '');

          this.allQuotes = filteredQuotes.sort(
            (a, b) =>
              parseInt(b.numeroPreventivo) - parseInt(a.numeroPreventivo),
          );

          this.quotesFrEnd = [...this.allQuotes];

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

  private normalize(s: string): string {
    return (s || '')
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .trim();
  }

  searchNumeroPreventivo(v: string): void {
    const q = this.normalize(v);

    this.quotesFrEnd = q
      ? this.allQuotes.filter((quote) =>
          this.normalize(quote?.numeroPreventivo?.toString()).startsWith(q),
        )
      : [...this.allQuotes];
  }

  searchNominativo(v: string): void {
    const q = this.normalize(v);

    this.quotesFrEnd = q
      ? this.allQuotes.filter((quote) =>
          this.normalize(this.getQuoteDisplayName(quote)).includes(q),
        )
      : [...this.allQuotes];
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
    const body = {
      numeroPreventivo,
      deliveryChannel: 'whatsapp',
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
          const targetUrl = response?.whatsappUrl || response?.approvalUrl;
          if (targetUrl) {
            window.open(targetUrl, '_blank');
          }

          alert('Link di accettazione generato');
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
