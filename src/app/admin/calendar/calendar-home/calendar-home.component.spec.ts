import { CalendarHomeComponent } from './calendar-home.component';

describe('CalendarHomeComponent', () => {
  it('should be exported', () => {
    expect(CalendarHomeComponent).toBeTruthy();
  });

  it('keeps every timed event visible when the filter is set to all', () => {
    const component = new CalendarHomeComponent(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const events = Array.from({ length: 7 }, (_, id) => ({ id })) as any[];
    const cell = { events } as any;

    expect(component.getTimedEvents(cell)).toBe(events);
    expect(component.getTimedEvents(cell).length).toBe(7);
  });

  it('uses the selected customer work duration when the start changes', () => {
    const globalService = {
      getRecordValueByRole: (
        _scope: string,
        customer: any,
        role: string,
      ) => role === 'customerWorkDurationMinutes'
        ? customer.durataLavoroMinuti
        : null,
    };
    const component = new CalendarHomeComponent(
      {} as any,
      globalService as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    component.categories = [{
      id: 'ordinario',
      text: 'Ordinario',
      color: '#00aa00',
      source: 'customers',
    }];
    component.clientiArray = [{
      numeroCliente: '004',
      durataLavoroMinuti: 90,
    }];
    component.popupCategory = 'ordinario';
    component.popupTitle = '004 - Cliente di prova';
    component.popupStartDate = '2026-07-27T10:00';

    component.onStartDateChange();

    expect(component.popupEndDate).toBe('2026-07-27T11:30');
  });

  it('falls back to thirty minutes when no customer duration is available', () => {
    const component = new CalendarHomeComponent(
      {} as any,
      { getRecordValueByRole: () => null } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    component.categories = [];
    component.popupStartDate = '2026-07-27T10:00';

    component.onStartDateChange();

    expect(component.popupEndDate).toBe('2026-07-27T10:30');
  });

  it('accepts a customer order progressive such as 454/1 in a linked calendar title', () => {
    const component = new CalendarHomeComponent(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    component.categories = [{
      id: 'ordine-servizio',
      text: 'Ordini di servizio',
      color: '#008577',
      source: 'customers',
    }];
    component.clientiArray = [{ numeroCliente: '454' }];

    expect(component.validateCodice('454/1', 'ordine-servizio')).toBeTrue();
  });
});
