import { HttpClient } from '@angular/common/http';
import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { GlobalService } from '../../service/global.service';
import { CustomerModelService } from '../../service/customer-model.service';
import { TenantService } from '../../service/tenant.service';
import { PopupServiceService } from '../../componenti/popup/popup-service.service';
import { AutomaticAddInspectionToCalendarService } from '../../service/automatic-add-inspection-to-calendar.service';

@Component({
  selector: 'app-add-customer',
  templateUrl: './add-customer.component.html',
  styleUrl: './add-customer.component.css',
})
export class AddCustomerComponent {
  stanzaSelezionata: string = '';

  nomiStanze: string[] = [];
  serviziOptions: string[] = [];
  stanzeEOggettiList: { stanza: string; oggetti: string }[] = [];

  frasePerStanza: Map<number, string[]> = new Map();
  stanzaMap: Map<string, number> = new Map();
  private allRooms: any[] = [];

  ngOnInit(): void {
    this.loadQuoteSettings();
    this.caricaStanzeEOggetti();
    if (this.tenantService.isEmmeci) {
      // Inizializza tipoCliente se non è impostato
      if (!this.customerModelService.tipoCliente) {
        this.customerModelService.tipoCliente = 'R';
      }
      this.updateNomiStanze();
    }
  }

  onTipoClienteChange(): void {
    if (this.tenantService.isEmmeci) {
      this.updateNomiStanze();
    }
  }

  loadQuoteSettings(): void {
    this.http
      .get<any[]>(this.globalService.url + 'admin/quote-settings/phrases', {
        headers: this.globalService.headers,
      })
      .subscribe({
        next: (phrases) => {
          if (this.tenantService.isEmmeci) {
            this.frasePerStanza.clear();
            this.serviziOptions = [];

            phrases.forEach((phrase) => {
              if (phrase.roomId) {
                if (!this.frasePerStanza.has(phrase.roomId)) {
                  this.frasePerStanza.set(phrase.roomId, []);
                }
                this.frasePerStanza.get(phrase.roomId)!.push(phrase.testo);
              }
            });
          } else {
            this.serviziOptions = phrases
              .filter((p) => !p.roomId)
              .map((p) => p.testo);
          }
        },
        error: (err) => {
          console.error('Errore caricamento frasi:', err);
        },
      });

    if (this.tenantService.isEmmeci) {
      this.http
        .get<any[]>(this.globalService.url + 'admin/quote-settings/rooms', {
          headers: this.globalService.headers,
        })
        .subscribe({
          next: (rooms) => {
            this.allRooms = rooms;
            this.updateNomiStanze();
          },
          error: (err) => {
            console.error('Errore caricamento stanze:', err);
          },
        });
    }
  }

  updateNomiStanze(): void {
    if (!this.tenantService.isEmmeci || this.allRooms.length === 0) return;

    const tipoPreventivo = this.customerModelService.tipoCliente === 'U' ? 'U' : 'R';

    this.nomiStanze = this.allRooms
      .filter((r) => r.tipoPreventivo === tipoPreventivo)
      .map((r) => r.nome)
      .sort();

    this.stanzaMap.clear();
    this.allRooms.forEach((room) => {
      if (room.tipoPreventivo === tipoPreventivo) {
        this.stanzaMap.set(room.nome, room.id);
      }
    });
  }

  getPhrasesForStanza(nomestanza: string): string[] {
    if (!nomestanza) return [];

    const nomeBase = nomestanza.split(' ').slice(0, -1).join(' ') || nomestanza;
    const stanzaId = this.stanzaMap.get(nomeBase) || this.stanzaMap.get(nomestanza);

    if (!stanzaId) return [];
    return this.frasePerStanza.get(stanzaId) || [];
  }

