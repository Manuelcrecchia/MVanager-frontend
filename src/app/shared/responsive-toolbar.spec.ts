import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

@Component({
  standalone: true,
  template: `
    <main class="responsive-audit-stage">
      <section class="invoice-page">
        <header class="invoice-toolbar mv-entity-toolbar" data-audit-toolbar="fatture-elenco">
          <div class="invoice-title-group mv-entity-toolbar__title">
            <h1>Fatture vendita</h1>
            <button type="button" class="btn mv-toolbar-back mv-mobile-home-back">
              <i class="fas fa-arrow-left" aria-hidden="true"></i>
              Torna indietro
            </button>
          </div>
          <div class="mv-entity-toolbar__controls">
            <label class="invoice-toolbar-search">
              <i class="fas fa-search" aria-hidden="true"></i>
              <input type="search" placeholder="Cerca numero, cliente, P.IVA" />
            </label>
            <span class="mv-entity-toolbar__count">36 / 41</span>
            <button type="button" class="ghost-btn">Mostra archivio</button>
          </div>
        </header>
      </section>

      <section class="accounting-page standard-management-page">
        <header class="accounting-toolbar mv-entity-toolbar" data-audit-toolbar="contabilita-date">
          <div class="mv-entity-toolbar__title">
            <h1>Cruscotto contabile</h1>
            <button type="button" class="btn mv-toolbar-back mv-mobile-home-back">← Torna indietro</button>
          </div>
          <div class="mv-entity-toolbar__controls economics-toolbar-controls">
            <label class="compact-toolbar-field">Da <input type="date" /></label>
            <label class="compact-toolbar-field">A <input type="date" /></label>
            <button type="button" class="ghost-btn">Aggiorna</button>
            <button type="button" class="primary-btn">Sincronizza da fatture</button>
          </div>
        </header>
      </section>

      <section class="warehouse-page standard-management-page">
        <header class="request-page-toolbar mv-entity-toolbar" data-audit-toolbar="magazzino-elenco">
          <div class="mv-entity-toolbar__title">
            <h1>Lista prodotti del magazzino interno</h1>
            <button type="button" class="btn mv-toolbar-back mv-mobile-home-back">← Torna indietro</button>
            <button type="button" class="mv-toolbar-primary">+ Nuovo</button>
          </div>
          <div class="mv-entity-toolbar__controls">
            <label class="request-search-field">
              <i class="fas fa-search" aria-hidden="true"></i>
              <input class="form-control" type="search" placeholder="Nome, barcode, categoria o fornitore" />
            </label>
            <span class="mv-entity-toolbar__count">24</span>
            <button type="button" class="btn btn-light">Mostra archivio</button>
          </div>
        </header>
      </section>

      <section class="service-orders-page standard-management-page">
        <header class="mv-entity-toolbar" data-audit-toolbar="ordini-servizio">
          <div class="mv-entity-toolbar__title">
            <h1>Ordini di servizio</h1>
            <button type="button" class="btn mv-toolbar-back mv-mobile-home-back">← Torna indietro</button>
          </div>
          <div class="mv-entity-toolbar__controls">
            <label class="service-order-search-field">
              <i class="fas fa-search" aria-hidden="true"></i>
              <input class="form-control" type="search" placeholder="ID, cliente, dipendente o stato" />
            </label>
            <span class="mv-entity-toolbar__count">18 / 30</span>
            <button type="button" class="btn btn-light">Mostra archivio</button>
          </div>
        </header>
      </section>

      <section class="standard-management-page">
        <header class="mv-entity-toolbar" data-audit-toolbar="dettaglio-lungo">
          <div class="mv-entity-toolbar__title">
            <h1>Scadenze attrezzature e presidi del cliente</h1>
          </div>
          <div class="mv-entity-toolbar__controls">
            <button type="button" class="mv-toolbar-back">← Torna indietro</button>
            <button type="button" class="mv-toolbar-primary">Aggiorna</button>
            <button type="button" class="mv-toolbar-primary">Aggiungi presidi</button>
          </div>
        </header>
      </section>

      <section class="candidates-page standard-management-page">
        <header class="candidate-toolbar mv-entity-toolbar" data-audit-toolbar="candidati-filtri">
          <div class="candidate-toolbar__left mv-entity-toolbar__title">
            <h1>Candidati e colloqui</h1>
            <button type="button" class="btn btn-back-glass">← Torna indietro</button>
            <button type="button" class="btn btn-pink">+ Nuovo</button>
          </div>
          <div class="candidate-toolbar__right mv-entity-toolbar__controls">
            <div class="btn-group candidate-tabs">
              <button type="button" class="btn">Attivi</button>
              <button type="button" class="btn">Completati</button>
            </div>
            <select class="form-select form-control-glass candidate-status-filter">
              <option>Tutti gli stati</option>
            </select>
            <input class="form-control form-control-glass" placeholder="Cerca" />
          </div>
        </header>
      </section>
    </main>
  `,
  styles: [`
    :host { display: block; }
    .responsive-audit-stage { display: grid; gap: 18px; margin: 0; }
    .responsive-audit-stage > section { min-width: 0; }
  `],
  styleUrls: [
    '../admin/invoices/invoices.component.css',
    '../admin/accounting/accounting.component.css',
    '../admin/internal-warehouse/internal-warehouse.component.css',
    '../admin/service-orders/service-orders.component.css',
    '../admin/deadlines-management/deadlines-management.component.css',
    '../admin/candidates/candidates.component.css',
  ],
})
class ResponsiveToolbarFixtureComponent {}

describe('Responsive entity toolbar', () => {
  let fixture: ComponentFixture<ResponsiveToolbarFixtureComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ResponsiveToolbarFixtureComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ResponsiveToolbarFixtureComponent);
  });

  it('keeps every audited header inside its bounds from 280px to 1920px', () => {
    if (window.innerWidth !== 500) {
      pending('Eseguire con il profilo ChromeHeadlessMobile.');
      return;
    }

    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const stage = host.querySelector<HTMLElement>('.responsive-audit-stage')!;

    for (let width = 280; width <= 1920; width += 1) {
      if (width < 500) {
        stage.style.width = `${width}px`;
      } else {
        window.resizeTo(width, 900);
        stage.style.width = '100%';
      }

      const toolbars = Array.from(
        host.querySelectorAll<HTMLElement>('[data-audit-toolbar]'),
      );

      for (const toolbar of toolbars) {
        const name = toolbar.dataset['auditToolbar'];
        const toolbarRect = toolbar.getBoundingClientRect();
        const auditedElements = Array.from(
          toolbar.querySelectorAll<HTMLElement>(
            'h1, button, label, input, select, .btn-group, .mv-entity-toolbar__controls',
          ),
        ).filter((element) => getComputedStyle(element).display !== 'none');

        expect(toolbar.scrollWidth)
          .withContext(`${name}: overflow interno a ${width}px`)
          .toBeLessThanOrEqual(toolbar.clientWidth + 1);

        for (const element of auditedElements) {
          const rect = element.getBoundingClientRect();
          expect(rect.left)
            .withContext(`${name}: ${element.tagName} esce a sinistra a ${width}px`)
            .toBeGreaterThanOrEqual(toolbarRect.left - 1);
          expect(rect.right)
            .withContext(`${name}: ${element.tagName} esce a destra a ${width}px`)
            .toBeLessThanOrEqual(toolbarRect.right + 1);
        }
      }
    }
  });
});
