import { Component } from '@angular/core';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { Capacitor } from '@capacitor/core';
import { PrivateImageDirective, PrivateImageService } from './private-image.directive';
import { GlobalService } from '../service/global.service';
import { TenantService } from '../service/tenant.service';

@Component({ standalone: true, imports: [PrivateImageDirective], template: '<img [privateImage]="source" alt="Foto privata">' })
class Host { source = 'https://images.test/private-images/admin/products/1'; }

for (const platform of ['web', 'ios', 'android']) {
  describe(`private images on ${platform}`, () => {
    let fixture: ComponentFixture<Host>;
    let http: HttpTestingController;
    let service: PrivateImageService;
    let state: { token: string; tenant: string };
    let create: jasmine.Spy;
    let revoke: jasmine.Spy;
    beforeEach(() => {
      state = { token: 'session-token', tenant: 'tenant-a' };
      spyOn(Capacitor, 'getPlatform').and.returnValue(platform);
      create = spyOn(URL, 'createObjectURL').and.returnValue('blob:https://images.test/image');
      revoke = spyOn(URL, 'revokeObjectURL');
      TestBed.configureTestingModule({
        imports: [Host],
        providers: [provideHttpClient(), provideHttpClientTesting(),
          { provide: GlobalService, useValue: { url: 'https://images.test/', get token() { return state.token; } } },
          { provide: TenantService, useValue: { get tenant() { return state.tenant; } } },
        ],
      });
      http = TestBed.inject(HttpTestingController);
      service = TestBed.inject(PrivateImageService);
      fixture = TestBed.createComponent(Host);
    });
    afterEach(() => { fixture.destroy(); http.verify({ ignoreCancelled: true }); });

    it('fetches with the session headers and displays only a local blob URL', () => {
      fixture.detectChanges();
      const req = http.expectOne(fixture.componentInstance.source);
      expect(req.request.headers.get('Authorization')).toBe('Bearer session-token');
      expect(req.request.headers.get('X-Tenant-Id')).toBe('tenant-a');
      expect(req.request.url).not.toContain('session-token');
      expect(req.request.responseType).toBe('blob');
      req.flush(new Blob(['png-fixture'], { type: 'image/png' }));
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('img').getAttribute('src')).toBe('blob:https://images.test/image');
      expect(create).toHaveBeenCalled();
      fixture.destroy();
      expect(revoke).toHaveBeenCalledWith('blob:https://images.test/image');
    });

    it('renders raster pixels through a real browser Blob URL', async () => {
      create.and.callThrough();
      revoke.and.callThrough();
      fixture.detectChanges();
      const image = fixture.nativeElement.querySelector('img') as HTMLImageElement;
      const loaded = new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('Image decoding failed'));
      });
      const bytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg=='), value => value.charCodeAt(0));
      http.expectOne(fixture.componentInstance.source).flush(new Blob([bytes], { type: 'image/png' }));
      fixture.detectChanges();
      await loaded;
      expect(image.naturalWidth).toBe(1);
      expect(image.naturalHeight).toBe(1);
      expect(image.src.startsWith('blob:')).toBeTrue();
    });

    it('clears the displayed image on logout and never makes anonymous requests', () => {
      fixture.detectChanges();
      http.expectOne(fixture.componentInstance.source).flush(new Blob(['png'], { type: 'image/png' }));
      fixture.detectChanges();
      state.token = '';
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('img').hasAttribute('src')).toBeFalse();
      expect(revoke).toHaveBeenCalled();
      http.expectNone(fixture.componentInstance.source);
    });

    it('drops old bytes and sends the new tenant when the session changes', () => {
      fixture.detectChanges();
      http.expectOne(fixture.componentInstance.source).flush(new Blob(['png'], { type: 'image/png' }));
      fixture.detectChanges();
      state.tenant = 'tenant-b';
      fixture.detectChanges();
      const next = http.expectOne(fixture.componentInstance.source);
      expect(next.request.headers.get('X-Tenant-Id')).toBe('tenant-b');
      expect(revoke).toHaveBeenCalled();
      expect(fixture.nativeElement.querySelector('img').hasAttribute('src')).toBeFalse();
      next.flush(new Blob(['next'], { type: 'image/webp' }));
    });

    it('cancels a previous image request when a different resource is selected', () => {
      fixture.detectChanges();
      const previous = http.expectOne(fixture.componentInstance.source);
      fixture.componentInstance.source = 'https://images.test/private-images/admin/products/2';
      fixture.detectChanges();
      expect(previous.cancelled).toBeTrue();
      http.expectOne(fixture.componentInstance.source).flush(new Blob(['png'], { type: 'image/png' }));
    });

    it('does not display HTML or SVG returned as an image', () => {
      fixture.detectChanges();
      http.expectOne(fixture.componentInstance.source).flush(new Blob(['<svg/>'], { type: 'image/svg+xml' }));
      fixture.detectChanges();
      const image = fixture.nativeElement.querySelector('img');
      expect(image.hasAttribute('src')).toBeFalse();
      expect(image.getAttribute('data-image-error')).toBe('Immagine non disponibile');
      expect(create).not.toHaveBeenCalled();
    });

    it('never sends credentials to external URLs, static paths, or token-bearing links', () => {
      for (const source of ['https://attacker.test/private-images/admin/products/1', 'https://images.test/uploads/tag/file.png', 'https://images.test/private-images/admin/products/1?token=secret']) {
        let rejected = false;
        service.fetch(source).subscribe({ error: () => rejected = true });
        expect(rejected).toBeTrue();
      }
      http.expectNone(() => true);
    });
  });
}
