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
    nominativo: string;
    complete: string;
    isLocked?: boolean;
    acceptanceStatus?: string | null;
    signaturePresent?: boolean;
    needsOfficeReview?: boolean;
    officeConfirmedAt?: string | null;
  }[] = [];

  private allQuotes: {
    numeroPreventivo: string;
    nominativo: string;
    complete: string;
    isLocked?: boolean;
    acceptanceStatus?: string | null;
    signaturePresent?: boolean;
    needsOfficeReview?: boolean;
    officeConfirmedAt?: string | null;
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

  addInspection(numeroPreventivo: string, nominativo: string) {
    this.automaticAddInspectionToCalendarService.pass = true;
    this.automaticAddInspectionToCalendarService.nominativo = nominativo;
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
            temp[0]?.telefono || '';
          this.router.navigateByUrl('/homeAdmin/calendarHome');
        },
        error: (err) => {
          console.error('Errore addInspection:', err);
          alert(this.parseServerError(err));
        },
      });
  }

  navigateToAddQuote() {
    this.router.navigateByUrl('/addQuote');
  }

  navigateToNotes(numeroPreventivo: string, nominativo: string) {
    this.router.navigate(['/quoteNotes'], {
      queryParams: { numeroPreventivo, nominativo },
    });
  }

  ngOnInit() {
    this.applyNotificationQueryParams();
    this.loadQuotes();
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

    if (!shouldOpenSignedPdf) {
      this.router.navigate(['/view-pdf'], {
        queryParams: { numeroPreventivo },
      });
      return;
    }

    this.http
      .post<{
        pdfUrl?: string;
      }>(
        this.globalService.url + 'quotes/getAcceptanceStatus',
        { numeroPreventivo },
        { headers: this.globalService.headers },
      )
      .subscribe({
        next: (response) => {
          if (response?.pdfUrl) {
            window.open(response.pdfUrl, '_blank', 'noopener,noreferrer');
            return;
          }

          this.router.navigate(['/view-pdf'], {
            queryParams: { numeroPreventivo },
          });
        },
        error: () => {
          this.router.navigate(['/view-pdf'], {
            queryParams: { numeroPreventivo },
          });
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
          this.normalize(quote?.nominativo).includes(q),
        )
      : [...this.allQuotes];
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

          this.quoteModel.numeroPreventivo = quoteJson['numeroPreventivo'];
          this.quoteModel.codiceOperatore = quoteJson['codiceOperatore'];
          this.quoteModel.tipoPreventivo = quoteJson['tipoPreventivo'];
          this.quoteModel.data = quoteJson['data'];
          this.quoteModel.nominativo = quoteJson['nominativo'];
          this.quoteModel.cfpi = quoteJson['cfpi'];

          // campi SAMI
          this.quoteModel.cittaDiFatturazione =
            quoteJson['cittaDiFatturazione'] || '';
          this.quoteModel.selettorePrefissoViaDiFatturazione =
            quoteJson['selettorePrefissoViaDiFatturazione'] || '';
          this.quoteModel.viaDiFatturazione =
            quoteJson['viaDiFatturazione'] || '';
          this.quoteModel.capDiFatturazione =
            quoteJson['capDiFatturazione'] || '';
          this.quoteModel.citta = quoteJson['citta'] || '';
          this.quoteModel.selettorePrefissoVia =
            quoteJson['selettorePrefissoVia'] || '';
          this.quoteModel.via = quoteJson['via'] || '';
          this.quoteModel.cap = quoteJson['cap'] || '';
          this.quoteModel.referente = quoteJson['referente'] || '';
          this.quoteModel.descrizioneImmobile =
            quoteJson['descrizioneImmobile'] || '';

          // campi comuni
          this.quoteModel.email = quoteJson['email'] || '';
          this.quoteModel.telefono = quoteJson['telefono'] || '';
          this.quoteModel.pagamento = quoteJson['pagamento'] || '';
          this.quoteModel.note = quoteJson['note'] || '';

          // array SAMI
          this.quoteModel.servizi = this.parseMaybeJsonArray(
            quoteJson['servizi'],
          );
          this.quoteModel.interventi = this.parseMaybeJsonArray(
            quoteJson['interventi'],
          );

          this.quoteModel.imponibile = quoteJson['imponibile']
            ? parseFloat(quoteJson['imponibile']).toFixed(2)
            : '0.00';

          this.quoteModel.iva = quoteJson['iva'] || '';
          this.quoteModel.dataInizioContratto =
            quoteJson['dataInizioContratto'] || '';
          this.quoteModel.dataInizioContrattoDate = quoteJson[
            'dataInizioContratto'
          ]
            ? this.parseDateIT(quoteJson['dataInizioContratto'])
            : null;

          this.quoteModel.durataContratto = quoteJson['durataContratto'] || '';

          // campi EMMECI
          (this.quoteModel as any).ragSociale = quoteJson['ragSociale'] || '';
          (this.quoteModel as any).cittaDiPartenza =
            quoteJson['cittaDiPartenza'] || '';
          (this.quoteModel as any).selettorePrefissoViaDiPartenza =
            quoteJson['selettorePrefissoViaDiPartenza'] || '';
          (this.quoteModel as any).viaDiPartenza =
            quoteJson['viaDiPartenza'] || '';
          (this.quoteModel as any).pianoDiPartenza =
            quoteJson['pianoDiPartenza'] || '';
          (this.quoteModel as any).occupazioneSuoloPubblicoDiPartenza =
            quoteJson['occupazioneSuoloPubblicoDiPartenza'] || '';
          (this.quoteModel as any).capDiPartenza =
            quoteJson['capDiPartenza'] || '';

          (this.quoteModel as any).cittaDiArrivo =
            quoteJson['cittaDiArrivo'] || '';
          (this.quoteModel as any).selettorePrefissoViaDiArrivo =
            quoteJson['selettorePrefissoViaDiArrivo'] || '';
          (this.quoteModel as any).viaDiArrivo = quoteJson['viaDiArrivo'] || '';
          (this.quoteModel as any).pianoDiArrivo =
            quoteJson['pianoDiArrivo'] || '';
          (this.quoteModel as any).occupazioneSuoloPubblicoDiArrivo =
            quoteJson['occupazioneSuoloPubblicoDiArrivo'] || '';
          (this.quoteModel as any).capDiArrivo = quoteJson['capDiArrivo'] || '';

          (this.quoteModel as any).altreDestinazioni =
            quoteJson['altreDestinazioni'] || '';
          (this.quoteModel as any).stanzeEOggetti = this.parseMaybeJsonArray(
            quoteJson['stanzeEOggetti'],
          );

          (this.quoteModel as any).lampadari = !!quoteJson['lampadari'];
          (this.quoteModel as any).imballaggio = !!quoteJson['imballaggio'];
          (this.quoteModel as any).smaltimentoMaterialiDiRisulta =
            !!quoteJson['smaltimentoMaterialiDiRisulta'];
          (this.quoteModel as any).riposizionamentoContenutiDegliArredi =
            !!quoteJson['riposizionamentoContenutiDegliArredi'];
          (this.quoteModel as any).smontaggioEImballaggioDegliArredi =
            !!quoteJson['smontaggioEImballaggioDegliArredi'];
          (this.quoteModel as any).caricoSuNostroMezzoIdoneo =
            !!quoteJson['caricoSuNostroMezzoIdoneo'];
          (this.quoteModel as any).trasporto = !!quoteJson['trasporto'];
          (this.quoteModel as any).scaricoEConsegnaAlPiano =
            !!quoteJson['scaricoEConsegnaAlPiano'];
          (this.quoteModel as any).montaggioDegliArredi =
            !!quoteJson['montaggioDegliArredi'];
          (this.quoteModel as any).ausilioDiElevatoreEsternoOvePossibile =
            !!quoteJson['ausilioDiElevatoreEsternoOvePossibile'];
          (this.quoteModel as any).assicurazioneControIRischiDiTrasporto =
            !!quoteJson['assicurazioneControIRischiDiTrasporto'];
          (this.quoteModel as any).fornituraMaterialiDaImballo =
            !!quoteJson['fornituraMaterialiDaImballo'];
          (this.quoteModel as any).imballaggioDeiContenuti =
            !!quoteJson['imballaggioDeiContenuti'];
          (this.quoteModel as any).custodiaInDeposito =
            !!quoteJson['custodiaInDeposito'];
          (this.quoteModel as any).ospCarico = !!quoteJson['ospCarico'];
          (this.quoteModel as any).ospScarico = !!quoteJson['ospScarico'];

          (this.quoteModel as any).prezzoTrasloco =
            quoteJson['prezzoTrasloco'] || 0;
          (this.quoteModel as any).prezzoFornituraMaterialiDaImballo =
            quoteJson['prezzoFornituraMaterialiDaImballo'] || 0;
          (this.quoteModel as any).prezzoImballaggioDeiContenuti =
            quoteJson['prezzoImballaggioDeiContenuti'] || 0;
          (this.quoteModel as any).prezzoPassaggioInDeposito =
            quoteJson['prezzoPassaggioInDeposito'] || 0;
          (this.quoteModel as any).prezzoOccupazioneSuoloPubblico =
            quoteJson['prezzoOccupazioneSuoloPubblico'] || 0;
          (this.quoteModel as any).prezzoMensileCustodiaMobili =
            quoteJson['prezzoMensileCustodiaMobili'] || 0;
          (this.quoteModel as any).stato = quoteJson['stato'] || '';

          this.router.navigateByUrl('/editQuote');
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

          // SAMI
          this.customerModelService.tipoCliente =
            quote.tipoPreventivo === 'S' ? 'S' : 'O';
          this.customerModelService.nominativo = quote.nominativo || '';
          this.customerModelService.cfpi = quote.cfpi || '';
          this.customerModelService.cittaDiFatturazione =
            quote.cittaDiFatturazione || '';
          this.customerModelService.selettorePrefissoViaDiFatturazione =
            quote.selettorePrefissoViaDiFatturazione || '';
          this.customerModelService.viaDiFatturazione =
            quote.viaDiFatturazione || '';
          this.customerModelService.capDiFatturazione =
            quote.capDiFatturazione || '';
          this.customerModelService.citta = quote.citta || '';
          this.customerModelService.selettorePrefissoVia =
            quote.selettorePrefissoVia || '';
          this.customerModelService.via = quote.via || '';
          this.customerModelService.cap = quote.cap || '';
          this.customerModelService.email = quote.email || '';
          this.customerModelService.telefono = quote.telefono || '';
          this.customerModelService.referente = quote.referente || '';
          this.customerModelService.descrizioneImmobile =
            quote.descrizioneImmobile || '';
          this.customerModelService.servizi = this.parseMaybeJsonArray(
            quote.servizi,
          );
          this.customerModelService.interventi = this.parseMaybeJsonArray(
            quote.interventi,
          );
          this.customerModelService.imponibile = quote.imponibile
            ? parseFloat(quote.imponibile).toFixed(2)
            : '0.00';
          this.customerModelService.iva = quote.iva || '';
          this.customerModelService.pagamento = quote.pagamento || '';
          this.customerModelService.tempistica = quote.tempistica || '';
          this.customerModelService.note = quote.note || '';

          (this.customerModelService as any).ragSociale = quote.ragSociale || '';
          (this.customerModelService as any).data = quote.data || '';
          (this.customerModelService as any).cittaDiPartenza = quote.cittaDiPartenza || '';
          (this.customerModelService as any).selettorePrefissoViaDiPartenza = quote.selettorePrefissoViaDiPartenza || '';
          (this.customerModelService as any).viaDiPartenza = quote.viaDiPartenza || '';
          (this.customerModelService as any).pianoDiPartenza = quote.pianoDiPartenza || '';
          (this.customerModelService as any).occupazioneSuoloPubblicoDiPartenza = quote.occupazioneSuoloPubblicoDiPartenza || '';
          (this.customerModelService as any).capDiPartenza = quote.capDiPartenza || '';

          (this.customerModelService as any).cittaDiArrivo = quote.cittaDiArrivo || '';
          (this.customerModelService as any).selettorePrefissoViaDiArrivo = quote.selettorePrefissoViaDiArrivo || '';
          (this.customerModelService as any).viaDiArrivo = quote.viaDiArrivo || '';
          (this.customerModelService as any).pianoDiArrivo = quote.pianoDiArrivo || '';
          (this.customerModelService as any).occupazioneSuoloPubblicoDiArrivo = quote.occupazioneSuoloPubblicoDiArrivo || '';
          (this.customerModelService as any).capDiArrivo = quote.capDiArrivo || '';

          (this.customerModelService as any).altreDestinazioni = quote.altreDestinazioni || '';
          (this.customerModelService as any).stanzeEOggetti = this.parseMaybeJsonArray(quote.stanzeEOggetti);

          (this.customerModelService as any).lampadari = !!quote.lampadari;
          (this.customerModelService as any).imballaggio = !!quote.imballaggio;
          (this.customerModelService as any).smaltimentoMaterialiDiRisulta = !!quote.smaltimentoMaterialiDiRisulta;
          (this.customerModelService as any).riposizionamentoContenutiDegliArredi = !!quote.riposizionamentoContenutiDegliArredi;
          (this.customerModelService as any).smontaggioEImballaggioDegliArredi = !!quote.smontaggioEImballaggioDegliArredi;
          (this.customerModelService as any).caricoSuNostroMezzoIdoneo = !!quote.caricoSuNostroMezzoIdoneo;
          (this.customerModelService as any).trasporto = !!quote.trasporto;
          (this.customerModelService as any).scaricoEConsegnaAlPiano = !!quote.scaricoEConsegnaAlPiano;
          (this.customerModelService as any).montaggioDegliArredi = !!quote.montaggioDegliArredi;
          (this.customerModelService as any).ausilioDiElevatoreEsternoOvePossibile = !!quote.ausilioDiElevatoreEsternoOvePossibile;
          (this.customerModelService as any).assicurazioneControIRischiDiTrasporto = !!quote.assicurazioneControIRischiDiTrasporto;
          (this.customerModelService as any).fornituraMaterialiDaImballo = !!quote.fornituraMaterialiDaImballo;
          (this.customerModelService as any).imballaggioDeiContenuti = !!quote.imballaggioDeiContenuti;
          (this.customerModelService as any).custodiaInDeposito = !!quote.custodiaInDeposito;
          (this.customerModelService as any).ospCarico = !!quote.ospCarico;
          (this.customerModelService as any).ospScarico = !!quote.ospScarico;

          (this.customerModelService as any).prezzoTrasloco = quote.prezzoTrasloco || 0;
          (this.customerModelService as any).prezzoFornituraMaterialiDaImballo = quote.prezzoFornituraMaterialiDaImballo || 0;
          (this.customerModelService as any).prezzoImballaggioDeiContenuti = quote.prezzoImballaggioDeiContenuti || 0;
          (this.customerModelService as any).prezzoPassaggioInDeposito = quote.prezzoPassaggioInDeposito || 0;
          (this.customerModelService as any).prezzoOccupazioneSuoloPubblico = quote.prezzoOccupazioneSuoloPubblico || 0;
          (this.customerModelService as any).prezzoMensileCustodiaMobili = quote.prezzoMensileCustodiaMobili || 0;

          this.customerModelService.numeroPreventivo = numeroPreventivo;

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
                this.router.navigateByUrl('/addCustomer');
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
