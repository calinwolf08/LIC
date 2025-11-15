import { Kysely, Migrator, FileMigrationProvider } from 'kysely';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Get the migration provider for running migrations
 */
export function getMigrationProvider() {
	return new FileMigrationProvider({
		fs,
		path,
		migrationFolder: __dirname,
	});
}

/**
 * Run all pending migrations
 *
 * @param db - Kysely database instance
 */
export async function migrateToLatest(db: Kysely<any>): Promise<void> {
	const migrator = new Migrator({
		db,
		provider: getMigrationProvider(),
	});

	const { error, results } = await migrator.migrateToLatest();

	results?.forEach((it) => {
		if (it.status === 'Success') {
			console.log(`✅ Migration "${it.migrationName}" was executed successfully`);
		} else if (it.status === 'Error') {
			console.error(`❌ Failed to execute migration "${it.migrationName}"`);
		}
	});

	if (error) {
		console.error('❌ Failed to migrate');
		console.error(error);
		process.exit(1);
	}

	console.log('✅ All migrations completed successfully');
}
