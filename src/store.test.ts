import { describe, expect, it } from 'vitest';
import { Persistence, Store, normalizePath, parseData } from './store';
import { SCHEMA_VERSION, WayfinderData, defaultData } from './types';

function memoryPersistence(initial: unknown = null) {
	const saves: WayfinderData[] = [];
	const p: Persistence = {
		load: () => Promise.resolve(initial),
		save: (data) => {
			saves.push(JSON.parse(JSON.stringify(data)) as WayfinderData);
			return Promise.resolve();
		},
	};
	return { p, saves };
}

async function makeStore(initial: unknown = null) {
	const { p, saves } = memoryPersistence(initial);
	const store = new Store(p);
	await store.load();
	return { store, saves };
}

describe('parseData: signals', () => {
	it('drops rules with empty property or value, keeps valid ones', () => {
		const r = parseData({
			version: 1,
			signals: [
				{ id: 'a', enabled: true, property: '', equals: 'x', marker: '!' },
				{ id: 'b', enabled: true, property: 'state', equals: 'draft', textColor: '#112233' },
			],
		});
		expect(r.data.signals).toHaveLength(1);
		expect(r.data.signals[0]).toMatchObject({ id: 'b', property: 'state', equals: 'draft', textColor: '#112233' });
		expect(r.signalsRepaired).toBe(true);
	});

	it('drops one invalid channel but keeps the rule', () => {
		const r = parseData({
			version: 1,
			signals: [{ id: 'a', enabled: true, property: 'state', equals: 'draft', textColor: 'red', marker: '●' }],
		});
		expect(r.data.signals[0]?.textColor).toBeUndefined();
		expect(r.data.signals[0]?.marker).toBe('●');
	});

	it('drops a rule with zero valid channels', () => {
		const r = parseData({
			version: 1,
			signals: [{ id: 'a', enabled: true, property: 'state', equals: 'draft', textColor: 'nope' }],
		});
		expect(r.data.signals).toHaveLength(0);
	});

	it('rejects multiline and control-character markers', () => {
		const r = parseData({
			version: 1,
			signals: [{ id: 'a', enabled: true, property: 's', equals: 'v', marker: 'a\nb', iconColor: '#112233' }],
		});
		expect(r.data.signals[0]?.marker).toBeUndefined();
		expect(r.data.signals[0]?.iconColor).toBe('#112233');
	});

	it('rejects markers longer than 8 grapheme clusters', () => {
		const r = parseData({
			version: 1,
			signals: [{ id: 'a', enabled: true, property: 's', equals: 'v', marker: '123456789', iconColor: '#112233' }],
		});
		expect(r.data.signals[0]?.marker).toBeUndefined();
	});

	it('repairs missing/duplicate ids without colliding with a valid wf-signal-0', () => {
		const r = parseData({
			version: 1,
			signals: [
				{ id: 'wf-signal-0', enabled: true, property: 'a', equals: '1', marker: 'x' },
				{ enabled: true, property: 'b', equals: '2', marker: 'y' },
				{ id: 'wf-signal-0', enabled: true, property: 'c', equals: '3', marker: 'z' },
			],
		});
		const ids = r.data.signals.map((s) => s.id);
		expect(new Set(ids).size).toBe(3);
		expect(ids[0]).toBe('wf-signal-0');
		expect(r.signalsRepaired).toBe(true);
	});

	it('preserves original index for repair even after earlier drops', () => {
		const r = parseData({
			version: 1,
			signals: [
				{ id: 'x', enabled: true, property: '', equals: '', marker: 'bad' },
				{ enabled: true, property: 'b', equals: '2', marker: 'y' },
			],
		});
		expect(r.data.signals).toHaveLength(1);
		expect(r.data.signals[0]?.id).toBe('wf-signal-1');
	});

	it('defaults enabled to true when absent', () => {
		const r = parseData({ version: 1, signals: [{ id: 'a', property: 's', equals: 'v', marker: '●' }] });
		expect(r.data.signals[0]?.enabled).toBe(true);
	});

	it('ignores a non-array signals field', () => {
		const r = parseData({ version: 1, signals: { nope: true } });
		expect(r.data.signals).toEqual([]);
	});

	it('persists the normalized collection once when repaired on load', async () => {
		const { store, saves } = await makeStore({
			version: 1,
			signals: [{ enabled: true, property: 's', equals: 'v', marker: '●' }],
		});
		await store.flush();
		expect(saves).toHaveLength(1);
		expect(saves[0]?.signals[0]?.id).toBe('wf-signal-0');
	});

	it('does not persist when signals need no repair', async () => {
		const { store, saves } = await makeStore({
			version: 1,
			signals: [{ id: 'keep', enabled: true, property: 's', equals: 'v', marker: '●' }],
		});
		await store.flush();
		expect(saves).toHaveLength(0);
	});
});

