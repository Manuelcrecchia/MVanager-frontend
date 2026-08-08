import { AssignDialogComponent } from './assign-dialog.component';

describe('AssignDialogComponent', () => {
  it('should be exported', () => {
    expect(AssignDialogComponent).toBeTruthy();
  });

  it('does not force-confirm an assignment without conflicts', async () => {
    const dialogRef = { close: jasmine.createSpy('close') };
    const component = new AssignDialogComponent(
      { busyDetails: [] },
      dialogRef as any,
      {} as any,
      {} as any,
      {} as any,
    );
    component.selectedEmployees = [10];

    await component.onSave();

    expect(dialogRef.close).toHaveBeenCalledWith(jasmine.objectContaining({
      employees: [10],
      forceConfirmed: false,
    }));
  });
});
