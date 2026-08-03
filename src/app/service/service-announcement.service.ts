import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Capacitor } from '@capacitor/core';
import { AppLauncher } from '@capacitor/app-launcher';
import { firstValueFrom } from 'rxjs';
import { GlobalService } from './global.service';

interface ServiceAnnouncement {
  id: number;
  title: string;
  body: string;
  severity: 'info' | 'maintenance' | 'warning' | 'critical';
  displayMode: 'once' | 'every_login' | 'until_acknowledged';
  presentation: 'modal' | 'banner' | 'both';
  startsAt: string | null;
  endsAt: string | null;
  ctaLabel: string;
  ctaUrl: string;
}

@Injectable({ providedIn: 'root' })
export class ServiceAnnouncementService {
  private readonly rootId = 'mv-service-announcements';
  private loading = false;

  constructor(
    private http: HttpClient,
    private global: GlobalService,
  ) {}

  async showAfterLogin(): Promise<void> {
    if (!this.global.token || this.loading) return;
    this.loading = true;
    this.removeCurrent();
    try {
      this.installStyles();
      const platform = Capacitor.getPlatform();
      const response = await firstValueFrom(this.http.get<{ announcements: ServiceAnnouncement[] }>(
        `${this.global.url}admin/service-announcements?platform=${encodeURIComponent(platform)}`,
        { headers: this.global.headers },
      ));
      for (const announcement of response.announcements || []) {
        await this.record(announcement.id, 'seen', platform);
        if (announcement.presentation === 'banner' || announcement.presentation === 'both') {
          this.renderBanner(announcement, platform);
        }
      }
      const modals = (response.announcements || []).filter(
        (item) => item.presentation === 'modal' || item.presentation === 'both',
      );
      await this.renderModalQueue(modals, platform);
    } catch (error) {
      // Gli avvisi informativi non devono mai impedire l'accesso all'app.
      console.warn('[ServiceAnnouncement] Caricamento non riuscito:', error);
    } finally {
      this.loading = false;
    }
  }

  private async renderModalQueue(items: ServiceAnnouncement[], platform: string): Promise<void> {
    for (const item of items) {
      await new Promise<void>((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = `mv-sa-overlay mv-sa-${item.severity}`;
        const card = this.card(item, 'modal');
        const actions = card.querySelector('.mv-sa-actions') as HTMLElement;
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'mv-sa-primary';
        close.textContent = item.displayMode === 'until_acknowledged' ? 'Ho letto' : 'Chiudi';
        close.onclick = async () => {
          if (item.displayMode === 'until_acknowledged') {
            await this.record(item.id, 'acknowledge', platform);
            this.removeAnnouncement(item.id);
          }
          overlay.remove();
          resolve();
        };
        actions.appendChild(close);
        overlay.appendChild(card);
        this.root().appendChild(overlay);
      });
    }
  }

  private renderBanner(item: ServiceAnnouncement, platform: string): void {
    const banner = this.card(item, 'banner');
    const actions = banner.querySelector('.mv-sa-actions') as HTMLElement;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'mv-sa-secondary';
    close.textContent = item.displayMode === 'until_acknowledged' ? 'Ho letto' : 'Chiudi';
    close.onclick = async () => {
      if (item.displayMode === 'until_acknowledged') {
        await this.record(item.id, 'acknowledge', platform);
      }
      this.removeAnnouncement(item.id);
    };
    actions.appendChild(close);
    this.root().appendChild(banner);
  }

  private card(item: ServiceAnnouncement, kind: 'modal' | 'banner'): HTMLElement {
    const card = document.createElement('section');
    card.className = `mv-sa-card mv-sa-${kind} mv-sa-${item.severity}`;
    card.dataset['announcementId'] = String(item.id);
    card.setAttribute('role', kind === 'modal' ? 'alertdialog' : 'status');

    const content = document.createElement('div');
    content.className = 'mv-sa-content';
    const eyebrow = document.createElement('small');
    eyebrow.textContent = item.severity === 'maintenance' ? 'Manutenzione programmata' : 'Avviso di servizio';
    const title = document.createElement('h2');
    title.textContent = item.title;
    const body = document.createElement('p');
    body.textContent = item.body;
    content.append(eyebrow, title, body);

    const actions = document.createElement('div');
    actions.className = 'mv-sa-actions';
    if (item.ctaLabel && item.ctaUrl) {
      const link = document.createElement('button');
      link.type = 'button';
      link.className = 'mv-sa-secondary';
      link.textContent = item.ctaLabel;
      link.onclick = () => this.openUrl(item.ctaUrl);
      actions.appendChild(link);
    }
    card.append(content, actions);
    return card;
  }

