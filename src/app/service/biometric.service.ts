import { Injectable } from '@angular/core';
import { NativeBiometric } from 'capacitor-native-biometric';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { TenantId, TenantService } from './tenant.service';

@Injectable({
  providedIn: 'root',
})
export class BiometricService {
  constructor(private tenantService: TenantService) {}

  private isNative(): boolean {
    return Capacitor.getPlatform() !== 'web';
  }

  private isAndroid(): boolean {
    return Capacitor.getPlatform() === 'android';
  }

  private getServerKey(tenant: TenantId): string {
    return `mvanager-login-${tenant}`;
  }

  private getAndroidEmailKey(tenant: TenantId): string {
    return `mvanager-biometric-email-${tenant}`;
  }

  private getAndroidPasswordKey(tenant: TenantId): string {
    return `mvanager-biometric-password-${tenant}`;
  }

  private getAndroidStoredMarkerKey(tenant: TenantId): string {
    return `mvanager-biometric-stored-${tenant}`;
  }

  isAndroidPlatform(): boolean {
    return this.isAndroid();
  }

  async isAvailable(): Promise<boolean> {
    // ❌ Su web → NON è disponibile
    if (!this.isNative()) return false;

    try {
      const result = await NativeBiometric.isAvailable();
      return result.isAvailable;
    } catch (error) {
      console.error('[BiometricService] isAvailable failed', error);
      return false;
    }
  }

  async hasStoredCredentials(tenant?: TenantId): Promise<boolean> {
    if (!this.isNative()) return false;

    const resolvedTenant = tenant || this.tenantService.selectedTenant;
    if (!resolvedTenant) return false;

    if (this.isAndroid()) {
      try {
        const [storedMarker, emailResult, passwordResult] = await Promise.all([
          Preferences.get({
            key: this.getAndroidStoredMarkerKey(resolvedTenant),
          }),
          Preferences.get({
            key: this.getAndroidEmailKey(resolvedTenant),
          }),
          Preferences.get({
            key: this.getAndroidPasswordKey(resolvedTenant),
          }),
        ]);

        return storedMarker.value === '1' || (!!emailResult.value && !!passwordResult.value);
      } catch (error) {
        console.error(
          '[BiometricService] hasStoredCredentials failed on Android',
          error,
        );
        return false;
      }
    }

    return true;
  }

  async storeCredentials(email: string, password: string, tenant?: TenantId) {
    if (!this.isNative()) return; // ⛔ PREVIENE ERRORI SU WEB
    const resolvedTenant = tenant || this.tenantService.tenant;

    if (this.isAndroid()) {
      await NativeBiometric.setCredentials({
        server: this.getServerKey(resolvedTenant),
        username: email,
        password: password,
      });

      await Promise.all([
        Preferences.set({
          key: this.getAndroidStoredMarkerKey(resolvedTenant),
          value: '1',
        }),
        Preferences.set({
          key: this.getAndroidEmailKey(resolvedTenant),
          value: email,
        }),
        Preferences.set({
          key: this.getAndroidPasswordKey(resolvedTenant),
          value: password,
        }),
      ]);
      return;
    }

    await NativeBiometric.setCredentials({
      server: this.getServerKey(resolvedTenant),
      username: email,
      password: password,
    });
  }

  async getCredentials(
    tenant?: TenantId,
  ): Promise<{ email: string; password: string } | null> {
    if (!this.isNative()) return null; // ⛔ PREVIENE ERRORI SU WEB

    const resolvedTenant = tenant || this.tenantService.selectedTenant;
    if (!resolvedTenant) return null;

    try {
      await NativeBiometric.verifyIdentity({
        reason: 'Autenticazione biometrica',
        title: 'Accesso rapido',
        subtitle: 'Conferma la tua identità',
        description: 'Usa la biometria per continuare',
        useFallback: true,
      });

      if (this.isAndroid()) {
        try {
          const creds = await NativeBiometric.getCredentials({
            server: this.getServerKey(resolvedTenant),
          });

          return {
            email: creds.username,
            password: creds.password,
          };
        } catch (nativeError) {
          console.warn(
            '[BiometricService] Credenziali native Android non trovate, provo fallback Preferences',
            nativeError,
          );
        }

        const [emailResult, passwordResult] = await Promise.all([
          Preferences.get({
            key: this.getAndroidEmailKey(resolvedTenant),
          }),
          Preferences.get({
            key: this.getAndroidPasswordKey(resolvedTenant),
          }),
        ]);

        const email = emailResult.value;
        const password = passwordResult.value;

        if (!email || !password) {
          return null;
        }

        await NativeBiometric.setCredentials({
          server: this.getServerKey(resolvedTenant),
          username: email,
          password,
        });
        await Preferences.set({
          key: this.getAndroidStoredMarkerKey(resolvedTenant),
          value: '1',
        });

        return { email, password };
      }

      const creds = await NativeBiometric.getCredentials({
        server: this.getServerKey(resolvedTenant),
      });

      return {
        email: creds.username,
        password: creds.password,
      };
    } catch (err) {
      console.log('❌ Biometria fallita', err);
      return null;
    }
  }

  async verifyIdentity(): Promise<boolean> {
    if (!this.isNative()) return true;

    try {
      await NativeBiometric.verifyIdentity({
        reason: 'Sblocca MVanager',
        title: 'Accesso rapido',
        subtitle: 'Conferma la tua identità',
        description: 'Usa la biometria per accedere all\'app',
        useFallback: true,
      });
      return true;
    } catch (error) {
      console.log('[BiometricService] Verifica identità annullata o fallita', error);
      return false;
    }
  }

  async deleteCredentials(tenant?: TenantId) {
    if (!this.isNative()) return; // ⛔ PREVIENE ERRORI SU WEB

    const resolvedTenant = tenant || this.tenantService.selectedTenant;
    if (!resolvedTenant) return;

    if (this.isAndroid()) {
      await Promise.all([
        Preferences.remove({
          key: this.getAndroidStoredMarkerKey(resolvedTenant),
        }),
        Preferences.remove({
          key: this.getAndroidEmailKey(resolvedTenant),
        }),
        Preferences.remove({
          key: this.getAndroidPasswordKey(resolvedTenant),
        }),
      ]);
      await NativeBiometric.deleteCredentials({
        server: this.getServerKey(resolvedTenant),
      }).catch(() => undefined);
      return;
    }

    await NativeBiometric.deleteCredentials({
      server: this.getServerKey(resolvedTenant),
    });
  }
}
