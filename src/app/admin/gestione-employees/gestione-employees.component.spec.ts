import { GestioneEmployeesComponent } from './gestione-employees.component';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { of, Subject, throwError } from 'rxjs';
import { GlobalService } from '../../service/global.service';
import { ContactRequirementPromptService } from '../../service/contact-requirement-prompt.service';
import { NoteUnreadService } from '../../service/note-unread.service';
import { PopupServiceService } from '../../componenti/popup/popup-service.service';
import { fileDownloadIO } from '../../shared/file-download';

describe('GestioneEmployeesComponent', () => {
  let fixture: ComponentFixture<GestioneEmployeesComponent>;
  let component: GestioneEmployeesComponent;
  let http: { post: jasmine.Spy; get: jasmine.Spy };
  let dialog: { confirm: jasmine.Spy; show: jasmine.Spy; showError: jasmine.Spy; showHttpError: jasmine.Spy };
  let permissions: Set<string>;
  const employee = { id: 7, nome: 'Giulia', cognome: 'Bianchetti', active: true };
  const archivedEmployee = { id: 8, nome: 'Lorenzo', cognome: 'Verdi', active: false };

  beforeEach(async () => {
    permissions = new Set(['EMPLOYEE_DELETE']);
    http = {
      post: jasmine.createSpy('post').and.returnValue(of(new Blob(['zip']))),
      get: jasmine.createSpy('get').and.returnValue(of(JSON.stringify([employee, archivedEmployee]))),
    };
    dialog = {
      confirm: jasmine.createSpy('confirm').and.resolveTo(true),
      show: jasmine.createSpy('show'),
      showError: jasmine.createSpy('showError'),
      showHttpError: jasmine.createSpy('showHttpError'),
    };
    await TestBed.configureTestingModule({
      declarations: [GestioneEmployeesComponent],
      imports: [CommonModule, FormsModule],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: HttpClient, useValue: http },
        { provide: GlobalService, useValue: {
          url: '/api/', headers: {}, hasPermission: (key: string) => permissions.has(key),
        } },
        { provide: ActivatedRoute, useValue: { snapshot: { data: {}, paramMap: { get: () => null } } } },
        { provide: Router, useValue: {} },
        { provide: NgbModal, useValue: {} },
        { provide: ContactRequirementPromptService, useValue: {} },
        { provide: NoteUnreadService, useValue: { start: () => {}, count: () => 0 } },
        { provide: PopupServiceService, useValue: dialog },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(GestioneEmployeesComponent);
    component = fixture.componentInstance;
    spyOn(component, 'getEmployees');
    spyOn(fileDownloadIO, 'native').and.returnValue(true);
    spyOn(fileDownloadIO, 'write').and.resolveTo({ uri: 'file:///cache/employee.zip' });
    spyOn(fileDownloadIO, 'share').and.resolveTo({});
  });

  it('shows archive in the expanded directory row with archive permission alone', () => {
    component.employees = [employee];
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[aria-label="Archivia dipendente"]')).toBeNull();

    fixture.nativeElement.querySelector('.employee-header-btn').click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[aria-label="Archivia dipendente"]')).not.toBeNull();
  });

  it('hides archive without permission and for employees already archived', () => {
    component.employees = [employee];
    component.toggleEmployeeOpen(employee.id);
    permissions.clear();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[aria-label="Archivia dipendente"]')).toBeNull();

    permissions.add('EMPLOYEE_DELETE');
    component.showArchived = true;
    component.employees = [{ ...employee, active: false }];
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[aria-label="Archivia dipendente"]')).toBeNull();
  });

  it('does not request archiving when the confirmation is cancelled', async () => {
    dialog.confirm.and.resolveTo(false);
    await component.exportAndArchiveEmployee(employee);

    expect(http.post).not.toHaveBeenCalled();
    expect(component.isEmployeeBusy(employee.id)).toBeFalse();
  });

  it('exports the ZIP and refreshes the directory after confirmed archiving', async () => {
    await component.exportAndArchiveEmployee(employee);

    expect(http.post).toHaveBeenCalledOnceWith('/api/employees/exportAndDeleteUser',
      { employeeId: employee.id }, { headers: {}, responseType: 'blob' });
    expect(fileDownloadIO.write).toHaveBeenCalledWith(jasmine.objectContaining({
      path: jasmine.stringMatching(/\/dipendente_Giulia_Bianchetti\.zip$/), data: btoa('zip'),
    }));
    expect(component.getEmployees).toHaveBeenCalledTimes(1);
    expect(dialog.show).toHaveBeenCalledWith(
      'Dipendente esportato e archiviato con successo.', 'Archiviazione completata', 'success');
    expect(component.isEmployeeBusy(employee.id)).toBeFalse();
  });

  it('disables archive and prevents duplicate submissions while confirmation is open', async () => {
    let resolveConfirmation!: (confirmed: boolean) => void;
    dialog.confirm.and.returnValue(new Promise<boolean>((resolve) => { resolveConfirmation = resolve; }));
    component.employees = [employee];
    component.toggleEmployeeOpen(employee.id);
    fixture.detectChanges();
    const pending = component.exportAndArchiveEmployee(employee);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[aria-label="Archivia dipendente"]').disabled).toBeTrue();

    await component.exportAndArchiveEmployee(employee);
    expect(dialog.confirm).toHaveBeenCalledTimes(1);
    expect(http.post).not.toHaveBeenCalled();
    resolveConfirmation(true);
    await pending;
    expect(http.post).toHaveBeenCalledTimes(1);
  });

  it('rejects calls without archive permission or for archived employees', async () => {
    permissions.clear();
    await component.exportAndArchiveEmployee(employee);
    permissions.add('EMPLOYEE_DELETE');
    await component.exportAndArchiveEmployee({ ...employee, active: false });

    expect(dialog.confirm).not.toHaveBeenCalled();
    expect(http.post).not.toHaveBeenCalled();
  });

  it('reports API failures and releases the archive button without reporting success', async () => {
    const error = { status: 500 };
    http.post.and.returnValue(throwError(() => error));
    await component.exportAndArchiveEmployee(employee);

    expect(dialog.showHttpError).toHaveBeenCalledWith(error, 'Errore durante esportazione/archiviazione dipendente.');
    expect(dialog.show).not.toHaveBeenCalled();
    expect(component.getEmployees).not.toHaveBeenCalled();
    expect(fileDownloadIO.write).not.toHaveBeenCalled();
    expect(component.isEmployeeBusy(employee.id)).toBeFalse();
  });

  it('refreshes the archived state but does not report export success if saving fails', async () => {
    (fileDownloadIO.write as jasmine.Spy).and.rejectWith(new Error('disk full'));
    spyOn(console, 'error');
    await component.exportAndArchiveEmployee(employee);

    expect(component.getEmployees).toHaveBeenCalledTimes(1);
    expect(dialog.showError).toHaveBeenCalled();
    expect(dialog.show).not.toHaveBeenCalled();
    expect(component.isEmployeeBusy(employee.id)).toBeFalse();
  });

  it('filters active and archived views before applying search', () => {
    component.employees = [employee, archivedEmployee];
    expect(component.filteredEmployees).toEqual([employee]);

    component.showArchived = true;
    expect(component.filteredEmployees).toEqual([archivedEmployee]);
    component.employeeSearch = 'giulia';
    expect(component.filteredEmployees).toEqual([]);
    component.employeeSearch = 'VERDI';
    expect(component.filteredEmployees).toEqual([archivedEmployee]);
    expect(component.employeesInCurrentView.length).toBe(1);
  });

  it('switches the toolbar to archived rows only and clears active selection', () => {
    component.employees = [employee, archivedEmployee];
    component.selected.add(employee.id);
    component.toggleEmployeeOpen(employee.id);
    fixture.detectChanges();
    const toggle = fixture.nativeElement.querySelector('[aria-pressed]');
    expect(toggle.textContent.trim()).toBe('Mostra archiviati');
    toggle.click();
    fixture.detectChanges();

    expect(component.selectedCount).toBe(0);
    expect(component.isEmployeeOpen(employee.id)).toBeFalse();
    expect(fixture.nativeElement.querySelectorAll('.employee-card').length).toBe(1);
    expect(fixture.nativeElement.querySelector('.employee-name').textContent).toContain('Lorenzo Verdi');
    expect(toggle.textContent.trim()).toBe('Mostra attivi');
    expect(fixture.nativeElement.querySelector('.mv-entity-toolbar__count').textContent.trim()).toBe('1 / 1');

    toggle.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.employee-name').textContent).toContain('Giulia Bianchetti');
  });

  it('ignores old loading responses after switching to the archived view', () => {
    const activeResponse = new Subject<string>();
    const archiveResponse = new Subject<string>();
    http.get.and.returnValues(activeResponse, archiveResponse);
    (component.getEmployees as jasmine.Spy).and.callThrough();
    component.getEmployees();
    component.toggleShowArchived();
    expect(http.get.calls.argsFor(1)[0]).toBe('/api/employees/getAll?includeArchived=true');

    archiveResponse.next(JSON.stringify([employee, archivedEmployee]));
    activeResponse.next(JSON.stringify([employee]));
    expect(component.filteredEmployees).toEqual([archivedEmployee]);
    activeResponse.complete();
    archiveResponse.complete();
  });

  it('replaces normal actions with reactivate and anonymize for archived employees', () => {
    ['EMPLOYEE_CREATE', 'EMPLOYEE_EDIT', 'EMPLOYEE_PERMITS_MANAGE', 'EMPLOYEE_DOCS_MANAGE',
      'NOTIFICATIONS_VIEW', 'NOTIFICATIONS_MANAGE', 'EMAIL_VIEW'].forEach((key) => permissions.add(key));
    component.showArchived = true;
    component.employees = [archivedEmployee];
    component.toggleEmployeeOpen(archivedEmployee.id);
    fixture.detectChanges();

    const buttons: HTMLButtonElement[] = Array.from(fixture.nativeElement.querySelectorAll('.employee-actions button'));
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Riattiva dipendente', 'Anonimizza dipendente',
    ]);
    expect(fixture.nativeElement.querySelector('.employee-selector')).toBeNull();
  });

  it('shows archived actions only with their individual permissions', () => {
    component.showArchived = true;
    component.employees = [archivedEmployee];
    component.toggleEmployeeOpen(archivedEmployee.id);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[aria-label="Riattiva dipendente"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[aria-label="Anonimizza dipendente"]')).not.toBeNull();

    permissions.clear();
    permissions.add('EMPLOYEE_CREATE');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[aria-label="Riattiva dipendente"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[aria-label="Anonimizza dipendente"]')).toBeNull();
  });

  it('shows the anonymized badge without reactivate or anonymize buttons', () => {
    permissions.add('EMPLOYEE_CREATE');
    component.showArchived = true;
    component.employees = [{ ...archivedEmployee, anonymizedAt: '2026-10-14T08:00:00Z' }];
    component.toggleEmployeeOpen(archivedEmployee.id);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.badge.bg-secondary').textContent).toContain('Anonimizzato');
    expect(fixture.nativeElement.querySelectorAll('.employee-actions button').length).toBe(0);
  });

  it('does not select archived employees or send them directory notifications', () => {
    component.showArchived = true;
    component.employees = [archivedEmployee];
    component.toggleEmployee(archivedEmployee.id);
    component.toggleSelectAll();
    component.notifyTitle = 'Avviso';
    component.notifyBody = 'Messaggio';
    component.sendNotification({});

    expect(component.selectedCount).toBe(0);
    expect(http.post).not.toHaveBeenCalled();
  });

  for (const operation of [
    { method: 'unarchiveEmployee', endpoint: 'unarchive', permission: 'EMPLOYEE_CREATE' },
    { method: 'anonymizeEmployee', endpoint: 'pseudonymize', permission: 'EMPLOYEE_DELETE' },
  ] as const) {
    it(`confirms ${operation.endpoint} and refreshes the archived view after success`, async () => {
      permissions.add(operation.permission);
      component.showArchived = true;
      component.employees = [archivedEmployee];
      const updated = operation.endpoint === 'unarchive'
        ? { ...archivedEmployee, active: true }
        : { ...archivedEmployee, anonymizedAt: '2026-10-14T08:00:00Z' };
      http.post.and.returnValue(of('{}'));
      http.get.and.returnValue(of(JSON.stringify([employee, updated])));
      (component.getEmployees as jasmine.Spy).and.callThrough();

      await component[operation.method](archivedEmployee);

      expect(dialog.confirm).toHaveBeenCalledTimes(1);
      expect(http.post).toHaveBeenCalledOnceWith(`/api/employees/${operation.endpoint}`,
        { employeeId: archivedEmployee.id }, { headers: {}, responseType: 'text' });
      expect(component.getEmployees).toHaveBeenCalledTimes(1);
      expect(component.filteredEmployees).toEqual(operation.endpoint === 'unarchive' ? [] : [updated]);
      expect(dialog.show).toHaveBeenCalled();
      expect(component.isEmployeeBusy(archivedEmployee.id)).toBeFalse();
      if (operation.endpoint === 'pseudonymize') {
        expect(dialog.confirm.calls.mostRecent().args[0]).toContain('non potrà più essere riattivato');
      }
    });

    it(`cancels ${operation.endpoint} without sending a request`, async () => {
      permissions.add(operation.permission);
      dialog.confirm.and.resolveTo(false);
      await component[operation.method](archivedEmployee);

      expect(http.post).not.toHaveBeenCalled();
      expect(component.isEmployeeBusy(archivedEmployee.id)).toBeFalse();
    });

    it(`blocks ${operation.endpoint} for active, anonymized or unauthorized employees`, async () => {
      permissions.add(operation.permission);
      await component[operation.method](employee);
      await component[operation.method]({ ...archivedEmployee, anonymizedAt: '2026-10-14T08:00:00Z' });
      permissions.clear();
      await component[operation.method](archivedEmployee);

      expect(dialog.confirm).not.toHaveBeenCalled();
      expect(http.post).not.toHaveBeenCalled();
    });

    it(`reports ${operation.endpoint} failure and restores its button`, async () => {
      permissions.add(operation.permission);
      const error = { status: 500 };
      http.post.and.returnValue(throwError(() => error));
      await component[operation.method](archivedEmployee);

      expect(dialog.showHttpError).toHaveBeenCalledWith(error, jasmine.any(String));
      expect(dialog.show).not.toHaveBeenCalled();
      expect(component.getEmployees).not.toHaveBeenCalled();
      expect(component.isEmployeeBusy(archivedEmployee.id)).toBeFalse();
    });
  }

  it('disables both archived actions and prevents concurrent reactivation and anonymization', async () => {
    permissions.add('EMPLOYEE_CREATE');
    let resolveConfirmation!: (confirmed: boolean) => void;
    dialog.confirm.and.returnValue(new Promise<boolean>((resolve) => { resolveConfirmation = resolve; }));
    component.showArchived = true;
    component.employees = [archivedEmployee];
    component.toggleEmployeeOpen(archivedEmployee.id);
    const pending = component.unarchiveEmployee(archivedEmployee);
    fixture.detectChanges();
    const buttons: HTMLButtonElement[] = Array.from(fixture.nativeElement.querySelectorAll('.employee-actions button'));
    expect(buttons.length).toBe(2);
    expect(buttons.every((button) => button.disabled)).toBeTrue();

    await component.anonymizeEmployee(archivedEmployee);
    expect(dialog.confirm).toHaveBeenCalledTimes(1);
    resolveConfirmation(false);
    await pending;
    expect(http.post).not.toHaveBeenCalled();
    expect(component.isEmployeeBusy(archivedEmployee.id)).toBeFalse();
  });
});
