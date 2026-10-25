import { Redirect } from 'expo-router';

import { useSettingsStore } from '@/state/settings';

/** Entry: first launch goes through onboarding; afterwards the camera opens immediately. */
export default function Index() {
  const onboardingComplete = useSettingsStore((state) => state.onboardingComplete);
  return <Redirect href={onboardingComplete ? '/camera' : '/onboarding'} />;
}
