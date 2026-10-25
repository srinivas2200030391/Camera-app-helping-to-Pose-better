/**
 * Processing job queue for full-resolution enhanced copies.
 *
 * - One job runs at a time (GPU memory and thermal headroom are limited on phones).
 * - Jobs are de-duplicated by photo + recipe hash, so double taps never render twice.
 * - Cancellation is cooperative between pipeline stages; partial files are never committed.
 * - State lives in a zustand store so any screen can show progress.
 * Jobs do not survive the app being killed: the original is safe and the edit can be re-run.
 */
import { File } from 'expo-file-system';
import { create } from 'zustand';

import { getPhoto } from '@/storage/photosRepo';
import { saveEditedCopy } from '@/storage/photoLibrary';
import { createId } from '@/utils/id';
import { recordSample } from '@/utils/perf';

import { recipeHash, resolveParams, type EditRecipe } from './params';
import {
  analyzeSource,
  decodeSource,
  ProcessingCancelledError,
  renderToJpeg,
  type CancelToken,
  type ProcessingStage,
} from './renderer';

export type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';

export interface ProcessingJob {
  id: string;
  photoId: string;
  hash: string;
  recipe: EditRecipe;
  status: JobStatus;
  progress: number;
  stage: ProcessingStage | null;
  error: string | null;
  editId: string | null;
  createdAt: number;
  durationMs: number | null;
}

export interface JobOptions {
  quality: number;
  keepMetadata: boolean;
}

interface JobsStore {
  jobs: Record<string, ProcessingJob>;
  order: string[];
  patch: (id: string, patch: Partial<ProcessingJob>) => void;
}

export const useJobsStore = create<JobsStore>()((set) => ({
  jobs: {},
  order: [],
  patch: (id, patch) =>
    set((state) => {
      const job = state.jobs[id];
      if (!job) return state;
      return { jobs: { ...state.jobs, [id]: { ...job, ...patch } } };
    }),
}));

const tokens = new Map<string, CancelToken>();
const options = new Map<string, JobOptions>();
let running = false;

function activeJobFor(photoId: string, hash: string): ProcessingJob | undefined {
  const { jobs, order } = useJobsStore.getState();
  return order
    .map((id) => jobs[id])
    .find((job) => job && job.photoId === photoId && job.hash === hash && (job.status === 'queued' || job.status === 'running'));
}

export function enqueueEnhancement(photoId: string, recipe: EditRecipe, jobOptions: JobOptions): string {
  const hash = recipeHash(recipe);
  const existing = activeJobFor(photoId, hash);
  if (existing) return existing.id;
  const id = createId();
  const job: ProcessingJob = {
    id,
    photoId,
    hash,
    recipe,
    status: 'queued',
    progress: 0,
    stage: null,
    error: null,
    editId: null,
    createdAt: Date.now(),
    durationMs: null,
  };
  tokens.set(id, { cancelled: false });
  options.set(id, jobOptions);
  useJobsStore.setState((state) => ({ jobs: { ...state.jobs, [id]: job }, order: [...state.order, id] }));
  void drain();
  return id;
}

export function cancelJob(id: string): void {
  const token = tokens.get(id);
  if (token) token.cancelled = true;
  const job = useJobsStore.getState().jobs[id];
  if (job?.status === 'queued') useJobsStore.getState().patch(id, { status: 'cancelled' });
}

export function getJob(id: string): ProcessingJob | undefined {
  return useJobsStore.getState().jobs[id];
}

async function drain(): Promise<void> {
  if (running) return;
  running = true;
  try {
    for (;;) {
      const { jobs, order } = useJobsStore.getState();
      const next = order.map((id) => jobs[id]).find((job) => job?.status === 'queued');
      if (!next) break;
      await runJob(next);
    }
  } finally {
    running = false;
  }
}

async function runJob(job: ProcessingJob): Promise<void> {
  const { patch } = useJobsStore.getState();
  const token = tokens.get(job.id) ?? { cancelled: false };
  const jobOptions = options.get(job.id) ?? { quality: 0.95, keepMetadata: true };
  const started = Date.now();
  patch(job.id, { status: 'running', progress: 0.01, stage: 'decode' });
  let source: ReturnType<typeof decodeSource> | null = null;
  try {
    const photo = await getPhoto(job.photoId);
    if (!photo) throw new Error('This photo no longer exists');
    const bytes = await new File(photo.originalUri).bytes();
    if (token.cancelled) throw new ProcessingCancelledError();
    source = decodeSource(bytes);
    patch(job.id, { progress: 0.04, stage: 'analyze' });
    const auto = job.recipe.auto ?? analyzeSource(source, job.recipe.crop).auto;
    const recipe: EditRecipe = { ...job.recipe, auto };
    const output = await renderToJpeg(source, resolveParams(recipe), {
      crop: recipe.crop,
      quality: jobOptions.quality,
      keepMetadata: jobOptions.keepMetadata,
      cancel: token,
      onProgress: (progress, stage) => patch(job.id, { progress, stage }),
    });
    if (token.cancelled) throw new ProcessingCancelledError();
    const edit = await saveEditedCopy(job.photoId, output.jpeg, recipe, { width: output.width, height: output.height });
    const durationMs = Date.now() - started;
    recordSample(`Enhance ${output.width}×${output.height}`, durationMs);
    patch(job.id, { status: 'done', progress: 1, stage: null, editId: edit.id, durationMs });
  } catch (error) {
    if (error instanceof ProcessingCancelledError || token.cancelled) {
      patch(job.id, { status: 'cancelled', stage: null });
    } else {
      const message = error instanceof Error ? error.message : String(error);
      console.warn('[jobs] enhancement failed', message);
      patch(job.id, { status: 'failed', stage: null, error: message });
    }
  } finally {
    source?.image.dispose?.();
    tokens.delete(job.id);
    options.delete(job.id);
  }
}
