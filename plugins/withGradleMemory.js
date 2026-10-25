/**
 * Config plugin: Gradle/Kotlin daemon heap sizes for native builds.
 *
 * The React Native template defaults (2 GB) are tight for this dependency set (Skia, VisionCamera,
 * Reanimated, ML Kit) and cause "Metaspace" / GC-overhead failures; these values also leave
 * headroom for clang on 8 GB development machines.
 */
const { withGradleProperties } = require('expo/config-plugins');

const PROPERTIES = {
  'org.gradle.jvmargs': '-Xmx3g -XX:MaxMetaspaceSize=768m -Dfile.encoding=UTF-8',
  'kotlin.daemon.jvmargs': '-Xmx1536m',
};

module.exports = function withGradleMemory(config) {
  return withGradleProperties(config, (modConfig) => {
    for (const [key, value] of Object.entries(PROPERTIES)) {
      const existing = modConfig.modResults.find((item) => item.type === 'property' && item.key === key);
      if (existing) {
        existing.value = value;
      } else {
        modConfig.modResults.push({ type: 'property', key, value });
      }
    }
    return modConfig;
  });
};
