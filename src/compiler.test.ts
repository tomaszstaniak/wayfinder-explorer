import { describe, expect, it } from 'vitest';
import { compile } from './compiler';
import { WayfinderData, defaultData } from './types';

const fakeResolve = (name: string): string | null =>
	name.startsWith('gone') ? null : `url("data:fake/${name}")`;

function state(patch: Partial<WayfinderData> = {}): WayfinderData {
	return { ...defaultData(), ...patch };
}

describe('compile: scoping and defaults', () => {
	it('roots every selector under the file-explorer leaf', () => {
		const { css } = compile(
			state({ folders: { A: { color: '#112233', icon: 'gem' } }, files: { 'n.md': { icon: 'star' } } }),
			fakeResolve
		);
		for (const line of css.split('\n')) {
			const trimmed = line.trim();
			if (trimmed === '' || trimmed.startsWith('\t') || /^[}]/.test(trimmed)) continue;
			if (!trimmed.includes('{')) continue;
			expect(trimmed).toContain('.workspace-leaf-content[data-type="file-explorer"]');
		}
	});

	it('emits default folder and file icon rules', () => {
		const { css } = compile(state(), fakeResolve);
		expect(css).toContain('data:fake/folder');
		expect(css).toContain('data:fake/file');
		expect(css).toContain('data:fake/file-text');
		expect(css).toContain('[data-path$=".pdf" i]');
	});

	it('emits longer suffixes after shorter ones so they win', () => {
		const { css } = compile(state(), fakeResolve);
		const md = css.indexOf('[data-path$=".md" i]');
		const excalidraw = css.indexOf('[data-path$=".excalidraw.md" i]');
		expect(md).toBeGreaterThan(-1);
		expect(excalidraw).toBeGreaterThan(md);
	});

	it('omits default layers when disabled, keeping manual overrides', () => {
		const { css } = compile(
			state({
				settings: { ...defaultData().settings, defaultFileIcons: false, defaultFolderIcons: false },
				files: { 'n.md': { icon: 'star' } },
			}),
			fakeResolve
		);
		expect(css).not.toContain('data:fake/folder');
		expect(css).not.toContain('[data-path$=');
		expect(css).toContain('data:fake/star');
	});

	it('uses the first available candidate for multi-candidate suffixes', () => {
		const resolve = (name: string) => (name === 'file-type' ? null : `url("data:fake/${name}")`);
		const { css, missingIcons } = compile(state(), resolve);
		const pdfRule = css.split('\n').find((l) => l.includes('".pdf" i'));
		expect(pdfRule).toContain('data:fake/file-text');
		expect(missingIcons).toContain('file-type');
	});
});

describe('compile: color scopes', () => {
	const base = {
		folders: {
			A: { color: '#111111' },
			'A/B': { color: '#222222' },
			'A/B/C': { color: null },
		},
	};

	it('emits wash, title, and main line per scope', () => {
		const { css } = compile(state(base), fakeResolve);
		expect(css).toContain('[data-path="A"], [data-path^="A/"]');
		expect(css).toContain('color-mix(in srgb, #111111 9%, transparent)');
		expect(css).toContain('color-mix(in srgb, #111111 80%, var(--text-normal))');
		expect(css).toContain(
			'.nav-folder:has(> .nav-folder-title[data-path="A"]) > .nav-folder-children'
		);
		expect(css).toContain('2px solid color-mix(in srgb, #111111 75%, transparent)');
	});

	it('orders scopes shallowest first so deeper overrides win', () => {
		const { css } = compile(state(base), fakeResolve);
		const a = css.indexOf('#111111 9%');
		const b = css.indexOf('#222222 9%');
		const optOut = css.indexOf('background-color: transparent');
		expect(a).toBeGreaterThan(-1);
		expect(b).toBeGreaterThan(a);
		expect(optOut).toBeGreaterThan(b);
	});

	it('emits only a neutral wash for opt-out scopes', () => {
		const { css } = compile(state({ folders: { 'A/B/C': { color: null } } }), fakeResolve);
		expect(css).toContain('background-color: transparent');
		expect(css).not.toContain('[data-path="A/B/C"] { color:');
		expect(css).not.toContain(':has(> .nav-folder-title[data-path="A/B/C"])');
	});

	it('guards rows against active/focus/drag states', () => {
		const { css } = compile(state({ folders: { A: { color: '#111111' } } }), fakeResolve);
		const washRule = css.split('\n').find((l) => l.includes('#111111 9%'));
		expect(washRule).toContain(':not(.is-active)');
		expect(washRule).toContain(':not(.has-focus)');
		expect(washRule).toContain(':not(.is-being-dragged)');
	});

	it('skips the wash at tint 0 but keeps title and line', () => {
		const { css } = compile(
			state({
				folders: { A: { color: '#111111' } },
				settings: { ...defaultData().settings, tintStrength: 0 },
			}),
			fakeResolve
		);
		expect(css).not.toContain('#111111 0%');
		expect(css).toContain('#111111 80%');
		expect(css).toContain('#111111 75%');
	});

	it('respects lineWidth setting', () => {
		const { css } = compile(
			state({
				folders: { A: { color: '#111111' } },
				settings: { ...defaultData().settings, lineWidth: 3 },
			}),
			fakeResolve
		);
		expect(css).toContain('3px solid');
	});
});

