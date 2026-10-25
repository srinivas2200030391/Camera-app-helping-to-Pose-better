import * as Device from 'expo-device';
import { useRouter } from 'expo-router';
import { ChevronRight, ShieldCheck } from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cameraEngineName } from '@/camera/CameraEngine';
import { StyleStrip } from '@/components/photo/StyleStrip';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { SettingRow } from '@/components/ui/SettingRow';
import { Slider } from '@/components/ui/Slider';
import { toast } from '@/components/ui/Toast';
import { APP_NAME, APP_VERSION } from '@/config/brand';
import { useLibraryStore } from '@/state/library';
import { useSettingsStore } from '@/state/settings';
import { availableBytes, directorySize, dirs, listFiles, safeDelete } from '@/storage/files';
import { countPhotos } from '@/storage/photosRepo';
import { colors, radii, spacing } from '@/theme/tokens';
import { formatBytes, formatDuration } from '@/utils/format';
import { getSamples, getStartupReport } from '@/utils/perf';
import { isExpoGo } from '@/utils/platform';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <AppText variant="label" uppercase color={colors.textTertiary} style={styles.sectionTitle}>
        {title}
      </AppText>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <AppText variant="caption" color={colors.textSecondary} style={{ flex: 1 }}>
        {label}
      </AppText>
      <AppText variant="caption" style={styles.metricValue}>
        {value}
      </AppText>
    </View>
  );
}

