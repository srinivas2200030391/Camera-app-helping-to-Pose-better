import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

export const DATABASE_NAME = 'poselens.db';

/**
 * Ordered migrations; index + 1 is the schema version stored in PRAGMA user_version.
 * Never edit a shipped migration — append a new one.
 */
export const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE IF NOT EXISTS photos (
    id TEXT PRIMARY KEY NOT NULL,
    created_at INTEGER NOT NULL,
    original_uri TEXT NOT NULL,
    thumb_uri TEXT,
    width INTEGER NOT NULL DEFAULT 0,
    height INTEGER NOT NULL DEFAULT 0,
    file_size INTEGER NOT NULL DEFAULT 0,
    facing TEXT,
    zoom REAL,
    exposure_bias REAL,
    flash TEXT,
    aspect TEXT,
    pose_id TEXT,
    style_id TEXT,
    current_edit_id TEXT,
    is_favorite INTEGER NOT NULL DEFAULT 0,
    exported_at INTEGER,
    status TEXT NOT NULL DEFAULT 'ready',
    source TEXT NOT NULL DEFAULT 'camera'
  );
  CREATE INDEX IF NOT EXISTS idx_photos_created ON photos (created_at DESC);
  CREATE TABLE IF NOT EXISTS edits (
    id TEXT PRIMARY KEY NOT NULL,
    photo_id TEXT NOT NULL REFERENCES photos (id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    uri TEXT NOT NULL,
    recipe TEXT NOT NULL,
    style_id TEXT NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    file_size INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_edits_photo ON edits (photo_id, created_at DESC);
  CREATE TABLE IF NOT EXISTS pose_favorites (
    pose_id TEXT PRIMARY KEY NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS pose_recents (
    pose_id TEXT PRIMARY KEY NOT NULL,
    used_at INTEGER NOT NULL
  );
  `,
];

export async function migrate(db: SQLiteDatabase): Promise<number> {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  while (version < MIGRATIONS.length) {
    const sql = MIGRATIONS[version] as string;
    const next = version + 1;
    await db.withTransactionAsync(async () => {
      await db.execAsync(sql);
      await db.execAsync(`PRAGMA user_version = ${next}`);
    });
    version = next;
  }
  return version;
}

let dbPromise: Promise<SQLiteDatabase> | null = null;

/** Lazily opens and migrates the database once per process. */
export function getDb(): Promise<SQLiteDatabase> {
  dbPromise ??= (async () => {
    const db = await openDatabaseAsync(DATABASE_NAME);
    await migrate(db);
    return db;
  })().catch((error: unknown) => {
    dbPromise = null;
    throw error;
  });
  return dbPromise;
}

/** Test hook: forget the cached connection. */
export function resetDbForTests(): void {
  dbPromise = null;
}
