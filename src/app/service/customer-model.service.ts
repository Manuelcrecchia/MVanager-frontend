import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class CustomerModelService {
  // comuni
  numeroCliente = '';
  nominativo = '';
  numeroPreventivo = ''; // popolato dal flusso preventivo → cliente
  cfpi = '';
  email = '';
  telefono = '';
  pagamento = '';
  note = '';
  tempistica = '';
  nOperatori = '';

  // SAMI
  tipoCliente = '';
  cittaDiFatturazione = '';
  selettorePrefissoViaDiFatturazione = '';
  viaDiFatturazione = '';
  capDiFatturazione = '';
  citta = '';
  selettorePrefissoVia = '';
  via = '';
  cap = '';
  referente = '';
  descrizioneImmobile = '';
  servizi = ['', '', '', '', '', '', '', '', '', '', '', '', '', ''];
  interventi = ['', '', '', '', '', '', '', '', '', '', '', '', '', ''];
  imponibile = '0.00';
  iva = 'N';
  key: boolean = false;

  // EMMECI
  codiceOperatore = '';
  data = '';
  ragSociale = '';

  cittaDiPartenza = '';
  selettorePrefissoViaDiPartenza = '';
  viaDiPartenza = '';
  pianoDiPartenza = '';
  occupazioneSuoloPubblicoDiPartenza = '';
  capDiPartenza = '';

  cittaDiArrivo = '';
  selettorePrefissoViaDiArrivo = '';
  viaDiArrivo = '';
  pianoDiArrivo = '';
  occupazioneSuoloPubblicoDiArrivo = '';
  capDiArrivo = '';

  altreDestinazioni = '';
  stanzeEOggetti = '';

  lampadari = false;
  imballaggio = false;
  smaltimentoMaterialiDiRisulta = false;
  riposizionamentoContenutiDegliArredi = false;
  smontaggioEImballaggioDegliArredi = false;
  caricoSuNostroMezzoIdoneo = false;
  trasporto = false;
  scaricoEConsegnaAlPiano = false;
  montaggioDegliArredi = false;
  ausilioDiElevatoreEsternoOvePossibile = false;
  assicurazioneControIRischiDiTrasporto = false;
  fornituraMaterialiDaImballo = false;
  imballaggioDeiContenuti = false;
  custodiaInDeposito = false;
  ospCarico = false;
  ospScarico = false;

  prezzoTrasloco = 0;
  prezzoFornituraMaterialiDaImballo = 0;
  prezzoImballaggioDeiContenuti = 0;
  prezzoPassaggioInDeposito = 0;
  prezzoOccupazioneSuoloPubblico = 0;
  prezzoMensileCustodiaMobili = 0;

  populateFromQuote(quote: any, numeroPreventivo: string): void {
    this.tipoCliente = quote.tipoPreventivo === 'S' ? 'S' : 'O';
    this.nominativo = quote.nominativo || '';
    this.cfpi = quote.cfpi || '';
    this.cittaDiFatturazione = quote.cittaDiFatturazione || '';
    this.selettorePrefissoViaDiFatturazione =
      quote.selettorePrefissoViaDiFatturazione || '';
    this.viaDiFatturazione = quote.viaDiFatturazione || '';
    this.capDiFatturazione = quote.capDiFatturazione || '';
    this.citta = quote.citta || '';
    this.selettorePrefissoVia = quote.selettorePrefissoVia || '';
    this.via = quote.via || '';
    this.cap = quote.cap || '';
    this.email = quote.email || '';
    this.telefono = quote.telefono || '';
    this.referente = quote.referente || '';
    this.descrizioneImmobile = quote.descrizioneImmobile || '';
    this.servizi = this.parseMaybeJsonArray(quote.servizi);
    this.interventi = this.parseMaybeJsonArray(quote.interventi);
    this.imponibile = quote.imponibile
      ? parseFloat(quote.imponibile).toFixed(2)
      : '0.00';
    this.iva = quote.iva || '';
    this.pagamento = quote.pagamento || '';
    this.tempistica = quote.tempistica || '';
    this.note = quote.note || '';

    this.ragSociale = quote.ragSociale || '';
    this.data = quote.data || '';
    this.cittaDiPartenza = quote.cittaDiPartenza || '';
    this.selettorePrefissoViaDiPartenza =
      quote.selettorePrefissoViaDiPartenza || '';
    this.viaDiPartenza = quote.viaDiPartenza || '';
    this.pianoDiPartenza = quote.pianoDiPartenza || '';
    this.occupazioneSuoloPubblicoDiPartenza =
      quote.occupazioneSuoloPubblicoDiPartenza || '';
    this.capDiPartenza = quote.capDiPartenza || '';

    this.cittaDiArrivo = quote.cittaDiArrivo || '';
    this.selettorePrefissoViaDiArrivo =
      quote.selettorePrefissoViaDiArrivo || '';
    this.viaDiArrivo = quote.viaDiArrivo || '';
    this.pianoDiArrivo = quote.pianoDiArrivo || '';
    this.occupazioneSuoloPubblicoDiArrivo =
      quote.occupazioneSuoloPubblicoDiArrivo || '';
    this.capDiArrivo = quote.capDiArrivo || '';

    this.altreDestinazioni = quote.altreDestinazioni || '';
    this.stanzeEOggetti = this.parseMaybeJsonArray(quote.stanzeEOggetti) as any;

    this.lampadari = !!quote.lampadari;
    this.imballaggio = !!quote.imballaggio;
    this.smaltimentoMaterialiDiRisulta = !!quote.smaltimentoMaterialiDiRisulta;
    this.riposizionamentoContenutiDegliArredi =
      !!quote.riposizionamentoContenutiDegliArredi;
    this.smontaggioEImballaggioDegliArredi =
      !!quote.smontaggioEImballaggioDegliArredi;
    this.caricoSuNostroMezzoIdoneo = !!quote.caricoSuNostroMezzoIdoneo;
    this.trasporto = !!quote.trasporto;
    this.scaricoEConsegnaAlPiano = !!quote.scaricoEConsegnaAlPiano;
    this.montaggioDegliArredi = !!quote.montaggioDegliArredi;
    this.ausilioDiElevatoreEsternoOvePossibile =
      !!quote.ausilioDiElevatoreEsternoOvePossibile;
    this.assicurazioneControIRischiDiTrasporto =
      !!quote.assicurazioneControIRischiDiTrasporto;
    this.fornituraMaterialiDaImballo = !!quote.fornituraMaterialiDaImballo;
    this.imballaggioDeiContenuti = !!quote.imballaggioDeiContenuti;
    this.custodiaInDeposito = !!quote.custodiaInDeposito;
    this.ospCarico = !!quote.ospCarico;
    this.ospScarico = !!quote.ospScarico;

    this.prezzoTrasloco = quote.prezzoTrasloco || 0;
    this.prezzoFornituraMaterialiDaImballo =
      quote.prezzoFornituraMaterialiDaImballo || 0;
    this.prezzoImballaggioDeiContenuti =
      quote.prezzoImballaggioDeiContenuti || 0;
    this.prezzoPassaggioInDeposito = quote.prezzoPassaggioInDeposito || 0;
    this.prezzoOccupazioneSuoloPubblico =
      quote.prezzoOccupazioneSuoloPubblico || 0;
    this.prezzoMensileCustodiaMobili =
      quote.prezzoMensileCustodiaMobili || 0;
    this.numeroPreventivo = numeroPreventivo;
  }

  reset() {
    this.numeroCliente = '';
    this.nominativo = '';
    this.numeroPreventivo = '';
    this.cfpi = '';
    this.email = '';
    this.telefono = '';
    this.pagamento = '';
    this.note = '';
    this.tempistica = '';
    this.nOperatori = '';

    this.tipoCliente = '';
    this.cittaDiFatturazione = '';
    this.selettorePrefissoViaDiFatturazione = '';
    this.viaDiFatturazione = '';
    this.capDiFatturazione = '';
    this.citta = '';
    this.selettorePrefissoVia = '';
    this.via = '';
    this.cap = '';
    this.referente = '';
    this.descrizioneImmobile = '';
    this.servizi = ['', '', '', '', '', '', '', '', '', '', '', '', '', ''];
    this.interventi = ['', '', '', '', '', '', '', '', '', '', '', '', '', ''];
    this.imponibile = '0.00';
    this.iva = 'N';
    this.key = false;

    this.codiceOperatore = '';
    this.data = '';
    this.ragSociale = '';

    this.cittaDiPartenza = '';
    this.selettorePrefissoViaDiPartenza = '';
    this.viaDiPartenza = '';
    this.pianoDiPartenza = '';
    this.occupazioneSuoloPubblicoDiPartenza = '';
    this.capDiPartenza = '';

    this.cittaDiArrivo = '';
    this.selettorePrefissoViaDiArrivo = '';
    this.viaDiArrivo = '';
    this.pianoDiArrivo = '';
    this.occupazioneSuoloPubblicoDiArrivo = '';
    this.capDiArrivo = '';

    this.altreDestinazioni = '';
    this.stanzeEOggetti = '';

    this.lampadari = false;
    this.imballaggio = false;
    this.smaltimentoMaterialiDiRisulta = false;
    this.riposizionamentoContenutiDegliArredi = false;
    this.smontaggioEImballaggioDegliArredi = false;
    this.caricoSuNostroMezzoIdoneo = false;
    this.trasporto = false;
    this.scaricoEConsegnaAlPiano = false;
    this.montaggioDegliArredi = false;
    this.ausilioDiElevatoreEsternoOvePossibile = false;
    this.assicurazioneControIRischiDiTrasporto = false;
    this.fornituraMaterialiDaImballo = false;
    this.imballaggioDeiContenuti = false;
    this.custodiaInDeposito = false;
    this.ospCarico = false;
    this.ospScarico = false;

    this.prezzoTrasloco = 0;
    this.prezzoFornituraMaterialiDaImballo = 0;
    this.prezzoImballaggioDeiContenuti = 0;
    this.prezzoPassaggioInDeposito = 0;
    this.prezzoOccupazioneSuoloPubblico = 0;
    this.prezzoMensileCustodiaMobili = 0;
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

  constructor() {}
}
