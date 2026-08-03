import type { CapacitorConfig } from '@capacitor/cli';

const sharedPlugins = [
  '@capacitor/app',
  '@capacitor/app-launcher',
  '@capacitor/barcode-scanner',
  '@capacitor/preferences',
  '@capacitor/push-notifications',
  'capacitor-native-biometric',
  'mvanager-inspection-alarm-kit',
];

const config: CapacitorConfig = {
  appId: 'it.mvtechcore.mvanager',
  appName: 'MVanager',
  webDir: 'dist/y/browser',
  server: {
    androidScheme: 'http',
  },
  android: {
    includePlugins: [...sharedPlugins, '@capacitor-firebase/messaging'],
  },
  ios: {
    includePlugins: sharedPlugins,
  },
};

export default config;
