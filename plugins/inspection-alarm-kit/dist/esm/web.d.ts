import { WebPlugin } from '@capacitor/core';
import type {
  InspectionAlarmKitPlugin,
  ReplaceInspectionAlarmsResult
} from './index';

export declare class InspectionAlarmKitWeb extends WebPlugin implements InspectionAlarmKitPlugin {
  isAvailable(): Promise<{ available: boolean }>;
  getAuthorizationState(): Promise<{ state: string }>;
  requestAuthorization(): Promise<{ state: string }>;
  replaceInspectionAlarms(): Promise<ReplaceInspectionAlarmsResult>;
  cancelAllInspectionAlarms(): Promise<{ cancelled: number }>;
}
