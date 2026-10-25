/**
 * Storage integration tests: real SQL (node:sqlite) and real files (temp directory) behind the
 * expo-sqlite / expo-file-system APIs. Covers capture commit, enhanced copies, restoring the
 * original, deletion and startup recovery.
 */
import { File } from 'expo-file-system';

import { buildExifSegment, fakeJpeg } from '@/processing/__tests__/fixtures';
import { createRecipe } from '@/processing/params';
import { testFs } from '@/test/expoFileSystemMock';

import { getDb, resetDbForTests } from '../db';
import { assertSpaceFor, commitFile, dirs, ensureDirectories, InsufficientStorageError, listFiles, paths, resetDirectoryCacheForTests, writeFileAtomically } from '../files';
import { commitCapture, deleteEdit, deletePhoto, displayUri, saveEditedCopy } from '../photoLibrary';
import { getPhoto, insertPhoto, listEdits, listPhotos, restoreOriginal, updatePhoto } from '../photosRepo';
import { planRecovery, runRecovery } from '../recovery';

/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories must use require */
jest.mock('expo-sqlite', () => require('@/test/expoSqliteMock'));
jest.mock('expo-file-system', () => require('@/test/expoFileSystemMock'));
/* eslint-enable @typescript-eslint/no-require-imports */
jest.mock('expo-image-manipulator', () => ({
  ImageManipulator: {
    manipulate: () => {
      throw new Error('image manipulation is not available in unit tests');
    },
  },
  SaveFormat: { JPEG: 'jpeg' },
}));

const META = { facing: 'back' as const, zoom: 1, exposureBias: 0, flash: 'off', aspect: '4:3', poseId: 'hand-on-hip', styleId: 'natural' };

async function stageCapture(bytes: Uint8Array): Promise<string> {
  ensureDirectories();
  const tmp = new File(paths.tmp('capture').uri.replace(/\.tmp$/, '.jpg'));
  tmp.create({ overwrite: true });
  await tmp.write(bytes);
  return tmp.uri;
}

