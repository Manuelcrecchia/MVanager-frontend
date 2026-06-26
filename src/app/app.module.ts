import { ErrorHandler, NgModule, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { registerLocaleData } from '@angular/common';
import localeIt from '@angular/common/locales/it';
import { LOCALE_ID } from '@angular/core';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { PrivateAreaComponent } from './componenti/login/private-area/private-area.component';
import { HomeAdminComponent } from './admin/homeadmin/homeadmin.component';
import { GlobalService } from './service/global.service';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import {
  MatButtonToggleGroup,
  MatButtonToggleModule,
} from '@angular/material/button-toggle';
import {
  HttpClientModule,
  provideHttpClient,
  withFetch,
  withInterceptorsFromDi,
} from '@angular/common/http';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { UserSettingsComponent } from './admin/user-settings/user-settings.component';
import { VehiclesSettingsComponent } from './admin/vehicles-settings/vehicles-settings.component';
import { QuoteSettingsComponent } from './admin/quote-settings/quote-settings.component';
import { VehicleAssignDialogComponent } from './admin/vehicle-assign-dialog/vehicle-assign-dialog.component';
import { EquipmentAssignDialogComponent } from './admin/equipment-assign-dialog/equipment-assign-dialog.component';
import { MatGridListModule } from '@angular/material/grid-list';
import { MatInputModule } from '@angular/material/input';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatMenuModule } from '@angular/material/menu';
import { MatRadioModule } from '@angular/material/radio';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatExpansionModule } from '@angular/material/expansion';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { QuotesHomeComponent } from './admin/quotes-home/quotes-home.component';
import { AddQuoteComponent } from './admin/add-quote/add-quote.component';
import { EditQuoteComponent } from './admin/edit-quote/edit-quote.component';
import { FileDirective } from './file.directive';
import { NgxExtendedPdfViewerModule } from 'ngx-extended-pdf-viewer';
import { AddCustomerComponent } from './admin/add-customer/add-customer.component';
import { ListCustomerComponent } from './admin/list-customer/list-customer.component';
import { PopupComponentComponent } from './componenti/popup/popup-component/popup-component.component';
import { PassworddimenticataComponent } from './componenti/login/passworddimenticata/passworddimenticata.component';
import { CambiapasswordComponent } from './componenti/admin/cambiapassword/cambiapassword.component';
import { CalendarHomeComponent } from './admin/calendar/calendar-home/calendar-home.component';
import { DatePipe } from '@angular/common';
import { CommonModule } from '@angular/common';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { DragDropModule } from '@angular/cdk/drag-drop';


import { MatNativeDateModule } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { PopUpComponent } from './admin/pop-up/pop-up.component';
import { QuestionPopupComponent } from './componenti/popup/question-popup/question-popup.component';
import { GestioneEmployeesComponent } from './admin/gestione-employees/gestione-employees.component';
import { GestioneUsersComponent } from './admin/gestione-users/gestione-users.component';
import { SettingsEmployeesComponent } from './admin/settings-employees/settings-employees.component';
import { DeadlinesManagementComponent } from './admin/deadlines-management/deadlines-management.component';
import { DocumentManagerComponent } from './admin/document-manager/document-manager.component';
import { ViewPdfComponent } from './admin/view-pdf/view-pdf.component';
import { DateAdapter, MAT_DATE_LOCALE } from '@angular/material/core';
import { ItalianDateAdapter } from './shared/italian-date-adapter';
import { NgbModalModule } from '@ng-bootstrap/ng-bootstrap';

