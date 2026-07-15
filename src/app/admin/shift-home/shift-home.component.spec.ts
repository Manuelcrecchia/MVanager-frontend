import { ShiftHomeComponent } from './shift-home.component';
import { convertToParamMap } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';

describe('ShiftHomeComponent', () => {
  it('should be exported', () => {
    expect(ShiftHomeComponent).toBeTruthy();
  });

  it('updates shifts and route date when a mini calendar day is selected', () => {
    const queryParamMap = new BehaviorSubject(convertToParamMap({}));
    const route: any = {
      queryParamMap: queryParamMap.asObservable(),
      snapshot: { queryParamMap: convertToParamMap({}) },
    };
    const http: any = {
      get: jasmine.createSpy('get').and.returnValue(of([])),
    };
    const router: any = {
      navigate: jasmine.createSpy('navigate').and.callFake((_commands: unknown[], extras: any) => {
        route.snapshot.queryParamMap = convertToParamMap(extras?.queryParams || {});
        queryParamMap.next(route.snapshot.queryParamMap);
        return Promise.resolve(true);
      }),
    };
    const globalService: any = {
      url: 'http://api/',
      loadTenantConfig: jasmine.createSpy('loadTenantConfig').and.returnValue(Promise.resolve()),
    };

    const component = new ShiftHomeComponent(
      http,
      router,
      route,
      globalService,
      {} as any,
    );

    component.selectedDate = new Date(2026, 6, 10);
    component.miniSelectDay(new Date(2026, 6, 15));

    expect(component.selectedDate).toEqual(new Date(2026, 6, 15));
    expect(http.get).toHaveBeenCalledWith('http://api/shifts/byDate/2026-07-15');
    expect(router.navigate).toHaveBeenCalledWith([], jasmine.objectContaining({
      relativeTo: route,
      queryParams: { date: '2026-07-15' },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    }));
  });
});
