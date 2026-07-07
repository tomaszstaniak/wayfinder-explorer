import { describe, expect, it } from 'vitest';
import { isOpenTaskStatus, rollUpToFolders } from './task-count';

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
});
