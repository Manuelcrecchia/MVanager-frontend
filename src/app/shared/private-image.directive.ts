import { Injectable, Directive, Input, HostBinding, DoCheck, OnDestroy } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, Subscription, throwError } from 'rxjs';
import { map } from 'rxjs/operators';
import { GlobalService } from '../service/global.service';
import { TenantService } from '../service/tenant.service';
@Injectable({ providedIn: 'root' })
export class PrivateImageService {
  constructor(private http: HttpClient, private global: GlobalService, private tenants: TenantService) {}
  private get baseUrl(): string { return this.global.url; }
  private get token(): string { return this.global.token || ''; }
  private get tenant(): string { return this.tenants.tenant || ''; }
  get sessionKey(): string {
    return this.token && this.tenant ? JSON.stringify([this.baseUrl, this.tenant, this.token]) : '';
  }
  fetch(source: string): Observable<Blob> {
    if (!this.sessionKey) return throwError(() => new Error('Sessione non disponibile'));
    let url: URL;
    try {
      const allowed = new URL('private-images/admin/', this.baseUrl);
      url = new URL(source, this.baseUrl);
      let sensitiveQuery = false;
      url.searchParams.forEach((_value, key) => { if (/token|auth|secret/i.test(key)) sensitiveQuery = true; });
      if (url.origin !== allowed.origin || !url.pathname.startsWith(allowed.pathname) || url.username || url.password ||
          sensitiveQuery) throw new Error();
    } catch { return throwError(() => new Error('Indirizzo immagine non consentito')); }
    return this.http.get(url.toString(), {
      responseType: 'blob',
      headers: new HttpHeaders({ Authorization: `Bearer ${this.token}`, 'X-Tenant-Id': this.tenant }),
    }).pipe(map(blob => {
      if (!/^image\/(jpeg|png|webp)$/i.test(blob.type)) throw new Error('Formato immagine non valido');
      return blob;
    }));
  }
}

@Directive({ selector: 'img[privateImage]', standalone: true, exportAs: 'privateImage' })
export class PrivateImageDirective implements DoCheck, OnDestroy {
  @Input() privateImage: string | null | undefined;
  @HostBinding('attr.src') objectUrl: string | null = null;
  @HostBinding('attr.aria-busy') loading = false;
  @HostBinding('attr.data-image-error') error: string | null = null;
  private requestKey = '';
  private generation = 0;
  private subscription?: Subscription;
  constructor(private images: PrivateImageService) {}
  ngDoCheck(): void {
    const session = this.images.sessionKey;
    const key = session && this.privateImage ? JSON.stringify([session, this.privateImage]) : '';
    if (key === this.requestKey) return;
    this.clear();
    this.requestKey = key;
    if (!key || !this.privateImage) return;
    const generation = this.generation;
    this.loading = true;
    this.subscription = this.images.fetch(this.privateImage).subscribe({
      next: blob => {
        if (generation !== this.generation || session !== this.images.sessionKey) return;
        this.objectUrl = URL.createObjectURL(blob);
        this.loading = false;
      },
      error: () => { if (generation === this.generation) { this.loading = false; this.error = 'Immagine non disponibile'; } },
    });
  }
  ngOnDestroy(): void { this.clear(); }
  private clear(): void {
    this.generation++;
    this.subscription?.unsubscribe();
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = null;
    this.loading = false;
    this.error = null;
  }
}
