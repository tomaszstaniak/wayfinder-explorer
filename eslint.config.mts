import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import { globalIgnores, defineConfig } from 'eslint/config';

export default defineConfig(
	globalIgnores([
		'node_modules',
		'dist',
		'esbuild.config.mjs',
		'version-bump.mjs',
		'versions.json',
		'main.js',
		'package.json',
		'package-lock.json',
		'tsconfig.json',
	]),
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: ['eslint.config.mts', 'manifest.json', 'vitest.config.ts'],
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json'],
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		// Declarative settings (1.13+ settings search) is a store-submission
		// task, tracked for v2; the imperative tab is fine for a local v1.
		files: ['src/settings.ts'],
		rules: {
			'obsidianmd/settings-tab/prefer-setting-definitions': 'off',
		},
	},
	{
		// Obsidian runtime rules don't apply to tests (node/jsdom, not the app).
		files: ['src/**/*.test.ts'],
		rules: {
			'no-unsanitized/property': 'off',
			'obsidianmd/prefer-create-el': 'off',
			'obsidianmd/prefer-window-timers': 'off',
		},
	},
);
