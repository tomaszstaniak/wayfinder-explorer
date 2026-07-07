import { describe, expect, it } from 'vitest';
import { countOpenTasksInText, isOpenTaskStatus, rollUpToFolders } from './task-count';

describe('countOpenTasksInText', () => {
	it('counts only real open checkboxes, not bullets or done/cancelled', () => {
		const text = [
			'- [ ] open todo',
			'- [/] in progress',
			'- [x] done',
			'- [-] cancelled',
			'- plain bullet',
			'* another bullet',
			'  - [ ] indented open',
			'text with [ ] mid-line, not a task',
		].join('\n');
		expect(countOpenTasksInText(text)).toBe(3); // two [ ] + one [/]
	});
	it('returns 0 for prose and empty input', () => {
		expect(countOpenTasksInText('just a paragraph\n- a list\n')).toBe(0);
		expect(countOpenTasksInText('')).toBe(0);
	});
});

describe('isOpenTaskStatus', () => {
	it('counts todo and in-progress as open', () => {
		expect(isOpenTaskStatus(' ')).toBe(true);
		expect(isOpenTaskStatus('/')).toBe(true);
	});
	it('does not count done or cancelled', () => {
		expect(isOpenTaskStatus('x')).toBe(false);
		expect(isOpenTaskStatus('X')).toBe(false);
		expect(isOpenTaskStatus('-')).toBe(false);
	});
});

describe('rollUpToFolders', () => {
	it('sums each file into all its ancestor folders', () => {
		const per = new Map([
			['01 Projects/Alpha/todo.md', 3],
			['01 Projects/Beta/plan.md', 2],
			['02 Areas/health.md', 1],
		]);
		const folders = rollUpToFolders(per);
		expect(folders.get('01 Projects')).toBe(5);
		expect(folders.get('01 Projects/Alpha')).toBe(3);
		expect(folders.get('01 Projects/Beta')).toBe(2);
		expect(folders.get('02 Areas')).toBe(1);
	});
	it('skips files with zero and omits folders with no tasks', () => {
		const folders = rollUpToFolders(
			new Map([
				['A/x.md', 0],
				['A/y.md', 4],
			])
		);
		expect(folders.get('A')).toBe(4);
		expect(folders.has('A/x.md')).toBe(false);
	});
	it('ignores root-level files (no folder to attribute to)', () => {
		expect(rollUpToFolders(new Map([['loose.md', 2]])).size).toBe(0);
	});

	it('drops files under any excluded folder subtree', () => {
		const per = new Map([
			['01 Projects/Velvet Ledger/docs/a.md', 4193],
			['01 Projects/Velvet Ledger/notes.md', 2],
			['02 Areas/health.md', 9],
		]);
		const folders = rollUpToFolders(per, ['01 Projects/Velvet Ledger/docs']);
		// the symlinked docs subtree is gone from every ancestor...
		expect(folders.get('01 Projects/Velvet Ledger/docs')).toBeUndefined();
		// ...but sibling notes and other trees are untouched
		expect(folders.get('01 Projects/Velvet Ledger')).toBe(2);
		expect(folders.get('01 Projects')).toBe(2);
		expect(folders.get('02 Areas')).toBe(9);
	});
});
