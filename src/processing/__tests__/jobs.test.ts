/**
 * Job queue behaviour: de-duplication, sequential execution, cancellation and failure handling.
 * Rendering and storage are mocked; the queue logic itself is real.
 */
import { createRecipe } from '../params';

const mockRender = jest.fn();
const mockSave = jest.fn();
const mockGetPhoto = jest.fn();

jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation((uri: string) => ({ uri, bytes: async () => new Uint8Array([1, 2, 3]) })),
}));
jest.mock('@/storage/photosRepo', () => ({ getPhoto: (id: string) => mockGetPhoto(id) }));
jest.mock('@/storage/photoLibrary', () => ({ saveEditedCopy: (...args: unknown[]) => mockSave(...args) }));
jest.mock('../renderer', () => {
  class ProcessingCancelledError extends Error {}
  return {
    ProcessingCancelledError,
    decodeSource: () => ({ image: { dispose: () => undefined }, exif: { orientation: 1 } }),
    analyzeSource: () => ({ auto: { exposure: 0.1 }, stats: {} }),
    renderToJpeg: (...args: unknown[]) => mockRender(...args),
  };
});

// Imported after mocks are registered.
// eslint-disable-next-line import/first
import { cancelJob, enqueueEnhancement, getJob, useJobsStore } from '../jobs';

const options = { quality: 0.9, keepMetadata: true };
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

async function settle(id: string) {
  for (let i = 0; i < 50; i++) {
    const job = getJob(id);
    if (job && job.status !== 'queued' && job.status !== 'running') return job;
    await flush();
  }
  throw new Error('job did not settle');
}

beforeEach(() => {
  useJobsStore.setState({ jobs: {}, order: [] });
  mockGetPhoto.mockReset().mockResolvedValue({ id: 'p1', originalUri: 'file:///p1.jpg' });
  mockSave.mockReset().mockResolvedValue({ id: 'edit-1' });
  mockRender.mockReset().mockResolvedValue({ jpeg: new Uint8Array([9]), width: 4, height: 3, durationMs: 1 });
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

describe('processing job queue', () => {
  it('runs a job to completion and saves the enhanced copy', async () => {
    const id = enqueueEnhancement('p1', createRecipe('natural'), options);
    const job = await settle(id);
    expect(job).toMatchObject({ status: 'done', editId: 'edit-1', progress: 1 });
    expect(mockSave).toHaveBeenCalledTimes(1);
    // The analysed auto values are stored with the recipe so re-edits reproduce the result.
    expect(mockSave.mock.calls[0]?.[2]).toMatchObject({ styleId: 'natural', auto: { exposure: 0.1 } });
  });

  it('de-duplicates identical requests while one is pending', async () => {
    const recipe = createRecipe('warm');
    const a = enqueueEnhancement('p1', recipe, options);
    const b = enqueueEnhancement('p1', { ...recipe }, options);
    expect(b).toBe(a);
    const c = enqueueEnhancement('p1', { ...recipe, strength: 0.5 }, options);
    expect(c).not.toBe(a);
    await settle(a);
    await settle(c);
    expect(mockRender).toHaveBeenCalledTimes(2);
  });

  it('cancels a queued job without rendering or saving it', async () => {
    let release: () => void = () => undefined;
    mockRender.mockImplementationOnce(
      () => new Promise((resolve) => (release = () => resolve({ jpeg: new Uint8Array([1]), width: 1, height: 1, durationMs: 1 }))),
    );
    const first = enqueueEnhancement('p1', createRecipe('cool'), options);
    const second = enqueueEnhancement('p1', createRecipe('mono'), options);
    await flush();
    cancelJob(second);
    expect(getJob(second)?.status).toBe('cancelled');
    release();
    await settle(first);
    await flush();
    expect(mockRender).toHaveBeenCalledTimes(1);
    expect(mockSave).toHaveBeenCalledTimes(1);
  });

  it('reports failures and keeps processing later jobs', async () => {
    mockRender.mockRejectedValueOnce(new Error('GPU surface allocation failed'));
    const failing = enqueueEnhancement('p1', createRecipe('portrait'), options);
    const next = enqueueEnhancement('p1', createRecipe('landscape'), options);
    expect(await settle(failing)).toMatchObject({ status: 'failed', error: 'GPU surface allocation failed' });
    expect((await settle(next)).status).toBe('done');
  });

  it('fails cleanly when the photo was deleted meanwhile', async () => {
    mockGetPhoto.mockResolvedValueOnce(null);
    const id = enqueueEnhancement('gone', createRecipe('natural'), options);
    expect(await settle(id)).toMatchObject({ status: 'failed', error: 'This photo no longer exists' });
    expect(mockSave).not.toHaveBeenCalled();
  });
});
