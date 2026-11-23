import {numberingServiceStub} from '../../shared/numbering.spec-support';
import { QuotesHomeComponent } from './quotes-home.component';

describe('QuotesHomeComponent', () => {
  it('should be exported', () => {
    expect(QuotesHomeComponent).toBeTruthy();
  });

  it('mantiene la provenienza dalla lista nell’URL del PDF firmato', () => {
    const navigate = jasmine.createSpy('navigate');
    const component = Object.create(QuotesHomeComponent.prototype) as QuotesHomeComponent;
    Object.assign(component, { router: { navigate } });

    component.viewPdf({ numeroPreventivo: '100', signaturePresent: true });

    expect(navigate).toHaveBeenCalledOnceWith(['/view-pdf'], {
      queryParams: { numeroPreventivo: '100', fromQuoteList: 1, signed: 1 },
    });
  });

  it('mantiene ricerca e preventivo selezionato durante il refresh realtime', () => {
    const component = Object.create(QuotesHomeComponent.prototype) as QuotesHomeComponent;
    const quotes = [
      { numeroPreventivo: '100', complete: 'false' },
      { numeroPreventivo: '200', complete: 'false' },
    ];
    Object.assign(component as any, {
      numeroClienteSelezionato: '100',
      quoteSearch: 'cliente cercato',
      showCompletedQuotes: false,
      quotesFrEnd: [],
      allQuotes: [],
      http: { get: () => ({ subscribe: ({ next }: any) => next(quotes) }) },
      globalService: { ...numberingServiceStub(), url: '', headers: {} },
      route: { snapshot: { queryParamMap: { get: () => null } } },
      isQuoteCompleted: () => false,
      applyQuoteSearch() { this.quotesFrEnd = [...this.allQuotes]; },
      focusQuoteFromNotificationIfNeeded: () => undefined,
    });

    (component as any).loadQuotes();

    expect(component.quoteSearch).toBe('cliente cercato');
    expect(component.numeroClienteSelezionato).toBe('100');
  });
});
