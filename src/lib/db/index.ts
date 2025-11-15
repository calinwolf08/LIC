/**
 * Database exports
 *
 * Import the database instance throughout your app:
 * import { db } from '$lib/db';
 */

export { db, createDB } from './connection';
export type { DB } from './types';
export { migrateToLatest, getMigrationProvider } from './migrations';
