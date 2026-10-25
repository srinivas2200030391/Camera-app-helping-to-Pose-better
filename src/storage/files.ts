/**
 * App-private photo storage.
 *
 *   <document>/photos/originals/<photoId>.jpg   captured originals (never modified)
 *   <document>/photos/edits/<photoId>_<editId>.jpg  enhanced copies
 *   <document>/photos/thumbs/<photoId>.jpg      thumbnails (re-creatable)
 *   <document>/photos/tmp/                      in-flight writes, swept on startup
 *
 * Every write lands in tmp/ first and is then moved into place. A move within one volume is
 * a rename, so a crash leaves either the complete file or a tmp file — never a partial photo.
 */
import { Directory, File, Paths } from 'expo-file-system';

import { createId } from '@/utils/id';

export const MIN_FREE_BYTES = 50 * 1024 * 1024;

export class InsufficientStorageError extends Error {
  constructor(readonly availableBytes: number) {
    super('Not enough free storage to save the photo. Free up at least 50 MB and try again.');
    this.name = 'InsufficientStorageError';
  }
}

function photosRoot(): Directory {
  return new Directory(Paths.document, 'photos');
}

export const dirs = {
  originals: () => new Directory(photosRoot(), 'originals'),
  edits: () => new Directory(photosRoot(), 'edits'),
  thumbs: () => new Directory(photosRoot(), 'thumbs'),
  tmp: () => new Directory(photosRoot(), 'tmp'),
  previews: () => new Directory(Paths.cache, 'previews'),
};

let ensured = false;

export function ensureDirectories(): void {
  if (ensured) return;
  for (const make of Object.values(dirs)) {
    make().create({ intermediates: true, idempotent: true });
  }
  ensured = true;
}

/** Test hook: forget that directories were created (after a test wipes storage). */
export function resetDirectoryCacheForTests(): void {
  ensured = false;
}

export const paths = {
  original: (photoId: string) => new File(dirs.originals(), `${photoId}.jpg`),
  edit: (photoId: string, editId: string) => new File(dirs.edits(), `${photoId}_${editId}.jpg`),
  thumb: (photoId: string) => new File(dirs.thumbs(), `${photoId}.jpg`),
  preview: (photoId: string) => new File(dirs.previews(), `${photoId}.jpg`),
  tmp: (label: string) => new File(dirs.tmp(), `${label}-${createId()}.tmp`),
};

export function availableBytes(): number {
  try {
    return Paths.availableDiskSpace;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

/** Throws InsufficientStorageError when saving `requiredBytes` would leave < 50 MB free. */
export function assertSpaceFor(requiredBytes: number): void {
  const available = availableBytes();
  if (available - requiredBytes < MIN_FREE_BYTES) throw new InsufficientStorageError(available);
}

/** Moves a finished temporary file into its final location (atomic rename on the same volume). */
export async function commitFile(temporary: File, target: File): Promise<File> {
  if (!temporary.exists) throw new Error('Temporary file is missing; nothing to commit');
  if (target.exists) throw new Error(`Refusing to overwrite existing file ${target.name}`);
  await temporary.move(target);
  return target;
}

/** Writes bytes to `target` via a temporary file. */
export async function writeFileAtomically(target: File, bytes: Uint8Array): Promise<File> {
  ensureDirectories();
  assertSpaceFor(bytes.length);
  const temporary = paths.tmp('write');
  try {
    temporary.create({ overwrite: true });
    await temporary.write(bytes);
    if (temporary.size !== bytes.length) {
      throw new Error(`Incomplete write (${temporary.size} of ${bytes.length} bytes)`);
    }
    return await commitFile(temporary, target);
  } catch (error) {
    safeDelete(temporary);
    throw error;
  }
}

export function safeDelete(file: File | null | undefined): void {
  try {
    if (file?.exists) file.delete();
  } catch (error) {
    console.warn('[files] delete failed', file?.uri, error);
  }
}

export function fileFromUri(uri: string): File {
  return new File(uri);
}

export function listFiles(directory: Directory): File[] {
  try {
    if (!directory.exists) return [];
    return directory.list().filter((entry): entry is File => entry instanceof File);
  } catch {
    return [];
  }
}

export function directorySize(directory: Directory): number {
  return listFiles(directory).reduce((sum, file) => sum + (file.size || 0), 0);
}

/** Photo id encoded in an original's file name (`<id>.jpg`). */
export function photoIdFromOriginal(file: File): string | null {
  const match = /^([0-9a-f-]{36})\.jpg$/i.exec(file.name);
  return match?.[1] ?? null;
}
