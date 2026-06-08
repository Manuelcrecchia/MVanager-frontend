'use strict';

const core = require('@capacitor/core');

const InspectionAlarmKit = core.registerPlugin('InspectionAlarmKit', {
  web: () => Promise.resolve().then(() => require('./plugin.cjs')).then((m) => new m.InspectionAlarmKitWeb()),
});

class InspectionAlarmKitWeb extends core.WebPlugin {
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

exports.InspectionAlarmKit = InspectionAlarmKit;
exports.InspectionAlarmKitWeb = InspectionAlarmKitWeb;
