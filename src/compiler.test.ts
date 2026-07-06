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
		const { css } = compile(state(), fakeResolve, { counts });
		expect(css).not.toContain('::after { content:');
	});

	it('emits monospace count rules per folder when enabled', () => {
		const { css } = compile(
			state({ settings: { ...defaultData().settings, showFolderCounts: true } }),
			fakeResolve,
			{ counts }
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

describe('compile: appearance settings', () => {
	it('emits no appearance rules at defaults', () => {
		const { css } = compile(state(), fakeResolve);
		expect(css).not.toContain('--nav-indentation-guide-width');
		expect(css).not.toContain('margin-bottom:');
		expect(css).not.toContain('--nav-item-children-margin-start');
		expect(css).not.toContain('min-height:');
	});

	it('hides indent guides when disabled', () => {
		const { css } = compile(
			state({ settings: { ...defaultData().settings, showIndentGuides: false } }),
			fakeResolve
		);
		expect(css).toContain('--nav-indentation-guide-width: 0px');
	});

	it('emits root spacing, indentation, and item height when set', () => {
		const { css } = compile(
			state({
				settings: {
					...defaultData().settings,
					rootItemSpacing: 6,
					treeIndent: 24,
					itemHeight: 24,
				},
			}),
			fakeResolve
		);
		expect(css).toContain('> .tree-item { margin-bottom: 6px; }');
		expect(css).toContain('--nav-item-children-margin-start: 20px');
		expect(css).toContain('min-height: 24px; padding-top: 3px; padding-bottom: 3px');
		// 24 < 28 and scaleTextWithHeight defaults on -> font rule
		expect(css).toContain('font-size: min(var(--nav-item-size), 11px)');
	});

	it('omits the font rule when scaling is off or height is large', () => {
		const noScale = compile(
			state({ settings: { ...defaultData().settings, itemHeight: 24, scaleTextWithHeight: false } }),
			fakeResolve
		);
		expect(noScale.css).not.toContain('font-size: min(');
		const tall = compile(
			state({ settings: { ...defaultData().settings, itemHeight: 32 } }),
			fakeResolve
		);
		expect(tall.css).not.toContain('font-size: min(');
	});

	it('emits leaders sized to stop before each count', () => {
		const { css } = compile(
			state({
				settings: { ...defaultData().settings, showFolderCounts: true, leaderStyle: 'dots' },
			}),
			fakeResolve,
			{ counts: new Map([['A', 7], ['B', 128]]) }
		);
		expect(css).toContain('repeating-linear-gradient');
		expect(css).toContain('content: "7"; background-size: calc(100% - 3ch) 1px;');
		expect(css).toContain('content: "128"; background-size: calc(100% - 5ch) 1px;');
	});

	it('emits no leader without counts enabled', () => {
		const { css } = compile(
			state({ settings: { ...defaultData().settings, leaderStyle: 'dots' } }),
			fakeResolve,
			{ counts: new Map([['A', 7]]) }
		);
		expect(css).not.toContain('repeating-linear-gradient');
	});
});

describe('compile: content-detected icons', () => {
	const contentIcons = new Map<string, readonly string[]>([
		['Boards/roadmap.md', ['square-kanban', 'kanban']],
	]);

	it('emits content icon rules after suffix defaults so they win', () => {
		const { css } = compile(state(), fakeResolve, { contentIcons });
		const suffixRule = css.indexOf('[data-path$=".md" i]');
		const contentRule = css.indexOf('[data-path="Boards/roadmap.md"]');
		expect(contentRule).toBeGreaterThan(suffixRule);
		expect(css).toContain('data:fake/square-kanban');
	});

	it('lets manual file overrides win over content icons', () => {
		const { css } = compile(
			state({ files: { 'Boards/roadmap.md': { icon: 'star' } } }),
			fakeResolve,
			{ contentIcons }
		);
		const contentRule = css.indexOf('data:fake/square-kanban');
		const manualRule = css.indexOf('data:fake/star');
		expect(manualRule).toBeGreaterThan(contentRule);
	});

	it('falls back through candidates and reports missing ones', () => {
		const { css, missingIcons } = compile(state(), fakeResolve, {
			contentIcons: new Map([['a.md', ['gone-1', 'kanban'] as const]]),
		});
		expect(css).toContain('data:fake/kanban');
		expect(missingIcons).toContain('gone-1');
	});

	it('omits content icons when default file icons are disabled', () => {
		const { css } = compile(
			state({ settings: { ...defaultData().settings, defaultFileIcons: false } }),
			fakeResolve,
			{ contentIcons }
		);
		expect(css).not.toContain('square-kanban');
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
