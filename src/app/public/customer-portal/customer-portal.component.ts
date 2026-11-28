import { CommonModule } from '@angular/common';
import { Component, HostListener, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpBackend, HttpClient, HttpHeaders } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { localCustomerPortalTenant } from './customer-portal-host';
import {CustomerTicketsComponent} from './customer-tickets.component';
import {CustomerCommunicationsComponent} from './customer-communications.component';
import {CustomerDocumentsComponent} from './customer-documents.component';

interface CustomerSession { token?: string; numeroCliente: string; username?: string; passwordChangeRequired: boolean; }
interface CustomerSection { id: string; icon: string; title: string; description: string; }

@Component({
  selector: 'app-customer-portal', standalone: true, imports: [CommonModule, FormsModule,CustomerDocumentsComponent,CustomerTicketsComponent,CustomerCommunicationsComponent],
  templateUrl: './customer-portal.component.html', styleUrls: ['../../shared/mv-auth-shell.css', './customer-portal.component.css'],
})
export class CustomerPortalComponent implements OnInit, OnDestroy {
  private http: HttpClient;
  tenant = '';
  token = '';
  private storageKey = '';
  readonly api = environment.apiUrl.replace(/\/+$/, '') + '/customer-portal/';
  documentsEnabled=false;communicationsEnabled=false;ticketsEnabled=false;counts={communications:0,tickets:0};
  initialTicket='';private summaryGeneration=0;
  get visibleSections(){return this.sections.filter(section=>this.sectionEnabled(section.id));}
  sectionEnabled(id:string){return id==='documents'?this.documentsEnabled:id==='communications'?this.communicationsEnabled:this.ticketsEnabled;}
  sectionCount(id:string){return id==='communications'?this.counts.communications:id==='tickets'?this.counts.tickets:0;}
  companyName = '';
  username = '';
  password = '';
  currentPassword = '';
  newPassword = '';
  confirmPassword = '';
  session: CustomerSession | null = null;
  loading = true;
  busy = false;
  ready = false;
  editingPassword = false;
  settingsMenuOpen = false;
  selectedSection: CustomerSection | null = null;
  error = '';
  notice = '';
  readonly sections: readonly CustomerSection[] = [
    { id: 'communications', icon: 'M4 5h16v14H4z M4 6l8 7 8-7', title: 'Comunicazioni', description: 'Le comunicazioni della tua azienda di riferimento.' },
    { id: 'documents', icon: 'M14 3H6v18h12V7z M14 3v5h4 M9 12h6 M9 16h6', title: 'Documenti', description: 'I tuoi documenti, raccolti in un unico spazio.' },
    { id: 'tickets', icon: 'M4 5h16v4a3 3 0 0 0 0 6v4H4v-4a3 3 0 0 0 0-6z M14 8v2 M14 12v2 M14 16v1', title: 'Ticket', description: 'Le tue richieste di assistenza e il loro stato.' },
  ];

