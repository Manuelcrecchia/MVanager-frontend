import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { GlobalService } from '../../service/global.service';
import { Location } from '@angular/common';

@Component({
  selector: 'app-timbrature-home',
  templateUrl: './timbrature-home.component.html',
  styleUrls: ['./timbrature-home.component.css'],
})
export class TimbratureHomeComponent implements OnInit {
  employees: any[] = [];
  selectedDate: string = '';
  loading: boolean = false;
  stampingConfig: any = { mode: 'customer_tag', warehouseLabel: 'Magazzino' };
  employeeSearch = '';

  constructor(
    private http: HttpClient,
    private router: Router,
    private global: GlobalService,
    private location: Location
  ) {}

  ngOnInit(): void {
    const today = new Date();
    this.selectedDate = today.toISOString().split('T')[0];
    this.loadEmployees();
  }

  get filteredEmployees(): any[] {
    const query = this.normalizeSearch(this.employeeSearch);
    if (!query) return this.employees;

    return this.employees.filter((emp) => {
      const text = this.normalizeSearch([
        emp?.nome,
        emp?.cognome,
        emp?.email,
        emp?.cellulare,
        emp?.hasError ? 'errori errore anomalie' : 'ok corretto',
        emp?.errorsCount,
      ].join(' '));

      return text.includes(query);
    });
  }

  // 🔹 Carica dipendenti e controlla errori
  loadEmployees(): void {
    this.loading = true;
    this.http
      .get<any>(
        `${this.global.url}admin/stamping/employees?date=${this.selectedDate}`
      )
      .subscribe({
        next: (res) => {
          this.employees = res.employees || [];
          this.stampingConfig = res.stampingConfig || this.stampingConfig;
          this.loading = false;
        },
        error: (err) => {
          console.error('Errore caricamento dipendenti:', err);
          this.loading = false;
          alert('Errore durante il caricamento delle timbrature');
        },
      });
  }

  // 🔹 Naviga nel dettaglio giornaliero
  openDetail(emp: any): void {
    this.router.navigate(['/timbratureDettaglio', emp.id, this.selectedDate]);
  }

  // 🔹 Cambia giorno
  changeDate(delta: number): void {
    const current = new Date(this.selectedDate);
    current.setDate(current.getDate() + delta);
    this.selectedDate = current.toISOString().split('T')[0];
    this.loadEmployees();
  }

  back(): void {
    this.location.back();
  }

  private normalizeSearch(value: unknown): string {
    return String(value || '')
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .trim();
  }
}
