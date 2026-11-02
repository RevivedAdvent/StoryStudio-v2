import { openDB, type IDBPDatabase } from 'idb';
import type { Project, StoredAsset } from '../types/project';
interface StoryStudioDB { projects: { key: string; value: Project }; assets: { key: string; value: StoredAsset }; }
let database: Promise<IDBPDatabase<StoryStudioDB>> | undefined;
export function getDatabase(): Promise<IDBPDatabase<StoryStudioDB>> {
  database ??= openDB<StoryStudioDB>('storystudio-v2', 1, { upgrade(db) { db.createObjectStore('projects', { keyPath: 'id' }); db.createObjectStore('assets', { keyPath: 'id' }); } });
  return database;
}
export async function resetDatabaseConnection(): Promise<void> { if (database) { (await database).close(); database = undefined; } }