describe('Store: signal mutations', () => {
	const base = (id: string): import('./types').SignalRule => ({
		id,
		enabled: true,
		property: 'state',
		equals: id,
		marker: '●',
	});

	it('adds, rejects empties/invalid, rejects duplicate ids, and persists', async () => {
		const { store, saves } = await makeStore();
		expect(store.addSignalRule(base('a'))).toBe(true);
		expect(store.addSignalRule({ ...base('b'), property: '  ' })).toBe(false); // normalizes to null
		expect(store.addSignalRule({ ...base('c'), marker: undefined })).toBe(false); // no channel
		expect(store.addSignalRule(base('a'))).toBe(false); // duplicate id
		expect(store.state.signals.map((r) => r.id)).toEqual(['a']);
		await store.flush();
		expect(saves[saves.length - 1]?.signals).toHaveLength(1);
	});

	it('normalizes channels through the shared validator on add', async () => {
		const { store } = await makeStore();
		store.addSignalRule({ ...base('a'), iconColor: '#ABCDEF', textColor: 'red' });
		expect(store.state.signals[0]?.iconColor).toBe('#abcdef');
		expect(store.state.signals[0]?.textColor).toBeUndefined();
	});

	it('updates a rule by id but never changes the id', async () => {
		const { store } = await makeStore();
		store.addSignalRule(base('a'));
		expect(store.updateSignalRule('a', { marker: '×' })).toBe(true);
		expect(store.state.signals[0]).toMatchObject({ id: 'a', marker: '×' });
		expect(store.updateSignalRule('missing', { marker: '!' })).toBe(false);
	});

	it('rejects an update that would make the rule invalid', async () => {
		const { store } = await makeStore();
		store.addSignalRule(base('a'));
		expect(store.updateSignalRule('a', { property: '' })).toBe(false);
		expect(store.state.signals[0]?.property).toBe('state');
	});

	it('moves rules within bounds', async () => {
		const { store } = await makeStore();
		store.addSignalRule(base('a'));
		store.addSignalRule(base('b'));
		expect(store.moveSignalRule('b', -1)).toBe(true);
		expect(store.state.signals.map((r) => r.id)).toEqual(['b', 'a']);
		expect(store.moveSignalRule('b', -1)).toBe(false);
	});

	it('duplicates after the original with a new id, rejecting a colliding new id', async () => {
		const { store } = await makeStore();
		store.addSignalRule(base('a'));
		store.addSignalRule(base('b'));
		expect(store.duplicateSignalRule('a', 'b')).toBe(false); // id collision
		expect(store.duplicateSignalRule('a', 'a2')).toBe(true);
		expect(store.state.signals.map((r) => r.id)).toEqual(['a', 'a2', 'b']);
	});

	it('removes and toggles enabled', async () => {
		const { store } = await makeStore();
		store.addSignalRule(base('a'));
		expect(store.setSignalRuleEnabled('a', false)).toBe(true);
		expect(store.state.signals[0]?.enabled).toBe(false);
		expect(store.removeSignalRule('a')).toBe(true);
		expect(store.state.signals).toHaveLength(0);
		expect(store.removeSignalRule('a')).toBe(false);
	});
});

describe('normalizePath', () => {
	it('normalizes separators and edges', () => {
		expect(normalizePath('/a/b/')).toBe('a/b');
		expect(normalizePath('a//b')).toBe('a/b');
		expect(normalizePath('  a/b  ')).toBe('a/b');
	});
	it('preserves backslashes in names (valid on macOS/Linux)', () => {
		expect(normalizePath('a\\b')).toBe('a\\b');
	});
	it('rejects unusable input', () => {
		expect(normalizePath('')).toBeNull();
		expect(normalizePath('/')).toBeNull();
		expect(normalizePath('.')).toBeNull();
		expect(normalizePath(42)).toBeNull();
	});
});

