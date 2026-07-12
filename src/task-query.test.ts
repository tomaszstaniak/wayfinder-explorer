import { describe, expect, it } from 'vitest';
import { TASKS_IN_NOTE_BLOCK, TASKS_DASHBOARD_BLOCK, blockInsertText } from './task-query';

describe('task-query — block content (locks Tasks 8.2.2 syntax)', () => {
	it('scopes the in-note block to the current file via a non-JS path placeholder', () => {
		expect(TASKS_IN_NOTE_BLOCK).toBe(
			['```tasks', 'not done', 'path includes {{query.file.path}}', '```'].join('\n')
		);
	});

	it('builds a lean vault dashboard block (grouped, sorted, capped, buttons hidden)', () => {
		expect(TASKS_DASHBOARD_BLOCK).toBe(
			[
				'```tasks',
				'not done',
				'group by path',
				'sort by priority',
				'sort by due',
				'limit 100',
				'short mode',
				'hide edit button',
				'hide postpone button',
				'hide backlinks',
				'```',
			].join('\n')
		);
	});
});

describe('task-query — blockInsertText', () => {
	it('adds no leading newline at the start of an empty line', () => {
		expect(blockInsertText('BLOCK', '')).toBe('BLOCK\n');
	});

	it('adds no leading newline when only whitespace precedes the cursor', () => {
		expect(blockInsertText('BLOCK', '   ')).toBe('BLOCK\n');
	});

	it('adds a leading newline when text precedes the cursor', () => {
		expect(blockInsertText('BLOCK', 'some text')).toBe('\nBLOCK\n');
	});
});
