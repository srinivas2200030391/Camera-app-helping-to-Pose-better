import { ShieldCheck } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { cancelJob, useJobsStore, type ProcessingJob } from '@/processing/jobs';
import type { ProcessingStage } from '@/processing/renderer';
import { colors, radii, spacing } from '@/theme/tokens';

const STAGE_LABEL: Record<ProcessingStage, string> = {
  decode: 'Reading the original',
  analyze: 'Analysing the scene',
  prepare: 'Preparing',
  render: 'Enhancing at full resolution',
  encode: 'Saving the enhanced copy',
};

export interface ProcessingSheetProps {
  jobId: string;
  onDone: (job: ProcessingJob) => void;
  onDismiss: () => void;
}

/** Progress for one enhancement job. Processing runs on-device; the sheet says so. */
export function ProcessingSheet({ jobId, onDone, onDismiss }: ProcessingSheetProps) {
  const job = useJobsStore((state) => state.jobs[jobId]);
  const reported = useRef(false);

  useEffect(() => {
    if (job?.status === 'done' && !reported.current) {
      reported.current = true;
      onDone(job);
    }
    if (job?.status === 'cancelled') onDismiss();
  }, [job, onDone, onDismiss]);

  if (!job) return null;
  const failed = job.status === 'failed';
  return (
    <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(140)} style={styles.backdrop}>
      <View style={styles.card} accessibilityViewIsModal>
        <AppText variant="title">{failed ? 'Enhancement failed' : job.status === 'done' ? 'Saved' : 'Enhancing…'}</AppText>
        {failed ? (
          <AppText variant="body" color={colors.textSecondary}>
            {job.error ?? 'Something went wrong.'} Your original photo is safe.
          </AppText>
        ) : (
          <>
            <ProgressBar progress={job.progress} />
            <AppText variant="caption" color={colors.textSecondary}>
              {job.stage ? STAGE_LABEL[job.stage] : job.status === 'queued' ? 'Waiting for the previous photo…' : 'Finishing…'}
            </AppText>
          </>
        )}
        <View style={styles.privacy}>
          <ShieldCheck size={14} color={colors.success} />
          <AppText variant="caption" color={colors.textTertiary}>
            Processed on this device · nothing is uploaded
          </AppText>
        </View>
        {failed ? (
          <Button label="Close" variant="secondary" onPress={onDismiss} />
        ) : job.status === 'done' ? null : (
          <Button label="Cancel" variant="ghost" onPress={() => cancelJob(jobId)} />
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.scrim,
    justifyContent: 'center',
    padding: spacing.xxl,
  },
  card: {
    padding: spacing.xl,
    gap: spacing.md,
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },
  privacy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
});