describe('parseData', () => {
	it('returns defaults for missing data', () => {
		const r = parseData(null);
		expect(r.data).toEqual(defaultData());
		expect(r.recovered).toBe(false);
		expect(r.warnings).toEqual([]);
	});

	it('recovers from a non-object top level', () => {
		const r = parseData('garbage');
		expect(r.data).toEqual(defaultData());
		expect(r.recovered).toBe(true);
		expect(r.warnings).toHaveLength(1);
	});

	it('defaults signals to an empty array', () => {
		const r = parseData(null);
		expect(r.data.signals).toEqual([]);
		expect(r.data.version).toBe(SCHEMA_VERSION);
	});

	it('rejects future versions instead of guessing', () => {
		const r = parseData({ version: 999, folders: { a: { color: '#112233' } } });
		expect(r.data.folders).toEqual({});
		expect(r.recovered).toBe(true);
	});

	it('migrates unversioned prototype data', () => {
		const r = parseData({ folders: { '/a/': { color: '#AABBCC' } } });
		expect(r.data.version).toBe(SCHEMA_VERSION);
		expect(r.data.folders).toEqual({ a: { color: '#aabbcc' } });
	});

	it('keeps null color (opt-out) and drops invalid colors and icons', () => {
		const r = parseData({
			version: 1,
			folders: {
				a: { color: null },
				b: { color: 'red' },
				c: { color: '#12345' },
				d: { icon: '' },
				e: { icon: 'gem', color: '#abcdef' },
				f: {},
			},
		});
		expect(r.data.folders).toEqual({
			a: { color: null },
			e: { icon: 'gem', color: '#abcdef' },
		});
		expect(r.warnings).toHaveLength(4); // b, c, d, f
	});

	it('ignores unknown fields and clamps settings', () => {
		const r = parseData({
			version: 1,
			someFutureField: true,
			settings: { tintStrength: 99, lineWidth: 0, defaultFileIcons: false, bogus: 1 },
		});
		expect(r.data.settings).toEqual({
			...defaultData().settings,
			defaultFileIcons: false,
			tintStrength: 25,
			lineWidth: 1,
		});
	});

	it('validates appearance settings with zero-as-default sentinels', () => {
		const r = parseData({
			version: 1,
			settings: {
				leaderStyle: 'dots',
				treeIndent: 3, // below min, non-zero -> clamps to min
				itemHeight: 0, // sentinel stays
				rootItemSpacing: 99,
				showIndentGuides: false,
			},
		});
		expect(r.data.settings.leaderStyle).toBe('dots');
		expect(r.data.settings.treeIndent).toBe(8);
		expect(r.data.settings.itemHeight).toBe(0);
		expect(r.data.settings.rootItemSpacing).toBe(24);
		expect(r.data.settings.showIndentGuides).toBe(false);
		const bogus = parseData({ version: 1, settings: { leaderStyle: 'zigzag' } });
		expect(bogus.data.settings.leaderStyle).toBe('none');
	});

	it('validates folderCountMode and falls back to items', () => {
		const notes = parseData({ version: 1, settings: { folderCountMode: 'notes' } });
		expect(notes.data.settings.folderCountMode).toBe('notes');
		const bogus = parseData({ version: 1, settings: { folderCountMode: 'bogus' } });
		expect(bogus.data.settings.folderCountMode).toBe('items');
	});

	it('validates emphasis and countBadge on folder entries', () => {
		const r = parseData({
			version: 1,
			folders: {
				a: { emphasis: 'dim' },
				b: { emphasis: 'normal', icon: 'x' },
				c: { emphasis: 'loud' },
				d: { countBadge: true },
				e: { countBadge: false },
			},
		});
		expect(r.data.folders).toEqual({
			a: { emphasis: 'dim' },
			b: { emphasis: 'normal', icon: 'x' },
			d: { countBadge: true },
		});
		expect(r.warnings).toHaveLength(2); // c, e
	});

	it('drops file entries without a valid icon', () => {
		const r = parseData({ version: 1, files: { 'a.md': { icon: 'star' }, 'b.md': {} } });
		expect(r.data.files).toEqual({ 'a.md': { icon: 'star' } });
	});
});

