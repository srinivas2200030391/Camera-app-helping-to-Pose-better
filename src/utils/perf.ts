/**
 * Lightweight startup / pipeline timing. Marks are kept in memory (last value wins) and shown in
 * Settings → Diagnostics so measurements come from the user's own device, not assumptions.
 */

export type PerfMark =
  | 'jsBundleStart'
  | 'rootLayoutMounted'
  | 'firstScreenRendered'
  | 'cameraMounted'
  | 'cameraPreviewStarted';

export interface PerfSample {
  label: string;
  ms: number;
  at: number;
}

interface StartupTiming {
  startTime?: number | null;
  initializeRuntimeStart?: number | null;
  executeJavaScriptBundleEntryPointStart?: number | null;
  endTime?: number | null;
}

const marks = new Map<PerfMark, number>();
const samples: PerfSample[] = [];
const MAX_SAMPLES = 60;

function now(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

function startupTiming(): StartupTiming | null {
  try {
    const timing = (globalThis.performance as unknown as { rnStartupTiming?: StartupTiming })?.rnStartupTiming;
    return timing ?? null;
  } catch {
    return null;
  }
}

export function mark(name: PerfMark): void {
  if (!marks.has(name)) marks.set(name, now());
}

/** Records a duration sample, e.g. capture or processing stage timings. */
export function recordSample(label: string, ms: number): void {
  samples.unshift({ label, ms, at: Date.now() });
  if (samples.length > MAX_SAMPLES) samples.length = MAX_SAMPLES;
  // One line per measurement (except per-frame preview renders), readable with
  // `adb logcat -s ReactNativeJS | findstr poselens:perf`.
  if (!label.startsWith('Preview')) console.log(`[poselens:perf] ${label}: ${Math.round(ms)} ms`);
}

let startupLogged = false;

/** Logs the startup report once per launch, when the camera preview first comes up. */
export function logStartupReport(): void {
  if (startupLogged) return;
  startupLogged = true;
  console.log(`[poselens:perf] startup ${JSON.stringify(getStartupReport())}`);
}

/** Times an async operation and records it under `label`. */
export async function timed<T>(label: string, task: () => Promise<T>): Promise<T> {
  const start = now();
  try {
    return await task();
  } finally {
    recordSample(label, now() - start);
  }
}

export interface StartupReport {
  /** Native start → JS bundle execution start (from React Native's startup timing). */
  nativeToBundleMs: number | null;
  /** Native start → root layout mounted. */
  toShellMs: number | null;
  /** Native start → first screen rendered. */
  toFirstScreenMs: number | null;
  /** Native start → camera preview reported started. */
  toCameraPreviewMs: number | null;
  /** Camera component mounted → preview started (camera pipeline cost alone). */
  cameraStartupMs: number | null;
}

export function getStartupReport(): StartupReport {
  const timing = startupTiming();
  const origin = timing?.startTime ?? marks.get('jsBundleStart') ?? null;
  const since = (name: PerfMark) => {
    const value = marks.get(name);
    return origin != null && value != null ? value - origin : null;
  };
  const bundleStart = timing?.executeJavaScriptBundleEntryPointStart;
  const cameraMounted = marks.get('cameraMounted');
  const previewStarted = marks.get('cameraPreviewStarted');
  return {
    nativeToBundleMs: origin != null && bundleStart != null ? bundleStart - origin : null,
    toShellMs: since('rootLayoutMounted'),
    toFirstScreenMs: since('firstScreenRendered'),
    toCameraPreviewMs: since('cameraPreviewStarted'),
    cameraStartupMs: cameraMounted != null && previewStarted != null ? previewStarted - cameraMounted : null,
  };
}

export function getSamples(): readonly PerfSample[] {
  return samples;
}

mark('jsBundleStart');
