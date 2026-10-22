import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { GlobalService } from '../../service/global.service';
import { AgendaNavigationPreferences, AgendaNavigator, AgendaWidgetPreferences, AgendaWidgetService } from '../../service/agenda-widget.service';
import { TenantService } from '../../service/tenant.service';

interface PersonalCategory { id: string; label: string; color: string; }
@Component({
  selector: 'app-calendar-settings', standalone: true, imports: [CommonModule, FormsModule],
  templateUrl: './calendar-settings.component.html', styleUrls: ['./calendar-settings.component.css'],
})
export class CalendarSettingsComponent implements OnInit {
  categories: PersonalCategory[] = [];
  sourceTenantId = '';
  linkedCompanies: Array<{ tenantId: string; label: string }> = [];
  editingId = '';
  label = '';
  color = '#7c3aed';
  loading = false;
  saving = false;
  error = '';
  success = '';
  widgetOptions: AgendaWidgetPreferences = { enabled: true, group: 'all', private: false, hiddenTenantIds: [] };
  widgetSaving = false;
  widgetFeedback = '';
  navigation?: AgendaNavigationPreferences;
  navigatorChoice: AgendaNavigator | '' = '';
  navigatorSaving = false;
  navigatorFeedback = '';
  constructor(private http: HttpClient, public global: GlobalService, private router: Router, public widget: AgendaWidgetService, public tenantService: TenantService) {}
  ngOnInit(): void {
    if (this.widget.available) void this.widget.getPreferences().then(options => this.widgetOptions = options);
    if (this.widget.navigationAvailable) void this.loadNavigators();
    this.load();
    this.http.get<{ tenants?: Array<{ tenantId: string; label: string; userId?: number }> }>(this.global.url + 'appointments/federationOptions', { headers: this.global.headers })
      .subscribe({ next: response => this.linkedCompanies = (response.tenants || []).filter(company => !!company.userId), error: () => {} });
  }
  changeCompany(): void { this.reset(); this.success = ''; this.load(); }
  async loadNavigators(): Promise<void> {
    try { this.navigation = await this.widget.getNavigationPreferences(); this.navigatorChoice = this.navigation.selected; }
    catch { this.navigatorFeedback = 'Impossibile verificare i navigatori disponibili. Riapri le impostazioni del calendario.'; }
  }
  async saveNavigator(): Promise<void> {
    if (!this.navigatorChoice || this.navigatorSaving) return;
    this.navigatorSaving = true; this.navigatorFeedback = '';
    try {
      this.navigation = await this.widget.setNavigator(this.navigatorChoice);
      this.navigatorChoice = this.navigation.selected;
      this.navigatorFeedback = 'Navigatore salvato per questo iPhone.';
    } catch {
      await this.loadNavigators();
      this.navigatorFeedback = 'Impossibile salvare la scelta. Verifica che il navigatore sia ancora installato.';
    } finally { this.navigatorSaving = false; }
  }
  widgetIncludesCompany(tenantId: string): boolean { return !this.widgetOptions.hiddenTenantIds.includes(tenantId); }
  toggleWidgetCompany(tenantId: string): void {
    this.widgetOptions.hiddenTenantIds = this.widgetIncludesCompany(tenantId)
      ? [...this.widgetOptions.hiddenTenantIds, tenantId] : this.widgetOptions.hiddenTenantIds.filter(id => id !== tenantId);
  }
  async saveWidget(): Promise<void> {
    this.widgetSaving = true; this.widgetFeedback = '';
    try { await this.widget.savePreferences(this.widgetOptions); this.widgetFeedback = this.widget.status.message || 'Impostazioni del widget salvate.'; }
    catch { this.widgetFeedback = this.widget.status.message || 'Impossibile aggiornare il widget. Controlla la connessione e riprova.'; }
    finally { this.widgetSaving = false; }
  }
  async addWidget(): Promise<void> {
    try {
      this.widgetFeedback = await this.widget.addToHome() ? 'Conferma l’aggiunta nella schermata del telefono.' : 'Tieni premuto su uno spazio vuoto della schermata principale, scegli Widget e cerca MVanager.';
    } catch { this.widgetFeedback = 'Aggiungi MVanager dal menu Widget della schermata principale del telefono.'; }
  }
  back(): void { void this.router.navigateByUrl('/homeAdmin'); }
  load(): void {
    this.loading = true; this.error = '';
    this.http.get<{ categories: PersonalCategory[] }>(this.global.url + 'appointments/personalCategories' + (this.sourceTenantId ? '?sourceTenantId=' + encodeURIComponent(this.sourceTenantId) : ''), { headers: this.global.headers })
      .subscribe({ next: response => { this.categories = response.categories; this.loading = false; },
        error: error => { this.error = error?.error?.error || 'Impossibile caricare le categorie.'; this.loading = false; } });
  }
  edit(category: PersonalCategory): void {
    this.editingId = category.id; this.label = category.label; this.color = category.color; this.success = ''; this.error = '';
  }
  reset(): void { this.editingId = ''; this.label = ''; this.color = '#7c3aed'; }
  save(): void {
    if (this.saving || !this.label.trim()) return;
    this.mutate('save', { id: this.editingId || undefined, label: this.label.trim(), color: this.color });
  }
  remove(category: PersonalCategory): void { if (!this.saving) this.mutate('delete', { id: category.id }); }
  private mutate(action: 'save' | 'delete', body: any): void {
    this.saving = true; this.error = ''; this.success = '';
    this.http.post<{ categories: PersonalCategory[] }>(this.global.url + `appointments/personalCategories/${action}`, { ...body, ...(this.sourceTenantId ? { sourceTenantId: this.sourceTenantId } : {}) }, { headers: this.global.headers })
      .subscribe({ next: response => { this.categories = response.categories; this.saving = false; this.reset();
        this.success = action === 'delete' ? 'Categoria eliminata. Gli eventi sono stati spostati in Evento.' : 'Categoria salvata.'; },
      error: error => { this.error = error?.error?.error || 'Impossibile salvare la categoria.'; this.saving = false; } });
  }
}
