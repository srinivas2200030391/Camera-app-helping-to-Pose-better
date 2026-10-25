#!/usr/bin/env node
/**
 * Local Android APK build.
 *
 *   node scripts/build-apk.mjs [release|debug] [--prebuild] [--clean]
 *
 * release  Standalone APK with the JS bundle embedded (no dev server needed). Default.
 * debug    Development client APK; pair it with `npx expo start --dev-client`.
 * --prebuild  Sync ./android with app.config.ts first (needed after config/native dep changes).
 *             Applies changes in place so incremental native build outputs survive.
 * --clean     Recreate ./android from scratch (full native rebuild).
 *
 * Requirements: JDK 17+ (JAVA_HOME), Android SDK (ANDROID_HOME or the default SDK location).
 * Missing SDK platforms, build-tools, NDK and CMake are downloaded by the Android Gradle Plugin.
 * APKs are copied to ./artifacts/.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const variant = args.has('debug') ? 'debug' : 'release';
const isWindows = process.platform === 'win32';

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

function run(command, commandArgs, options = {}) {
  console.log(`\n› ${command} ${commandArgs.join(' ')}`);
  const result = spawnSync(command, commandArgs, { stdio: 'inherit', shell: isWindows, ...options });
  if (result.status !== 0) fail(`${command} exited with code ${result.status}`);
}

function javaMajorVersion(javaHome) {
  const java = path.join(javaHome, 'bin', isWindows ? 'java.exe' : 'java');
  if (!fs.existsSync(java)) return null;
  const out = spawnSync(java, ['-version'], { encoding: 'utf8' });
  const match = /version "(\d+)(?:\.(\d+))?/.exec(`${out.stderr}${out.stdout}`);
  if (!match) return null;
  const major = Number(match[1]);
  return major === 1 ? Number(match[2]) : major;
}

function resolveAndroidSdk() {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    isWindows ? path.join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk') : null,
    process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Android', 'sdk') : null,
    path.join(os.homedir(), 'Android', 'Sdk'),
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(path.join(candidate, 'platform-tools')));
}

const javaHome = process.env.JAVA_HOME;
if (!javaHome) fail('JAVA_HOME is not set. Install JDK 17+ and point JAVA_HOME at it.');
const javaMajor = javaMajorVersion(javaHome);
if (javaMajor == null || javaMajor < 17) {
  fail(`JAVA_HOME (${javaHome}) is JDK ${javaMajor ?? 'unknown'}; Android Gradle Plugin 9 needs JDK 17+.`);
}

const sdk = resolveAndroidSdk();
if (!sdk) fail('Android SDK not found. Set ANDROID_HOME to your SDK folder.');

const androidDir = path.join(root, 'android');
const clean = args.has('--clean');
if (clean || args.has('--prebuild') || !fs.existsSync(androidDir)) {
  const prebuildArgs = ['expo', 'prebuild', '--platform', 'android', '--no-install'];
  if (!clean && fs.existsSync(androidDir)) prebuildArgs.push('--no-clean');
  run('npx', prebuildArgs, { cwd: root, env: { ...process.env, CI: '1' } });
}

fs.writeFileSync(
  path.join(androidDir, 'local.properties'),
  // local.properties is a Java properties file: backslashes and colons must be escaped.
  'sdk.dir=' + sdk.replaceAll('\\', '\\\\').replaceAll(':', '\\:') + '\n',
);

// cmd.exe needs the quoted absolute path: the project folder may contain spaces.
const gradlew = isWindows ? `"${path.join(androidDir, 'gradlew.bat')}"` : './gradlew';
// Daemon heap sizes come from plugins/withGradleMemory.js and per-module C++ job pools from
// plugins/withNativeBuildParallelism.js; two workers keep peak memory within 8 GB machines.
// Raise POSELENS_GRADLE_WORKERS on machines with more RAM for faster builds.
const gradleArgs = [`--max-workers=${process.env.POSELENS_GRADLE_WORKERS ?? '2'}`];
const env = { ...process.env, ANDROID_HOME: sdk, NODE_ENV: variant === 'release' ? 'production' : 'development' };

const task = variant === 'release' ? ':app:assembleRelease' : ':app:assembleDebug';
const started = Date.now();
run(gradlew, [task, ...gradleArgs], { cwd: androidDir, env });
const minutes = ((Date.now() - started) / 60000).toFixed(1);

const outDir = path.join(androidDir, 'app', 'build', 'outputs', 'apk', variant);
const apks = fs.existsSync(outDir) ? fs.readdirSync(outDir).filter((file) => file.endsWith('.apk')) : [];
if (apks.length === 0) fail(`Gradle finished but no APK was found in ${outDir}`);

const artifacts = path.join(root, 'artifacts');
fs.mkdirSync(artifacts, { recursive: true });
console.log(`\n✔ ${variant} build finished in ${minutes} min`);
for (const apk of apks) {
  const target = path.join(artifacts, apk.replace(/^app-/, 'poselens-'));
  fs.copyFileSync(path.join(outDir, apk), target);
  const sizeMb = (fs.statSync(target).size / 1024 / 1024).toFixed(1);
  console.log(`  ${path.relative(root, target)}  (${sizeMb} MB)`);
}
