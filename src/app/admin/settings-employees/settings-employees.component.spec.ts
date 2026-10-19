import { SettingsEmployeesComponent } from './settings-employees.component';
import { of, throwError } from 'rxjs';

describe('SettingsEmployeesComponent', () => {
  it('should be exported', () => {
    expect(SettingsEmployeesComponent).toBeTruthy();
  });

  it('keeps active and archived employees in separate standalone lists, including search', () => {
    const component = new SettingsEmployeesComponent({} as any, {} as any, {} as any, {} as any);
    const active = { id: 7, nome: 'Giulia', cognome: 'Bianchetti', active: true };
    const archived = { id: 8, nome: 'Lorenzo', cognome: 'Verdi', active: false };
    component.employeess = [active, archived] as any;

    expect(component.filteredEmployees).toEqual([active] as any);
    component.showArchived = true;
    expect(component.filteredEmployees).toEqual([archived] as any);
    component.employeeSearch = 'Giulia';
    expect(component.filteredEmployees).toEqual([]);
    component.employeeSearch = 'Verdi';
    expect(component.filteredEmployees).toEqual([archived] as any);
    expect(component.employeesInCurrentView.length).toBe(1);
  });

  it('keeps both employee states available when embedded to load the focused edit form', () => {
    const component = new SettingsEmployeesComponent({} as any, {} as any, {} as any, {} as any);
    component.embedded = true;
    component.showArchived = true;
    component.employeess = [
      { id: 7, nome: 'Giulia', active: true }, { id: 8, nome: 'Lorenzo', active: false },
    ] as any;

    expect(component.filteredEmployees).toEqual(component.employeess);
  });

  it('shows candidates with the same name returned by the server', () => {
    const http = {
      post: jasmine.createSpy('post').and.returnValue(of({
        matches: [{ id: 7, label: 'Giulia Bianchetti' }],
      })),
    };
    const component = new SettingsEmployeesComponent(
      http as any,
      { url: '/api/', headers: {} } as any,
      {} as any,
      {} as any,
    );
    component.employeesAdd.nome = 'Giulia';
    component.employeesAdd.cognome = 'Bianchetti';

    component.checkCandidateDuplicates();

    expect(http.post).toHaveBeenCalledWith(
      '/api/employees/candidate-duplicate-check',
      { nome: 'Giulia', cognome: 'Bianchetti' },
      { headers: {} },
    );
    expect(component.candidateNameMatches).toEqual([
      jasmine.objectContaining({ id: 7, label: 'Giulia Bianchetti' }),
    ]);
  });

  it('keeps the duplicate warning when employee creation is rejected by the server', () => {
    const match = { id: 7, label: 'Giulia Bianchetti' };
    const http = {
      post: jasmine.createSpy('post').and.returnValue(throwError(() => ({
        status: 409,
        error: JSON.stringify({ candidateMatches: [match] }),
      }))),
    };
    const dialog = { showHttpError: jasmine.createSpy('showHttpError') };
    const component = new SettingsEmployeesComponent(
      http as any,
      { url: '/api/', headers: {} } as any,
      {} as any,
      dialog as any,
    );
    component.employeesAdd.nome = 'Giulia';
    component.employeesAdd.cognome = 'Bianchetti';

    component.addEmployees();

    expect(component.candidateNameMatches).toEqual([match]);
    expect(dialog.showHttpError).not.toHaveBeenCalled();
  });
});
