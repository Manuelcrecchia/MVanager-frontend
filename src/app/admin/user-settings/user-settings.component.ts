import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { GlobalService } from '../../service/global.service';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { AdminAccessScope, ScopeKey, SCOPED_PERMISSION, legacyScope, isLimitedScope } from '../access-scope/access-scope';

interface PermissionOption {
  key: string;
  label: string;
  description?: string;
}

interface AdminDraft {
  nome: string;
  cognome: string;
  email: string;
  codiceOperatore: string;
  permissions: string[];
}

interface AdminRow extends AdminDraft {
  id: number;
  isPrimaryAdmin?: boolean;
  accessScope?: AdminAccessScope | null;
  consultationOnly?: boolean;
}

@Component({
  selector: 'app-user-settings',
  templateUrl: './user-settings.component.html',
  styleUrls: ['./user-settings.component.css'],
})
export class UserSettingsComponent implements OnInit {

  readonly realtimeResources = ["admins"];
  refreshRealtimeData(): void | boolean | Promise<void | boolean> {
    this.fetchAdmins();
  }
  // Lista permessi disponibili (presa dal backend)
  permissionOptions: PermissionOption[] = [];

  @ViewChild('pageHeading') private pageHeading?: ElementRef<HTMLElement>;
  @ViewChild('scopePicker', { read: ElementRef }) private scopePicker?: ElementRef<HTMLElement>;

  admins: AdminRow[] = [];
  adminSearch = '';
  permissionSearch = '';
  expandedAdminId: number | null = null;
  editorMode: 'new' | 'edit' | null = null;
  adminAdd = this.emptyDraft();
  adminEdit: AdminRow | null = null;
  loadingAdmins = false;
  saving = false;
  resettingPassword = false;
  deletingAdminId: number | null = null;
  formError = '';
  accessScope = legacyScope();
  activeScopeKey: ScopeKey | null = null;
  private scopeChanged = false;

  permissionGroups: Array<{
    title: string;
    items: PermissionOption[];
  }> = [];
  availablePermissionKeys = new Set<string>();

  private permissionDeps: Record<string, string[]> = {};
  private currentUserPermissions: Set<string> | null = null;

  constructor(
    private http: HttpClient,
    public globalService: GlobalService,
    private router: Router,
  ) {}

  ngOnInit() {
    this.fetchPermissionOptions();
    this.fetchAdmins();
  }

  fetchPermissionOptions() {
    const token = this.globalService.token;
    this.http
      .get(this.globalService.url + 'admin/permissions/list', {
        headers: this.globalService.headers,
        responseType: 'text',
      })
      .subscribe({
        next: (response) => {
          if (token !== this.globalService.token) return;
          let parsed: any;
          try {
            parsed = JSON.parse(response);
          } catch {
            parsed = response;
          }

          this.currentUserPermissions = Array.isArray(parsed?.currentUserPermissions)
            ? new Set(parsed.currentUserPermissions)
            : null;
          if (this.currentUserPermissions) {
            this.globalService.updateSessionPermissions(token, [...this.currentUserPermissions]);
          }
          this.permissionDeps = Object.fromEntries(
            Object.entries(parsed?.permissionDependencies || {}).map(([key, rule]: [string, any]) => [
              key, Array.isArray(rule?.permissions) ? rule.permissions : [],
            ]),
          );
          const availableKeysFromResponse = Array.isArray(parsed?.permissions)
            ? new Set<string>(parsed.permissions.map((key: string) => String(key)))
            : null;
          const backendGroups = Array.isArray(parsed?.groups)
            ? parsed.groups
                .map((g: any) => ({
                  title: String(g.title || ''),
                  items: (Array.isArray(g.items) ? g.items : [])
                    .filter((permission: any) =>
                      !availableKeysFromResponse ||
                        availableKeysFromResponse.has(String(permission?.key || permission)),
                    )
                    .map((permission: any) => this.normalizePermissionOption(permission)),
                }))
                .filter((g: any) => g.title && g.items.length)
            : [];

          const arr = Array.isArray(parsed)
            ? parsed
            : Array.isArray(parsed?.data)
              ? parsed.data
              : Array.isArray(parsed?.permissions)
                ? parsed.permissions.map((key: string) => this.normalizePermissionOption(key))
                : parsed && typeof parsed === 'object'
                  ? Object.values(parsed)
                  : [];

          this.permissionGroups = backendGroups.length
            ? backendGroups
            : this.buildPermissionGroups(
                (arr as any[])
                  .map((permission: any) => this.normalizePermissionOption(permission))
                  .filter((permission) =>
                    !availableKeysFromResponse || availableKeysFromResponse.has(permission.key),
                  ),
              );
          this.permissionOptions = this.permissionGroups.flatMap((g) => g.items);
          this.availablePermissionKeys = new Set(
            this.permissionOptions.map((permission) => permission.key),
          );
          this.admins = this.admins.map((admin) => ({
            ...admin,
            permissions: this.filterAvailablePermissions(admin.permissions),
          }));
        },
        error: (err) => {
          console.error('Errore permissions/list:', err);
          this.permissionOptions = [];
          alert(err?.error?.error || 'Errore durante il caricamento dei permessi disponibili.');
        },
      });
  }