  caricaStanzeEOggetti(): void {
    const raw = this.customerModelService.stanzeEOggetti;
    if (!raw) {
      this.stanzeEOggettiList = [];
      return;
    }
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      this.stanzeEOggettiList = Array.isArray(parsed) ? parsed : [];
    } catch {
      this.stanzeEOggettiList = [];
    }
  }

  aggiungiCampoStanza(): void {
    if (this.stanzeEOggettiList.length >= 10) {
      alert('Limite massimo di 10 stanze raggiunto');
      return;
    }

    if (!this.stanzaSelezionata) return;

    const numeroEsistenti = this.stanzeEOggettiList.filter((s) =>
      s.stanza.startsWith(this.stanzaSelezionata),
    ).length;

    const nomeStanza =
      numeroEsistenti > 0
        ? `${this.stanzaSelezionata} ${numeroEsistenti + 1}`
        : this.stanzaSelezionata;

    this.stanzeEOggettiList.push({ stanza: nomeStanza, oggetti: '' });
    this.stanzaSelezionata = '';
  }

  rimuoviStanzaEOggetti(index: number): void {
    this.stanzeEOggettiList.splice(index, 1);
  }

  constructor(
    public globalService: GlobalService,
    public customerModelService: CustomerModelService,
    public tenantService: TenantService,
    private http: HttpClient,
    private router: Router,
    private popup: PopupServiceService,
    private autoInspectionService: AutomaticAddInspectionToCalendarService,
  ) {}

  private buildSamiBody() {
    return {
      codiceOperatore: this.globalService.userCode,
      numeroCliente: this.customerModelService.numeroPreventivo || undefined,
      tipoCliente: this.customerModelService.tipoCliente,
      nominativo: this.customerModelService.nominativo,
      cfpi: this.customerModelService.cfpi,
      cittaDiFatturazione: this.customerModelService.cittaDiFatturazione,
      selettorePrefissoViaDiFatturazione:
        this.customerModelService.selettorePrefissoViaDiFatturazione,
      viaDiFatturazione: this.customerModelService.viaDiFatturazione,
      capDiFatturazione: this.customerModelService.capDiFatturazione,
      citta: this.customerModelService.citta,
      selettorePrefissoVia: this.customerModelService.selettorePrefissoVia,
      via: this.customerModelService.via,
      cap: this.customerModelService.cap,
      email: this.customerModelService.email,
      telefono: this.customerModelService.telefono,
      referente: this.customerModelService.referente,
      descrizioneImmobile: this.customerModelService.descrizioneImmobile,
      servizi: JSON.stringify(this.customerModelService.servizi),
      interventi: JSON.stringify(this.customerModelService.interventi),
      imponibile: Number(this.customerModelService.imponibile || 0).toFixed(2),
      iva: this.customerModelService.iva,
      pagamento: this.customerModelService.pagamento,
      note: this.customerModelService.note,
      key: this.customerModelService.key,
      tempistica: this.customerModelService.tempistica,
      nOperatori: this.customerModelService.nOperatori,
    };
  }

  private buildEmmeciBody() {
    return {
      codiceOperatore: this.globalService.userCode,
      numeroCliente: this.customerModelService.numeroPreventivo || undefined,
      data: this.customerModelService.data,
      nominativo: this.customerModelService.nominativo,
      cfpi: this.customerModelService.cfpi,
      email: this.customerModelService.email,
      telefono: this.customerModelService.telefono,
      ragSociale: this.customerModelService.ragSociale,

      cittaDiPartenza: this.customerModelService.cittaDiPartenza,
      selettorePrefissoViaDiPartenza:
        this.customerModelService.selettorePrefissoViaDiPartenza,
      viaDiPartenza: this.customerModelService.viaDiPartenza,
      pianoDiPartenza: this.customerModelService.pianoDiPartenza,
      occupazioneSuoloPubblicoDiPartenza:
        this.customerModelService.occupazioneSuoloPubblicoDiPartenza,
      capDiPartenza: this.customerModelService.capDiPartenza,

      cittaDiArrivo: this.customerModelService.cittaDiArrivo,
      selettorePrefissoViaDiArrivo:
        this.customerModelService.selettorePrefissoViaDiArrivo,
      viaDiArrivo: this.customerModelService.viaDiArrivo,
      pianoDiArrivo: this.customerModelService.pianoDiArrivo,
      occupazioneSuoloPubblicoDiArrivo:
        this.customerModelService.occupazioneSuoloPubblicoDiArrivo,
      capDiArrivo: this.customerModelService.capDiArrivo,

      altreDestinazioni: this.customerModelService.altreDestinazioni,
      stanzeEOggetti: JSON.stringify(this.stanzeEOggettiList),

      lampadari: this.customerModelService.lampadari,
      imballaggio: this.customerModelService.imballaggio,
      smaltimentoMaterialiDiRisulta:
        this.customerModelService.smaltimentoMaterialiDiRisulta,
      riposizionamentoContenutiDegliArredi:
        this.customerModelService.riposizionamentoContenutiDegliArredi,
      smontaggioEImballaggioDegliArredi:
        this.customerModelService.smontaggioEImballaggioDegliArredi,
      caricoSuNostroMezzoIdoneo:
        this.customerModelService.caricoSuNostroMezzoIdoneo,
      trasporto: this.customerModelService.trasporto,
      scaricoEConsegnaAlPiano:
        this.customerModelService.scaricoEConsegnaAlPiano,
      montaggioDegliArredi: this.customerModelService.montaggioDegliArredi,
      ausilioDiElevatoreEsternoOvePossibile:
        this.customerModelService.ausilioDiElevatoreEsternoOvePossibile,
      assicurazioneControIRischiDiTrasporto:
        this.customerModelService.assicurazioneControIRischiDiTrasporto,
      fornituraMaterialiDaImballo:
        this.customerModelService.fornituraMaterialiDaImballo,
      imballaggioDeiContenuti:
        this.customerModelService.imballaggioDeiContenuti,
      custodiaInDeposito: this.customerModelService.custodiaInDeposito,
      ospCarico: this.customerModelService.ospCarico,
      ospScarico: this.customerModelService.ospScarico,

      prezzoTrasloco: this.customerModelService.prezzoTrasloco,
      prezzoFornituraMaterialiDaImballo:
        this.customerModelService.prezzoFornituraMaterialiDaImballo,
      prezzoImballaggioDeiContenuti:
        this.customerModelService.prezzoImballaggioDeiContenuti,
      prezzoPassaggioInDeposito:
        this.customerModelService.prezzoPassaggioInDeposito,
      prezzoOccupazioneSuoloPubblico:
        this.customerModelService.prezzoOccupazioneSuoloPubblico,
      prezzoMensileCustodiaMobili:
        this.customerModelService.prezzoMensileCustodiaMobili,

      pagamento: this.customerModelService.pagamento,
      note: this.customerModelService.note,
      tempistica: this.customerModelService.tempistica,
      nOperatori: this.customerModelService.nOperatori,
    };
  }

  addCustomer(): void {
    if (
      this.tenantService.isSami &&
      this.customerModelService.tipoCliente === ''
    ) {
      alert('Compilare il campo tipo cliente.');
      return;
    }

    const body = this.tenantService.isEmmeci
      ? this.buildEmmeciBody()
      : this.buildSamiBody();

    const numeroPreventivo = this.customerModelService.numeroPreventivo;
    const sourceCustomerName = this.customerModelService.nominativo;
    const sourceCustomerPhone = this.customerModelService.telefono;
    const sourceCustomerEmail = this.customerModelService.email;
    const sourceCustomerCategory =
      this.tenantService.isSami && this.customerModelService.tipoCliente === 'S'
        ? 'straordinario'
        : 'ordinario';

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
          const signedQuoteArchived = !!res?.signedQuoteArchived;
          const signedQuoteArchivePath = res?.signedQuoteArchivePath || '';
          const signedQuoteArchiveError = res?.signedQuoteArchiveError;
          const finalizeCustomerCreation = () => {
            if (signedQuoteArchiveError) {
              alert(
                `Cliente creato, ma non siamo riusciti ad archiviare il preventivo firmato: ${signedQuoteArchiveError}`,
              );
            } else if (signedQuoteArchived) {
              alert(
                `Cliente creato e preventivo firmato archiviato in Documenti cliente > ${signedQuoteArchivePath || 'Preventivi Firmati'}`,
              );
            }

            if (numeroPreventivo && numeroCliente) {
              this.autoInspectionService.pendingCustomerEvent = true;
              this.autoInspectionService.numeroCliente = numeroCliente;
              this.autoInspectionService.nominativo = sourceCustomerName;
              this.autoInspectionService.telefono = sourceCustomerPhone;
              this.autoInspectionService.customerEventCategory = sourceCustomerCategory;
              this.autoInspectionService.customerEventDescription = [
                `Cliente ${sourceCustomerName}`,
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
                next: () => {
                  finalizeCustomerCreation();
                },
                error: () => {
                  finalizeCustomerCreation();
                },
              });
          } else {
            finalizeCustomerCreation();
          }
        },
        error: (err) => {
          console.error("Errore durante l'aggiunta del cliente:", err);
          const msg = this.parseServerError(err);
          alert(msg);
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
