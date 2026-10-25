/**
 * Photo and edit metadata. The only module that reads/writes the photos/edits tables.
 */
import { useLibraryStore } from '@/state/library';

import { getDb } from './db';

export type PhotoStatus = 'ready' | 'missing';
export type PhotoSource = 'camera' | 'recovered';

export interface PhotoRecord {
  id: string;
  createdAt: number;
  originalUri: string;
  thumbUri: string | null;
  width: number;
  height: number;
  fileSize: number;
  facing: string | null;
  zoom: number | null;
  exposureBias: number | null;
  flash: string | null;
  aspect: string | null;
  poseId: string | null;
  styleId: string | null;
  currentEditId: string | null;
  isFavorite: boolean;
  exportedAt: number | null;
  status: PhotoStatus;
  source: PhotoSource;
}

export interface EditRecord {
  id: string;
  photoId: string;
  createdAt: number;
  uri: string;
  recipe: string;
  styleId: string;
  width: number;
  height: number;
  fileSize: number;
}

/** A photo joined with the file of its current enhanced copy, for list rendering. */
export interface PhotoListItem extends PhotoRecord {
  editUri: string | null;
}

interface PhotoRow {
  id: string;
  created_at: number;
  original_uri: string;
  thumb_uri: string | null;
  width: number;
  height: number;
  file_size: number;
  facing: string | null;
  zoom: number | null;
  exposure_bias: number | null;
  flash: string | null;
  aspect: string | null;
  pose_id: string | null;
  style_id: string | null;
  current_edit_id: string | null;
  is_favorite: number;
  exported_at: number | null;
  status: string;
  source: string;
  edit_uri?: string | null;
}

interface EditRow {
  id: string;
  photo_id: string;
  created_at: number;
  uri: string;
  recipe: string;
  style_id: string;
  width: number;
  height: number;
  file_size: number;
}

function toPhoto(row: PhotoRow): PhotoListItem {
  return {
    id: row.id,
    createdAt: row.created_at,
    originalUri: row.original_uri,
    thumbUri: row.thumb_uri,
    width: row.width,
    height: row.height,
    fileSize: row.file_size,
    facing: row.facing,
    zoom: row.zoom,
    exposureBias: row.exposure_bias,
    flash: row.flash,
    aspect: row.aspect,
    poseId: row.pose_id,
    styleId: row.style_id,
    currentEditId: row.current_edit_id,
    isFavorite: row.is_favorite === 1,
    exportedAt: row.exported_at,
    status: row.status === 'missing' ? 'missing' : 'ready',
    source: row.source === 'recovered' ? 'recovered' : 'camera',
    editUri: row.edit_uri ?? null,
  };
}

function toEdit(row: EditRow): EditRecord {
  return {
    id: row.id,
    photoId: row.photo_id,
    createdAt: row.created_at,
    uri: row.uri,
    recipe: row.recipe,
    styleId: row.style_id,
    width: row.width,
    height: row.height,
    fileSize: row.file_size,
  };
}

const bump = () => useLibraryStore.getState().bumpPhotos();

const SELECT_PHOTO = `
  SELECT p.*, e.uri AS edit_uri
  FROM photos p
  LEFT JOIN edits e ON e.id = p.current_edit_id`;

export type NewPhoto = Pick<PhotoRecord, 'id' | 'createdAt' | 'originalUri' | 'width' | 'height' | 'fileSize'> &
  Partial<Pick<PhotoRecord, 'thumbUri' | 'facing' | 'zoom' | 'exposureBias' | 'flash' | 'aspect' | 'poseId' | 'styleId' | 'source'>>;

export async function insertPhoto(photo: NewPhoto): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO photos (id, created_at, original_uri, thumb_uri, width, height, file_size, facing, zoom,
       exposure_bias, flash, aspect, pose_id, style_id, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    photo.id,
    photo.createdAt,
    photo.originalUri,
    photo.thumbUri ?? null,
    photo.width,
    photo.height,
    photo.fileSize,
    photo.facing ?? null,
    photo.zoom ?? null,
    photo.exposureBias ?? null,
    photo.flash ?? null,
    photo.aspect ?? null,
    photo.poseId ?? null,
    photo.styleId ?? null,
    photo.source ?? 'camera',
  );
  bump();
}

const UPDATABLE: Record<string, string> = {
  thumbUri: 'thumb_uri',
  width: 'width',
  height: 'height',
  fileSize: 'file_size',
  styleId: 'style_id',
  currentEditId: 'current_edit_id',
  isFavorite: 'is_favorite',
  exportedAt: 'exported_at',
  status: 'status',
};

export type PhotoPatch = Partial<Pick<PhotoRecord, 'thumbUri' | 'width' | 'height' | 'fileSize' | 'styleId' | 'currentEditId' | 'isFavorite' | 'exportedAt' | 'status'>>;

