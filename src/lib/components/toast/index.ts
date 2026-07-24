import { toast as sonnerToast } from 'svelte-sonner';

export { default as Toaster } from './toaster.svelte';

/**
 * App-wide toast helper. Thin wrapper over svelte-sonner so call sites are
 * decoupled from the underlying library.
 */
export const toast = {
	success: (message: string, description?: string) =>
		sonnerToast.success(message, description ? { description } : undefined),
	error: (message: string, description?: string) =>
		sonnerToast.error(message, description ? { description } : undefined),
	info: (message: string, description?: string) =>
		sonnerToast.info(message, description ? { description } : undefined),
	message: (message: string, description?: string) =>
		sonnerToast(message, description ? { description } : undefined)
};
