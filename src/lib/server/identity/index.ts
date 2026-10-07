/**
 * The application's identity service — the single entry point for
 * authentication on the server. See `types.ts` for why app code must not reach
 * for better-auth directly.
 */

import { auth } from '../../auth';
import { createBetterAuthIdentity } from './better-auth/identity';

export * from './types';

export const identity = createBetterAuthIdentity(auth);
