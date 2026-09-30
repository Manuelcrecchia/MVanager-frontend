import { SettingsEmployeesComponent } from './settings-employees.component';
import { of, throwError } from 'rxjs';

describe('SettingsEmployeesComponent', () => {
  it('should be exported', () => {
    expect(SettingsEmployeesComponent).toBeTruthy();
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
