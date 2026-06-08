import { registerPlugin } from '@capacitor/core';

export const InspectionAlarmKit = registerPlugin('InspectionAlarmKit', {
  web: () => import('./web').then((m) => new m.InspectionAlarmKitWeb()),
});
