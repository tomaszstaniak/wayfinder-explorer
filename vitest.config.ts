import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['src/**/*.test.ts'],
		environment: 'node',
		// SVG serialization tests opt into jsdom per-file via @vitest-environment
	},
});