const ms = (value: number | null) => (value == null ? '—' : formatDuration(value));

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const settings = useSettingsStore();
  const photosVersion = useLibraryStore((state) => state.photosVersion);
  const [storage, setStorage] = useState<{ photos: number; originals: number; edits: number; cache: number; free: number } | null>(null);
  const [report, setReport] = useState(getStartupReport());
  const [samples, setSamples] = useState(getSamples().slice(0, 12));

  useEffect(() => {
    countPhotos()
      .then((photos) =>
        setStorage({
          photos,
          originals: directorySize(dirs.originals()),
          edits: directorySize(dirs.edits()) + directorySize(dirs.thumbs()),
          cache: directorySize(dirs.previews()),
          free: availableBytes(),
        }),
      )
      .catch(() => undefined);
  }, [photosVersion]);

  const refreshDiagnostics = () => {
    setReport(getStartupReport());
    setSamples(getSamples().slice(0, 12));
  };

  const clearCache = () => {
    for (const file of listFiles(dirs.previews())) safeDelete(file);
    toast.success('Cache cleared');
    setStorage((current) => (current ? { ...current, cache: 0 } : current));
  };

  const resetSettings = () =>
    Alert.alert('Reset settings?', 'Camera and processing preferences return to their defaults. Photos are not affected.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: settings.reset },
    ]);

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Settings" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.huge }}>
        <Section title="Camera">
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
          <SettingRow title="Level indicator" value={settings.showLevel} onValueChange={(showLevel) => settings.update({ showLevel })} />
          <SettingRow title="Centre mark" value={settings.showCenterMark} onValueChange={(showCenterMark) => settings.update({ showCenterMark })} />
          <SettingRow title="Composition hints" value={settings.compositionHints} onValueChange={(compositionHints) => settings.update({ compositionHints })} />
          <SettingRow
            title="Face guidance"
            description="On-device ML Kit face detection for headroom, distance and hands-free capture"
            value={settings.faceGuidance}
            onValueChange={(faceGuidance) => settings.update({ faceGuidance })}
            unavailableReason={isExpoGo ? 'Needs the development build (not in Expo Go)' : undefined}
            disabled={isExpoGo}
          />
          <SettingRow title="Photo HDR (when supported)" value={settings.photoHdr} onValueChange={(photoHdr) => settings.update({ photoHdr })} />
          <SettingRow title="Shutter sound" value={settings.shutterSound} onValueChange={(shutterSound) => settings.update({ shutterSound })} />
          <SettingRow title="Haptic feedback" value={settings.haptics} onValueChange={(haptics) => settings.update({ haptics })} />
        </Section>

        <Section title="Processing">
          <AppText variant="caption" color={colors.textSecondary} style={styles.caption}>
            Default style for new photos
          </AppText>
          <View style={styles.bleed}>
            <StyleStrip value={settings.defaultStyle} onChange={(defaultStyle) => settings.update({ defaultStyle })} />
          </View>
          <Slider
            label="JPEG quality for enhanced copies"
            value={Math.round(settings.exportQuality * 100)}
            min={80}
            max={100}
            resetValue={95}
            onChange={(value) => settings.update({ exportQuality: value / 100 })}
            format={(value) => `${Math.round(value)}`}
          />
          <SettingRow
            title="Keep photo metadata"
            description="Copy camera EXIF (exposure, lens, date) into enhanced copies. Location is never recorded."
            value={settings.keepMetadata}
            onValueChange={(keepMetadata) => settings.update({ keepMetadata })}
          />
        </Section>

        <Section title="Gallery">
          <SettingRow
            title="Save new photos to the gallery"
            description="Otherwise photos stay private in the app until you export them"
            value={settings.autoExportToGallery}
            onValueChange={(autoExportToGallery) => settings.update({ autoExportToGallery })}
          />
        </Section>

        <Section title="Storage">
          {storage ? (
            <>
              <Metric label="Photos" value={`${storage.photos}`} />
              <Metric label="Originals" value={formatBytes(storage.originals)} />
              <Metric label="Enhanced copies & thumbnails" value={formatBytes(storage.edits)} />
              <Metric label="Preview cache" value={formatBytes(storage.cache)} />
              <Metric label="Free space on device" value={Number.isFinite(storage.free) ? formatBytes(storage.free) : '—'} />
            </>
          ) : null}
          <Button label="Clear preview cache" variant="ghost" compact onPress={clearCache} />
        </Section>

        <Section title="Diagnostics (measured on this device)">
          <Metric label="Native start → JS bundle" value={ms(report.nativeToBundleMs)} />
          <Metric label="Native start → app shell" value={ms(report.toShellMs)} />
          <Metric label="Native start → first screen" value={ms(report.toFirstScreenMs)} />
          <Metric label="Native start → camera preview" value={ms(report.toCameraPreviewMs)} />
          <Metric label="Camera mount → preview" value={ms(report.cameraStartupMs)} />
          {samples.map((sample, index) => (
            <Metric key={`${sample.at}-${index}`} label={sample.label} value={formatDuration(sample.ms)} />
          ))}
          <Metric label="Camera engine" value={cameraEngineName} />
          <Metric label="Device" value={[Device.manufacturer, Device.modelName].filter(Boolean).join(' ') || '—'} />
          <Metric label="Android / OS" value={Device.osVersion ?? '—'} />
          <Metric label="Memory" value={Device.totalMemory ? formatBytes(Device.totalMemory) : '—'} />
          <Button label="Refresh" variant="ghost" compact onPress={refreshDiagnostics} />
        </Section>

        <Section title="Privacy">
          <View style={styles.privacy}>
            <ShieldCheck size={20} color={colors.success} />
            <AppText variant="caption" color={colors.textSecondary} style={{ flex: 1 }}>
              All processing runs on this phone. {APP_NAME} has no account and no cloud service, and the release build does not include the Internet permission, so photos cannot be uploaded by the app. Face detection uses the on-device Google ML Kit model.
            </AppText>
          </View>
        </Section>

        <Section title="More">
          <SettingRow title="Composition tips" onPress={() => router.push('/learn')} accessory={<ChevronRight size={18} color={colors.textSecondary} />} />
          <SettingRow
            title="Show the introduction again"
            onPress={() => {
              settings.update({ onboardingComplete: false });
              router.replace('/onboarding');
            }}
            accessory={<ChevronRight size={18} color={colors.textSecondary} />}
          />
          <Button label="Reset settings" variant="danger" compact onPress={resetSettings} />
        </Section>

        <AppText variant="caption" color={colors.textTertiary} align="center" style={{ marginTop: spacing.xl }}>
          {APP_NAME} {APP_VERSION}
        </AppText>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  card: {
    padding: spacing.lg,
    gap: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },
  caption: {
    marginTop: spacing.xs,
  },
  bleed: {
    marginHorizontal: -spacing.lg,
  },
  metric: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 22,
  },
  metricValue: {
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
  },
  privacy: {
    flexDirection: 'row',
    gap: spacing.md,
  },
});
