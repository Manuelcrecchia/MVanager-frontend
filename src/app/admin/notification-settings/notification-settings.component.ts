import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { GlobalService } from '../../service/global.service';

interface NotificationCategory {
  key: string;
  label: string;
  description: string;
  requiredPermissions: string[];
  types: string[];
}

interface NotificationPreferencesResponse {
  categories: NotificationCategory[];
  enabledCategories: string[];
}

@Component({
  selector: 'app-notification-settings',
  templateUrl: './notification-settings.component.html',
  styleUrls: ['./notification-settings.component.css'],
})
export class NotificationSettingsComponent implements OnInit {
  categories: NotificationCategory[] = [];
  enabledCategories = new Set<string>();
  loading = false;
  saving = false;
  error = '';

  constructor(
    private http: HttpClient,
    private router: Router,
    public global: GlobalService,
  ) {}

  ngOnInit(): void {
    if (!this.global.forMobile) {
      this.router.navigateByUrl('/homeAdmin');
      return;
    }

    this.loadPreferences();
  }

  back(): void {
    this.router.navigateByUrl('/homeAdmin');
  }

  loadPreferences(): void {
    this.loading = true;
    this.error = '';

    this.http
      .get<NotificationPreferencesResponse>(
        this.global.url + 'admin/notification-preferences',
      )
      .subscribe({
        next: (res) => {
          this.categories = res?.categories || [];
          this.enabledCategories = new Set(res?.enabledCategories || []);
          this.loading = false;
        },
        error: (err) => {
          console.error('Errore caricamento preferenze notifiche:', err);
          this.error =
            err?.error?.error || 'Errore durante il caricamento delle preferenze.';
          this.loading = false;
        },
      });
  }

  isEnabled(key: string): boolean {
    return this.enabledCategories.has(key);
  }

  toggleCategory(key: string): void {
    if (this.enabledCategories.has(key)) {
      this.enabledCategories.delete(key);
      return;
    }

    this.enabledCategories.add(key);
  }

  save(): void {
    this.saving = true;
    this.error = '';

    this.http
      .post<{ enabledCategories: string[] }>(
        this.global.url + 'admin/notification-preferences',
        { enabledCategories: [...this.enabledCategories] },
      )
      .subscribe({
        next: (res) => {
          this.enabledCategories = new Set(res?.enabledCategories || []);
          this.saving = false;
        },
        error: (err) => {
          console.error('Errore salvataggio preferenze notifiche:', err);
          this.error =
            err?.error?.error || 'Errore durante il salvataggio delle preferenze.';
          this.saving = false;
        },
      });
  }
}
