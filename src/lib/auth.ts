import { betterAuth } from 'better-auth';
import Database from "better-sqlite3";

// Use the same database path as the rest of the app
const dbPath = process.env.DATABASE_PATH || './sqlite.db';

export const auth = betterAuth({
    emailAndPassword: {
        enabled: true,
    },
    database: new Database(dbPath),
});

