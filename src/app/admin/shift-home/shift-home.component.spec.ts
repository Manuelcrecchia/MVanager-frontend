import { ShiftHomeComponent } from './shift-home.component';
import { CommonModule, registerLocaleData } from '@angular/common';
import localeIt from '@angular/common/locales/it';
import { HttpClient } from '@angular/common/http';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { By } from '@angular/platform-browser';
import { BehaviorSubject, of } from 'rxjs';
import { GlobalService } from '../../service/global.service';
import { TenantService } from '../../service/tenant.service';
import { ContactRequirementPromptService } from '../../service/contact-requirement-prompt.service';

describe('ShiftHomeComponent', () => {
  beforeAll(() => {
    registerLocaleData(localeIt);
  });

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
    const contactPrompt: any = {
      promptEmployeePhoneMissing: jasmine.createSpy('promptEmployeePhoneMissing'),
    };

    const component = new ShiftHomeComponent(
      http,
      router,
      route,
      globalService,
      {} as any,
      contactPrompt,
    );

    component.selectedDate = new Date(2026, 6, 10);
    component.showMiniCal = true;
    const event: any = {
      preventDefault: jasmine.createSpy('preventDefault'),
      stopPropagation: jasmine.createSpy('stopPropagation'),
    };
    component.miniSelectDay(new Date(2026, 6, 15), event);

    expect(component.selectedDate).toEqual(new Date(2026, 6, 15));
    expect(component.showMiniCal).toBeFalse();
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(http.get).toHaveBeenCalledWith('http://api/shifts/byDate/2026-07-15');
    expect(router.navigate).toHaveBeenCalledWith([], jasmine.objectContaining({
      relativeTo: route,
      queryParams: { date: '2026-07-15' },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    }));
  });

  it('selects a mini calendar day from the rendered popup pointer interaction', fakeAsync(() => {
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
      hasTenantFeature: jasmine.createSpy('hasTenantFeature').and.returnValue(false),
      hasPermission: jasmine.createSpy('hasPermission').and.returnValue(false),
    };

    TestBed.configureTestingModule({
      declarations: [ShiftHomeComponent],
      imports: [CommonModule, FormsModule],
      providers: [
        { provide: HttpClient, useValue: http },
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: route },
        { provide: GlobalService, useValue: globalService },
        { provide: TenantService, useValue: {} },
        { provide: ContactRequirementPromptService, useValue: { promptEmployeePhoneMissing: jasmine.createSpy('promptEmployeePhoneMissing') } },
      ],
    });

    const fixture: ComponentFixture<ShiftHomeComponent> = TestBed.createComponent(ShiftHomeComponent);
    const component = fixture.componentInstance;
    component.selectedDate = new Date(2026, 6, 10);
    component.miniCalDate = new Date(2026, 6, 10);
    component.showMiniCal = true;

    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    const dayButton = fixture.debugElement
      .queryAll(By.css('.smc-day'))
      .find((el) => el.nativeElement.getAttribute('data-date') === '2026-07-15');

    expect(dayButton).toBeTruthy();
    dayButton!.nativeElement.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    fixture.detectChanges();

    expect(component.selectedDate).toEqual(new Date(2026, 6, 15));
    expect(component.showMiniCal).toBeFalse();
    expect(http.get).toHaveBeenCalledWith('http://api/shifts/byDate/2026-07-15');
    expect(router.navigate).toHaveBeenCalledWith([], jasmine.objectContaining({
      relativeTo: route,
      queryParams: { date: '2026-07-15' },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    }));
  }));

  it('moves to previous and next day from the rendered arrow buttons', fakeAsync(() => {
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
      hasTenantFeature: jasmine.createSpy('hasTenantFeature').and.returnValue(false),
      hasPermission: jasmine.createSpy('hasPermission').and.returnValue(false),
    };

    TestBed.configureTestingModule({
      declarations: [ShiftHomeComponent],
      imports: [CommonModule, FormsModule],
      providers: [
        { provide: HttpClient, useValue: http },
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: route },
        { provide: GlobalService, useValue: globalService },
        { provide: TenantService, useValue: {} },
        { provide: ContactRequirementPromptService, useValue: { promptEmployeePhoneMissing: jasmine.createSpy('promptEmployeePhoneMissing') } },
      ],
    });

    const fixture: ComponentFixture<ShiftHomeComponent> = TestBed.createComponent(ShiftHomeComponent);
    const component = fixture.componentInstance;
    component.selectedDate = new Date(2026, 6, 10);
    component.miniCalDate = new Date(2026, 6, 10);

    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    const nextButton = fixture.debugElement.query(By.css('button[aria-label="Giorno successivo"]'));
    const prevButton = fixture.debugElement.query(By.css('button[aria-label="Giorno precedente"]'));

    expect(nextButton).toBeTruthy();
    expect(prevButton).toBeTruthy();

    nextButton.nativeElement.click();
    fixture.detectChanges();

    expect(component.selectedDate).toEqual(new Date(2026, 6, 11));
    expect(component.showMiniCal).toBeFalse();
    expect(http.get).toHaveBeenCalledWith('http://api/shifts/byDate/2026-07-11');
    expect(router.navigate).toHaveBeenCalledWith([], jasmine.objectContaining({
      relativeTo: route,
      queryParams: { date: '2026-07-11' },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    }));

    prevButton.nativeElement.click();
    fixture.detectChanges();

    expect(component.selectedDate).toEqual(new Date(2026, 6, 10));
    expect(component.showMiniCal).toBeFalse();
    expect(http.get).toHaveBeenCalledWith('http://api/shifts/byDate/2026-07-10');
    expect(router.navigate).toHaveBeenCalledWith([], jasmine.objectContaining({
      relativeTo: route,
      queryParams: { date: '2026-07-10' },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    }));
  }));
});