  private normalizePermissionOption(permission: any): PermissionOption {
    if (permission && typeof permission === 'object') {
      const key = String(permission.key || '').trim();
      return {
        key,
        label: String(permission.label || key).trim(),
        description: permission.description
          ? String(permission.description).trim()
          : undefined,
      };
    }

    const key = String(permission || '').trim();
    return { key, label: key };
  }

  hasCurrentPermission(key: string): boolean {
    return this.currentUserPermissions?.has(key) ?? this.globalService.hasPermission(key);
  }

  canAssignPermission(key: string): boolean {
    return this.hasCurrentPermission('ADMIN_PERMISSIONS_MANAGE') && this.availablePermissionKeys.has(key);
  }

  togglePermission(target: { permissions: string[] }, key: string) {
    if (!target.permissions) target.permissions = [];
    if (!this.canAssignPermission(key)) return;

    const idx = target.permissions.indexOf(key);
    const willBeChecked = idx < 0;
    if (idx >= 0) target.permissions.splice(idx, 1);
    else target.permissions.push(key);
    this.ensurePermissionDeps(target, key, willBeChecked);
  }

  isProtectedPrimaryPermission(target: AdminRow, key: string): boolean {
    return target?.isPrimaryAdmin === true && [
      'ADMIN_VIEW',
      'ADMIN_CREATE',
      'ADMIN_PROFILE_EDIT',
      'ADMIN_PERMISSIONS_MANAGE',
      'ADMIN_DELETE',
    ].includes(key);
  }

  get pageTitle(): string {
    if (this.editorMode === 'new') return 'Nuovo amministratore';
    if (this.editorMode === 'edit') return 'Modifica amministratore';
    return 'Gestisci utenti';
  }

  get filteredAdmins(): AdminRow[] {
    const terms = this.normalizeSearch(this.adminSearch).split(/\s+/).filter(Boolean);
    if (!terms.length) return this.admins;
    return this.admins.filter(admin => {
      const searchable = this.normalizeSearch(
        `#${admin.id} ${admin.nome} ${admin.cognome} ${admin.email} ${admin.codiceOperatore}`,
      );
      return terms.every(term => searchable.includes(term));
    });
  }

  get visiblePermissionGroups(): typeof this.permissionGroups {
    const search = this.normalizeSearch(this.permissionSearch.trim());
    if (!search) return this.permissionGroups;
    return this.permissionGroups.map(group => ({
      ...group,
      items: this.normalizeSearch(group.title).includes(search)
        ? group.items
        : group.items.filter(permission =>
          this.normalizeSearch(`${permission.label} ${permission.description || ''}`).includes(search)),
    })).filter(group => group.items.length);
  }

  trackPermissionGroup(_index: number, group: { title: string }): string {
    return group.title;
  }

  trackAdmin(_index: number, admin: AdminRow): number {
    return admin.id;
  }

  toggleAdmin(admin: AdminRow): void {
    this.expandedAdminId = this.expandedAdminId === admin.id ? null : admin.id;
  }

  private normalizeSearch(value: string): string {
    return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  }

