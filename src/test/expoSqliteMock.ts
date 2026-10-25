/**
 * Test double for expo-sqlite backed by Node's built-in SQLite (node:sqlite), so repository tests
 * run real SQL. Implements the async subset the app uses.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');

type Param = string | number | null;

class MockDatabase {
  private db = new DatabaseSync(':memory:');

  async execAsync(sql: string): Promise<void> {
    this.db.exec(sql);
  }

  async runAsync(sql: string, ...params: Param[]): Promise<{ lastInsertRowId: number; changes: number }> {
    const result = this.db.prepare(sql).run(...params);
    return { lastInsertRowId: Number(result.lastInsertRowid), changes: Number(result.changes) };
  }

  async getFirstAsync<T>(sql: string, ...params: Param[]): Promise<T | null> {
    return (this.db.prepare(sql).get(...params) as T | undefined) ?? null;
  }

  async getAllAsync<T>(sql: string, ...params: Param[]): Promise<T[]> {
    return this.db.prepare(sql).all(...params) as T[];
  }

  async withTransactionAsync(task: () => Promise<void>): Promise<void> {
    this.db.exec('BEGIN');
    try {
      await task();
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
}

export async function openDatabaseAsync(): Promise<MockDatabase> {
  return new MockDatabase();
}

export type SQLiteDatabase = MockDatabase;