beforeEach(async () => {
  testFs.reset();
  resetDirectoryCacheForTests();
  resetDbForTests();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('database', () => {
  it('migrates to the latest schema exactly once', async () => {
    const db = await getDb();
    expect((await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))?.user_version).toBe(1);
    const tables = await db.getAllAsync<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name");
    expect(tables.map((t) => t.name)).toEqual(expect.arrayContaining(['photos', 'edits', 'pose_favorites', 'pose_recents']));
  });
});

describe('atomic files', () => {
  it('writes the exact bytes and leaves no temporary files behind', async () => {
    const target = paths.edit('p', 'e');
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    await writeFileAtomically(target, bytes);
    expect(Array.from(await target.bytes())).toEqual([1, 2, 3, 4, 5]);
    expect(listFiles(dirs.tmp())).toHaveLength(0);
  });

  it('refuses to save when storage is nearly full, without leaving partial files', async () => {
    testFs.availableDiskSpace = 10 * 1024 * 1024;
    const target = paths.edit('p', 'low');
    await expect(writeFileAtomically(target, new Uint8Array(1024))).rejects.toBeInstanceOf(InsufficientStorageError);
    expect(target.exists).toBe(false);
    expect(listFiles(dirs.tmp())).toHaveLength(0);
    expect(() => assertSpaceFor(1)).toThrow(/Free up at least 50 MB/);
  });

  it('never overwrites an existing file on commit', async () => {
    ensureDirectories();
    const a = paths.tmp('a');
    a.create();
    await a.write('new');
    const target = paths.edit('x', 'y');
    target.create();
    await target.write('old');
    await expect(commitFile(a, target)).rejects.toThrow(/Refusing to overwrite/);
    expect(new TextDecoder().decode(await target.bytes())).toBe('old');
  });
});

describe('capture → enhance → restore', () => {
  it('commits a capture with oriented dimensions and moves it out of tmp', async () => {
    const jpeg = fakeJpeg(buildExifSegment({ orientation: 6, pixelWidth: 4000, pixelHeight: 3000 }));
    const tmpUri = await stageCapture(jpeg);
    const photo = await commitCapture(tmpUri, META);
    expect(photo.width).toBe(3000);
    expect(photo.height).toBe(4000);
    expect(photo.poseId).toBe('hand-on-hip');
    expect(new File(tmpUri).exists).toBe(false);
    expect(Array.from(await new File(photo.originalUri).bytes())).toEqual(Array.from(jpeg));
  });

  it('takes the size from the JPEG frame header when EXIF has no dimensions', async () => {
    const jpeg = fakeJpeg(undefined, true, { width: 4032, height: 3024 });
    const photo = await commitCapture(await stageCapture(jpeg), META);
    expect([photo.width, photo.height]).toEqual([4032, 3024]);
  });

  it('saves enhanced copies separately and can always restore the untouched original', async () => {
    const original = fakeJpeg(buildExifSegment({ iso: 200 }));
    const photo = await commitCapture(await stageCapture(original), META);
    const recipe = createRecipe('warm');
    const edit = await saveEditedCopy(photo.id, new Uint8Array([9, 9, 9]), recipe, { width: 10, height: 20 });

    let current = await getPhoto(photo.id);
    expect(current?.currentEditId).toBe(edit.id);
    expect(displayUri(current!)).toBe(edit.uri);
    expect((await listPhotos('edited')).map((p) => p.id)).toEqual([photo.id]);

    await restoreOriginal(photo.id);
    current = await getPhoto(photo.id);
    expect(current?.currentEditId).toBeNull();
    expect(displayUri(current!)).toBe(photo.originalUri);
    expect(Array.from(await new File(photo.originalUri).bytes())).toEqual(Array.from(original));
    expect(await listEdits(photo.id)).toHaveLength(1);
  });

  it('falls back to the newest remaining copy when the current one is deleted', async () => {
    const photo = await commitCapture(await stageCapture(fakeJpeg()), META);
    const first = await saveEditedCopy(photo.id, new Uint8Array([1]), createRecipe('cool'), { width: 1, height: 1 });
    await new Promise((r) => setTimeout(r, 5));
    const second = await saveEditedCopy(photo.id, new Uint8Array([2]), createRecipe('mono'), { width: 1, height: 1 });
    await deleteEdit(photo.id, second.id);
    expect((await getPhoto(photo.id))?.currentEditId).toBe(first.id);
    expect(new File(second.uri).exists).toBe(false);
  });

  it('deletes rows and every file of a photo', async () => {
    const photo = await commitCapture(await stageCapture(fakeJpeg()), META);
    const edit = await saveEditedCopy(photo.id, new Uint8Array([7]), createRecipe('natural'), { width: 1, height: 1 });
    await deletePhoto(photo.id);
    expect(await getPhoto(photo.id)).toBeNull();
    expect(new File(photo.originalUri).exists).toBe(false);
    expect(new File(edit.uri).exists).toBe(false);
  });

  it('filters favourites', async () => {
    const a = await commitCapture(await stageCapture(fakeJpeg()), META);
    await commitCapture(await stageCapture(fakeJpeg()), META);
    await updatePhoto(a.id, { isFavorite: true });
    expect((await listPhotos('favorites')).map((p) => p.id)).toEqual([a.id]);
    expect(await listPhotos('all')).toHaveLength(2);
  });
});

describe('startup recovery', () => {
  it('plans recovery from database rows and files on disk', () => {
    const plan = planRecovery(
      [
        { id: 'a', originalUri: 'file:///a.jpg', thumbUri: null },
        { id: 'b', originalUri: 'file:///b.jpg', thumbUri: 'file:///b_t.jpg' },
      ],
      [
        { id: 'a', uri: 'file:///a.jpg' },
        { id: 'c', uri: 'file:///c.jpg' },
      ],
      (uri) => uri === 'file:///a.jpg' || uri === 'file:///c.jpg',
    );
    expect(plan.orphanOriginals.map((o) => o.id)).toEqual(['c']);
    expect(plan.missingOriginals).toEqual(['b']);
    expect(plan.missingThumbnails.map((t) => t.id)).toEqual(['a']);
  });

  it('re-registers orphaned originals, marks missing files and sweeps tmp', async () => {
    ensureDirectories();
    // An original whose database insert never happened (app killed mid-save).
    const orphanId = '12345678-1234-4123-8123-123456789abc';
    const orphan = paths.original(orphanId);
    orphan.create();
    await orphan.write(fakeJpeg(buildExifSegment({ orientation: 1, pixelWidth: 1200, pixelHeight: 900 })));
    // A row whose file vanished.
    await insertPhoto({ id: 'gone', createdAt: 1, originalUri: paths.original('gone').uri, width: 1, height: 1, fileSize: 1 });
    // A leftover temporary file.
    const leftover = paths.tmp('write');
    leftover.create();

    const report = await runRecovery();
    expect(report).toMatchObject({ temporaryFilesRemoved: 1, recoveredPhotos: 1, missingOriginals: 1 });
    const recovered = await getPhoto(orphanId);
    expect(recovered).toMatchObject({ source: 'recovered', width: 1200, height: 900 });
    expect((await getPhoto('gone'))?.status).toBe('missing');
    expect(listFiles(dirs.tmp())).toHaveLength(0);
  });
});
