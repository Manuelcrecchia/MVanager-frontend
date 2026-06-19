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

interface EmployeeCertification {
  id?: number;
  title: string;
  description?: string;
  remindDays?: number | null;
  folder?: string;
}

interface EmployeeCategory {
  id?: number;
  name: string;
  description?: string;
  certifications: EmployeeCertification[];
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
  categories: EmployeeCategory[] = [];
  employeeCategoryMap: { [employeeId: number]: number[] } = {};
  categoryDraft: EmployeeCategory = this.emptyCategoryDraft();
  editingCategoryId: number | null = null;
  selectedEmployeeForCategories: Employee | null = null;
  selectedEmployeeCategoryIds: number[] = [];
  employeeSearch = '';
  categorySearch = '';

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
    this.fetchCategories();
  }

  private emptyCategoryDraft(): EmployeeCategory {
    return {
      name: '',
      description: '',
      certifications: [
        { title: '', description: '', remindDays: 30, folder: 'Certificazioni categoria' },
      ],
    };
  }

  get filteredEmployees(): Employee[] {
    const query = this.normalizeSearch(this.employeeSearch);
    if (!query) return this.employeess;

    return this.employeess.filter((emp) => {
      const text = this.normalizeSearch([
        emp.nome,
        emp.cognome,
        emp.email,
        emp.cellulare,
        emp.oreGiornaliereDefault,
        emp.active ? 'attivo' : 'archiviato',
        ...this.getEmployeeCategoryNames(emp),
      ].join(' '));

      return text.includes(query);
    });
  }

  get filteredCategories(): EmployeeCategory[] {
    const query = this.normalizeSearch(this.categorySearch);
    if (!query) return this.categories;

    return this.categories.filter((category) => {
      const text = this.normalizeSearch([
        category.name,
        category.description,
        ...(category.certifications || []).flatMap((cert) => [
          cert.title,
          cert.folder,
          cert.description,
        ]),
      ].join(' '));

      return text.includes(query);
    });
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
          this.fetchEmployeeCategoryAssignments();
        },
        error: (error) => {
          console.error('Errore durante il recupero dei dipendenti:', error);
        },
      });
  }

  fetchCategories() {
    this.http
      .get<EmployeeCategory[]>(this.globalService.url + 'admin/employee-categories', {
        headers: this.globalService.headers,
      })
      .subscribe({
        next: (categories) => {
          this.categories = Array.isArray(categories) ? categories : [];
          this.fetchEmployeeCategoryAssignments();
        },
        error: (error) => {
          console.error('Errore caricamento categorie dipendenti:', error);
        },
      });
  }

  fetchEmployeeCategoryAssignments() {
    this.http
      .get<any[]>(this.globalService.url + 'admin/employee-categories/assignments', {
        headers: this.globalService.headers,
      })
      .subscribe({
        next: (rows) => {
          const map: { [employeeId: number]: number[] } = {};
          for (const row of rows || []) {
            const employeeId = Number(row.employeeId);
            const categoryId = Number(row.categoryId);
            if (!employeeId || !categoryId) continue;
            if (!map[employeeId]) map[employeeId] = [];
            map[employeeId].push(categoryId);
          }
          this.employeeCategoryMap = map;
        },
        error: () => {
          this.employeeCategoryMap = {};
        },
      });
  }

  getEmployeeCategoryNames(emp: Employee): string[] {
    const ids = this.employeeCategoryMap[emp.id] || [];
    return ids
      .map((id) => this.categories.find((category) => category.id === id)?.name || '')
      .filter(Boolean);
  }

  addCertificationDraft() {
    this.categoryDraft.certifications.push({
      title: '',
      description: '',
      remindDays: 30,
      folder: this.categoryDraft.name ? `Certificazioni ${this.categoryDraft.name}` : 'Certificazioni categoria',
    });
  }

  removeCertificationDraft(index: number) {
    this.categoryDraft.certifications.splice(index, 1);
    if (!this.categoryDraft.certifications.length) {
      this.addCertificationDraft();
    }
  }

  editCategory(category: EmployeeCategory) {
    this.editingCategoryId = category.id || null;
    this.categoryDraft = {
      id: category.id,
      name: category.name,
      description: category.description || '',
      certifications: (category.certifications || []).length
        ? category.certifications.map((cert) => ({ ...cert }))
        : [{ title: '', description: '', remindDays: 30, folder: `Certificazioni ${category.name}` }],
    };
  }

  resetCategoryDraft() {
    this.editingCategoryId = null;
    this.categoryDraft = this.emptyCategoryDraft();
  }

  saveCategory() {
    if (!this.categoryDraft.name.trim()) {
      alert('Inserisci il nome della categoria');
      return;
    }

    const body = {
      ...this.categoryDraft,
      certifications: this.categoryDraft.certifications.filter((cert) => cert.title.trim()),
    };

    this.http
      .post(this.globalService.url + 'admin/employee-categories/save', body, {
        headers: this.globalService.headers,
      })
      .subscribe({
        next: () => {
          this.resetCategoryDraft();
          this.fetchCategories();
        },
        error: (error) => {
          console.error('Errore salvataggio categoria:', error);
          alert(this.parseServerError(error, 'Errore durante il salvataggio categoria'));
        },
      });
  }

  deleteCategory(category: EmployeeCategory) {
    if (!category.id) return;
    if (!confirm(`Eliminare la categoria "${category.name}"?`)) return;

    this.http
      .post(this.globalService.url + 'admin/employee-categories/delete', { id: category.id }, {
        headers: this.globalService.headers,
      })
      .subscribe({
        next: () => {
          this.fetchCategories();
          if (this.editingCategoryId === category.id) this.resetCategoryDraft();
        },
        error: (error) => {
          console.error('Errore eliminazione categoria:', error);
          alert(this.parseServerError(error, 'Errore durante eliminazione categoria'));
        },
      });
  }

  openEmployeeCategories(emp: Employee) {
    this.selectedEmployeeForCategories = emp;
    this.selectedEmployeeCategoryIds = [];
    this.http
      .get<number[]>(this.globalService.url + `admin/employee-categories/employee/${emp.id}`, {
        headers: this.globalService.headers,
      })
      .subscribe({
        next: (ids) => {
          this.selectedEmployeeCategoryIds = Array.isArray(ids) ? ids.map(Number) : [];
        },
        error: (error) => {
          console.error('Errore categorie dipendente:', error);
          alert('Errore durante il caricamento categorie dipendente');
        },
      });
  }

  toggleEmployeeCategory(categoryId: number | undefined, checked: boolean) {
    if (!categoryId) return;
    if (checked && !this.selectedEmployeeCategoryIds.includes(categoryId)) {
      this.selectedEmployeeCategoryIds.push(categoryId);
    }
    if (!checked) {
      this.selectedEmployeeCategoryIds = this.selectedEmployeeCategoryIds.filter((id) => id !== categoryId);
    }
  }

  saveEmployeeCategories() {
    if (!this.selectedEmployeeForCategories) return;

    this.http
      .post(
        this.globalService.url + `admin/employee-categories/employee/${this.selectedEmployeeForCategories.id}`,
        { categoryIds: this.selectedEmployeeCategoryIds },
        { headers: this.globalService.headers },
      )
      .subscribe({
        next: (res: any) => {
          if (this.selectedEmployeeForCategories) {
            this.employeeCategoryMap[this.selectedEmployeeForCategories.id] = [
              ...this.selectedEmployeeCategoryIds,
            ];
          }
          const created = Number(res?.createdDeadlines || 0);
          alert(
            created > 0
              ? `Categorie salvate. Create ${created} scadenze obbligatorie vuote.`
              : 'Categorie salvate.',
          );
        },
        error: (error) => {
          console.error('Errore salvataggio categorie dipendente:', error);
          alert(this.parseServerError(error, 'Errore durante il salvataggio categorie dipendente'));
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

  startEditEmployee(emp: Employee) {
    const index = this.employeess.findIndex((item) => item.id === emp.id);
    if (index === -1) return;
    this.startEdit(index);
  }

  isEditingEmployee(emp: Employee): boolean {
    return (
      this.editingIndex !== null &&
      this.employeess[this.editingIndex]?.id === emp.id
    );
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

  private normalizeSearch(value: unknown): string {
    return String(value || '')
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .trim();
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
