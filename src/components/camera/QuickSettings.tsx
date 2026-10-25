import { useRouter } from 'expo-router';
import { ChevronRight, X } from 'lucide-react-native';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { CameraCapabilities } from '@/camera/types';
import { AppText } from '@/components/ui/AppText';
import { IconButton } from '@/components/ui/IconButton';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { SettingRow } from '@/components/ui/SettingRow';
import { useSettingsStore } from '@/state/settings';
import { colors, radii, spacing } from '@/theme/tokens';

export interface QuickSettingsProps {
  capabilities: CameraCapabilities;
  onClose: () => void;
}

/** Camera-side settings panel; everything here also lives in the full Settings screen. */
export function QuickSettings({ capabilities, onClose }: QuickSettingsProps) {
  const settings = useSettingsStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const nativeOnly = capabilities.engine === 'expo-camera' ? 'Needs the development build (not available in Expo Go)' : undefined;

  return (
    <Animated.View entering={SlideInDown.duration(240)} exiting={SlideOutDown.duration(200)} style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
      <View style={styles.header}>
        <AppText variant="title">Camera settings</AppText>
        <IconButton icon={X} label="Close camera settings" onPress={onClose} />
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <AppText variant="label" uppercase color={colors.textTertiary}>
          Composition grid
        </AppText>
        <SegmentedControl
          accessibilityLabel="Composition grid"
          value={settings.gridType}
          onChange={(gridType) => settings.update({ gridType })}
          segments={[
            { value: 'off', label: 'Off' },
            { value: 'thirds', label: 'Thirds' },
            { value: 'golden', label: 'Golden' },
            { value: 'center', label: 'Centre' },
            { value: 'diagonal', label: 'Diag.' },
          ]}
        />
        <SettingRow title="Level" description="Horizon indicator, gold when straight" value={settings.showLevel} onValueChange={(showLevel) => settings.update({ showLevel })} />
        <SettingRow title="Centre mark" value={settings.showCenterMark} onValueChange={(showCenterMark) => settings.update({ showCenterMark })} />
        <SettingRow
          title="Composition hints"
          description="Tips for level, distance and headroom"
          value={settings.compositionHints}
          onValueChange={(compositionHints) => settings.update({ compositionHints })}
        />
        <SettingRow
          title="Face guidance"
          description="On-device face detection for headroom and framing"
          value={settings.faceGuidance && capabilities.supportsFaceGuidance}
          onValueChange={(faceGuidance) => settings.update({ faceGuidance })}
          disabled={!capabilities.supportsFaceGuidance}
          unavailableReason={capabilities.supportsFaceGuidance ? undefined : nativeOnly}
        />

        <AppText variant="label" uppercase color={colors.textTertiary} style={styles.section}>
          Pose overlay
        </AppText>
        <SegmentedControl
          accessibilityLabel="Pose overlay style"
          value={settings.overlayStyle}
          onChange={(overlayStyle) => settings.update({ overlayStyle })}
          segments={[
            { value: 'ghost', label: 'Silhouette' },
            { value: 'outline', label: 'Outline' },
          ]}
        />

        <AppText variant="label" uppercase color={colors.textTertiary} style={styles.section}>
          Capture
        </AppText>
        <SegmentedControl
          accessibilityLabel="Capture priority"
          value={settings.captureQuality}
          onChange={(captureQuality) => settings.update({ captureQuality })}
          segments={[
            { value: 'speed', label: 'Fastest' },
            { value: 'balanced', label: 'Balanced' },
            { value: 'quality', label: 'Best quality' },
          ]}
        />
        <SettingRow
          title="Photo HDR"
          description="Multi-exposure capture by the camera hardware"
          value={settings.photoHdr && capabilities.supportsPhotoHdr}
          onValueChange={(photoHdr) => settings.update({ photoHdr })}
          disabled={!capabilities.supportsPhotoHdr}
          unavailableReason={capabilities.supportsPhotoHdr ? undefined : (nativeOnly ?? 'Not supported by this camera')}
        />
        <SettingRow title="Shutter sound" value={settings.shutterSound} onValueChange={(shutterSound) => settings.update({ shutterSound })} />
        <SettingRow
          title="All settings"
          onPress={() => {
            onClose();
            router.push('/settings');
          }}
          accessory={<ChevronRight size={20} color={colors.textSecondary} />}
        />
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '78%',
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: spacing.xl,
    paddingRight: spacing.sm,
    paddingTop: spacing.sm,
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
    gap: spacing.xs,
  },
  section: {
    marginTop: spacing.lg,
  },
});
