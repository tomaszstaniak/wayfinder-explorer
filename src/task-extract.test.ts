import { describe, expect, it } from 'vitest';
import { extractTasks, statusFromChar } from './task-extract';

describe('statusFromChar', () => {
	it('maps the core statuses and falls back to other', () => {
		expect(statusFromChar(' ')).toBe('todo');
		expect(statusFromChar('x')).toBe('done');
		expect(statusFromChar('X')).toBe('done');
		expect(statusFromChar('/')).toBe('inProgress');
		expect(statusFromChar('-')).toBe('cancelled');
		expect(statusFromChar('?')).toBe('other');
	});
});

describe('extractTasks — basic', () => {
	it('extracts checkboxes with status, text, line, and raw', () => {
		const md = ['# Note', '- [ ] first', 'prose', '  - [x] second done'].join('\n');
		const tasks = extractTasks(md);
		expect(tasks).toHaveLength(2);
		expect(tasks[0]).toMatchObject({
			line: 1,
			raw: '- [ ] first',
			statusChar: ' ',
			status: 'todo',
			text: 'first',
		});
		expect(tasks[1]).toMatchObject({
			line: 3,
			raw: '  - [x] second done',
			statusChar: 'x',
			status: 'done',
			text: 'second done',
		});
	});

	it('ignores plain bullets and non-list lines', () => {
		expect(extractTasks('- a bullet\n* another\n1. numbered\nplain')).toEqual([]);
	});

	it('strips a trailing CR from raw', () => {
		const tasks = extractTasks('- [ ] windows\r\n- [/] going');
		expect(tasks[0]!.raw).toBe('- [ ] windows');
		expect(tasks[1]).toMatchObject({ statusChar: '/', status: 'inProgress', text: 'going' });
	});
});
