import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { GlobalService } from '../../service/global.service';

@Component({
  selector: 'app-gestione-assenze',
  templateUrl: './gestione-assenze.component.html',
  styleUrls: ['./gestione-assenze.component.css'],
})
export class GestioneAssenzeComponent implements OnInit {
  employeeId!: number;
  assenze: any[] = [];
  nuovaAssenza = {
    dataInizio: '',
    dataFine: '',
    categoria: '',
    oreGiornaliere: '',
  };
  categorie: string[] = [];

  constructor(
    private http: HttpClient,
    private route: ActivatedRoute,
    private router: Router,
    private global: GlobalService
  ) {}

  ngOnInit(): void {
    this.global.loadTenantConfig(false, { showError: false }).then(() => {
      this.categorie = this.global.getLeaveCategories().map((category) => category.key);
      if (!this.nuovaAssenza.categoria && this.categorie.length) {
        this.nuovaAssenza.categoria = this.categorie[0];
      }
    });
    this.route.queryParams.subscribe((params) => {
      this.employeeId = params['employeeId'];
      if (this.employeeId) this.loadAssenze();
    });
  }

  goBack() {
    this.router.navigateByUrl('/gestioneemployees');
  }

  loadAssenze() {
    this.http
      .get(this.global.url + 'admin/attendanceCategory/get/' + this.employeeId)
      .subscribe({
        next: (data: any) => (this.assenze = data),
        error: (err) => {
          console.error('Errore caricamento assenze:', err);
          alert('❌ ' + this.parseServerError(err));
        },
      });
  }

  addAssenza() {
    const payload = { ...this.nuovaAssenza, employeeId: this.employeeId };

    this.http
      .post(this.global.url + 'admin/attendanceCategory/add', payload)
      .subscribe({
        next: () => {
          this.loadAssenze();
          this.nuovaAssenza = {
            dataInizio: '',
            dataFine: '',
            categoria: '',
            oreGiornaliere: '',
          };
        },
        error: (err) => {
          console.error('Errore creazione assenza:', err);
          alert('❌ ' + this.parseServerError(err));
        },
      });
  }

  updateAssenza(a: any) {
    this.http
      .post(this.global.url + 'admin/attendanceCategory/update/' + a.id, a)
      .subscribe({
        next: () => this.loadAssenze(),
        error: (err) => {
          console.error('Errore aggiornamento:', err);
          alert('❌ ' + this.parseServerError(err));
        },
      });
  }

  deleteAssenza(id: number) {
    if (confirm('Vuoi davvero eliminare questa assenza?')) {
      this.http
        .post(this.global.url + 'admin/attendanceCategory/delete/' + id, {})
        .subscribe({
          next: () => this.loadAssenze(),
          error: (err) => {
            console.error('Errore eliminazione:', err);
            alert('❌ ' + this.parseServerError(err));
          },
        });
    }
  }

  private parseServerError(err: any): string {
    try {
      const body = typeof err.error === 'string' ? JSON.parse(err.error) : err.error;
      if (body?.error) return body.error;
    } catch {}
    if (err.status === 0) return 'Impossibile connettersi al server';
    return 'Errore imprevisto. Riprova.';
  }
}
