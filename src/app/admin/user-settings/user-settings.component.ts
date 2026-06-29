import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { GlobalService } from '../../service/global.service';
import { Router } from '@angular/router';

interface PermissionOption {
  key: string;
  label: string;
  description?: string;
}

interface AdminRow {
  id: number;
  nome: string;
  cognome: string;
  email: string;
  codiceOperatore: string;
  permissions: string[];
}

@Component({
  selector: 'app-user-settings',
  templateUrl: './user-settings.component.html',
  styleUrls: ['./user-settings.component.css'],
})
export class UserSettingsComponent implements OnInit {
  // Lista permessi disponibili (presa dal backend)
  permissionOptions: PermissionOption[] = [];

  adminAdd: {
    nome: string;
    cognome: string;
    email: string;
    codiceOperatore: string;
    permissions: string[];
  } = {
    nome: '',
    cognome: '',
    email: '',
    codiceOperatore: '',
    permissions: [],
  };

  admins: AdminRow[] = [];

  editingIndex: number | null = null;
  adminEdit: any = {}; // buffer edit
  private adminEditOriginal: any = {};

  permissionGroups: Array<{
    title: string;
    items: PermissionOption[];
  }> = [];
  availablePermissionKeys = new Set<string>();

  private permissionDeps: Record<string, string[]> = {
    // Note: richiedono prima la VIEW della sezione padre
    QUOTES_VIEW: ['CUSTOMERS_VIEW'],
    QUOTES_NOTES_VIEW: ['QUOTES_VIEW'],
    CUSTOMERS_NOTES_VIEW: ['CUSTOMERS_VIEW'],
    INVOICES_VIEW: ['CUSTOMERS_VIEW'],
    ACCOUNTING_VIEW: ['INVOICES_VIEW'],
    SERVICE_ORDERS_VIEW: ['CUSTOMERS_VIEW', 'CALENDAR_VIEW'],

    // Gestione preventivi/clienti
    QUOTES_MANAGE: ['QUOTES_VIEW'],
    QUOTES_NOTES_MANAGE: ['QUOTES_NOTES_VIEW'], // → transitivo: QUOTES_VIEW
    SERVICE_ORDERS_MANAGE: ['SERVICE_ORDERS_VIEW'],
    INVOICES_MANAGE: ['INVOICES_VIEW'],
    ACCOUNTING_MANAGE: ['ACCOUNTING_VIEW'],
    CUSTOMERS_MANAGE: ['CUSTOMERS_VIEW'],
    CUSTOMER_DOCS_MANAGE: ['CUSTOMERS_VIEW'],
    CUSTOMERS_NOTES_MANAGE: ['CUSTOMERS_NOTES_VIEW'], // → transitivo: CUSTOMERS_VIEW
    CUSTOMERS_HOURS_VIEW: ['CUSTOMERS_VIEW'],

    // Operatività
    SHIFTS_VIEW: ['EMPLOYEE_VIEW', 'CALENDAR_VIEW'],
    SHIFTS_MANAGE: ['SHIFTS_VIEW'],
    ATTENDANCE_VIEW: ['EMPLOYEE_VIEW'],
    ATTENDANCE_MANAGE: ['ATTENDANCE_VIEW'],
    STAMPING_VIEW: ['EMPLOYEE_VIEW', 'SHIFTS_VIEW'],
    STAMPING_MANAGE: ['STAMPING_VIEW'],
    STAMPING_WAREHOUSES_MANAGE: ['STAMPING_VIEW'],
    CALENDAR_EVENT_MANAGE: ['CALENDAR_VIEW'],
    NOTIFICATIONS_MANAGE: ['NOTIFICATIONS_VIEW'],
    STATS_VIEW: ['CUSTOMERS_VIEW', 'EMPLOYEE_VIEW', 'SHIFTS_VIEW'],

    // Amministratori
    ADMIN_CREATE: ['ADMIN_VIEW'],
    ADMIN_EDIT: ['ADMIN_VIEW'],
    ADMIN_DELETE: ['ADMIN_VIEW'],
    SETTINGS_ADMIN: ['ADMIN_VIEW'],
    EMAIL_SETTINGS: ['EMAIL_VIEW'],

    // Dipendenti
    EMPLOYEE_CREATE: ['EMPLOYEE_VIEW'],
    EMPLOYEE_EDIT: ['EMPLOYEE_VIEW'],
    EMPLOYEE_DELETE: ['EMPLOYEE_VIEW'],
    EMPLOYEE_DOCS_MANAGE: ['EMPLOYEE_VIEW'],
    EMPLOYEE_PERMITS_MANAGE: ['EMPLOYEE_VIEW', 'CALENDAR_VIEW'],
    EMPLOYEE_DEADLINES_VIEW: ['EMPLOYEE_VIEW'],
    EMPLOYEE_DEADLINES_CREATE: ['EMPLOYEE_DEADLINES_VIEW'],
    EMPLOYEE_DEADLINES_EDIT: ['EMPLOYEE_DEADLINES_VIEW'],
    EMPLOYEE_DEADLINES_DELETE: ['EMPLOYEE_DEADLINES_VIEW'],
    VEHICLE_DEADLINES_CREATE: ['VEHICLE_DEADLINES_VIEW'],
    VEHICLE_DEADLINES_EDIT: ['VEHICLE_DEADLINES_VIEW'],
    VEHICLE_DEADLINES_DELETE: ['VEHICLE_DEADLINES_VIEW'],
    EQUIPMENT_DEADLINES_CREATE: ['EQUIPMENT_DEADLINES_VIEW'],
    EQUIPMENT_DEADLINES_EDIT: ['EQUIPMENT_DEADLINES_VIEW'],
    EQUIPMENT_DEADLINES_DELETE: ['EQUIPMENT_DEADLINES_VIEW'],
    CUSTOMER_DEADLINES_VIEW: ['CUSTOMERS_VIEW'],
    CUSTOMER_DEADLINES_CREATE: ['CUSTOMER_DEADLINES_VIEW'],
    CUSTOMER_DEADLINES_EDIT: ['CUSTOMER_DEADLINES_VIEW'],
    CUSTOMER_DEADLINES_DELETE: ['CUSTOMER_DEADLINES_VIEW'],
    INTERNAL_DEADLINES_CREATE: ['INTERNAL_DEADLINES_VIEW'],
    INTERNAL_DEADLINES_EDIT: ['INTERNAL_DEADLINES_VIEW'],
    INTERNAL_DEADLINES_DELETE: ['INTERNAL_DEADLINES_VIEW'],
  };

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
    this.http
      .get(this.globalService.url + 'admin/permissions/list', {
        headers: this.globalService.headers,
        responseType: 'text',
      })
      .subscribe({
        next: (response) => {
          let parsed: any;
          try {
            parsed = JSON.parse(response);
          } catch {
            parsed = response;
          }

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

  togglePermission(target: { permissions: string[] }, key: string) {
    if (!target.permissions) target.permissions = [];
    if (!this.availablePermissionKeys.has(key)) return;

    const idx = target.permissions.indexOf(key);
    const willBeChecked = idx < 0;
    if (idx >= 0) target.permissions.splice(idx, 1);
    else target.permissions.push(key);
    this.ensurePermissionDeps(target, key, willBeChecked);
  }

  fetchAdmins() {
    this.http
      .get(this.globalService.url + 'admin/getAll', {
        headers: this.globalService.headers,
        responseType: 'text',
      })
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

          // ✅ QUI È LA FIX VERA
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

    return [
      {
        title: 'Amministratori',
        items: pick([
          'ADMIN_VIEW',
          'ADMIN_CREATE',
          'ADMIN_EDIT',
          'ADMIN_DELETE',
        ]),
      },
      {
        title: 'Gestione mezzi e attrezzature',
        items: pick([
          'VEHICLE_SETTINGS_MANAGE',
          'EQUIPMENT_SETTINGS_MANAGE',
          'SETTINGS_ADMIN',
        ]),
      },
      {
        title: 'Dipendenti',
        items: pick([
          'EMPLOYEE_VIEW',
          'EMPLOYEE_CREATE',
          'EMPLOYEE_EDIT',
          'EMPLOYEE_DELETE',
          'EMPLOYEE_DOCS_MANAGE',
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
      { title: 'Documenti interni', items: pick(['INTERNAL_DOCS_ACCESS']) },
      { title: 'Documenti clienti', items: pick(['CUSTOMER_DOCS_MANAGE']) },
      {
        title: 'Preventivi',
        items: pick([
          'QUOTES_VIEW',
          'QUOTES_MANAGE',
          'QUOTES_NOTES_VIEW',
          'QUOTES_NOTES_MANAGE',
          'SETTINGS_QUOTES',
        ]),
      },
      {
        title: 'Ordini di servizio',
        items: pick(['SERVICE_ORDERS_VIEW', 'SERVICE_ORDERS_MANAGE']),
      },
      {
        title: 'Clienti',
        items: pick([
          'CUSTOMERS_VIEW',
          'CUSTOMERS_MANAGE',
          'CUSTOMERS_NOTES_VIEW',
          'CUSTOMERS_NOTES_MANAGE',
          'CUSTOMERS_HOURS_VIEW',
        ]),
      },
      { title: 'Turni', items: pick(['SHIFTS_VIEW', 'SHIFTS_MANAGE']) },
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
        items: pick(['EMAIL_VIEW', 'EMAIL_SETTINGS']),
      },
      {
        title: 'Statistiche',
        items: pick(['STATS_VIEW']),
      },
    ].filter((g) => g.items.length > 0);
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

  addAdmin() {
    const body = {
      nome: this.adminAdd.nome,
      cognome: this.adminAdd.cognome,
      email: this.adminAdd.email,
      codiceOperatore: this.adminAdd.codiceOperatore,
      permissions: this.filterAvailablePermissions(this.adminAdd.permissions || []),
    };

    this.http
      .post(this.globalService.url + 'admin/add', body, {
        headers: this.globalService.headers,
        responseType: 'text',
      })
      .subscribe({
        next: () => {
          this.adminAdd = {
            nome: '',
            cognome: '',
            email: '',
            codiceOperatore: '',
            permissions: [],
          };
          this.fetchAdmins();
        },
        error: (err) => {
          console.error('Errore creazione admin:', err);
          alert(this.parseServerError(err));
        },
      });
  }

  deleteAdmin(i: number) {
    const body = { email: this.admins[i].email };
    this.http
      .post(this.globalService.url + 'admin/delete', body, {
        headers: this.globalService.headers,
        responseType: 'text',
      })
      .subscribe({
        next: () => {
          if (this.editingIndex === i) this.cancelEditAdmin();
          this.fetchAdmins();
        },
        error: (err) => {
          console.error('Errore cancellazione admin:', err);
          alert(this.parseServerError(err));
        },
      });
  }

  startEditAdmin(i: number) {
    this.editingIndex = i;
    this.adminEditOriginal = { ...this.admins[i] };
    this.adminEdit = {
      ...this.admins[i],
      permissions: [...(this.admins[i].permissions || [])],
    };
  }

  cancelEditAdmin() {
    this.editingIndex = null;
    this.adminEdit = {};
    this.adminEditOriginal = {};
  }

  saveEditAdmin() {
    if (this.editingIndex === null) return;

    const body: any = {
      id: this.adminEdit.id,
      nome: this.adminEdit.nome,
      cognome: this.adminEdit.cognome,
      email: this.adminEdit.email,
      codiceOperatore: this.adminEdit.codiceOperatore,
      permissions: this.filterAvailablePermissions(this.adminEdit.permissions || []),
    };

    this.http
      .post(this.globalService.url + 'admin/edit', body, {
        headers: this.globalService.headers,
        responseType: 'text',
      })
      .subscribe({
        next: () => {
          this.cancelEditAdmin();
          this.fetchAdmins();
        },
        error: (err) => {
          console.error('Errore modifica admin:', err);
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
    if (!this.availablePermissionKeys.size) return permissions || [];
    return [...new Set(permissions || [])].filter((permission) =>
      this.availablePermissionKeys.has(permission),
    );
  }
}
