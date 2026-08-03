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
  search = '';
  showArchived = false;
  viewMode: 'day' | 'month' = 'day';
  clientiSelezionati = new Set<string>();
  errorMessage = '';
  savingCells = new Set<string>();

  // Per tracciare quali dettagli sono espansi
  espanso: Set<string> = new Set();

  constructor(
    private http: HttpClient,
    public globalService: GlobalService,
    private router: Router,
  ) {}

  back(): void {
    this.router.navigateByUrl('/homeAdmin');
  }

  get filteredClienti(): any[] {
    const query = this.search.trim().toLowerCase();
    if (!query) return this.clienti;
    return this.clienti.filter((customer) =>
      [customer.numeroCliente, customer.customerName]
        .some((value) => String(value || '').toLowerCase().includes(query)),
    );
  }

  get visibleTotalHours(): string {
    const total = this.filteredClienti.reduce((sum, customer) => sum + (parseFloat(customer.totale) || 0), 0);
    return total.toFixed(2);
  }

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
          `${this.globalService.url}admin/attendance/getMonthlyByCustomer/${this.meseSelezionato}/${this.annoSelezionato}${this.showArchived ? '?includeArchived=true' : ''}`
        )
        .toPromise();

      this.clienti = res?.clienti || [];
      this.clientiSelezionati = new Set(this.clienti.map((customer) => String(customer.numeroCliente)));
      this.espanso.clear();
      this.errorMessage = '';
    } catch (err) {
      console.error('❌ Errore caricamento ore clienti:', err);
      this.errorMessage = 'Errore durante il caricamento dei dati.';
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
    return this.formatOreStr(cliente?.orePerGiorno?.[index]);
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

  isManual(cliente: any, giornoIdx: number): boolean {
    return Array.isArray(cliente?.manualDays) && cliente.manualDays.includes(giornoIdx + 1);
  }

  toggleCliente(numeroCliente: string) {
    const key = String(numeroCliente);
    if (this.clientiSelezionati.has(key)) this.clientiSelezionati.delete(key);
    else this.clientiSelezionati.add(key);
  }

  toggleAllVisible() {
    const ids = this.filteredClienti.map((customer) => String(customer.numeroCliente));
    const allSelected = ids.length > 0 && ids.every((id) => this.clientiSelezionati.has(id));
    ids.forEach((id) => allSelected ? this.clientiSelezionati.delete(id) : this.clientiSelezionati.add(id));
  }

  toggleShowArchived() {
    this.showArchived = !this.showArchived;
    this.caricaDati();
  }

  formatOreStr(value: any): string {
    const number = Number(String(value ?? '').replace(',', '.'));
    return Number.isFinite(number) && number >= 0 ? number.toFixed(2) : '0.00';
  }

  saveCustomerHours(cliente: any, giornoIdx: number) {
    const hours = Number(String(cliente.orePerGiorno[giornoIdx] ?? '').replace(',', '.'));
    if (!Number.isFinite(hours) || hours < 0 || hours > 24) {
      this.errorMessage = 'Le ore devono essere comprese tra 0 e 24.';
      return;
    }
    cliente.orePerGiorno[giornoIdx] = hours.toFixed(2);
    cliente.totale = cliente.orePerGiorno
      .reduce((sum: number, value: any) => sum + (parseFloat(value) || 0), 0)
      .toFixed(2);
    cliente.manualDays = Array.from(new Set([...(cliente.manualDays || []), giornoIdx + 1]));
    const key = `${cliente.numeroCliente}:${giornoIdx}`;
    this.savingCells.add(key);
    this.http.post(`${this.globalService.url}admin/attendance/saveMonthlyCustomerCell`, {
      numeroCliente: cliente.numeroCliente,
      giorno: giornoIdx + 1,
      mese: this.meseSelezionato,
      anno: this.annoSelezionato,
      ore: hours,
    }).subscribe({
      next: () => { this.savingCells.delete(key); this.errorMessage = ''; },
      error: (error) => {
        this.savingCells.delete(key);
        this.errorMessage = error?.error?.error || 'Errore durante il salvataggio delle ore.';
      },
    });
  }

  exportCsv() {
    const selected = this.clienti.filter((customer) => this.clientiSelezionati.has(String(customer.numeroCliente)));
    const header = ['ID cliente', 'Cliente', ...this.giorni.map((_, index) => `Giorno ${index + 1}`), 'Totale'];
    const rows = selected.map((customer) => [
      customer.numeroCliente,
      customer.customerName,
      ...customer.orePerGiorno.map((value: any) => this.formatOreStr(value)),
      this.formatOreStr(customer.totale),
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(';'))
      .join('\n');
    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Ore_clienti_${this.annoSelezionato}-${this.meseSelezionato}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
  }
}
