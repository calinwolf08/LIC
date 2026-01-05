import { betterAuth } from 'better-auth';
import Database from "better-sqlite3";
import { PUBLIC_BASE_URL } from "$env/static/public";

// Use the same database path as the rest of the app
const dbPath = process.env.DATABASE_PATH || './sqlite.db';

// Create a raw SQLite database connection for post-signup hook
// We use raw SQLite because Kysely db instance may cause circular import issues
const rawDb = new Database(dbPath);

/**
 * Create a default schedule for a newly registered user
 * Called after successful signup to implement schedule-first architecture
 */
function createDefaultScheduleForUser(userId: string): string | null {
    try {
        const now = new Date();
        const currentYear = now.getFullYear();

        // Default to academic year (July - June) or calendar year
        const startDate = now.getMonth() >= 6
            ? `${currentYear}-07-01`
            : `${currentYear}-01-01`;
        const endDate = now.getMonth() >= 6
            ? `${currentYear + 1}-06-30`
            : `${currentYear}-12-31`;

        const scheduleId = crypto.randomUUID();
        const timestamp = now.toISOString();

        // Insert the schedule
        rawDb.prepare(`
            INSERT INTO scheduling_periods (id, name, start_date, end_date, user_id, is_active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(scheduleId, 'My Schedule', startDate, endDate, userId, 0, timestamp, timestamp);

        // Set as user's active schedule
        rawDb.prepare(`
            UPDATE user SET active_schedule_id = ? WHERE id = ?
        `).run(scheduleId, userId);

        console.log(`[auth] Created default schedule ${scheduleId} for user ${userId}`);
        return scheduleId;
    } catch (error) {
        // Log error but don't fail signup - user can create schedule manually
        console.error('[auth] Failed to create default schedule for user:', error);
        return null;
    }
}

export const auth = betterAuth({
    emailAndPassword: {
        enabled: true,
    },
    database: rawDb,
    trustedOrigins: [
        PUBLIC_BASE_URL,
        'http://localhost:4173',
        'http://localhost:5173',
    ],
    user: {
        additionalFields: {
            active_schedule_id: {
                type: 'string',
                required: false,
            },
        },
    },
    databaseHooks: {
        user: {
            create: {
                after: async (user) => {
                    // Create default schedule for new user
                    createDefaultScheduleForUser(user.id);
                },
            },
        },
    },
});