  constructor(backend: HttpBackend, private route: ActivatedRoute) {
    // Customer credentials and errors are isolated from the admin interceptor and offline queue.
    this.http = new HttpClient(backend);
  }
  private options() {
    let headers = new HttpHeaders({ 'X-Tenant-Id': this.tenant });
    if (this.token) headers = headers.set('Authorization', `Bearer ${this.token}`);
    return { headers };
  }
  async ngOnInit(): Promise<void> {
    const host = window.location.hostname.toLowerCase();
    const local = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost');
    this.tenant = this.route.snapshot.paramMap.get('tenant') || localCustomerPortalTenant(host) || (local ? this.route.snapshot.queryParamMap.get('tenant') || '' : '');
    try {
      const config = await firstValueFrom(this.http.get<{ tenantId: string; companyName: string; documentsEnabled?:boolean;communicationsEnabled?:boolean;ticketsEnabled?:boolean }>(this.api + 'config', this.options()));
      this.tenant = config.tenantId;
      this.companyName = config.companyName;
      this.documentsEnabled=config.documentsEnabled===true;this.communicationsEnabled=config.communicationsEnabled===true;this.ticketsEnabled=config.ticketsEnabled===true;
      this.initialTicket=this.route.snapshot.queryParamMap.get('ticket')||'';
      this.storageKey = 'customerPortal:' + this.tenant;
      this.ready = true;
      try { this.token = sessionStorage.getItem(this.storageKey) || ''; } catch {}
      if (this.token) {
        try { this.session = await firstValueFrom(this.http.get<CustomerSession>(this.api + 'me', this.options())); }
        catch (error: any) { this.clearSession(); this.handleDisabledModule(error); }
      }
    } catch (error: any) { if (!this.handleDisabledModule(error)) this.error = 'Impossibile caricare l’area clienti. Verifica il link ricevuto o riprova più tardi.'; }
    finally { this.loading = false; this.activateInitialSection();void this.refreshSummary(); }
  }
  async login(): Promise<void> {
    if (this.busy || !this.ready) return;
    this.busy = true; this.error = ''; this.notice = '';
    try {
      const session = await firstValueFrom(this.http.post<CustomerSession>(this.api + 'login', { username: this.username.trim(), password: this.password }, this.options()));
      this.remember(session);
      this.password = '';
    } catch (error: any) { if (!this.handleDisabledModule(error)) this.error = error.error?.error || 'Accesso non riuscito. Riprova.'; }
    finally { this.busy = false; }
  }
  async changePassword(): Promise<void> {
    if (this.busy) return;
    this.error = ''; this.notice = '';
    if (this.newPassword !== this.confirmPassword) { this.error = 'Le nuove password non coincidono.'; return; }
    this.busy = true;
    try {
      const session = await firstValueFrom(this.http.post<CustomerSession>(this.api + 'password', {
        currentPassword: this.currentPassword, newPassword: this.newPassword,
      }, this.options()));
      this.remember(session);
      this.currentPassword = this.newPassword = this.confirmPassword = '';
      this.editingPassword = false;
      this.notice = 'Password aggiornata.';
    } catch (error: any) {
      if (error.status === 401) this.clearSession();
      if (!this.handleDisabledModule(error)) this.error = error.error?.error || 'Impossibile cambiare la password. Riprova.';
    } finally { this.busy = false; }
  }
  private handleDisabledModule(error: any): boolean {
    if (error.status !== 403 || error.error?.feature !== 'customerAccounts') return false;
    this.ready = false;
    this.clearSession();
    this.error = 'L’area clienti non è attiva per questa azienda. Contatta la tua azienda di riferimento.';
    return true;
  }
  private remember(session: CustomerSession): void {
    this.token = session.token || '';
    this.session = session;this.activateInitialSection();void this.refreshSummary();
    try { sessionStorage.setItem(this.storageKey, this.token); } catch {}
  }
  private clearSession(): void {
    this.token = ''; this.session = null;this.summaryGeneration++;this.counts={communications:0,tickets:0};
    this.settingsMenuOpen = false;
    this.editingPassword = false;
    this.selectedSection = null;
    this.currentPassword = this.newPassword = this.confirmPassword = '';
    try { sessionStorage.removeItem(this.storageKey); } catch {}
  }
  @HostListener('document:click', ['$event'])
  closeSettingsOutside(event: MouseEvent): void {
    if (!(event.target instanceof Element) || !event.target.closest('.portal-settings')) this.settingsMenuOpen = false;
  }
  @HostListener('document:keydown.escape')
  closeSettings(): void { this.settingsMenuOpen = false; }

  openPasswordChange(): void {
    this.settingsMenuOpen = false;
    this.currentPassword = this.newPassword = this.confirmPassword = '';
    this.error = ''; this.notice = '';
    this.editingPassword = true;
  }
  cancelPasswordChange(): void {
    if (this.busy) return;
    this.settingsMenuOpen = false;
    this.currentPassword = this.newPassword = this.confirmPassword = '';
    this.error = ''; this.notice = '';
    this.editingPassword = false;
  }
  selectSection(section: CustomerSection): void {
    if (this.busy||!this.sectionEnabled(section.id)) return;
    this.cancelPasswordChange();
    this.selectedSection = section;
  }
  showHome(): void {
    if (this.busy) return;
    this.cancelPasswordChange();
    this.selectedSection = null;
  }
  logout(): void {
    this.clearSession();
    this.password = this.currentPassword = this.newPassword = this.confirmPassword = '';
    this.editingPassword = false; this.error = ''; this.notice = '';
  }
  ngOnDestroy(){this.summaryGeneration++;}
  @HostListener('window:focus') onFocus(){void this.refreshSummary();}
  private activateInitialSection(){if(!this.session||this.session.passwordChangeRequired||this.selectedSection)return;const id=this.route.snapshot.queryParamMap.get('section');const section=this.sections.find(section=>section.id===id&&this.sectionEnabled(section.id));if(section)this.selectedSection=section;}
  async refreshSummary(){if(!this.session||this.session.passwordChangeRequired||!this.token)return;const generation=++this.summaryGeneration;try{const value=await firstValueFrom(this.http.get<{communications:number;tickets:number}>(this.api+'summary',this.options()));if(generation===this.summaryGeneration)this.counts=value;}catch(e:any){if(generation===this.summaryGeneration&&e.status===401)this.documentSessionExpired();}}
  documentSessionExpired():void{this.logout();this.error='Sessione scaduta. Accedi di nuovo.';}
}
