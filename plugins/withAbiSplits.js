/**
 * Config plugin: emit one APK per ABI (e.g. app-arm64-v8a-release.apk, app-x86_64-release.apk).
 *
 * A single Gradle run compiles every ABI listed in `abis`, but each installable APK only carries
 * the native libraries for its own ABI, so the phone APK stays small while an x86_64 APK is
 * still available for emulator smoke tests. App bundles (.aab) ignore splits.
 */
const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = '// @generated withAbiSplits';

module.exports = function withAbiSplits(config, { abis = ['arm64-v8a'] } = {}) {
  return withAppBuildGradle(config, (modConfig) => {
    const gradle = modConfig.modResults;
    if (gradle.language !== 'groovy' || gradle.contents.includes(MARKER)) {
      return modConfig;
    }
    const include = abis.map((abi) => `"${abi}"`).join(', ');
    gradle.contents += `
${MARKER}
android {
    splits {
        abi {
            enable true
            reset()
            include ${include}
            universalApk false
        }
    }
}
`;
    return modConfig;
  });
};