describe('compile: escaping and robustness', () => {
	it('escapes quotes and backslashes in paths', () => {
		const { css } = compile(
			state({ folders: { 'we"ird\\name': { color: '#111111' } } }),
			fakeResolve
		);
		expect(css).toContain('[data-path="we\\"ird\\\\name"]');
	});

	it('passes emoji and Unicode paths through', () => {
		const { css } = compile(state({ folders: { '🚀 Projekty': { color: '#111111' } } }), fakeResolve);
		expect(css).toContain('[data-path="🚀 Projekty"]');
	});

	it('skips unknown icons but keeps compiling and reports them', () => {
		const { css, missingIcons } = compile(
			state({
				folders: { A: { icon: 'gone-icon', color: '#111111' } },
				files: { 'n.md': { icon: 'star' } },
			}),
			fakeResolve
		);
		expect(missingIcons).toEqual(['gone-icon']);
		expect(css).toContain('#111111');
		expect(css).toContain('data:fake/star');
	});

	it('is deterministic regardless of insertion order', () => {
		const a = compile(
			state({ folders: { B: { color: '#222222' }, A: { color: '#111111' } } }),
			fakeResolve
		);
		const b = compile(
			state({ folders: { A: { color: '#111111' }, B: { color: '#222222' } } }),
			fakeResolve
		);
		expect(a.css).toBe(b.css);
	});
});

describe('compile: folder counts', () => {
	const counts = new Map([
		['B', 12],
		['A', 3],
		['A/we"ird', 5],
	]);

	it('emits nothing without the setting even when counts are provided', () => {
		const { css } = compile(state(), fakeResolve, counts);
		expect(css).not.toContain('::after { content:');
	});

	it('emits monospace count rules per folder when enabled', () => {
		const { css } = compile(
			state({ settings: { ...defaultData().settings, showFolderCounts: true } }),
			fakeResolve,
			counts
		);
		expect(css).toContain('font-family: var(--font-monospace);');
		expect(css).toContain('[data-path="A"]::after { content: "3"; }');
		expect(css).toContain('[data-path="B"]::after { content: "12"; }');
		expect(css).toContain('[data-path="A/we\\"ird"]::after { content: "5"; }');
		// deterministic: sorted by path
		expect(css.indexOf('content: "3"')).toBeLessThan(css.indexOf('content: "12"'));
	});

	it('emits nothing when enabled but counts are unavailable', () => {
		const { css } = compile(
			state({ settings: { ...defaultData().settings, showFolderCounts: true } }),
			fakeResolve
		);
		expect(css).not.toContain('::after { content:');
	});
});

describe('compile: performance guard', () => {
	it('compiles 500 color roots and 1000 icon overrides quickly', () => {
		const folders: WayfinderData['folders'] = {};
		const files: WayfinderData['files'] = {};
		for (let i = 0; i < 500; i++) {
			folders[`Area ${Math.floor(i / 25)}/Folder ${i}`] = {
				color: `#${(i * 33025).toString(16).padStart(6, '0').slice(0, 6)}`,
				icon: `icon-${i % 40}`,
			};
		}
		for (let i = 0; i < 1000; i++) {
			files[`Area ${Math.floor(i / 50)}/note-${i}.md`] = { icon: `icon-${i % 40}` };
		}
		const start = performance.now();
		const { css } = compile(state({ folders, files }), fakeResolve);
		const ms = performance.now() - start;
		expect(css.length).toBeGreaterThan(100_000);
		// Deliberately generous threshold; guards regressions, not micro-perf.
		expect(ms).toBeLessThan(500);
	});
});
