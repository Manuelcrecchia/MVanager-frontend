import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { GlobalService } from '../../service/global.service';
import { Router } from '@angular/router';
import { saveAs } from 'file-saver';

interface Employee {
  id: number;
  nome: string;
  cognome: string;
  email: string;
  cellulare: string;
  oreGiornaliereDefault?: string | number | null;
  active: boolean;
}

@Component({
  selector: 'app-settings-employees',
  templateUrl: './settings-employees.component.html',
  styleUrls: ['./settings-employees.component.css'],
})
export class SettingsEmployeesComponent implements OnInit {
  employeesAdd: Omit<Employee, 'id' | 'active'> = {
    nome: '',
    cognome: '',
    email: '',
    cellulare: '',
    oreGiornaliereDefault: null,
  };
  employeess: Employee[] = [];
  showArchived = false;
  isLoading = false;

  editingIndex: number | null = null;
  employeeEdit: any = {};
  private employeeEditOriginal: any = {};

  constructor(
    private http: HttpClient,
    public globalService: GlobalService,
    private router: Router,
  ) {}

  ngOnInit() {
    this.fetchEmployees();
  }

  fetchEmployees() {
    const params = this.showArchived ? '?includeArchived=true' : '';
    this.http
      .get(this.globalService.url + 'employees/getAll' + params, {
        headers: this.globalService.headers,
        responseType: 'text',
      })
      .subscribe({
        next: (response) => {
          this.employeess = JSON.parse(response);
        },
        error: (error) => {
          console.error('Errore durante il recupero dei dipendenti:', error);
        },
      });
  }

  toggleShowArchived() {
    this.showArchived = !this.showArchived;
    this.fetchEmployees();
  }

  startEdit(i: number) {
    this.editingIndex = i;
    this.employeeEditOriginal = { ...this.employeess[i] };
    this.employeeEdit = { ...this.employeess[i] };
  }

  cancelEdit() {
    this.editingIndex = null;
    this.employeeEdit = {};
    this.employeeEditOriginal = {};
  }

  saveEdit() {
    if (this.editingIndex === null) return;

    const body = {
      id: this.employeeEdit.id,
      nome: this.employeeEdit.nome,
      cognome: this.employeeEdit.cognome,
      email: this.employeeEdit.email,
      cellulare: this.employeeEdit.cellulare,
      oreGiornaliereDefault: this.employeeEdit.oreGiornaliereDefault,
    };

    this.http
      .post(this.globalService.url + 'employees/edit', body, {
        headers: this.globalService.headers,
        responseType: 'text',
      })
      .subscribe({
        next: () => {
          this.cancelEdit();
          this.fetchEmployees();
        },
        error: (err) => {
          console.error('Errore modifica dipendente:', err);
          alert('Errore durante la modifica dipendente');
        },
      });
  }

  addEmployees() {
    const body = {
      nome: this.employeesAdd.nome,
      cognome: this.employeesAdd.cognome,
      email: this.employeesAdd.email,
      cellulare: this.employeesAdd.cellulare,
      oreGiornaliereDefault: this.employeesAdd.oreGiornaliereDefault,
    };

    this.isLoading = true;
    this.http
      .post(this.globalService.url + 'employees/add', body, {
        headers: this.globalService.headers,
        responseType: 'text',
      })
      .subscribe({
        next: () => {
          this.isLoading = false;
          this.employeesAdd = {
            nome: '',
            cognome: '',
            email: '',
            cellulare: '',
            oreGiornaliereDefault: null,
          };
          this.fetchEmployees();
        },
        error: (error) => {
          this.isLoading = false;
          console.error("Errore durante l'aggiunta del dipendente:", error);
          if (error.status === 409) {
            alert(this.parseServerError(error, 'Un dipendente con questa email esiste già'));
          } else {
            alert(this.parseServerError(error, "Errore durante l'aggiunta del dipendente"));
          }
        },
      });
  }

  private parseServerError(error: any, fallback: string): string {
    try {
      const body = typeof error?.error === 'string'
        ? JSON.parse(error.error)
        : error?.error;
      return body?.error || fallback;
    } catch {
      return fallback;
    }
  }

  unarchiveEmployee(emp: Employee): void {
    if (!confirm(`Vuoi riattivare il dipendente "${emp.nome} ${emp.cognome}"?`)) return;

    this.isLoading = true;
    this.http
      .post(this.globalService.url + 'employees/unarchive', { employeeId: emp.id }, {
        headers: this.globalService.headers,
        responseType: 'text',
      })
      .subscribe({
        next: () => {
          this.isLoading = false;
          alert(`Dipendente ${emp.nome} ${emp.cognome} riattivato con successo.`);
          this.fetchEmployees();
        },
        error: (err) => {
          this.isLoading = false;
          console.error('Errore disarchiviazione dipendente:', err);
          try {
            const body = JSON.parse(err.error);
            alert(body.error);
          } catch {
            alert('Errore durante la riattivazione del dipendente');
          }
        },
      });
  }

  exportAndArchiveEmployee(emp: any): void {
    if (
      !confirm(
        `Vuoi esportare e ARCHIVIARE il dipendente "${emp.nome} ${emp.cognome}"?\n\n` +
          `Lo storico (turni, presenze, timbrature) rimarrà nel sistema.`,
      )
    )
      return;

    this.http
      .post(this.globalService.url + 'employees/exportAndDeleteUser', { employeeId: emp.id }, {
        headers: this.globalService.headers,
        responseType: 'blob',
      })
      .subscribe({
        next: (blob) => {
          saveAs(blob, `dipendente_${emp.nome}_${emp.cognome}.zip`);
          alert('Dipendente esportato e archiviato con successo.');
          this.fetchEmployees();
        },
        error: (err) => {
          console.error('Errore:', err);
          alert('Errore durante esportazione/archiviazione dipendente.');
        },
      });
  }

  back() {
    this.router.navigateByUrl('/homeAdmin');
  }
}