export async function updatePhoto(id: string, patch: PhotoPatch): Promise<void> {
  const entries = Object.entries(patch).filter(([key, value]) => key in UPDATABLE && value !== undefined);
  if (entries.length === 0) return;
  const db = await getDb();
  const assignments = entries.map(([key]) => `${UPDATABLE[key]} = ?`).join(', ');
  const values = entries.map(([, value]) => (typeof value === 'boolean' ? (value ? 1 : 0) : (value as string | number | null)));
  await db.runAsync(`UPDATE photos SET ${assignments} WHERE id = ?`, ...values, id);
  bump();
}

export async function getPhoto(id: string): Promise<PhotoListItem | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<PhotoRow>(`${SELECT_PHOTO} WHERE p.id = ?`, id);
  return row ? toPhoto(row) : null;
}

export type PhotoFilter = 'all' | 'favorites' | 'edited';

export async function listPhotos(filter: PhotoFilter = 'all', limit = 500): Promise<PhotoListItem[]> {
  const db = await getDb();
  const where = filter === 'favorites' ? 'WHERE p.is_favorite = 1' : filter === 'edited' ? 'WHERE p.current_edit_id IS NOT NULL' : '';
  const rows = await db.getAllAsync<PhotoRow>(`${SELECT_PHOTO} ${where} ORDER BY p.created_at DESC LIMIT ?`, limit);
  return rows.map(toPhoto);
}

export async function latestPhoto(): Promise<PhotoListItem | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<PhotoRow>(`${SELECT_PHOTO} ORDER BY p.created_at DESC LIMIT 1`);
  return row ? toPhoto(row) : null;
}

export async function countPhotos(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM photos');
  return row?.n ?? 0;
}

export async function allPhotoFileRefs(): Promise<{ id: string; originalUri: string; thumbUri: string | null }[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: string; original_uri: string; thumb_uri: string | null }>(
    'SELECT id, original_uri, thumb_uri FROM photos',
  );
  return rows.map((row) => ({ id: row.id, originalUri: row.original_uri, thumbUri: row.thumb_uri }));
}

/** Deletes the DB rows (photo + edits) and returns every file URI the caller should remove. */
export async function deletePhotoRecords(id: string): Promise<string[]> {
  const db = await getDb();
  const photo = await db.getFirstAsync<PhotoRow>('SELECT * FROM photos WHERE id = ?', id);
  if (!photo) return [];
  const edits = await db.getAllAsync<EditRow>('SELECT * FROM edits WHERE photo_id = ?', id);
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM edits WHERE photo_id = ?', id);
    await db.runAsync('DELETE FROM photos WHERE id = ?', id);
  });
  bump();
  return [photo.original_uri, photo.thumb_uri, ...edits.map((edit) => edit.uri)].filter((uri): uri is string => !!uri);
}

export async function insertEdit(edit: EditRecord, makeCurrent = true): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO edits (id, photo_id, created_at, uri, recipe, style_id, width, height, file_size)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      edit.id,
      edit.photoId,
      edit.createdAt,
      edit.uri,
      edit.recipe,
      edit.styleId,
      edit.width,
      edit.height,
      edit.fileSize,
    );
    if (makeCurrent) {
      await db.runAsync('UPDATE photos SET current_edit_id = ?, style_id = ? WHERE id = ?', edit.id, edit.styleId, edit.photoId);
    }
  });
  bump();
}

export async function listEdits(photoId: string): Promise<EditRecord[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<EditRow>('SELECT * FROM edits WHERE photo_id = ? ORDER BY created_at DESC', photoId);
  return rows.map(toEdit);
}

export async function getEdit(id: string): Promise<EditRecord | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<EditRow>('SELECT * FROM edits WHERE id = ?', id);
  return row ? toEdit(row) : null;
}

/** Points the photo back at its original (edits are kept unless deleted explicitly). */
export async function restoreOriginal(photoId: string): Promise<void> {
  await updatePhoto(photoId, { currentEditId: null });
}

/** Removes one edit row; returns its file URI for deletion. Falls back to the newest remaining edit. */
export async function deleteEditRecord(editId: string): Promise<string | null> {
  const db = await getDb();
  const edit = await db.getFirstAsync<EditRow>('SELECT * FROM edits WHERE id = ?', editId);
  if (!edit) return null;
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM edits WHERE id = ?', editId);
    const next = await db.getFirstAsync<{ id: string }>(
      'SELECT id FROM edits WHERE photo_id = ? ORDER BY created_at DESC LIMIT 1',
      edit.photo_id,
    );
    await db.runAsync(
      'UPDATE photos SET current_edit_id = CASE WHEN current_edit_id = ? THEN ? ELSE current_edit_id END WHERE id = ?',
      editId,
      next?.id ?? null,
      edit.photo_id,
    );
  });
  bump();
  return edit.uri;
}