import { HTTP_INTERCEPTORS } from '@angular/common/http';
import { AuthInterceptorService } from './auth-interceptor.service';
import { EditCustomerComponent } from './admin/edit-customer/edit-customer.component';
import { SchedaClienteComponent } from './admin/scheda-cliente/scheda-cliente.component';
import { ShiftHomeComponent } from './admin/shift-home/shift-home.component';
import { CreateShiftComponent } from './admin/create-shift/create-shift.component';
import { AssignDialogComponent } from './admin/assign-dialog/assign-dialog.component';
import { GestionePermessiComponent } from './admin/gestione-permessi/gestione-permessi.component';
import { TimbratureHomeComponent } from './admin/timbrature-home/timbrature-home.component';
import { TimbratureDettaglioComponent } from './admin/timbrature-dettaglio/timbrature-dettaglio.component';
import { CustomModalComponent } from './admin/timbrature-dettaglio/custom-modal/custom-modal.component';
import { GestioneAssenzeComponent } from './admin/gestione-assenze/gestione-assenze.component';
import { LeaveSettingsComponent } from './admin/leave-settings/leave-settings.component';
import { GestioneTagClienteComponent } from './gestione-tag-cliente/gestione-tag-cliente.component';
import { RiepilogoPresenzeEditabileComponent } from './admin/riepilogo-presenze-editabile/riepilogo-presenze-editabile.component';
import { RiepilogoOreClientiComponent } from './admin/riepilogo-ore-clienti/riepilogo-ore-clienti.component';
import { InternalDocumentsComponent } from './admin/internal-documents/internal-documents.component';
import { QuoteNotesComponent } from './admin/quote-notes/quote-notes.component';
import { CustomerNotesComponent } from './admin/customer-notes/customer-notes.component';
import { ServiceOrdersComponent } from './admin/service-orders/service-orders.component';
import { AddServiceOrderComponent } from './admin/add-service-order/add-service-order.component';
import { QuoteAcceptComponent } from './public/quote-accept/quote-accept.component';
import { ContractAcceptComponent } from './public/contract-accept/contract-accept.component';
import { WorkCompletionStatsComponent } from './admin/work-completion-stats/work-completion-stats.component';
import { EmailHomeComponent } from './admin/email-home/email-home.component';
import { EmailSettingsComponent } from './admin/email-settings/email-settings.component';
import { NotificationSettingsComponent } from './admin/notification-settings/notification-settings.component';
import { AppErrorHandler } from './app-error-handler';
import { InternalWarehouseComponent } from './admin/internal-warehouse/internal-warehouse.component';
import { InvoicesComponent } from './admin/invoices/invoices.component';
import { EmployeeContractsComponent } from './admin/employee-contracts/employee-contracts.component';

registerLocaleData(localeIt);

@NgModule({
  declarations: [
    AppComponent,
    PrivateAreaComponent,
    HomeAdminComponent,
    UserSettingsComponent,
    QuotesHomeComponent,
    AddQuoteComponent,
    EditQuoteComponent,
    FileDirective,
    AddCustomerComponent,
    ListCustomerComponent,
    PopupComponentComponent,
    PassworddimenticataComponent,
    CambiapasswordComponent,
    CalendarHomeComponent,
    PopUpComponent,
    QuestionPopupComponent,
    GestioneEmployeesComponent,
    GestioneUsersComponent,
    SettingsEmployeesComponent,
    DeadlinesManagementComponent,
    ViewPdfComponent,
    DocumentManagerComponent,
    EditCustomerComponent,
    SchedaClienteComponent,
    ShiftHomeComponent,
    CreateShiftComponent,
    AssignDialogComponent,
    VehicleAssignDialogComponent,
    EquipmentAssignDialogComponent,
    VehiclesSettingsComponent,
    QuoteSettingsComponent,
    GestionePermessiComponent,
    TimbratureHomeComponent,
    TimbratureDettaglioComponent,
    GestioneAssenzeComponent,
    LeaveSettingsComponent,
    GestioneTagClienteComponent,
    RiepilogoPresenzeEditabileComponent,
    RiepilogoOreClientiComponent,
    InternalDocumentsComponent,
    QuoteNotesComponent,
    CustomerNotesComponent,
    ServiceOrdersComponent,
    AddServiceOrderComponent,
    QuoteAcceptComponent,
    ContractAcceptComponent,
    WorkCompletionStatsComponent,
    EmailHomeComponent,
    EmailSettingsComponent,
    NotificationSettingsComponent,
    InternalWarehouseComponent,
    InvoicesComponent,
    EmployeeContractsComponent,
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    MatSlideToggleModule,
    MatButtonToggleGroup,
    HttpClientModule,
    MatFormFieldModule,
    FormsModule,
    MatSelectModule,
    MatButtonToggleModule,
    BrowserAnimationsModule,
    ReactiveFormsModule,
    MatGridListModule,
    MatInputModule,
    MatChipsModule,
    MatIconModule,
    MatListModule,
    MatCardModule,
    MatButtonModule,
    MatToolbarModule,
    MatTabsModule,
    MatSidenavModule,
    MatMenuModule,
    MatRadioModule,
    MatCheckboxModule,
    MatAutocompleteModule,
    MatExpansionModule,
    NgxExtendedPdfViewerModule,
    MatNativeDateModule,
    MatDatepickerModule,
    MatDialogModule,
    DragDropModule,
    NgbModalModule,
  ],
  providers: [
    provideHttpClient(withFetch(), withInterceptorsFromDi()),
    {
      provide: HTTP_INTERCEPTORS,
      useClass: AuthInterceptorService,
      multi: true,
    },
    { provide: ErrorHandler, useClass: AppErrorHandler },
    { provide: LOCALE_ID, useValue: 'it-IT' },
    { provide: MAT_DATE_LOCALE, useValue: 'it-IT' },
    { provide: DateAdapter, useClass: ItalianDateAdapter },
    GlobalService,
    DatePipe,
  ],
  bootstrap: [AppComponent],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
// Remove the existing export statement for the AppModule class
// export class AppModule { }
export class AppModule {}
