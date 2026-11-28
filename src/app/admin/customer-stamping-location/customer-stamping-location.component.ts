import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { GlobalService } from '../../service/global.service';

@Component({
  selector: 'app-customer-stamping-location', standalone: true, imports: [CommonModule],
  template: `<section class="card p-3 mb-3" *ngIf="global.hasTenantFeature('stamping')">
    <h2 class="h5">Luogo di lavoro per le timbrature</h2>
    <p>La posizione è ricavata automaticamente dall’indirizzo di lavoro configurato in MVControl. Raggio consentito: {{ radius }} metri.</p>
    <p><strong>Indirizzo di lavoro salvato:</strong> {{ address || 'Da completare nella scheda cliente' }}</p>
    <p *ngIf="civicIssue" class="badge bg-warning text-dark align-self-start">{{ civicIssue }}</p>
    <p>Salva le modifiche all’indirizzo: il controllo delle timbrature userà automaticamente quello aggiornato.</p>
    <p *ngIf="busy" role="status">Localizzazione dell’indirizzo in corso…</p>
    <p *ngIf="!busy && configured" class="text-success">Indirizzo localizzato: il controllo della posizione è disponibile.</p>
    <p *ngIf="!busy && !configured" class="text-warning" role="status">{{ message || 'Indirizzo non ancora localizzato.' }}</p>
    <p *ngIf="configured && pointMapUrl"><a [href]="pointMapUrl" target="_blank" rel="noopener noreferrer">Visualizza il luogo di lavoro sulla mappa</a></p>
    <small *ngIf="configured && source === 'geocoded' && provider === 'overture'">Geodati: <a href="https://docs.overturemaps.org/attribution/#italy" target="_blank" rel="noopener noreferrer">Overture Maps · OpenAddresses · ANNCSU, Istat e Agenzia delle Entrate</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a></small>
    <small *ngIf="configured && source === 'geocoded' && provider === 'opencage'">Geodati © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a> · <a href="https://opencagedata.com/credits" target="_blank" rel="noopener noreferrer">Altre fonti dei dati</a></small>
    <button type="button" class="btn btn-outline-primary align-self-start" *ngIf="!configured && address" (click)="load(true)" [disabled]="busy">Riprova localizzazione</button>
  </section>`,
})
export class CustomerStampingLocationComponent implements OnChanges {
  @Input() numeroCliente = '';
  address = ''; radius = 200; busy = false; configured = false; message = '';
  source = ''; provider = '';
  civicIssue = '';
  private latitude: number | null = null;
  private longitude: number | null = null;
  constructor(private http: HttpClient, public global: GlobalService) {}
  private get url(): string { return this.global.url + 'customers/' + encodeURIComponent(this.numeroCliente) + '/stamping-location'; }
  get pointMapUrl(): string { return this.latitude !== null && this.longitude !== null ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(this.latitude + ',' + this.longitude) : ''; }
  async ngOnChanges(): Promise<void> {
    if (this.numeroCliente && this.global.hasTenantFeature('stamping')) await this.load();
  }
  async load(refresh = false): Promise<void> {
    if (this.busy) return;
    this.busy = true; this.message = '';
    try {
      const meta: any = await firstValueFrom(refresh ? this.http.post(this.url + '/refresh', {}) : this.http.get(this.url));
      this.address = meta.address; this.radius = meta.radiusMeters; this.configured = meta.configured;
      this.source = meta.source; this.provider = meta.provider;
      this.civicIssue = meta.civic?.label || '';
      this.latitude = meta.location?.latitude ?? null; this.longitude = meta.location?.longitude ?? null;
      this.message = meta.message || '';
    } catch (error: any) { this.message = error.error?.error || 'Impossibile localizzare l’indirizzo di lavoro.'; }
    finally { this.busy = false; }
  }
}
