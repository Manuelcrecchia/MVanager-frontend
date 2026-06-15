import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { GlobalService } from '../../service/global.service';
import { Subject, debounceTime, lastValueFrom } from 'rxjs';
import { Router } from '@angular/router';

@Component({
  selector: 'app-riepilogo-presenze-editabile',
  templateUrl: './riepilogo-presenze-editabile.component.html',
  styleUrls: ['./riepilogo-presenze-editabile.component.css'],
})
export class RiepilogoPresenzeEditabileComponent implements OnInit {
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

  dipendenti: any[] = [];
  giorni: string[] = [];
  loading = false;
  dipendentiSelezionati: Set<number> = new Set();
  selectedDayIndex = 0;

  private noteChanges: { [id: number]: Subject<string> } = {};

  get categorieVoci(): string[] {
    const keys = new Set<string>(['Ordinario']);
    this.globalService.getLeaveCategories().forEach((category) => keys.add(category.key));
    this.dipendenti.forEach((dip) => {
      Object.keys(dip.tipologie || {}).forEach((key) => {
        if (key !== '_hasCategory') keys.add(key);
      });
    });
    return [...keys];
  }

  normalizeVoceCategoria(categoria: unknown): string {
    const value = String(categoria || '').trim();
    return value || 'Ordinario';
  }

  constructor(
    private http: HttpClient,
    public globalService: GlobalService,
    private router: Router
  ) {}

  ngOnInit() {
    this.generaGiorni();
    this.caricaPresenze();
  }

  generaGiorni() {
    const year = +this.annoSelezionato;
    const month = +this.meseSelezionato;
    const numGiorni = new Date(year, month, 0).getDate();
    const abbr = ['D', 'L', 'M', 'M', 'G', 'V', 'S']; // domenica=0, lunedì=1, martedì=2, mercoledì=3, giovedì=4, venerdì=5, sabato=6

    this.giorni = Array.from({ length: numGiorni }, (_, i) => {
      const date = new Date(year, month - 1, i + 1);
      const dayOfWeek = abbr[date.getDay()];
      return `${(i + 1).toString().padStart(2, '0')}\n${dayOfWeek}`;
    });
  }

