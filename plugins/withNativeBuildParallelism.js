/**
 * Config plugin: cap concurrent C++ compiles in every native module.
 *
 * Ninja defaults to (CPU cores + 2) parallel jobs per CMake project, and each clang process for
 * the Nitro/JSI-heavy sources (VisionCamera, Skia, Reanimated) can commit 2–3 GB. On machines with
 * 8 GB of RAM that exhausts memory ("LLVM ERROR: out of memory"). A CMake job pool limits each
 * module to `compileJobs` concurrent compiles; Gradle's --max-workers bounds how many modules
 * build at once. Override per build with -Pposelens.nativeCompileJobs=N.
 *
 * The block must be registered before the Expo/React Native root plugins are applied, because
 * they evaluate subprojects early and AGP rejects finalizeDsl hooks added after that.
 */
const { withProjectBuildGradle } = require('expo/config-plugins');

const BEGIN = '// @generated begin withNativeBuildParallelism';
const END = '// @generated end withNativeBuildParallelism';
const ANCHOR = 'apply plugin: "expo-root-project"';

function block(compileJobs) {
  return `${BEGIN}
def poseLensNativeJobs = (findProperty('poselens.nativeCompileJobs') ?: '${compileJobs}').toString()
subprojects { sub ->
  def limitNativeJobs = {
    def components = sub.extensions.findByName('androidComponents')
    if (components == null) return
    components.finalizeDsl { ext ->
      ext.defaultConfig.externalNativeBuild.cmake.arguments(
        "-DCMAKE_JOB_POOLS=compile=\${poseLensNativeJobs};link=1",
        '-DCMAKE_JOB_POOL_COMPILE=compile',
        '-DCMAKE_JOB_POOL_LINK=link'
      )
    }
  }
  sub.plugins.withId('com.android.library') { limitNativeJobs() }
  sub.plugins.withId('com.android.application') { limitNativeJobs() }
}
${END}
`;
}

module.exports = function withNativeBuildParallelism(config, { compileJobs = 2 } = {}) {
  return withProjectBuildGradle(config, (modConfig) => {
    const gradle = modConfig.modResults;
    if (gradle.language !== 'groovy') return modConfig;
    // Drop any previously generated copy (also older marker formats) before re-inserting.
    let contents = gradle.contents.replace(new RegExp(`${BEGIN}[\\s\\S]*?${END}\\n?`, 'g'), '');
    const legacy = contents.indexOf('// @generated withNativeBuildParallelism');
    if (legacy !== -1) contents = contents.slice(0, legacy).trimEnd() + '\n';
    const anchor = contents.indexOf(ANCHOR);
    gradle.contents = anchor === -1 ? `${contents}\n${block(compileJobs)}` : `${contents.slice(0, anchor)}${block(compileJobs)}\n${contents.slice(anchor)}`;
    return modConfig;
  });
};
