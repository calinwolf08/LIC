import { betterAuth } from 'better-auth';
import Database from "better-sqlite3";
import { PUBLIC_BASE_URL } from "$env/static/public";

// Use the same database path as the rest of the app
const dbPath = process.env.DATABASE_PATH || './sqlite.db';

export const auth = betterAuth({
    emailAndPassword: {
        enabled: true,
    },
    database: new Database(dbPath),
    trustedOrigins: [
        PUBLIC_BASE_URL,
        'http://localhost:4173',
        'http://localhost:5173',
    ],
});