describe('Store mutations', () => {
	it('sets, overrides, opts out, and inherits folder color', async () => {
		const { store } = await makeStore();
		expect(store.setFolderColor('A', '#A78BFA')).toBe(true);
		expect(store.state.folders['A']).toEqual({ color: '#a78bfa' });
		expect(store.setFolderColor('A/B', null)).toBe(true);
		expect(store.state.folders['A/B']).toEqual({ color: null });
		expect(store.inheritFolderColor('A/B')).toBe(true);
		expect(store.state.folders['A/B']).toBeUndefined(); // empty entry removed
	});

	it('rejects invalid colors and paths without mutating', async () => {
		const { store, saves } = await makeStore();
		expect(store.setFolderColor('A', 'red')).toBe(false);
		expect(store.setFolderColor('', '#112233')).toBe(false);
		expect(store.setFolderIcon('A', '  ')).toBe(false);
		await store.flush();
		expect(saves).toHaveLength(0);
	});

	it('is a no-op when the value is unchanged', async () => {
		const { store, saves } = await makeStore();
		store.setFolderColor('A', '#112233');
		expect(store.setFolderColor('A', '#112233')).toBe(false);
		await store.flush();
		expect(saves).toHaveLength(1);
	});

	it('keeps icon when color is removed and vice versa', async () => {
		const { store } = await makeStore();
		store.setFolderColor('A', '#112233');
		store.setFolderIcon('A', 'gem');
		store.inheritFolderColor('A');
		expect(store.state.folders['A']).toEqual({ icon: 'gem' });
		store.removeFolderIcon('A');
		expect(store.state.folders['A']).toBeUndefined();
	});

	it('manages emphasis, count badges, and preset merging', async () => {
		const { store } = await makeStore();
		expect(store.setFolderEmphasis('A', 'dim')).toBe(true);
		expect(store.state.folders['A']).toEqual({ emphasis: 'dim' });
		expect(store.setFolderEmphasis('A/B', 'normal')).toBe(true);
		expect(store.setFolderEmphasis('A/B', null)).toBe(true);
		expect(store.state.folders['A/B']).toBeUndefined();
		expect(store.setFolderEmphasis('A/B', null)).toBe(false);

		expect(store.setFolderCountBadge('Inbox', true)).toBe(true);
		expect(store.state.folders['Inbox']).toEqual({ countBadge: true });
		expect(store.setFolderCountBadge('Inbox', false)).toBe(true);
		expect(store.state.folders['Inbox']).toBeUndefined();
		expect(store.setFolderCountBadge('Inbox', false)).toBe(false);

		// preset merge keeps existing props it doesn't set
		store.setFolderIcon('P', 'star');
		expect(store.applyPresetEntry('P', { color: '#d96a4b', icon: 'target' })).toBe(true);
		expect(store.state.folders['P']).toEqual({ color: '#d96a4b', icon: 'target' });
	});

	it('manages file icons', async () => {
		const { store } = await makeStore();
		expect(store.setFileIcon('/n.md', 'alarm-clock')).toBe(true);
		expect(store.state.files['n.md']).toEqual({ icon: 'alarm-clock' });
		expect(store.removeFileIcon('n.md')).toBe(true);
		expect(store.removeFileIcon('n.md')).toBe(false);
		expect(store.state.files['n.md']).toBeUndefined();
	});

	it('clamps settings updates', async () => {
		const { store } = await makeStore();
		expect(store.updateSettings({ tintStrength: 500, lineWidth: -3 })).toBe(true);
		expect(store.state.settings.tintStrength).toBe(25);
		expect(store.state.settings.lineWidth).toBe(1);
		expect(store.updateSettings({})).toBe(false);
	});
});

