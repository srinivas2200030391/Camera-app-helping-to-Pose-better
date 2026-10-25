/**
 * High-level photo operations: committing captures, thumbnails, saving enhanced copies and
 * deleting. Combines the file layer (atomic writes) with the metadata repositories.
 */
import { File, FileMode } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { orientedSize, readExif, readJpegSize, type ExifSummary } from '@/processing/exif';
import { serializeRecipe, type EditRecipe } from '@/processing/params';
import { createId } from '@/utils/id';

import { commitFile, ensureDirectories, paths, safeDelete, writeFileAtomically } from './files';
import {
  deleteEditRecord,
  deletePhotoRecords,
  getPhoto,
  insertEdit,
  insertPhoto,
  updatePhoto,
  type EditRecord,
  type PhotoListItem,
} from './photosRepo';

const THUMB_WIDTH = 480;
const HEADER_BYTES = 128 * 1024;

export interface CaptureMetadata {
  facing: 'front' | 'back';
  zoom: number;
  exposureBias: number;
  flash: string;
  aspect: string;
  poseId: string | null;
  styleId: string;
}

/** Reads just the start of a JPEG — enough for the EXIF block — without loading the whole file. */
export function readJpegHeader(file: File, length = HEADER_BYTES): Uint8Array {
  const handle = file.open(FileMode.ReadOnly);
  try {
    return handle.readBytesSync(Math.min(length, file.size || length));
  } finally {
    handle.close();
  }
}

export function readExifFromFile(uri: string): ExifSummary {
  return readImageInfo(uri).exif;
}

export interface ImageInfo {
  exif: ExifSummary;
  /** Upright (display) size; 0 when the header could not be read. */
  width: number;
  height: number;
}

/** EXIF plus upright pixel size, from the first 128 KB of a JPEG (frame header first, EXIF as fallback). */
export function readImageInfo(uri: string, storedSize?: { width: number; height: number }): ImageInfo {
  try {
    const header = readJpegHeader(new File(uri));
    const exif = readExif(header);
    const stored = storedSize ?? readJpegSize(header) ?? { width: exif.pixelWidth ?? 0, height: exif.pixelHeight ?? 0 };
    return { exif, ...orientedSize(stored.width, stored.height, exif.orientation) };
  } catch {
    return { exif: { orientation: 1 }, width: storedSize?.width ?? 0, height: storedSize?.height ?? 0 };
  }
}

/**
 * Moves a finished capture into permanent storage and registers it.
 * `pixelSize` is the stored (pre-orientation) size if the caller knows it.
 */
export async function commitCapture(
  capturedUri: string,
  metadata: CaptureMetadata,
  pixelSize?: { width: number; height: number },
): Promise<PhotoListItem> {
  ensureDirectories();
  const id = createId();
  const temporary = new File(capturedUri);
  const target = paths.original(id);
  await commitFile(temporary, target);

  const { width, height } = readImageInfo(target.uri, pixelSize);

  try {
    await insertPhoto({
      id,
      createdAt: Date.now(),
      originalUri: target.uri,
      width,
      height,
      fileSize: target.size,
      facing: metadata.facing,
      zoom: metadata.zoom,
      exposureBias: metadata.exposureBias,
      flash: metadata.flash,
      aspect: metadata.aspect,
      poseId: metadata.poseId,
      styleId: metadata.styleId,
    });
  } catch (error) {
    // Keep the file: startup recovery re-registers originals without a row. Never lose a photo.
    console.warn('[library] failed to register capture; it will be recovered on next launch', error);
    throw error;
  }

  void refreshThumbnail(id, target.uri);
  const photo = await getPhoto(id);
  if (!photo) throw new Error('Photo was saved but could not be read back');
  return photo;
}

/** Generates (or regenerates) the grid thumbnail from `sourceUri`. Failures are non-fatal. */
export async function refreshThumbnail(photoId: string, sourceUri: string): Promise<string | null> {
  try {
    const context = ImageManipulator.manipulate(sourceUri, { maxWidth: THUMB_WIDTH * 2, maxHeight: THUMB_WIDTH * 2 });
    context.resize({ width: THUMB_WIDTH });
    const image = await context.renderAsync();
    const result = await image.saveAsync({ compress: 0.82, format: SaveFormat.JPEG });
    const target = new File(paths.thumb(photoId).uri.replace(/\.jpg$/, `_${Date.now()}.jpg`));
    await commitFile(new File(result.uri), target);
    const previous = await getPhoto(photoId);
    await updatePhoto(photoId, { thumbUri: target.uri });
    if (previous?.thumbUri && previous.thumbUri !== target.uri) safeDelete(new File(previous.thumbUri));
    return target.uri;
  } catch (error) {
    console.warn('[library] thumbnail failed', photoId, error);
    return null;
  }
}

export async function saveEditedCopy(
  photoId: string,
  jpeg: Uint8Array,
  recipe: EditRecipe,
  size: { width: number; height: number },
): Promise<EditRecord> {
  const editId = createId();
  const target = paths.edit(photoId, editId);
  await writeFileAtomically(target, jpeg);
  const record: EditRecord = {
    id: editId,
    photoId,
    createdAt: Date.now(),
    uri: target.uri,
    recipe: serializeRecipe(recipe),
    styleId: recipe.styleId,
    width: size.width,
    height: size.height,
    fileSize: jpeg.length,
  };
  try {
    await insertEdit(record, true);
  } catch (error) {
    safeDelete(target);
    throw error;
  }
  void refreshThumbnail(photoId, target.uri);
  return record;
}

/** Deletes a photo, all of its enhanced copies and its thumbnail. Callers confirm with the user first. */
export async function deletePhoto(photoId: string): Promise<void> {
  const uris = await deletePhotoRecords(photoId);
  for (const uri of uris) safeDelete(new File(uri));
}

export async function deleteEdit(photoId: string, editId: string): Promise<void> {
  const uri = await deleteEditRecord(editId);
  if (uri) safeDelete(new File(uri));
  const photo = await getPhoto(photoId);
  if (photo) void refreshThumbnail(photoId, photo.editUri ?? photo.originalUri);
}

/** The file that represents the photo right now: its current enhanced copy, else the original. */
export function displayUri(photo: Pick<PhotoListItem, 'editUri' | 'originalUri'>): string {
  return photo.editUri ?? photo.originalUri;
}
