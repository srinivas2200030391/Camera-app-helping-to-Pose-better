import { Camera, Settings } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import type { CameraPermissionStatus } from '@/camera/permissions';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { colors, radii, spacing } from '@/theme/tokens';

export interface PermissionGateProps {
  status: CameraPermissionStatus;
  onRequest: () => void;
  onOpenSettings: () => void;
  onBrowsePoses: () => void;
}

/** Shown instead of the preview when camera access is missing. The rest of the app still works. */
export function PermissionGate({ status, onRequest, onOpenSettings, onBrowsePoses }: PermissionGateProps) {
  const blocked = status === 'blocked';
  return (
    <View style={styles.container}>
      <View style={styles.icon}>
        <Camera size={30} color={colors.accent} strokeWidth={1.7} />
      </View>
      <AppText variant="headline" align="center">
        {blocked ? 'Camera access is off' : 'Allow camera access'}
      </AppText>
      <AppText variant="body" color={colors.textSecondary} align="center" style={styles.message}>
        {blocked
          ? 'Turn on the camera permission in system settings to take photos. Pose guides and your gallery still work.'
          : 'PoseLens needs the camera to show a live preview with pose and composition guides. Photos stay on your device.'}
      </AppText>
      {blocked ? (
        <Button label="Open settings" icon={Settings} onPress={onOpenSettings} />
      ) : (
        <Button label="Allow camera" icon={Camera} onPress={onRequest} />
      )}
      <Button label="Browse poses" variant="ghost" onPress={onBrowsePoses} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxxl,
    gap: spacing.md,
    backgroundColor: colors.bg,
  },
  icon: {
    width: 68,
    height: 68,
    borderRadius: radii.xl,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentMuted,
    marginBottom: spacing.sm,
  },
  message: {
    maxWidth: 320,
    marginBottom: spacing.md,
  },
});