  async caricaPresenze() {
    this.loading = true;

    try {
      // 1️⃣ GIORNI DEL MESE
      this.generaGiorni();

      // 2️⃣ RIEPILOGO UFFICIALE (base)
      const res: any = await this.http
        .get(
          `${this.globalService.url}admin/attendance/getMonthly/${this.meseSelezionato}/${this.annoSelezionato}`
        )
        .toPromise();

      const dipTmp = res?.dipendenti || [];

      // 3️⃣ NORMALIZZO STRUTTURA TIPOLGIE + NOTE
      dipTmp.forEach((d: any) => {
        if (!d.tipologie) d.tipologie = {};

        const numGiorni = this.giorni.length;

        const ensureArray = (arr: any) =>
          Array.isArray(arr) ? arr : Array(numGiorni).fill('');

        d.tipologie.Ordinario = ensureArray(d.tipologie.Ordinario);
        Object.keys(d.tipologie).forEach((key) => {
          d.tipologie[key] = ensureArray(d.tipologie[key]);
        });

        if (!d.note) d.note = '';
      });

      // 4️⃣ ASSEGNO AL TEMPLATE
      this.dipendenti = dipTmp;
      this.dipendentiSelezionati = new Set(dipTmp.map((d: any) => d.id));

      // ✅ NORMALIZZAZIONE: assicura che il totale abbia sempre 2 decimali
      this.dipendenti.forEach((d: any) => {
        if (d.totale) {
          d.totale = this.formatOreStr(d.totale);
        }
      });

      // 5️⃣ INIZIALIZZO VOCI GIORNO (struttura per giornate miste)
      // Ogni giorno può avere multiple voci: [{categoria: 'O', ore: '4'}, {categoria: 'P', ore: '4'}]
      this.dipendenti.forEach((d) => {
        d.vociGiorno = []; // Array di array: vociGiorno[giornoIndex] = [{categoria, ore}, ...]

        for (let i = 0; i < this.giorni.length; i++) {
          const voci: any[] = [];

          // Controlliamo ogni tipologia e creiamo voci per i valori presenti
          Object.entries(d.tipologie).forEach(([categoria, values]: [string, any]) => {
            if (!Array.isArray(values) || categoria === '_hasCategory') return;
            const value = values[i];
            if (value && !isNaN(Number(value)) && Number(value) > 0) {
              voci.push({ categoria, ore: this.formatOreStr(value) });
            }
          });

          // Se non ci sono voci, aggiungiamo una voce vuota di default
          if (voci.length === 0) {
            voci.push({ categoria: 'Ordinario', ore: '' });
          }

          d.vociGiorno[i] = voci;
        }

        // Campi sintetici usati dalla UI per la prima voce del giorno.
        d.categorie = [];
        d.ore = [];
        for (let i = 0; i < this.giorni.length; i++) {
          const primaVoce = d.vociGiorno[i]?.[0];
          d.categorie[i] = primaVoce?.categoria || 'Ordinario';
          d.ore[i] = primaVoce?.ore || '';
        }
      });

      // 6️⃣ APPLICO MODIFICHE MANUALI CELLE (AttendanceEditableCell)
      const edits: any = await this.http
        .get(
          `${this.globalService.url}admin/attendanceEdit/getEditable/${this.meseSelezionato}/${this.annoSelezionato}`
        )
        .toPromise();

      (edits || []).forEach((cell: any) => {
        const dip = this.dipendenti.find((d) => d.id === cell.employeeId);
        if (!dip) return;

        const index = cell.giorno - 1;
        if (index < 0 || index >= this.giorni.length) return;

        let cellVoci = cell.voci;
        if (typeof cellVoci === 'string') {
          try {
            cellVoci = JSON.parse(cellVoci);
          } catch {
            cellVoci = null;
          }
        }

        if (Array.isArray(cellVoci)) {
          dip.vociGiorno[index] = cellVoci.map((v: any) => ({
            categoria: this.normalizeVoceCategoria(v.categoria),
            ore: v.ore || '',
          }));
        } else {
          dip.vociGiorno[index] = [
            { categoria: this.normalizeVoceCategoria(cell.categoria), ore: cell.ore || '' },
          ];
        }

        // Aggiorna i campi sintetici usati dalla UI.
        dip.categorie[index] = this.normalizeVoceCategoria(cell.categoria);
        dip.ore[index] = cell.ore || '';

        // Sincronizza con tipologie
        Object.keys(dip.tipologie).forEach((category) => {
          if (Array.isArray(dip.tipologie[category])) dip.tipologie[category][index] = '';
        });

        // Processa tutte le voci per aggiornare le tipologie
        const voci = dip.vociGiorno[index];
        voci.forEach((voce: any) => {
          const oreVal = voce.ore || '';
          const categoria = this.normalizeVoceCategoria(voce.categoria);
          if (!dip.tipologie[categoria]) dip.tipologie[categoria] = Array(this.giorni.length).fill('');
          if (categoria === 'Ordinario' && oreVal) {
            const curr = dip.tipologie.Ordinario[index];
            const sum = (parseFloat(curr) || 0) + (parseFloat(oreVal) || 0);
            dip.tipologie.Ordinario[index] = this.formatOreStr(sum);
          } else if (categoria !== 'Ordinario') {
            dip.tipologie[categoria][index] = oreVal ? this.formatOreStr(oreVal) : '0.00';
          }
        });
      });

      // Ricalcola totale dopo aver applicato gli override celle
      this.dipendenti.forEach((d) => this.ricalcolaTotale(d));

      // 7️⃣ APPLICO NOTE MANUALI (AttendanceEditableNote)
      const noteEdits: any = await this.http
        .get(
          `${this.globalService.url}admin/attendanceEdit/getEditableNotes/${this.meseSelezionato}/${this.annoSelezionato}`
        )
        .toPromise();

      (noteEdits || []).forEach((n: any) => {
        const dip = this.dipendenti.find((d) => d.id === n.employeeId);
        if (dip) dip.note = n.nota ?? '';
      });
    } catch (err) {
      console.error('❌ Errore caricamento presenze editabili:', err);
      alert('Errore durante il caricamento delle presenze');
    } finally {
      this.loading = false;
    }
  }

  toggleDipendente(id: number) {
    if (this.dipendentiSelezionati.has(id)) {
      this.dipendentiSelezionati.delete(id);
    } else {
      this.dipendentiSelezionati.add(id);
    }
  }

