import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { GlobalService } from '../../service/global.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-riepilogo-ore-clienti',
  templateUrl: './riepilogo-ore-clienti.component.html',
  styleUrls: ['./riepilogo-ore-clienti.component.css'],
})
export class RiepilogoOreClientiComponent implements OnInit {
  mesi = [
    { nome: 'Gennaio', valore: '01' },
    { nome: 'Febbraio', valore: '02' },
    { nome: 'Marzo', valore: '03' },
    { nome: 'Aprile', valore: '04' },
    { nome: 'Maggio', valore: '05' },
    { nome: 'Giugno', valore: '06' },
    { nome: 'Luglio', valore: '07' },
    { nome: 'Agosto', valore: '08' },
    { nome: 'Settembre', valore: '09' },
    { nome: 'Ottobre', valore: '10' },
    { nome: 'Novembre', valore: '11' },
    { nome: 'Dicembre', valore: '12' },
  ];

  meseSelezionato = (new Date().getMonth() + 1).toString().padStart(2, '0');
  annoSelezionato = new Date().getFullYear();

  clienti: any[] = [];
  giorni: string[] = [];
  loading = false;
  selectedDayIndex = 0;

  // Per tracciare quali dettagli sono espansi
  espanso: Set<string> = new Set();

  constructor(
    private http: HttpClient,
    public globalService: GlobalService,
    private router: Router
  ) {}

  ngOnInit() {
    this.generaGiorni();
    this.caricaDati();
  }

  generaGiorni() {
    const year = +this.annoSelezionato;
    const month = +this.meseSelezionato;
    const numGiorni = new Date(year, month, 0).getDate();
    const abbr = ['D', 'L', 'M', 'M', 'G', 'V', 'S'];

    this.giorni = Array.from({ length: numGiorni }, (_, i) => {
      const date = new Date(year, month - 1, i + 1);
      const dayOfWeek = abbr[date.getDay()];
      return `${(i + 1).toString().padStart(2, '0')}\n${dayOfWeek}`;
    });
  }

  async caricaDati() {
    this.loading = true;

    try {
      this.generaGiorni();

      const res: any = await this.http
        .get(
          `${this.globalService.url}admin/attendance/getMonthlyByCustomer/${this.meseSelezionato}/${this.annoSelezionato}`
        )
        .toPromise();

      this.clienti = res?.clienti || [];
      this.espanso.clear();
    } catch (err) {
      console.error('❌ Errore caricamento ore clienti:', err);
      alert('Errore durante il caricamento dei dati');
    } finally {
      this.loading = false;
    }
  }

  cambiaMeseAnno() {
    this.generaGiorni();
    this.selectedDayIndex = 0;
    this.caricaDati();
  }

  selectDay(index: number) {
    this.selectedDayIndex = index;
  }

  prevDay() {
    if (this.selectedDayIndex > 0) {
      this.selectedDayIndex -= 1;
    }
  }

  nextDay() {
    if (this.selectedDayIndex < this.giorni.length - 1) {
      this.selectedDayIndex += 1;
    }
  }

  get selectedDayLabel(): string {
    return this.giorni[this.selectedDayIndex] || '';
  }

  getDayLabel(index: number): string {
    return this.giorni[index] || '';
  }

  getDayShortLabel(index: number): string {
    const [day, weekday] = this.getDayLabel(index).split('\n');
    return [day, weekday].filter(Boolean).join(' ');
  }

  getClienteOre(cliente: any, index: number): string {
    return cliente?.orePerGiorno?.[index] || '0.00';
  }

  getClienteDettagli(cliente: any, index: number): any[] {
    return cliente?.dettagliPerGiorno?.[index] || [];
  }

  // Genera una chiave unica per tracciare lo stato espanso
  getDettaglioKey(numeroCliente: string, giornoIdx: number): string {
    return `${numeroCliente}_${giornoIdx}`;
  }

  toggleDettaglio(numeroCliente: string, giornoIdx: number) {
    const key = this.getDettaglioKey(numeroCliente, giornoIdx);
    if (this.espanso.has(key)) {
      this.espanso.delete(key);
    } else {
      this.espanso.add(key);
    }
  }

  isEspanso(numeroCliente: string, giornoIdx: number): boolean {
    return this.espanso.has(this.getDettaglioKey(numeroCliente, giornoIdx));
  }

  haDettagli(cliente: any, giornoIdx: number): boolean {
    return cliente.dettagliPerGiorno[giornoIdx]?.length > 0;
  }

  back() {
    this.router.navigate(['/homeAdmin']);
  }
}
