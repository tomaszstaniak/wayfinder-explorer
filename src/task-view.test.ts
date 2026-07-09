// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { ExtractedTask } from './task-extract';
import { renderTaskList } from './task-view';

// Build a valid ExtractedTask; `raw` is derived from statusChar so fixtures
// stay internally consistent (no stale "- [ ]" on a done task).
function task(p: Partial<ExtractedTask> & { text: string }): ExtractedTask {
	const statusChar = p.statusChar ?? ' ';
	return {
		line: p.line ?? 0,
		statusChar,
		status: p.status ?? 'todo',
		text: p.text,
		raw: p.raw ?? `- [${statusChar}] ${p.text}`,
		...(p.due ? { due: p.due } : {}),
		...(p.priority ? { priority: p.priority } : {}),
	};
}

const handlers = { onToggle: vi.fn(), onJump: vi.fn() };

describe('renderTaskList — structure', () => {
	it('renders non-empty groups in fixed order with labels and counts', () => {
		const container = document.createElement('div');
		renderTaskList(
			container,
			[
				task({ text: 'a', status: 'done', statusChar: 'x' }),
				task({ text: 'b', status: 'todo' }),
				task({ text: 'c', status: 'todo' }),
			],
			handlers
		);
		const groups = [...container.querySelectorAll('.wayfinder-task-group')];
		expect(groups).toHaveLength(2);
		// todo group comes before done group
		const labels = groups.map((g) => g.querySelector('.wayfinder-task-group-label')!.textContent);
		expect(labels).toEqual(['Todo', 'Done']);
		const counts = groups.map((g) => g.querySelector('.wayfinder-task-group-count')!.textContent);
		expect(counts).toEqual(['2', '1']);
	});

	it('renders one row per task with its text', () => {
		const container = document.createElement('div');
		renderTaskList(container, [task({ text: 'first' }), task({ text: 'second' })], handlers);
		const rows = [...container.querySelectorAll('.wayfinder-task-row')];
		expect(rows.map((r) => r.querySelector('.wayfinder-task-text')!.textContent)).toEqual([
			'first',
			'second',
		]);
	});

	it('renders the task text as a keyboard-focusable button', () => {
		const container = document.createElement('div');
		renderTaskList(container, [task({ text: 'clickable' })], handlers);
		const btn = container.querySelector('.wayfinder-task-text')!;
		expect(btn.tagName).toBe('BUTTON');
		expect(btn.getAttribute('type')).toBe('button');
	});

	it('checks the checkbox only for done tasks', () => {
		const container = document.createElement('div');
		renderTaskList(
			container,
			[task({ text: 'open' }), task({ text: 'closed', status: 'done', statusChar: 'x' })],
			handlers
		);
		const boxes = [...container.querySelectorAll<HTMLInputElement>('input.wayfinder-task-checkbox')];
		expect(boxes.map((b) => b.checked)).toEqual([false, true]);
	});

	it('shows due and a capitalized priority label only when present', () => {
		const container = document.createElement('div');
		renderTaskList(
			container,
			[task({ text: 'dated', due: '2026-07-10', priority: 'high' }), task({ text: 'plain' })],
			handlers
		);
		const rows = [...container.querySelectorAll('.wayfinder-task-row')];
		expect(rows[0]!.querySelector('.wayfinder-task-due')!.textContent).toBe('2026-07-10');
		expect(rows[0]!.querySelector('.wayfinder-task-priority')!.textContent).toBe('High');
		expect(rows[1]!.querySelector('.wayfinder-task-chip')).toBeNull();
	});
});
