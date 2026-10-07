import 'zone.js';
import { NgZone } from '@angular/core';
const session = JSON.parse(localStorage.getItem('test-session') || 'null');
if (!session || !location.hostname.match(/^(127\.0\.0\.1|localhost)$/)) throw new Error('Isolated test session required');
import { Component, NgModule, ViewChild, NO_ERRORS_SCHEMA } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { FormsModule } from '@angular/forms';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatListModule } from '@angular/material/list';
import { EMPTY } from 'rxjs';
import { registerLocaleData } from '@angular/common';
import localeIt from '@angular/common/locales/it';
import { CreateShiftComponent } from '../../src/app/admin/create-shift/create-shift.component';
import { OfflineService, OFFLINE_SESSION } from '../../src/app/offline/offline.service';
import { bodyHash, encodeBody, operationId } from '../../src/app/offline/offline-codec';
import { OfflineStatusComponent } from '../../src/app/offline/offline-status.component';
import { GlobalService } from '../../src/app/service/global.service';
import { SocketService } from '../../src/app/service/soket.service';
import { TenantService } from '../../src/app/service/tenant.service';
import { PopupServiceService } from '../../src/app/componenti/popup/popup-service.service';
import { AssignDialogComponent } from '../../src/app/admin/assign-dialog/assign-dialog.component';
import { VehicleAssignDialogComponent } from '../../src/app/admin/vehicle-assign-dialog/vehicle-assign-dialog.component';
import { EquipmentAssignDialogComponent } from '../../src/app/admin/equipment-assign-dialog/equipment-assign-dialog.component';
import { PopupComponentComponent } from '../../src/app/componenti/popup/popup-component/popup-component.component';
registerLocaleData(localeIt);
@Component({selector:'app-root',template:`<header style="padding:12px;background:#e8eff8">Collaudo isolato · pagina originale · database di prova <span>{{status}}</span></header><app-create-shift/><app-offline-status/>`})
class AuditComponent {
 @ViewChild(CreateShiftComponent) component!: CreateShiftComponent;
 status=''; navigations:any[]=[]; popups:string[]=[];
 constructor(public offline: OfflineService, public socketService:SocketService, public zone:NgZone){
  (window as any).shiftAudit=this;
  window.alert=message=>{this.status=String(message);this.popups.push(String(message));};
  offline.start();
 }
}
const fakeGlobal = {url:session.baseUrl,token:session.token,headers:{Authorization:'Bearer '+session.token,'X-Tenant-Id':session.tenant}, hasTenantFeature:(feature:string)=>['shifts','employeeApp','customers','documents'].includes(feature),hasPermission:()=>true,getTenantRoutePlanningConfig:()=>({}),getAppointmentCategoryDetails:()=>[{key:'work',forShifts:true}],getRecordValueByRole:()=>null,getEffectiveCustomerAddressFields:()=>({}),buildCustomerAddress:()=>''};
@NgModule({declarations:[AuditComponent,CreateShiftComponent,AssignDialogComponent,VehicleAssignDialogComponent,EquipmentAssignDialogComponent,PopupComponentComponent],imports:[BrowserModule,NoopAnimationsModule,FormsModule,DragDropModule,MatCheckboxModule,MatDialogModule,MatListModule,HttpClientModule,OfflineStatusComponent],schemas:[NO_ERRORS_SCHEMA],providers:[
 {provide:OFFLINE_SESSION,useValue:()=>session},
 {provide:HTTP_INTERCEPTORS,multi:true,useFactory:(offline:OfflineService)=>({intercept:(req:any,next:any)=>offline.intercept(req.clone({setHeaders:{Authorization:'Bearer '+session.token,'X-Tenant-Id':session.tenant}}),r=>next.handle(r))}),deps:[OfflineService]},
 {provide:GlobalService,useValue:fakeGlobal},{provide:SocketService,useFactory:()=>new SocketService({url:location.origin+'/',token:session.token} as any,{tenant:session.tenant} as any)},
 {provide:TenantService,useValue:{}},{provide:ActivatedRoute,useValue:{snapshot:{queryParamMap:{get:()=> '2026-10-07'}}}},
 {provide:Router,useValue:{navigate:(...args:any[])=>{(window as any).shiftAudit.navigations.push(args);return Promise.resolve(true);}}},
 {provide:PopupServiceService,useValue:{confirm:async()=>true}},
],bootstrap:[AuditComponent]})
class AuditModule {}
platformBrowserDynamic().bootstrapModule(AuditModule).catch(console.error);