  private emptyDraft(): AdminDraft {
    return { nome: '', cognome: '', email: '', codiceOperatore: '', permissions: [] };
  }

  private focusHeading(): void {
    requestAnimationFrame(() => this.pageHeading?.nativeElement.focus());
  }

  fetchAdmins() {
    this.loadingAdmins = true;
    this.http
      .get(this.globalService.url + 'admin/getAll', {
        headers: this.globalService.headers,
        responseType: 'text',
      })
      .pipe(finalize(() => this.loadingAdmins = false))
      .subscribe({
        next: (response) => {
          let parsed: any;
          try {
            parsed = JSON.parse(response);
          } catch {
            parsed = response;
          }

          const arr = Array.isArray(parsed)
            ? parsed
            : Array.isArray(parsed?.data)
              ? parsed.data
              : Array.isArray(parsed?.admins)
                ? parsed.admins
                : [];

          this.admins = arr.map((a: any) => ({
            ...a,
            permissions: this.filterAvailablePermissions(Array.isArray(a.permissions)
              ? a.permissions
              : typeof a.permissions === 'string'
                ? JSON.parse(a.permissions || '[]')
                : []),
          }));
        },
        error: (err) => {
          console.error('Errore admin/getAll:', err);
          this.admins = [];
          alert(err?.error?.error || 'Errore durante il caricamento degli amministratori.');
        },
      });
  }

