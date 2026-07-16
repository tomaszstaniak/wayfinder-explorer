// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { ExtractedTask } from './task-extract';
import { renderTaskRow, renderGroupedTasks } from './task-view';

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

describe('renderTaskRow — row content & interactivity', () => {
	it('checks the checkbox only for done tasks', () => {
		const open = renderTaskRow(document, task({ text: 'open' }), handlers);
		const done = renderTaskRow(
			document,
			task({ text: 'closed', status: 'done', statusChar: 'x' }),
			handlers
		);
		expect(open.querySelector<HTMLInputElement>('input.wayfinder-task-checkbox')!.checked).toBe(
			false
		);
		expect(done.querySelector<HTMLInputElement>('input.wayfinder-task-checkbox')!.checked).toBe(
			true
		);
	});

	it('shows due and a capitalized priority label only when present', () => {
		const dated = renderTaskRow(
			document,
			task({ text: 'dated', due: '2026-07-10', priority: 'high' }),
			handlers
		);
		const plain = renderTaskRow(document, task({ text: 'plain' }), handlers);
		expect(dated.querySelector('.wayfinder-task-due')!.textContent).toBe('2026-07-10');
		expect(dated.querySelector('.wayfinder-task-priority')!.textContent).toBe('High');
		expect(plain.querySelector('.wayfinder-task-chip')).toBeNull();
	});

	it('renders the task text as a keyboard-focusable button role', () => {
		const row = renderTaskRow(document, task({ text: 'clickable' }), handlers);
		const btn = row.querySelector('.wayfinder-task-text')!;
		expect(btn.getAttribute('role')).toBe('button');
		expect(btn.getAttribute('tabindex')).toBe('0');
	});

	it('invokes onJump on click and on Enter', () => {
		const onJump = vi.fn();
		const tk = task({ text: 'go' });
		const row = renderTaskRow(document, tk, { onToggle: vi.fn(), onJump });
		const textEl = row.querySelector<HTMLElement>('.wayfinder-task-text')!;
		textEl.click();
		textEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
		expect(onJump).toHaveBeenCalledTimes(2);
		expect(onJump).toHaveBeenCalledWith(tk);
	});

	it('invokes onToggle when the checkbox is clicked', () => {
		const onToggle = vi.fn();
		const tk = task({ text: 'toggle me' });
		const row = renderTaskRow(document, tk, { onToggle, onJump: vi.fn() });
		row.querySelector<HTMLInputElement>('input.wayfinder-task-checkbox')!.click();
		expect(onToggle).toHaveBeenCalledTimes(1);
		expect(onToggle).toHaveBeenCalledWith(tk);
	});

	it('renders a recurrence control (not a checkbox) for recurring tasks and calls onRecurring', () => {
		const onRecurring = vi.fn();
		const onToggle = vi.fn();
		const tk = { ...task({ text: 'weekly' }), recurring: true };
		const row = renderTaskRow(document, tk, { onToggle, onJump: vi.fn(), onRecurring });
		expect(row.querySelector('input.wayfinder-task-checkbox')).toBeNull();
		const rec = row.querySelector<HTMLElement>('.wayfinder-task-recurring')!;
		rec.click();
		expect(onRecurring).toHaveBeenCalledWith(tk);
		expect(onToggle).not.toHaveBeenCalled();
	});
});

describe('renderTaskRow — source chip', () => {
	it('omits the source chip when no sourceLabel is given', () => {
		const row = renderTaskRow(document, task({ text: 'a' }), { onToggle: vi.fn(), onJump: vi.fn() });
		expect(row.querySelector('.wayfinder-task-source')).toBeNull();
	});

	it('renders a source chip with basename text and full-path title', () => {
		const row = renderTaskRow(
			document,
			task({ text: 'a' }),
			{ onToggle: vi.fn(), onJump: vi.fn() },
			{ sourceLabel: 'Note.md', sourceTitle: 'Projects/Note.md' }
		);
		const chip = row.querySelector('.wayfinder-task-source')!;
		expect(chip.textContent).toBe('Note.md');
		expect(chip.getAttribute('title')).toBe('Projects/Note.md');
	});
});

describe('renderGroupedTasks', () => {
	it('renders each group header with its label and count, then rows', () => {
		const container = document.createElement('div');
		renderGroupedTasks(
			container,
			[
				{ key: 'g1', label: 'Group One', count: 2, tasks: [task({ text: 'a' }), task({ text: 'b' })] },
				{ key: 'g2', label: 'Group Two', count: 1, tasks: [task({ text: 'c' })] },
			],
			{ onToggle: vi.fn(), onJump: vi.fn() }
		);
		const headers = Array.from(container.querySelectorAll('.wayfinder-task-group-header'));
		expect(headers.map((h) => h.querySelector('.wayfinder-task-group-label')!.textContent)).toEqual([
			'Group One',
			'Group Two',
		]);
		expect(headers.map((h) => h.querySelector('.wayfinder-task-group-count')!.textContent)).toEqual([
			'2',
			'1',
		]);
		expect(container.querySelectorAll('.wayfinder-task-row')).toHaveLength(3);
	});
});
