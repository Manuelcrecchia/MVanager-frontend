import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { CustomerStampingLocationComponent } from './customer-stamping-location.component';
import { GlobalService } from '../../service/global.service';

describe('automatic customer work location', () => {
  beforeEach(() => TestBed.configureTestingModule({
    imports: [HttpClientTestingModule, CustomerStampingLocationComponent],
    providers: [{ provide: GlobalService, useValue: { url: '/api/', hasTenantFeature: () => true } }],
  }));
  afterEach(() => TestBed.inject(HttpTestingController).verify());
  it('keeps the missing civic warning visible even when a precise place is found', async () => {
    const fixture = TestBed.createComponent(CustomerStampingLocationComponent);
    fixture.componentRef.setInput('numeroCliente', '42'); fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne('/api/customers/42/stamping-location').flush({
      address: 'Contrada Bosco, Pescara', configured: true, radiusMeters: 200, civic: { issue: 'CIVIC_MISSING', label: 'Civico da verificare' },
    });
    await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.badge').textContent).toContain('Civico da verificare');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.badge')).toBeTruthy();
  });
  it('loads the address automatically without coordinate fields or confirmation', async () => {
    const fixture = TestBed.createComponent(CustomerStampingLocationComponent);
    fixture.componentRef.setInput('numeroCliente', '42'); fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne('/api/customers/42/stamping-location').flush({
      address: 'Via Lavoro 10, 20100 Milano', configured: true, radiusMeters: 200, source: 'geocoded', provider: 'overture', location: { latitude: 45, longitude: 9 },
    });
    await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Via Lavoro 10');
    expect(fixture.nativeElement.textContent).toContain('Indirizzo localizzato');
    expect(fixture.nativeElement.querySelectorAll('input').length).toBe(0);
    expect(fixture.nativeElement.querySelectorAll('button').length).toBe(0);
    expect(fixture.nativeElement.textContent).toContain('ANNCSU, Istat e Agenzia delle Entrate');
    expect(fixture.nativeElement.textContent).toContain('CC BY 4.0');
  });
  it('shows an address/provider error and permits retry without manual coordinates', async () => {
    const fixture = TestBed.createComponent(CustomerStampingLocationComponent);
    fixture.componentRef.setInput('numeroCliente', '42'); fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne('/api/customers/42/stamping-location').flush({
      address: 'Via Lavoro 10, Milano', configured: false, radiusMeters: 200, message: 'Servizio da collegare',
    });
    await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Servizio da collegare');
    fixture.nativeElement.querySelector('button').click();
    const retry = TestBed.inject(HttpTestingController).expectOne('/api/customers/42/stamping-location/refresh');
    expect(retry.request.method).toBe('POST');
    expect(retry.request.body).toEqual({});
    retry.flush({ address: 'Via Lavoro 10, Milano', configured: true, location: { latitude: 45, longitude: 9 }, radiusMeters: 200 });
    await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Indirizzo localizzato');
  });
});