  private buildPermissionGroups(options: PermissionOption[]) {
    const byKey = new Map(options.map((o) => [o.key, o]));

    const pick = (keys: string[]) =>
      keys.map((k) => byKey.get(k)).filter(Boolean) as PermissionOption[];

    const groups = [
      {
        title: 'Amministratori',
        items: pick([
          'ADMIN_VIEW',
          'ADMIN_CREATE',
          'ADMIN_PROFILE_EDIT',
          'ADMIN_PERMISSIONS_MANAGE',
          'ADMIN_DELETE',
        ]),
      },
      {
        title: 'Gestione mezzi e attrezzature',
        items: pick([
          'VEHICLES_VIEW',
          'VEHICLE_SETTINGS_MANAGE',
          'EQUIPMENT_VIEW',
          'EQUIPMENT_SETTINGS_MANAGE',
        ]),
      },
      {
        title: 'Dipendenti',
        items: pick([
          'EMPLOYEE_VIEW',
          'EMPLOYEE_CREATE',
          'EMPLOYEE_EDIT',
          'EMPLOYEE_DELETE',
          'EMPLOYEE_DOCS_VIEW',
          'EMPLOYEE_DOCS_EDIT',
          'EMPLOYEE_DOCS_DELETE',
          'EMPLOYEE_DOCS_SEND',
          'EMPLOYEE_PERMITS_VIEW',
          'EMPLOYEE_PERMITS_MANAGE',
        ]),
      },
      {
        title: 'Scadenze dipendenti',
        items: pick([
          'EMPLOYEE_DEADLINES_VIEW',
          'EMPLOYEE_DEADLINES_CREATE',
          'EMPLOYEE_DEADLINES_EDIT',
          'EMPLOYEE_DEADLINES_DELETE',
        ]),
      },
      {
        title: 'Scadenze mezzi',
        items: pick([
          'VEHICLE_DEADLINES_VIEW',
          'VEHICLE_DEADLINES_CREATE',
          'VEHICLE_DEADLINES_EDIT',
          'VEHICLE_DEADLINES_DELETE',
        ]),
      },
      {
        title: 'Scadenze attrezzature',
        items: pick([
          'EQUIPMENT_DEADLINES_VIEW',
          'EQUIPMENT_DEADLINES_CREATE',
          'EQUIPMENT_DEADLINES_EDIT',
          'EQUIPMENT_DEADLINES_DELETE',
        ]),
      },
      {
        title: 'Scadenze clienti',
        items: pick([
          'CUSTOMER_DEADLINES_VIEW',
          'CUSTOMER_DEADLINES_CREATE',
          'CUSTOMER_DEADLINES_EDIT',
          'CUSTOMER_DEADLINES_DELETE',
          'CUSTOMER_DEADLINE_CATEGORIES_MANAGE',
        ]),
      },
      {
        title: 'Scadenze interne',
        items: pick([
          'INTERNAL_DEADLINES_VIEW',
          'INTERNAL_DEADLINES_CREATE',
          'INTERNAL_DEADLINES_EDIT',
          'INTERNAL_DEADLINES_DELETE',
        ]),
      },
      { title: 'Documenti interni', items: pick(['INTERNAL_DOCS_VIEW', 'INTERNAL_DOCS_EDIT', 'INTERNAL_DOCS_DELETE']) },
      { title: 'Documenti clienti', items: pick(['CUSTOMER_DOCS_VIEW', 'CUSTOMER_DOCS_EDIT', 'CUSTOMER_DOCS_DELETE', 'CUSTOMER_DOCS_SEND']) },
      {
        title: 'Preventivi',
        items: pick([
          'QUOTES_VIEW',
          'QUOTES_MANAGE',
          'QUOTES_SEND',
          'QUOTES_REQUEST_SIGNATURE',
          'QUOTES_DELETE',
          'QUOTES_ANONYMIZE',
          'QUOTES_NOTES_VIEW',
          'QUOTES_NOTES_MANAGE',
          'SETTINGS_QUOTES',
        ]),
      },
      {
        title: 'Fatture elettroniche',
        items: pick([
          'INVOICES_VIEW',
          'INVOICES_MANAGE',
          'INVOICES_SEND_SDI',
          'INVOICES_DELETE_DRAFTS',
          'INVOICES_CREDIT_NOTES',
          'INVOICES_SETTINGS_MANAGE',
        ]),
      },
      {
        title: 'Contratti dipendenti',
        items: pick([
          'EMPLOYEE_CONTRACTS_VIEW',
          'EMPLOYEE_CONTRACTS_MANAGE',
          'EMPLOYEE_CONTRACTS_REQUEST_SIGNATURE',
          'EMPLOYEE_CONTRACTS_DELETE',
        ]),
      },
      {
        title: 'Ordini di servizio',
        items: pick(['SERVICE_ORDERS_VIEW', 'SERVICE_ORDERS_MANAGE', 'SERVICE_ORDERS_REQUEST_SIGNATURE', 'SERVICE_ORDERS_ARCHIVE']),
      },
      {
        title: 'Clienti',
        items: pick([
          'CUSTOMERS_VIEW',
          'CUSTOMERS_MANAGE',
          'CUSTOMERS_ARCHIVE',
          'CUSTOMERS_ANONYMIZE',
          'CUSTOMERS_DELETE',
          'CUSTOMERS_NOTES_VIEW',
          'CUSTOMERS_NOTES_MANAGE',
        ]),
      },
      {
        title: 'Riepilogo ore clienti',
        items: pick(['CUSTOMERS_HOURS_VIEW', 'CUSTOMERS_HOURS_MANAGE']),
      },
      { title: 'Turni', items: pick(['SHIFTS_VIEW', 'SHIFTS_MANAGE', 'SHIFTS_PUBLISH', 'SHIFTS_DELETE', 'SHIFTS_EXPORT']) },
      {
        title: 'Magazzino interno',
        items: pick([
          'INTERNAL_WAREHOUSE_VIEW',
          'INTERNAL_WAREHOUSE_IN',
          'INTERNAL_WAREHOUSE_OUT',
          'INTERNAL_WAREHOUSE_PRODUCTS_MANAGE',
          'INTERNAL_WAREHOUSE_ADJUST',
          'INTERNAL_WAREHOUSE_HISTORY_VIEW',
          'INTERNAL_WAREHOUSE_IMPORT',
          'INTERNAL_WAREHOUSE_EXPORT',
        ]),
      },
      {
        title: 'Presenze',
        items: pick(['ATTENDANCE_VIEW', 'ATTENDANCE_MANAGE']),
      },
      {
        title: 'Timbrature',
        items: pick([
          'STAMPING_VIEW',
          'STAMPING_MANAGE',
          'STAMPING_WAREHOUSES_MANAGE',
        ]),
      },
      {
        title: 'Calendario',
        items: pick(['CALENDAR_VIEW', 'CALENDAR_EVENT_MANAGE']),
      },
      {
        title: 'Notifiche',
        items: pick(['NOTIFICATIONS_VIEW', 'NOTIFICATIONS_MANAGE']),
      },
      {
        title: 'Email aziendali',
        items: pick(['EMAIL_READ', 'EMAIL_COMPOSE', 'EMAIL_ORGANIZE', 'EMAIL_SETTINGS']),
      },
      {
        title: 'Statistiche',
        items: pick(['STATS_VIEW']),
      },
    ].filter((g) => g.items.length > 0);
    const grouped = new Set(groups.flatMap(group => group.items.map(item => item.key)));
    const other = options.filter(item => !grouped.has(item.key));
    if (other.length) groups.push({ title: 'Altri permessi', items: other });
    return groups;
  }

