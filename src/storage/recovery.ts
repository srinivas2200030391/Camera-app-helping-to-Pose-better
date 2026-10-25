/**
 * Startup integrity pass (runs after the first frame, never blocks the camera):
 * - removes leftovers of interrupted writes in photos/tmp;
 * - re-registers originals that exist on disk but have no database row (e.g. the app was killed
 *   between the file move and the insert) so no photo is ever silently lost;
 * - marks rows whose original file disappeared as `missing` (the user decides what to do);
 * - regenerates missing thumbnails.
 */
import { File } from 'expo-file-system';

import { dirs, ensureDirectories, listFiles, photoIdFromOriginal, safeDelete } from './files';
import { readImageInfo, refreshThumbnail } from './photoLibrary';
import { allPhotoFileRefs, insertPhoto, updatePhoto } from './photosRepo';

export interface RecoveryReport {
  temporaryFilesRemoved: number;
  recoveredPhotos: number;
  missingOriginals: number;
  thumbnailsQueued: number;
}

export interface RecoveryPlan {
  orphanOriginals: { id: string; uri: string }[];
  missingOriginals: string[];
  missingThumbnails: { id: string; uri: string }[];
}

/** Pure decision step (unit-tested): compares DB references with files on disk. */
export function planRecovery(
  rows: { id: string; originalUri: string; thumbUri: string | null }[],
  originalsOnDisk: { id: string; uri: string }[],
  exists: (uri: string) => boolean,
): RecoveryPlan {
  const known = new Set(rows.map((row) => row.id));
  return {
    orphanOriginals: originalsOnDisk.filter((file) => !known.has(file.id)),
    missingOriginals: rows.filter((row) => !exists(row.originalUri)).map((row) => row.id),
    missingThumbnails: rows
      .filter((row) => exists(row.originalUri) && (!row.thumbUri || !exists(row.thumbUri)))
      .map((row) => ({ id: row.id, uri: row.originalUri })),
  };
}

export async function runRecovery(): Promise<RecoveryReport> {
  ensureDirectories();
  const report: RecoveryReport = { temporaryFilesRemoved: 0, recoveredPhotos: 0, missingOriginals: 0, thumbnailsQueued: 0 };

  for (const file of listFiles(dirs.tmp())) {
    safeDelete(file);
    report.temporaryFilesRemoved++;
  }

  const rows = await allPhotoFileRefs();
  const originals = listFiles(dirs.originals())
    .map((file) => ({ id: photoIdFromOriginal(file), uri: file.uri }))
    .filter((entry): entry is { id: string; uri: string } => entry.id != null);
  const plan = planRecovery(rows, originals, (uri) => new File(uri).exists);

  for (const orphan of plan.orphanOriginals) {
    const file = new File(orphan.uri);
    const size = readImageInfo(orphan.uri);
    try {
      await insertPhoto({
        id: orphan.id,
        createdAt: file.modificationTime ?? Date.now(),
        originalUri: orphan.uri,
        width: size.width,
        height: size.height,
        fileSize: file.size,
        source: 'recovered',
      });
      report.recoveredPhotos++;
      void refreshThumbnail(orphan.id, orphan.uri);
    } catch (error) {
      console.warn('[recovery] could not re-register', orphan.id, error);
    }
  }

  for (const id of plan.missingOriginals) {
    await updatePhoto(id, { status: 'missing' });
    report.missingOriginals++;
  }

  for (const item of plan.missingThumbnails) {
    void refreshThumbnail(item.id, item.uri);
    report.thumbnailsQueued++;
  }
  return report;
}