  cambiaMeseAnno() {
    this.generaGiorni();
    this.selectedDayIndex = 0;
    this.caricaPresenze();
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

  getDayShortLabel(index: number): string {
    const [day, weekday] = (this.giorni[index] || '').split('\n');
    return [day, weekday].filter(Boolean).join(' ');
  }

  // ✅ Formatta SEMPRE con 2 decimali (es: "4.00", "3.25")
  formatOreStr(ore: any): string {
    const n = parseFloat(ore) || 0;
    const h = Math.floor(n);
    const c = Math.round((n - h) * 100);
    return `${h}.${String(c).padStart(2, '0')}`;
  }

  // 🔵 QUANDO CAMBIA UNA CELLA (giorno specifico)
  onCellaChange(d: any, i: number) {
    const voci = d.vociGiorno[i] || [];

    // Aggiorna i campi sintetici usati dalla UI.
    const primaVoce = voci[0];
    if (primaVoce) {
      d.categorie[i] = primaVoce.categoria;
      d.ore[i] = primaVoce.ore;
    }

    // Sincronizza con tipologie e ricalcola totale
    this.sincronizzaTipologie(d, i);
    this.ricalcolaTotale(d);

    this.http
      .post(`${this.globalService.url}admin/attendanceEdit/saveEditableCell`, {
        employeeId: d.id,
        giorno: i + 1,
        mese: this.meseSelezionato,
        anno: this.annoSelezionato,
        voci: voci.map((v: any) => ({ categoria: v.categoria, ore: v.ore })),
        // Campi sintetici della prima voce, utili per query rapide e UI.
        categoria: primaVoce?.categoria || 'Ordinario',
        ore: primaVoce?.ore || '',
      })
      .subscribe({
        next: () => {},
        error: (err) => {
          console.error('Errore salvataggio cella:', err);
          alert(this.parseServerError(err));
        },
      });
  }

  // 🔵 AGGIUNGI VOCE A UN GIORNO
  aggiungiVoce(d: any, i: number) {
    if (!d.vociGiorno[i]) {
      d.vociGiorno[i] = [];
    }
    d.vociGiorno[i].push({ categoria: 'Ordinario', ore: '' });
    this.onCellaChange(d, i);
  }

  // 🔵 RIMUOVI VOCE DA UN GIORNO
  rimuoviVoce(d: any, i: number, vIndex: number) {
    if (d.vociGiorno[i] && d.vociGiorno[i].length > vIndex) {
      d.vociGiorno[i].splice(vIndex, 1);
      // Se non ci sono più voci, aggiungi una voce vuota di default
      if (d.vociGiorno[i].length === 0) {
        d.vociGiorno[i].push({ categoria: 'Ordinario', ore: '' });
      }
      this.onCellaChange(d, i);
    }
  }

  // 🔵 RICALCOLA TOTALE: somma di TUTTE le categorie
  private ricalcolaTotale(d: any) {
    const numGiorni = (d.tipologie.Ordinario || []).length;
    let totalCents = 0;

    for (let i = 0; i < numGiorni; i++) {
      totalCents += Object.values(d.tipologie || {}).reduce((sum: number, values: any) => {
        const dayValue = Array.isArray(values) ? values[i] : '';
        return sum + Math.round((parseFloat(dayValue) || 0) * 100);
      }, 0);
    }

    const h = Math.floor(totalCents / 100);
    const c = totalCents % 100;
    // ✅ SEMPRE con 2 decimali per coerenza
    d.totale = `${h}.${String(c).padStart(2, '0')}`;
  }

  // 🔵 SINCRONIZZA VOCI CON TIPOLOGIE
  private sincronizzaTipologie(d: any, i: number) {
    const voci = d.vociGiorno[i] || [];

    Object.keys(d.tipologie).forEach((category) => {
      if (Array.isArray(d.tipologie[category])) d.tipologie[category][i] = '0.00';
    });

    // Accumula ore per categoria
    let oreOrdinario = 0;
    voci.forEach((voce: any) => {
      const ore = voce.ore ? parseFloat(voce.ore) : 0;

      const categoria = this.normalizeVoceCategoria(voce.categoria);
      if (!d.tipologie[categoria]) d.tipologie[categoria] = Array(this.giorni.length).fill('0.00');
      if (categoria === 'Ordinario') {
        oreOrdinario += ore;
      } else {
        d.tipologie[categoria][i] = voce.ore ? this.formatOreStr(voce.ore) : '0.00';
      }
    });

    // ✅ Ordinario: SEMPRE in decimale con 2 cifre
    d.tipologie.Ordinario[i] = oreOrdinario > 0 ? this.formatOreStr(oreOrdinario) : '0.00';
  }

  // 🔵 AUTOSAVE NOTE con debounce
  onNotaChange(dip: any) {
    const id = dip.id;

    if (!this.noteChanges[id]) {
      this.noteChanges[id] = new Subject<string>();

      this.noteChanges[id]
        .pipe(debounceTime(700))
        .subscribe((val) => this.salvaNotaSingola(dip, val));
    }

    this.noteChanges[id].next(dip.note);
  }

  async salvaNotaSingola(dip: any, nota: string) {
    try {
      await this.http
        .post(
          `${this.globalService.url}admin/attendanceEdit/saveEditableNote`,
          {
            employeeId: dip.id,
            mese: this.meseSelezionato,
            anno: this.annoSelezionato,
            nota,
          }
        )
        .toPromise();

      console.log('✔ Nota salvata');
    } catch (err) {
      console.error('❌ Errore salvataggio nota editabile:', err);
      alert(this.parseServerError(err));
    }
  }

  async generaPdf() {
    this.loading = true;
    try {
      const excludeIds = this.dipendenti
        .filter((d) => !this.dipendentiSelezionati.has(d.id))
        .map((d) => d.id);

      const body: any = {
        mese: this.meseSelezionato,
        anno: this.annoSelezionato,
      };
      if (excludeIds.length > 0) body.excludeIds = excludeIds;

      // 1) genera PDF lato server
      await lastValueFrom(
        this.http.post(
          `${this.globalService.url}admin/attendanceEdit/generatePdf`,
          body
        )
      );

      // 2) scarica blob senza token
      const blob = await lastValueFrom(
        this.http.post(
          `${this.globalService.url}admin/attendanceEdit/downloadSecure`,
          body,
          { responseType: 'blob' }
        )
      );

      const filename = `Presenze_${this.annoSelezionato}-${this.meseSelezionato}_EDITABILE.pdf`;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Errore generazione/scarico PDF EDITABILE:', err);
      alert('Errore durante la generazione o il download del PDF editabile.');
    } finally {
      this.loading = false;
    }
  }

  back() {
    this.router.navigate(['/homeAdmin']);
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
