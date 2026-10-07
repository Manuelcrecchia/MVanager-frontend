import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { NgZone, enableProdMode } from '@angular/core';
import { Router, ChildrenOutletContexts } from '@angular/router';
import { AppModule } from '../../src/app/app.module';
import { OfflineService } from '../../src/app/offline/offline.service';
import { GlobalService } from '../../src/app/service/global.service';
import { environment } from '../../src/environments/environment';

const session = JSON.parse(localStorage.getItem('test-session') || 'null');
if (!session || !/^(127\.0\.0\.1|localhost)$/.test(location.hostname) || !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/api\/$/.test(session.baseUrl)) throw new Error('Isolated local session required');
enableProdMode();
environment.apiUrl = session.baseUrl;
environment.companyRegistryEndpoint = session.baseUrl + 'company-registry/companies';
platformBrowserDynamic().bootstrapModule(AppModule).then(ref => {
  const router = ref.injector.get(Router), zone = ref.injector.get(NgZone), contexts = ref.injector.get(ChildrenOutletContexts);
  (window as any).uiAudit = { offline: ref.injector.get(OfflineService), global: ref.injector.get(GlobalService), router, zone,
    go: (url: string) => zone.run(() => router.navigateByUrl(url)),
    component: (selector: string) => {
      if (!document.querySelector(selector)) throw new Error('View not active: ' + selector);
      let context = contexts.getContext('primary'), component: any;
      while (context?.outlet?.isActivated) { component = context.outlet.component; context = context.children.getContext('primary'); }
      return component;
    },
  };
}).catch(error => { (window as any).auditBootstrapError = String(error); console.error(error); });
