import { useLibraryStore } from '@/state/library';

import { getDb } from './db';

const MAX_RECENTS = 12;

const bump = () => useLibraryStore.getState().bumpPoses();

export async function listFavoritePoseIds(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ pose_id: string }>('SELECT pose_id FROM pose_favorites ORDER BY created_at DESC');
  return rows.map((row) => row.pose_id);
}

export async function isFavoritePose(poseId: string): Promise<boolean> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ pose_id: string }>('SELECT pose_id FROM pose_favorites WHERE pose_id = ?', poseId);
  return row != null;
}

export async function setFavoritePose(poseId: string, favorite: boolean): Promise<void> {
  const db = await getDb();
  if (favorite) {
    await db.runAsync('INSERT OR REPLACE INTO pose_favorites (pose_id, created_at) VALUES (?, ?)', poseId, Date.now());
  } else {
    await db.runAsync('DELETE FROM pose_favorites WHERE pose_id = ?', poseId);
  }
  bump();
}

export async function listRecentPoseIds(limit = MAX_RECENTS): Promise<string[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ pose_id: string }>('SELECT pose_id FROM pose_recents ORDER BY used_at DESC LIMIT ?', limit);
  return rows.map((row) => row.pose_id);
}

export async function recordPoseUse(poseId: string, at = Date.now()): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('INSERT OR REPLACE INTO pose_recents (pose_id, used_at) VALUES (?, ?)', poseId, at);
    await db.runAsync(
      'DELETE FROM pose_recents WHERE pose_id NOT IN (SELECT pose_id FROM pose_recents ORDER BY used_at DESC LIMIT ?)',
      MAX_RECENTS,
    );
  });
  bump();
}
