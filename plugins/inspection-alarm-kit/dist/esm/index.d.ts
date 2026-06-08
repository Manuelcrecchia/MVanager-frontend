import type { PluginListenerHandle } from '@capacitor/core';

export interface InspectionAlarmPayload {
  id: string;
  title: string;
  body?: string;
  fireDate: string;
  appointmentId?: number | string;
  occurrenceStart?: string;
  route?: string;
  snoozeMinutes?: number;
}

export interface ReplaceInspectionAlarmsResult {
  available: boolean;
  authorizationState: 'notDetermined' | 'denied' | 'authorized' | 'unsupported' | 'unknown';
  scheduled: number;
  skipped: number;
}

export interface InspectionAlarmKitPlugin {
  isAvailable(): Promise<{ available: boolean }>;
  getAuthorizationState(): Promise<{ state: string }>;
  requestAuthorization(): Promise<{ state: string }>;
  replaceInspectionAlarms(options: { alarms: InspectionAlarmPayload[] }): Promise<ReplaceInspectionAlarmsResult>;
  cancelAllInspectionAlarms(): Promise<{ cancelled: number }>;
  addListener(eventName: string, listenerFunc: (data: any) => void): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}

export declare const InspectionAlarmKit: InspectionAlarmKitPlugin;