  private ensurePermissionDeps(
    target: { permissions: string[] },
    key: string,
    checked: boolean,
  ) {
    if (!target.permissions) target.permissions = [];

    if (checked) {
      // child selezionato -> aggiungi tutti i parent (ricorsivo per catene transitive)
      for (const p of this.permissionDeps[key] || []) {
        if (!this.availablePermissionKeys.has(p)) continue;
        if (!target.permissions.includes(p)) {
          target.permissions.push(p);
          this.ensurePermissionDeps(target, p, true);
        }
      }
    } else {
      // parent tolto -> togli ricorsivamente tutti i child che dipendono da lui
      const children = Object.keys(this.permissionDeps).filter((child) =>
        (this.permissionDeps[child] || []).includes(key),
      );
      for (const c of children) {
        const idx = target.permissions.indexOf(c);
        if (idx >= 0) {
          target.permissions.splice(idx, 1);
          this.ensurePermissionDeps(target, c, false);
        }
      }
    }
  }

  openNewAdmin(): void {
    if (!this.hasCurrentPermission('ADMIN_CREATE')) return;
    this.adminAdd = this.emptyDraft();
    this.accessScope = legacyScope();
    this.openEditor('new');
  }

  startEditAdmin(target: AdminRow): void {
    if (!this.hasCurrentPermission('ADMIN_PROFILE_EDIT')) return;
    this.adminEdit = { ...target, permissions: [...target.permissions] };
    this.accessScope = legacyScope(target.accessScope);
    this.openEditor('edit');
  }

  private openEditor(mode: 'new' | 'edit'): void {
    this.editorMode = mode;
    this.activeScopeKey = null;
    this.scopeChanged = false;
    this.permissionSearch = '';
    this.formError = '';
    this.focusHeading();
  }

  closeEditor(): void {
    if (this.saving) return;
    this.editorMode = null;
    this.adminEdit = null;
    this.activeScopeKey = null;
    this.formError = '';
    this.focusHeading();
  }

  scopeKey(permission: string): ScopeKey | undefined {
    return SCOPED_PERMISSION[permission];
  }

  get limitedConsultation(): boolean {
    return isLimitedScope(this.accessScope);
  }

  scopeSummary(section: ScopeKey): string {
    if (section === 'customerDocuments' && this.accessScope.customerDocuments === null && this.accessScope.customers !== null) {
      return 'Tutti dei clienti scelti';
    }
    return this.accessScope[section] === null ? 'Tutti' : 'Solo selezionati';
  }

  openScope(section: ScopeKey, permission: string): void {
    if (this.saving || this.adminEdit?.isPrimaryAdmin || !this.canAssignPermission(permission)) return;
    this.activeScopeKey = section;
    requestAnimationFrame(() => this.scopePicker?.nativeElement.focus());
  }

  applyScope(scope: AdminAccessScope): void {
    this.accessScope = scope;
    this.scopeChanged = true;
    this.activeScopeKey = null;
  }

