import { describe, expect, it } from 'vitest';
import type { IndexedTask } from './task-extract';
import { deriveView, normalizeFolderScope, OPEN_STATUSES, type DeriveConfig } from './task-filter';

const TODAY = '2026-07-15';

function t(p: Partial<IndexedTask> & { path: string; text: string }): IndexedTask {
	return {
		line: p.line ?? 0,
		raw: p.raw ?? `- [ ] ${p.text}`,
		statusChar: p.statusChar ?? ' ',
		status: p.status ?? 'todo',
		text: p.text,
		path: p.path,
		...(p.due ? { due: p.due } : {}),
		...(p.priority ? { priority: p.priority } : {}),
	};
}

function cfg(over: Partial<DeriveConfig> = {}): DeriveConfig {
	return {
		filters: { statuses: OPEN_STATUSES, ...over.filters },
		grouping: over.grouping ?? 'note',
		sort: over.sort ?? 'due',
		limit: over.limit ?? 200,
	};
}

describe('normalizeFolderScope', () => {
	it('trims whitespace and slashes; empty stays empty', () => {
		expect(normalizeFolderScope('  /Projects/A/ ')).toBe('Projects/A');
		expect(normalizeFolderScope('  /  ')).toBe('');
	});
});

describe('deriveView — filters', () => {
	it('keeps only open statuses by default (todo, inProgress, other), hides done/cancelled', () => {
		const tasks = [
			t({ path: 'a.md', text: 'todo', status: 'todo' }),
			t({ path: 'a.md', text: 'done', status: 'done', statusChar: 'x' }),
			t({ path: 'a.md', text: 'other', status: 'other', statusChar: '?' }),
			t({ path: 'a.md', text: 'cancelled', status: 'cancelled', statusChar: '-' }),
		];
		const view = deriveView(tasks, cfg(), TODAY);
		expect(view.total).toBe(2);
		expect(view.groups.flatMap((g) => g.tasks.map((x) => x.text)).sort()).toEqual(['other', 'todo']);
	});

	it('empty path scope means whole vault', () => {
		const tasks = [t({ path: 'Projects/A/x.md', text: 'a' }), t({ path: 'Other/y.md', text: 'b' })];
		const view = deriveView(tasks, cfg({ filters: { statuses: OPEN_STATUSES, pathScope: '  ' } }), TODAY);
		expect(view.total).toBe(2);
	});

	it('path scope is folder-boundary (A excludes Archive)', () => {
		const tasks = [t({ path: 'Projects/A/x.md', text: 'a' }), t({ path: 'Projects/Archive/y.md', text: 'b' })];
		const view = deriveView(tasks, cfg({ filters: { statuses: OPEN_STATUSES, pathScope: 'Projects/A' } }), TODAY);
		expect(view.total).toBe(1);
		expect(view.groups[0]!.tasks[0]!.text).toBe('a');
	});

	it('minPriority keeps only tasks at or above threshold', () => {
		const tasks = [
			t({ path: 'a.md', text: 'hi', priority: 'high' }),
			t({ path: 'a.md', text: 'lo', priority: 'low' }),
			t({ path: 'a.md', text: 'none' }),
		];
		const view = deriveView(tasks, cfg({ filters: { statuses: OPEN_STATUSES, minPriority: 'high' } }), TODAY);
		expect(view.total).toBe(1);
	});

	it('due=overdue keeps only past-due', () => {
		const tasks = [
			t({ path: 'a.md', text: 'over', due: '2026-07-14' }),
			t({ path: 'a.md', text: 'today', due: '2026-07-15' }),
		];
		const view = deriveView(tasks, cfg({ filters: { statuses: OPEN_STATUSES, due: 'overdue' } }), TODAY);
		expect(view.groups.flatMap((g) => g.tasks.map((x) => x.text))).toEqual(['over']);
	});

	it('text query matches task text or path, case-insensitively', () => {
		const tasks = [t({ path: 'Work/a.md', text: 'buy milk' }), t({ path: 'Home/b.md', text: 'call bank' })];
		const view = deriveView(tasks, cfg({ filters: { statuses: OPEN_STATUSES, text: 'WORK' } }), TODAY);
		expect(view.total).toBe(1);
		expect(view.groups[0]!.tasks[0]!.text).toBe('buy milk');
	});
});

describe('deriveView — grouping, order, cap', () => {
	it('groups by note (path asc) by default', () => {
		const tasks = [t({ path: 'b.md', text: 'x' }), t({ path: 'a.md', text: 'y' })];
		const view = deriveView(tasks, cfg(), TODAY);
		expect(view.groups.map((g) => g.key)).toEqual(['a.md', 'b.md']);
		expect(view.groups[0]!.label).toBe('a.md');
	});

	it('groups by due buckets in fixed order', () => {
		const tasks = [
			t({ path: 'a.md', text: 'later', due: '2026-08-30' }),
			t({ path: 'a.md', text: 'over', due: '2026-07-01' }),
			t({ path: 'a.md', text: 'today', due: '2026-07-15' }),
		];
		const view = deriveView(tasks, cfg({ grouping: 'due' }), TODAY);
		expect(view.groups.map((g) => g.label)).toEqual(['Overdue', 'Today', 'Later']);
	});

	it('caps matched ROWS and reports visibleCount/shown/total', () => {
		const tasks = [
			t({ path: 'a.md', text: '1' }),
			t({ path: 'a.md', text: '2' }),
			t({ path: 'b.md', text: '3' }),
		];
		const view = deriveView(tasks, cfg({ limit: 2 }), TODAY);
		expect(view.total).toBe(3);
		expect(view.shown).toBe(2);
		expect(view.groups).toHaveLength(1);
		expect(view.groups[0]!.visibleCount).toBe(2);
	});

	it('due sort places dated before undated with priority tiebreak', () => {
		const tasks = [
			t({ path: 'a.md', text: 'undated', priority: 'low' }),
			t({ path: 'a.md', text: 'dated', due: '2026-07-20' }),
		];
		const view = deriveView(tasks, cfg({ sort: 'due' }), TODAY);
		expect(view.groups[0]!.tasks.map((x) => x.text)).toEqual(['dated', 'undated']);
	});
});
