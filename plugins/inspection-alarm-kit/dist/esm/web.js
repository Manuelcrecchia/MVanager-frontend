import { WebPlugin } from '@capacitor/core';

export class InspectionAlarmKitWeb extends WebPlugin {
  async isAvailable() {
    return { available: false };
  }

  async getAuthorizationState() {
    return { state: 'unsupported' };
  }

  async requestAuthorization() {
    return { state: 'unsupported' };
  }

  async replaceInspectionAlarms() {
    return {
      available: false,
      authorizationState: 'unsupported',
      scheduled: 0,
      skipped: 0,
    };
  }

  async cancelAllInspectionAlarms() {
    return { cancelled: 0 };
  }
}