  private async record(id: number, action: 'seen' | 'acknowledge', platform: string): Promise<void> {
    try {
      await firstValueFrom(this.http.post(
        `${this.global.url}admin/service-announcements/${id}/${action}`,
        { platform },
        { headers: this.global.headers },
      ));
    } catch (error) {
      console.warn(`[ServiceAnnouncement] Ricevuta ${action} non salvata:`, error);
    }
  }

  private async openUrl(url: string): Promise<void> {
    if (Capacitor.getPlatform() === 'web') {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    try {
      await AppLauncher.openUrl({ url });
    } catch {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  private root(): HTMLElement {
    let root = document.getElementById(this.rootId);
    if (!root) {
      root = document.createElement('div');
      root.id = this.rootId;
      document.body.appendChild(root);
    }
    return root;
  }

  private removeAnnouncement(id: number): void {
    this.root().querySelectorAll(`[data-announcement-id="${id}"]`).forEach((node) => node.remove());
  }

  private removeCurrent(): void {
    document.getElementById(this.rootId)?.remove();
  }

  private installStyles(): void {
    if (document.getElementById('mv-service-announcement-styles')) return;
    const style = document.createElement('style');
    style.id = 'mv-service-announcement-styles';
    style.textContent = `
      #${this.rootId}{position:relative;z-index:2147483000;font-family:inherit}
      .mv-sa-overlay{position:fixed;inset:0;background:rgba(15,23,42,.58);display:grid;place-items:center;padding:20px;z-index:2147483001}
      .mv-sa-card{box-sizing:border-box;border:1px solid #b9d9ff;border-left:5px solid #1677d2;background:#f2f8ff;color:#172033;box-shadow:0 18px 50px rgba(15,23,42,.2)}
      .mv-sa-modal{width:min(560px,100%);border-radius:14px;padding:22px}
      .mv-sa-banner{position:fixed;top:calc(env(safe-area-inset-top,0px) + 12px);left:50%;transform:translateX(-50%);width:min(880px,calc(100% - 24px));border-radius:10px;padding:14px 16px;display:flex;gap:16px;align-items:center;justify-content:space-between;z-index:2147483000}
      .mv-sa-maintenance,.mv-sa-warning{background:#fffaeb;border-color:#f5b83d}.mv-sa-critical{background:#fff1f1;border-color:#d92d20}
      .mv-sa-content{min-width:0}.mv-sa-content small{text-transform:uppercase;font-weight:800;letter-spacing:.06em}.mv-sa-content h2{font-size:1.2rem;margin:5px 0 8px}.mv-sa-content p{margin:0;line-height:1.5;white-space:pre-wrap}
      .mv-sa-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:18px;flex-wrap:wrap}.mv-sa-banner .mv-sa-actions{margin:0;flex-shrink:0}
      .mv-sa-actions button{border-radius:8px;padding:9px 13px;font:inherit;font-weight:750;cursor:pointer}.mv-sa-primary{border:0;background:#172033;color:#fff}.mv-sa-secondary{border:1px solid #aab4c5;background:#fff;color:#172033}
      @media(min-width:992px){
        body:has(.home-desktop-sidebar:not(.sidebar-collapsed)) .mv-sa-banner{left:calc(50% + 130px)}
        body:has(.home-desktop-sidebar.sidebar-collapsed) .mv-sa-banner{left:calc(50% + 30px)}
      }
      @media(max-width:620px){.mv-sa-banner{align-items:flex-start;flex-direction:column}.mv-sa-banner .mv-sa-actions{width:100%;justify-content:flex-end}}
    `;
    document.head.appendChild(style);
  }
}
