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

  private getAndroidStoredMarkerKey(tenant: TenantId): string {
    return `mvanager-biometric-stored-${tenant}`;
  }

  private getLegacyAndroidEmailKey(tenant: TenantId): string {
    return `mvanager-biometric-email-${tenant}`;
  }

  private getLegacyAndroidPasswordKey(tenant: TenantId): string {
    return `mvanager-biometric-password-${tenant}`;
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
        const storedMarker = await Preferences.get({
          key: this.getAndroidStoredMarkerKey(resolvedTenant),
        });

        return storedMarker.value === '1';
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
        this.deleteLegacyAndroidPreferences(resolvedTenant),
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
            '[BiometricService] Credenziali native Android non trovate',
            nativeError,
          );
          await this.deleteLegacyAndroidPreferences(resolvedTenant);
          return null;
        }
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
        this.deleteLegacyAndroidPreferences(resolvedTenant),
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

  private async deleteLegacyAndroidPreferences(tenant: TenantId): Promise<void> {
    await Promise.all([
      Preferences.remove({
        key: this.getLegacyAndroidEmailKey(tenant),
      }),
      Preferences.remove({
        key: this.getLegacyAndroidPasswordKey(tenant),
      }),
    ]).catch(() => undefined);
  }
}