describe('Store rename/delete', () => {
	async function seeded() {
		const { store, saves } = await makeStore();
		store.setFolderColor('A', '#111111');
		store.setFolderColor('A/B', '#222222');
		store.setFolderColor('AB', '#333333'); // prefix lookalike
		store.setFileIcon('A/B/n.md', 'star');
		store.setFileIcon('AB/x.md', 'star');
		return { store, saves };
	}

	it('renames a file key exactly', async () => {
		const { store } = await seeded();
		expect(store.handleRename('A/B/n.md', 'A/B/renamed.md')).toBe(true);
		expect(store.state.files['A/B/renamed.md']).toEqual({ icon: 'star' });
		expect(store.state.files['A/B/n.md']).toBeUndefined();
	});

	it('renames a folder and rewrites all descendant keys in both maps', async () => {
		const { store } = await seeded();
		expect(store.handleRename('A', 'Z')).toBe(true);
		expect(store.state.folders['Z']).toEqual({ color: '#111111' });
		expect(store.state.folders['Z/B']).toEqual({ color: '#222222' });
		expect(store.state.files['Z/B/n.md']).toEqual({ icon: 'star' });
		// lookalikes untouched
		expect(store.state.folders['AB']).toEqual({ color: '#333333' });
		expect(store.state.files['AB/x.md']).toEqual({ icon: 'star' });
	});

	it('handles a move (rename with new parent)', async () => {
		const { store } = await seeded();
		store.handleRename('A/B', 'C/D/B');
		expect(store.state.folders['C/D/B']).toEqual({ color: '#222222' });
		expect(store.state.files['C/D/B/n.md']).toEqual({ icon: 'star' });
		expect(store.state.folders['A']).toEqual({ color: '#111111' });
	});

	it('is a no-op for unknown paths', async () => {
		const { store, saves } = await seeded();
		await store.flush();
		const before = saves.length;
		expect(store.handleRename('Nope', 'StillNope')).toBe(false);
		expect(store.handleDelete('Nope')).toBe(false);
		await store.flush();
		expect(saves.length).toBe(before);
	});

	it('deletes a folder with all descendants, sparing lookalikes', async () => {
		const { store } = await seeded();
		expect(store.handleDelete('A')).toBe(true);
		expect(store.state.folders).toEqual({ AB: { color: '#333333' } });
		expect(store.state.files).toEqual({ 'AB/x.md': { icon: 'star' } });
	});
});

describe('Store persistence behavior', () => {
	it('serializes saves in mutation order', async () => {
		const order: number[] = [];
		let n = 0;
		const gate: Array<() => void> = [];
		const store = new Store({
			load: () => Promise.resolve(null),
			save: () => {
				const id = ++n;
				return new Promise<void>((resolve) => {
					gate.push(() => {
						order.push(id);
						resolve();
					});
				});
			},
		});
		await store.load();
		const drain = () => new Promise<void>((r) => setTimeout(r, 0));
		store.setFolderColor('A', '#111111');
		store.setFolderColor('A', '#222222');
		store.setFolderColor('A', '#333333');
		// Only one save may ever be in flight, however long we wait.
		await drain();
		expect(gate).toHaveLength(1);
		gate.shift()!();
		await drain();
		expect(gate).toHaveLength(1);
		gate.shift()!();
		await drain();
		expect(gate).toHaveLength(1);
		gate.shift()!();
		await store.flush();
		expect(order).toEqual([1, 2, 3]);
	});

	it('reports save failures and keeps working', async () => {
		let fail = true;
		const errors: unknown[] = [];
		const saved: WayfinderData[] = [];
		const store = new Store({
			load: () => Promise.resolve(null),
			save: (d) => {
				if (fail) return Promise.reject(new Error('disk full'));
				saved.push(d);
				return Promise.resolve();
			},
		});
		store.onSaveError = (e) => errors.push(e);
		await store.load();
		store.setFolderColor('A', '#111111');
		await store.flush();
		expect(errors).toHaveLength(1);
		fail = false;
		store.setFolderColor('A', '#222222');
		await store.flush();
		expect(saved).toHaveLength(1);
		expect(saved[0]!.folders['A']).toEqual({ color: '#222222' });
	});

	it('collects load warnings instead of throwing', async () => {
		const store = new Store({
			load: () => Promise.reject(new Error('corrupt')),
			save: () => Promise.resolve(),
		});
		await store.load();
		expect(store.loadWarnings).toHaveLength(1);
		expect(store.state).toEqual(defaultData());
	});

	it('notifies subscribers once per mutation', async () => {
		const { store } = await makeStore();
		let calls = 0;
		store.subscribe(() => calls++);
		store.setFolderColor('A', '#111111');
		store.setFolderColor('A', '#111111'); // no-op
		store.handleDelete('A');
		expect(calls).toBe(2);
	});
});
