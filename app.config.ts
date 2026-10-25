import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Branding lives here so the product can be renamed in one place.
 * In-app copy reads the display name from `expo-constants` (see src/config/brand.ts).
 */
const APP_NAME = 'PoseLens AI';
const APP_SLUG = 'poselens-ai';
const APP_SCHEME = 'poselens';
const ANDROID_PACKAGE = 'com.poselens.camera';
const IOS_BUNDLE_ID = 'com.poselens.camera';

const BACKGROUND = '#0A0A0C';

/**
 * ABIs compiled into native builds. arm64-v8a covers effectively all current Android phones;
 * x86_64 is kept so the same build can be smoke-tested on an Android emulator. The
 * withAbiSplits plugin emits one APK per ABI so the phone APK stays small.
 */
const BUILD_ARCHS = ['arm64-v8a', 'x86_64'];

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: APP_NAME,
  slug: APP_SLUG,
  scheme: APP_SCHEME,
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'dark',
  backgroundColor: BACKGROUND,
  ios: {
    supportsTablet: false,
    bundleIdentifier: IOS_BUNDLE_ID,
    infoPlist: {
      NSCameraUsageDescription: `${APP_NAME} uses the camera to take photos with pose and composition guides.`,
    },
  },
  android: {
    package: ANDROID_PACKAGE,
    versionCode: 1,
    adaptiveIcon: {
      backgroundColor: BACKGROUND,
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    permissions: ['android.permission.CAMERA', 'android.permission.VIBRATE'],
    // Capabilities this app never uses. Blocking them keeps transitive library manifests honest.
    blockedPermissions: [
      'android.permission.RECORD_AUDIO',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_COARSE_LOCATION',
      'android.permission.ACTIVITY_RECOGNITION',
      'android.permission.READ_MEDIA_VIDEO',
      'android.permission.READ_MEDIA_AUDIO',
    ],
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        backgroundColor: BACKGROUND,
        image: './assets/splash-icon.png',
        imageWidth: 132,
      },
    ],
    'expo-sqlite',
    'expo-image',
    [
      'expo-media-library',
      {
        photosPermission: `${APP_NAME} needs access to save your photos to the gallery.`,
        savePhotosPermission: `${APP_NAME} saves photos you export to your gallery.`,
        isAccessMediaLocationEnabled: false,
        granularPermissions: ['photo'],
      },
    ],
    [
      'expo-build-properties',
      {
        android: {
          buildArchs: BUILD_ARCHS,
          // R8 stays off until the release build has been exercised on physical devices: the
          // Nitro-based camera stack resolves classes over JNI, which shrinking can break.
          enableMinifyInReleaseBuilds: false,
          enableShrinkResourcesInReleaseBuilds: false,
        },
      },
    ],
    ['./plugins/withAbiSplits', { abis: BUILD_ARCHS }],
    './plugins/withReleaseOfflineManifest',
    './plugins/withGradleMemory',
    ['./plugins/withNativeBuildParallelism', { compileJobs: 2 }],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    brand: { appName: APP_NAME },
  },
});
