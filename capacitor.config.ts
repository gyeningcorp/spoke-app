import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize } from '@capacitor/keyboard';

const config: CapacitorConfig = {
  appId: 'com.app.voicenotes',
  appName: 'VoiceNotes',
  webDir: 'dist',
  server: {
    androidScheme: 'com.app.voicenotes',
    iosScheme: 'com.app.voicenotes',
  },
  ios: {
    scheme: 'com.app.voicenotes',
    contentInset: 'automatic',
  },
  android: {
    // android scheme is configured via server.androidScheme
    allowMixedContent: false,
  },
  plugins: {
    Keyboard: {
      resize: KeyboardResize.Body,
    },
  },
};

export default config;
