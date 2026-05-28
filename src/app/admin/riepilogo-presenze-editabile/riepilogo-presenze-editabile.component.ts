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

  // Mappa categorie codice -> nome tipologia
  private catMap: { [key: string]: string } = {
    O: 'Ordinario',
    F: 'Ferie',
    M: 'Malattia',
    P: 'Permessi/ROL',
    AI: 'Assenza Ingiustificata',
    INF: 'Infortunio',
  };

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
        d.tipologie.Malattia = ensureArray(d.tipologie.Malattia);
        d.tipologie.Ferie = ensureArray(d.tipologie.Ferie);
        d.tipologie['Permessi/ROL'] = ensureArray(d.tipologie['Permessi/ROL']);
        d.tipologie['Assenza Ingiustificata'] = ensureArray(
          d.tipologie['Assenza Ingiustificata']
        );
        d.tipologie.Infortunio = ensureArray(d.tipologie.Infortunio);

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
          const ordin = d.tipologie.Ordinario[i];
          const ferie = d.tipologie.Ferie[i];
          const mal = d.tipologie.Malattia[i];
          const perm = d.tipologie['Permessi/ROL'][i];
          const ass = d.tipologie['Assenza Ingiustificata'][i];
          const inf = d.tipologie.Infortunio[i];

          // 🔹 Ordinario (può essere numero o stringa vuota)
          if (ordin && !isNaN(Number(ordin)) && Number(ordin) > 0) {
            // ✅ SEMPRE con 2 decimali
            voci.push({ categoria: 'O', ore: this.formatOreStr(ordin) });
          }

          // 🔹 Altre categorie - SEMPRE con 2 decimali
          if (ferie && (String(ferie).trim() !== '' || ferie === 'F')) {
            voci.push({ categoria: 'F', ore: !isNaN(Number(ferie)) ? this.formatOreStr(ferie) : '' });
          }
          if (mal && (String(mal).trim() !== '' || mal === 'M')) {
            voci.push({ categoria: 'M', ore: !isNaN(Number(mal)) ? this.formatOreStr(mal) : '' });
          }
          if (perm && (String(perm).trim() !== '' || perm === 'P')) {
            voci.push({ categoria: 'P', ore: !isNaN(Number(perm)) ? this.formatOreStr(perm) : '' });
          }
          if (ass && (String(ass).trim() !== '' || ass === 'AI')) {
            voci.push({ categoria: 'AI', ore: !isNaN(Number(ass)) ? this.formatOreStr(ass) : '' });
          }
          if (inf && (String(inf).trim() !== '' || inf === 'INF')) {
            voci.push({ categoria: 'INF', ore: !isNaN(Number(inf)) ? this.formatOreStr(inf) : '' });
          }

          // Se non ci sono voci, aggiungiamo una voce vuota di default
          if (voci.length === 0) {
            voci.push({ categoria: 'O', ore: '' });
          }

          d.vociGiorno[i] = voci;
        }

        // Manteniamo categorie e ore per retrocompatibilità
        d.categorie = [];
        d.ore = [];
        for (let i = 0; i < this.giorni.length; i++) {
          const primaVoce = d.vociGiorno[i]?.[0];
          d.categorie[i] = primaVoce?.categoria || 'O';
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

        // 👇 Supporto nuovo formato con voci multiple
        if (Array.isArray(cellVoci)) {
          // Nuovo formato: array di voci
          dip.vociGiorno[index] = cellVoci.map((v: any) => ({
            categoria: v.categoria || 'O',
            ore: v.ore || '',
          }));
        } else {
          // Vecchio formato: singola categoria + ore
          dip.vociGiorno[index] = [
            { categoria: cell.categoria || 'O', ore: cell.ore || '' },
          ];
        }

        // Aggiorna anche categorie/ore per retrocompatibilità
        dip.categorie[index] = cell.categoria || 'O';
        dip.ore[index] = cell.ore || '';

        // Sincronizza con tipologie
        dip.tipologie.Ferie[index] = '';
        dip.tipologie.Malattia[index] = '';
        dip.tipologie['Permessi/ROL'][index] = '';
        dip.tipologie['Assenza Ingiustificata'][index] = '';
        dip.tipologie.Infortunio[index] = '';
        dip.tipologie.Ordinario[index] = '';

        // Processa tutte le voci per aggiornare le tipologie
        const voci = dip.vociGiorno[index];
        voci.forEach((voce: any) => {
          const oreVal = voce.ore || '';

          switch (voce.categoria) {
            case 'O':
              if (oreVal) {
                const curr = dip.tipologie.Ordinario[index];
                const sum = (parseFloat(curr) || 0) + (parseFloat(oreVal) || 0);
                // ✅ SEMPRE con 2 decimali
                dip.tipologie.Ordinario[index] = this.formatOreStr(sum);
              }
              break;
            case 'F':
              // ✅ SEMPRE in decimale con 2 cifre
              dip.tipologie.Ferie[index] = oreVal ? this.formatOreStr(oreVal) : '0.00';
              break;
            case 'M':
              dip.tipologie.Malattia[index] = oreVal ? this.formatOreStr(oreVal) : '0.00';
              break;
            case 'P':
              dip.tipologie['Permessi/ROL'][index] = oreVal ? this.formatOreStr(oreVal) : '0.00';
              break;
            case 'AI':
              dip.tipologie['Assenza Ingiustificata'][index] = oreVal ? this.formatOreStr(oreVal) : '0.00';
              break;
            case 'INF':
              dip.tipologie.Infortunio[index] = oreVal ? this.formatOreStr(oreVal) : '0.00';
              break;
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

    // Aggiorna categorie/ore per retrocompatibilità
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
        // Manteniamo anche i vecchi campi per retrocompatibilità
        categoria: primaVoce?.categoria || 'O',
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
    d.vociGiorno[i].push({ categoria: 'O', ore: '' });
    this.onCellaChange(d, i);
  }

  // 🔵 RIMUOVI VOCE DA UN GIORNO
  rimuoviVoce(d: any, i: number, vIndex: number) {
    if (d.vociGiorno[i] && d.vociGiorno[i].length > vIndex) {
      d.vociGiorno[i].splice(vIndex, 1);
      // Se non ci sono più voci, aggiungi una voce vuota di default
      if (d.vociGiorno[i].length === 0) {
        d.vociGiorno[i].push({ categoria: 'O', ore: '' });
      }
      this.onCellaChange(d, i);
    }
  }

  // 🔵 RICALCOLA TOTALE: somma di TUTTE le categorie
  private ricalcolaTotale(d: any) {
    const numGiorni = (d.tipologie.Ordinario || []).length;
    let totalCents = 0;

    for (let i = 0; i < numGiorni; i++) {
      const ordinarioCents = Math.round((parseFloat(d.tipologie.Ordinario[i]) || 0) * 100);
      const malattiaVal = parseFloat(d.tipologie.Malattia[i]) || 0;
      const ferieVal = parseFloat(d.tipologie.Ferie[i]) || 0;
      const permessiVal = parseFloat(d.tipologie['Permessi/ROL'][i]) || 0;
      const assenzaVal = parseFloat(d.tipologie['Assenza Ingiustificata'][i]) || 0;
      const infortunioVal = parseFloat(d.tipologie.Infortunio[i]) || 0;

      const giornoCents = ordinarioCents +
                         Math.round(malattiaVal * 100) +
                         Math.round(ferieVal * 100) +
                         Math.round(permessiVal * 100) +
                         Math.round(assenzaVal * 100) +
                         Math.round(infortunioVal * 100);
      totalCents += giornoCents;
    }

    const h = Math.floor(totalCents / 100);
    const c = totalCents % 100;
    // ✅ SEMPRE con 2 decimali per coerenza
    d.totale = `${h}.${String(c).padStart(2, '0')}`;
  }

  // 🔵 SINCRONIZZA VOCI CON TIPOLOGIE
  private sincronizzaTipologie(d: any, i: number) {
    const voci = d.vociGiorno[i] || [];

    // Reset tipologie a 0.00
    d.tipologie.Ordinario[i] = '0.00';
    d.tipologie.Ferie[i] = '0.00';
    d.tipologie.Malattia[i] = '0.00';
    d.tipologie['Permessi/ROL'][i] = '0.00';
    d.tipologie['Assenza Ingiustificata'][i] = '0.00';
    d.tipologie.Infortunio[i] = '0.00';

    // Accumula ore per categoria
    let oreOrdinario = 0;
    voci.forEach((voce: any) => {
      const ore = voce.ore ? parseFloat(voce.ore) : 0;

      switch (voce.categoria) {
        case 'O':
          oreOrdinario += ore;
          break;
        case 'F':
          // ✅ SEMPRE in decimale con 2 cifre
          d.tipologie.Ferie[i] = voce.ore ? this.formatOreStr(voce.ore) : '0.00';
          break;
        case 'M':
          d.tipologie.Malattia[i] = voce.ore ? this.formatOreStr(voce.ore) : '0.00';
          break;
        case 'P':
          d.tipologie['Permessi/ROL'][i] = voce.ore ? this.formatOreStr(voce.ore) : '0.00';
          break;
        case 'AI':
          d.tipologie['Assenza Ingiustificata'][i] = voce.ore ? this.formatOreStr(voce.ore) : '0.00';
          break;
        case 'INF':
          d.tipologie.Infortunio[i] = voce.ore ? this.formatOreStr(voce.ore) : '0.00';
          break;
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
