import { describe, expect, it } from 'vitest';
import { Controller, ControllerDeps } from './controller';
import { Persistence, Store } from './store';

function harness(initialData: unknown = null, opts: { failSave?: boolean } = {}) {
	const saves: unknown[] = [];
	const persistence: Persistence = {
		load: () => Promise.resolve(initialData),
		save: (d) => {
			if (opts.failSave) return Promise.reject(new Error('nope'));
			saves.push(JSON.parse(JSON.stringify(d)));
			return Promise.resolve();
		},
	};
	const store = new Store(persistence);
	const cssHistory: string[] = [];
	const warnings: string[] = [];
	const notices: string[] = [];
	const scheduled: Array<() => void> = [];
	const counts = new Map<string, number>();
	const deps: ControllerDeps = {
		store,
		resolve: (name) => (name.startsWith('gone') ? null : `url("data:fake/${name}")`),
		hostData: () => (store.state.settings.showFolderCounts ? { counts } : {}),
		setCss: (css) => cssHistory.push(css),
		warn: (m) => warnings.push(m),
		notify: (m) => notices.push(m),
		schedule: (fn) => scheduled.push(fn),
	};
	const controller = new Controller(deps);
	const runScheduled = () => {
		while (scheduled.length) scheduled.shift()!();
	};
	return { controller, store, cssHistory, warnings, notices, scheduled, runScheduled, saves, counts };
}

describe('Controller', () => {
	it('compiles once on start', async () => {
		const h = harness();
		await h.controller.start();
		expect(h.cssHistory).toHaveLength(1);
		expect(h.cssHistory[0]).toContain('file-explorer');
	});

	it('surfaces invalid stored data as warnings plus one notice', async () => {
		const h = harness({ version: 1, folders: { a: { color: 'red' } } });
		await h.controller.start();
		expect(h.warnings.some((w) => w.includes('dropped invalid folder entry'))).toBe(true);
		expect(h.notices).toHaveLength(1);
	});

	it('coalesces a burst of mutations into one recompile', async () => {
		const h = harness();
		await h.controller.start();
		h.store.setFolderColor('A', '#111111');
		h.store.setFolderColor('B', '#222222');
		h.store.setFileIcon('n.md', 'star');
		expect(h.cssHistory).toHaveLength(1); // nothing yet, all pending
		expect(h.scheduled).toHaveLength(1); // one scheduled recompile, not three
		h.runScheduled();
		expect(h.cssHistory).toHaveLength(2);
		expect(h.cssHistory[1]).toContain('#111111');
		expect(h.cssHistory[1]).toContain('#222222');
		expect(h.cssHistory[1]).toContain('data:fake/star');
	});

	it('recompiles after rename and delete, and persists in order', async () => {
		const h = harness();
		await h.controller.start();
		h.store.setFolderColor('A', '#111111');
		h.runScheduled();
		h.controller.handleRename('A', 'Z');
		h.runScheduled();
		expect(h.cssHistory.at(-1)).toContain('[data-path="Z"]');
		expect(h.cssHistory.at(-1)).not.toContain('[data-path="A"]');
		h.controller.handleDelete('Z');
		h.runScheduled();
		expect(h.cssHistory.at(-1)).not.toContain('#111111');
		await h.store.flush();
		const last = h.saves.at(-1) as { folders: Record<string, unknown> };
		expect(last.folders).toEqual({});
	});

	it('ignores rename/delete of unconfigured paths without recompiling', async () => {
		const h = harness();
		await h.controller.start();
		h.controller.handleRename('nope', 'still-nope');
		h.controller.handleDelete('nope');
		expect(h.scheduled).toHaveLength(0);
		expect(h.cssHistory).toHaveLength(1);
	});

	it('warns once per missing icon across recompiles', async () => {
		const h = harness();
		await h.controller.start();
		h.store.setFileIcon('a.md', 'gone-icon');
		h.runScheduled();
		h.store.setFileIcon('b.md', 'gone-icon');
		h.runScheduled();
		const missing = h.warnings.filter((w) => w.includes('gone-icon'));
		expect(missing).toHaveLength(1);
	});

	it('includes folder counts only when the setting is on', async () => {
		const h = harness();
		await h.controller.start();
		h.counts.set('A', 7);
		h.controller.requestRecompile();
		h.runScheduled();
		expect(h.cssHistory.at(-1)).not.toContain('content: "7"');
		h.store.updateSettings({ showFolderCounts: true });
		h.runScheduled();
		expect(h.cssHistory.at(-1)).toContain('[data-path="A"]::after { content: "7"; }');
	});

	it('notifies on save failure and keeps compiling', async () => {
		const h = harness(null, { failSave: true });
		await h.controller.start();
		h.store.setFolderColor('A', '#111111');
		h.runScheduled();
		await h.store.flush();
		expect(h.notices.some((n) => n.includes('saving settings failed'))).toBe(true);
		expect(h.cssHistory.at(-1)).toContain('#111111');
	});
});
