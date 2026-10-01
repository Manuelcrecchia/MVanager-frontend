import { QuotesHomeComponent } from './quotes-home.component';

describe('QuotesHomeComponent', () => {
  it('should be exported', () => {
    expect(QuotesHomeComponent).toBeTruthy();
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
      globalService: { url: '', headers: {} },
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
