import { registerPlugin } from '@capacitor/core';

export interface NativePdfViewerPlugin {
  present(options: {
    base64Data: string;
    fileName: string;
    title: string;
  }): Promise<void>;
}

export const NativePdfViewer = registerPlugin<NativePdfViewerPlugin>('NativePdfViewer');
