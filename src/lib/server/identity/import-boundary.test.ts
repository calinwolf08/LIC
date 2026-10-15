/**
 * The identity boundary: only the identity layer may touch the auth provider.
 *
 * App code reaches authentication through `$lib/server/identity` (server) and
 * `$lib/identity-client` (browser). Importing better-auth — or the modules that
 * configure it, `$lib/auth` and `$lib/auth-client` — anywhere else would quietly
 * re-couple the app to the provider and make it expensive to replace. The repo
 * has no ESLint, so this test is the enforcement point.
 *
 * Test files are exempt: they exercise the adapter and the provider directly.
 */

import { readdirSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/** Source files (relative to `src/`, POSIX separators) allowed to import the provider. */
const ALLOWED_IMPORTERS: readonly (string | RegExp)[] = [
	'lib/auth.ts',
	'lib/auth-client.ts',
	'lib/identity-client.ts',
	'lib/server/identity/index.ts',
	/^lib\/server\/identity\/better-auth\//
];

/** Provider modules, as they appear after resolving `$lib` and relative specifiers. */
function isProviderModule(resolved: string): boolean {
	return (
		resolved === 'better-auth' ||
		resolved.startsWith('better-auth/') ||
		resolved === 'lib/auth' ||
		resolved === 'lib/auth-client'
	);
}

function isAllowedImporter(file: string): boolean {
	return ALLOWED_IMPORTERS.some((rule) =>
		typeof rule === 'string' ? rule === file : rule.test(file)
	);
}

function isTestFile(file: string): boolean {
	return /\.(test|spec)\.[jt]s$/.test(file);
}

function listSourceFiles(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) return listSourceFiles(full);
		return /\.(ts|js|svelte)$/.test(entry.name) ? [full] : [];
	});
}

/** Every module specifier in `import … from`, side-effect `import '…'` and `import('…')`. */
function importSpecifiers(source: string): string[] {
	const pattern = /(?:\bfrom\s*|\bimport\s*\(?\s*)['"]([^'"]+)['"]/g;
	return [...source.matchAll(pattern)].map((m) => m[1]);
}

/** Normalize a specifier to a `src/`-relative path without extension, or a bare package name. */
function resolveSpecifier(specifier: string, importerAbs: string): string {
	let target: string;
	if (specifier.startsWith('$lib/') || specifier === '$lib') {
		target = path.join(SRC, 'lib', specifier.slice('$lib'.length));
	} else if (specifier.startsWith('.')) {
		target = path.resolve(path.dirname(importerAbs), specifier);
	} else {
		return specifier;
	}
	return path
		.relative(SRC, target)
		.split(path.sep)
		.join('/')
		.replace(/\.(ts|js)$/, '');
}

function findViolations(): string[] {
	const violations: string[] = [];
	for (const abs of listSourceFiles(SRC)) {
		const file = path.relative(SRC, abs).split(path.sep).join('/');
		if (isTestFile(file) || isAllowedImporter(file)) continue;
		for (const specifier of importSpecifiers(readFileSync(abs, 'utf8'))) {
			if (isProviderModule(resolveSpecifier(specifier, abs))) {
				violations.push(`src/${file} imports '${specifier}'`);
			}
		}
	}
	return violations;
}

describe('identity import boundary', () => {
	it('keeps the auth provider behind the identity layer', () => {
		expect(
			findViolations(),
			'Use $lib/server/identity (server) or $lib/identity-client (browser) instead'
		).toEqual([]);
	});

	it('recognizes every way of naming a provider module', () => {
		const importer = path.join(SRC, 'routes', 'x', '+page.server.ts');
		expect(isProviderModule(resolveSpecifier('better-auth', importer))).toBe(true);
		expect(isProviderModule(resolveSpecifier('better-auth/svelte-kit', importer))).toBe(true);
		expect(isProviderModule(resolveSpecifier('$lib/auth', importer))).toBe(true);
		expect(isProviderModule(resolveSpecifier('$lib/auth-client', importer))).toBe(true);
		expect(isProviderModule(resolveSpecifier('../../lib/auth.ts', importer))).toBe(true);
		expect(isProviderModule(resolveSpecifier('$lib/server/identity', importer))).toBe(false);
		expect(isProviderModule(resolveSpecifier('$lib/auth-helpers', importer))).toBe(false);
	});

	it('finds specifiers in every import form', () => {
		const source = [
			"import { a } from 'better-auth';",
			'import type { B } from "$lib/auth";',
			"import '$lib/auth-client';",
			"const m = await import('better-auth/svelte');"
		].join('\n');
		expect(importSpecifiers(source)).toEqual([
			'better-auth',
			'$lib/auth',
			'$lib/auth-client',
			'better-auth/svelte'
		]);
	});
});