  saveAdmin(): void {
    if (this.saving || this.activeScopeKey) return;
    const editing = this.editorMode === 'edit';
    const draft = editing ? this.adminEdit : this.adminAdd;
    if (!this.editorMode || !draft) return;
    if (!editing && !this.hasCurrentPermission('ADMIN_CREATE')) return;
    if (editing) {
      const current = this.admins.find(admin => admin.id === this.adminEdit?.id);
      if (!current || !this.hasCurrentPermission('ADMIN_PROFILE_EDIT')) {
        this.formError = 'Il profilo non è più disponibile per la modifica.';
        return;
      }
    }

    const { nome, cognome, email, codiceOperatore, permissions } = draft;
    const body = {
      nome, cognome, email, codiceOperatore,
      ...(editing ? { id: this.adminEdit?.id } : {}),
      ...(this.scopeChanged ? { accessScope: this.limitedConsultation ? this.accessScope : null } : {}),
      ...(!editing || this.hasCurrentPermission('ADMIN_PERMISSIONS_MANAGE')
        ? { permissions: this.filterAvailablePermissions(permissions) }
        : {}),
    };
    this.formError = '';
    this.saving = true;
    this.http
      .post(this.globalService.url + (editing ? 'admin/edit' : 'admin/add'), body, {
        headers: this.globalService.headers,
        responseType: 'text',
      })
      .pipe(finalize(() => this.saving = false))
      .subscribe({
        next: (response) => {
          if (!editing) this.showCreationWarnings(response);
          this.saving = false;
          this.closeEditor();
          this.fetchPermissionOptions();
          this.fetchAdmins();
        },
        error: (err) => {
          this.formError = this.parseServerError(err);
        },
      });
  }

  private showCreationWarnings(response: string): void {
    try {
      const outcome = JSON.parse(response);
      if (outcome.saved === true && Array.isArray(outcome.saveWarnings)) {
        alert(outcome.saveWarnings.join('\n'));
      }
    } catch {
      // The API may return a plain-text success response.
    }
  }

  regeneratePassword(): void {
    const id = this.adminEdit?.id;
    if (!id || this.resettingPassword || !this.hasCurrentPermission('ADMIN_PROFILE_EDIT')) return;
    if (!window.confirm('Rigenerare la password e inviarla all’indirizzo email salvato per questo amministratore? Le sessioni attive verranno chiuse.')) return;
    this.resettingPassword = true;
    this.http.post(this.globalService.url + 'admin/regeneratePassword', { id }, { headers: this.globalService.headers })
      .pipe(finalize(() => this.resettingPassword = false))
      .subscribe({
        next: () => alert('Nuova password inviata.'),
        error: error => alert(this.parseServerError(error)),
      });
  }

  deleteAdmin(target: AdminRow): void {
    if (this.deletingAdminId !== null || target.isPrimaryAdmin || !this.hasCurrentPermission('ADMIN_DELETE')) return;
    this.deletingAdminId = target.id;
    this.http
      .post(this.globalService.url + 'admin/delete', { email: target.email }, {
        headers: this.globalService.headers,
        responseType: 'text',
      })
      .pipe(finalize(() => this.deletingAdminId = null))
      .subscribe({
        next: () => {
          if (this.expandedAdminId === target.id) this.expandedAdminId = null;
          this.fetchAdmins();
        },
        error: (err) => {
          alert(this.parseServerError(err));
        },
      });
  }

  getPermissionLabel(key: string): string {
    const opt = this.permissionOptions.find((o) => o.key === key);
    return opt ? opt.label : key;
  }

  countGroupActive(
    group: { items: PermissionOption[] },
    permissions: string[],
  ): number {
    return group.items.filter((p) => (permissions || []).includes(p.key))
      .length;
  }

  back() {
    this.router.navigateByUrl('/homeAdmin');
  }

  private parseServerError(err: any): string {
    try {
      const body =
        typeof err.error === 'string' ? JSON.parse(err.error) : err.error;
      if (body?.error) return body.error;
    } catch {}
    if (err.status === 0) return 'Impossibile connettersi al server';
    return 'Errore imprevisto. Riprova.';
  }

  private filterAvailablePermissions(permissions: string[]): string[] {
    const expanded = new Set<string>();
    const add = (key: string) => {
      if (expanded.has(key) || (this.availablePermissionKeys.size && !this.availablePermissionKeys.has(key))) return;
      expanded.add(key);
      for (const dependency of this.permissionDeps[key] || []) add(dependency);
    };
    for (const key of permissions || []) add(key);
    return [...expanded];
  }
}
