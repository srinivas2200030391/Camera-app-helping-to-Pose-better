import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { toast, ToastHost } from '@/components/ui/Toast';
import { getDb } from '@/storage/db';
import { runRecovery } from '@/storage/recovery';
import { colors } from '@/theme/tokens';
import { mark } from '@/utils/perf';

/** Work that must never delay the first frame or the camera: DB migration and integrity checks. */
async function bootstrapInBackground(): Promise<void> {
  try {
    await getDb();
    const report = await runRecovery();
    if (report.recoveredPhotos > 0) {
      toast.info(`Recovered ${report.recoveredPhotos} photo${report.recoveredPhotos === 1 ? '' : 's'} from an interrupted save`);
    }
    if (report.missingOriginals > 0) {
      toast.error(`${report.missingOriginals} photo file${report.missingOriginals === 1 ? ' is' : 's are'} missing from storage`);
    }
  } catch (error) {
    console.warn('[bootstrap] storage initialisation failed', error);
    toast.error('Photo storage could not be opened. Restart the app to try again.');
  }
}

export default function RootLayout() {
  useEffect(() => {
    mark('rootLayoutMounted');
    SystemUI.setBackgroundColorAsync(colors.bg).catch(() => undefined);
    const idle = globalThis.requestIdleCallback ?? ((callback: () => void) => setTimeout(callback, 250));
    idle(() => {
      void bootstrapInBackground();
    });
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg },
            animation: 'fade_from_bottom',
            animationDuration: 220,
          }}
        >
          <Stack.Screen name="index" options={{ animation: 'none' }} />
          <Stack.Screen name="camera" options={{ animation: 'none', contentStyle: { backgroundColor: colors.black } }} />
          <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
          <Stack.Screen name="review/[photoId]" options={{ animation: 'fade' }} />
        </Stack>
        <ToastHost />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
});
