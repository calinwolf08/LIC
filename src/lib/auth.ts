import { betterAuth } from 'better-auth';
import { Pool } from 'pg';

const poolConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    database: process.env.DB_DATABASE,
};

export const auth = betterAuth({
    emailAndPassword: {
        enabled: true,
    },
    database: new Pool(poolConfig),
    advanced: {
        generateId: false,
    },
    user: {
        modelName: 'users',
        fields: {
            // id: 'better_auth_id',
            name: 'first_name',
            emailVerified: 'email_verified',
            createdAt: 'created_at',
            updatedAt: 'updated_at',
        }
    },
    session: {
        modelName: 'sessions',
        fields: {
            // id: 'better_auth_id',
            userId: 'user_id',
            expiresAt: 'expires_at',
            ipAddress: 'ip_address',
            userAgent: 'user_agent',
            createdAt: 'created_at',
            updatedAt: 'updated_at',
        }
    },
    account: {
        modelName: 'accounts',
        fields: {
            // id: 'better_auth_id',
            userId: 'user_id',
            accountId: 'account_id',
            providerId: 'provider_id',
            accessToken: 'access_token',
            refreshToken: 'refresh_token',
            idToken: 'id_token',
            accessTokenExpiresAt: 'access_token_expires_at',
            refreshTokenExpiresAt: 'refresh_token_expires_at',
            createdAt: 'created_at',
            updatedAt: 'updated_at',
        }
    },
    verification: {
        modelName: 'verifications',
        fields: {
            // id: 'better_auth_id',
            expiresAt: 'expires_at',
            createdAt: 'created_at',
            updatedAt: 'updated_at',
        }
    },
});

