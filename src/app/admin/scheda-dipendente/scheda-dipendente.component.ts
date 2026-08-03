import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { GlobalService, TenantEmployeeFieldConfig } from '../../service/global.service';

@Component({
  selector: 'app-scheda-dipendente',
  templateUrl: './scheda-dipendente.component.html',
  styleUrls: ['./scheda-dipendente.component.css'],
})
export class SchedaDipendenteComponent implements OnInit {
  employee: any | null = null;
  loading = true;

  constructor(
    public globalService: GlobalService,
    private http: HttpClient,
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  ngOnInit(): void {
    const employeeId = Number(this.route.snapshot.paramMap.get('employeeId'));
    if (!employeeId) {
      this.loading = false;
      return;
    }

    this.globalService.loadTenantConfig(false, { showError: false });
    this.http.get(this.globalService.url + 'employees/getAll?includeArchived=true', {
      headers: this.globalService.headers,
      responseType: 'text',
    }).subscribe({
      next: (response) => {
        try {
          const employees = JSON.parse(response);
          this.employee = Array.isArray(employees)
            ? employees.find((item) => Number(item?.id) === employeeId) || null
            : null;
        } catch {
          this.employee = null;
        }
        this.loading = false;
      },
      error: () => {
        this.employee = null;
        this.loading = false;
      },
    });
  }

  get displayName(): string {
    return [this.employee?.nome, this.employee?.cognome].filter(Boolean).join(' ') || 'Dipendente sconosciuto';
  }

  get visibleExtraFields(): TenantEmployeeFieldConfig[] {
    const baseFields = new Set(
      ['nome', 'cognome', 'email', 'cellulare', 'oreGiornaliereDefault']
        .map((key) => key.toLowerCase()),
    );
    return (this.globalService.getTenantEmployeeConfig()?.fields || []).filter((field) => {
      const key = String(field.dbColumn || field.key || '').trim().toLowerCase();
      return !!key && field.visible !== false && !baseFields.has(key);
    });
  }

  fieldValue(field: TenantEmployeeFieldConfig): string {
    const key = String(field.dbColumn || field.key || '').trim();
    const value = key ? this.employee?.[key] : null;
    if (value === undefined || value === null || value === '') return '-';
    if (field.type === 'boolean') return value === true || value === 1 || value === 'true' ? 'Sì' : 'No';
    if (Array.isArray(value)) return value.filter(Boolean).join(', ') || '-';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  back(): void {
    this.router.navigateByUrl('/homeAdmin/gestioneemployees');
  }
}
