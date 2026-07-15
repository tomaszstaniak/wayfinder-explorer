import type { ExtractedTask, TaskStatus } from './task-extract';
import type { Priority } from './task-parser';

export interface TaskViewHandlers<T extends ExtractedTask = ExtractedTask> {
	onToggle(task: T): void;
	onJump(task: T): void;
}

export interface RenderGroup<T extends ExtractedTask = ExtractedTask> {
	key: string;
	label: string;
	count: number;
	tasks: readonly T[];
}

const GROUP_ORDER: ReadonlyArray<{ status: TaskStatus; label: string }> = [
	{ status: 'todo', label: 'Todo' },
	{ status: 'inProgress', label: 'In Progress' },
	{ status: 'done', label: 'Done' },
	{ status: 'cancelled', label: 'Cancelled' },
	{ status: 'other', label: 'Other' },
];

const PRIORITY_LABEL: Record<Priority, string> = {
	highest: 'Highest',
	high: 'High',
	medium: 'Medium',
	low: 'Low',
	lowest: 'Lowest',
};

/** One task row. A <div role=button> (not <button>) avoids theme button chrome. */
export function renderTaskRow<T extends ExtractedTask>(
	doc: Document,
	task: T,
	handlers: TaskViewHandlers<T>,
	options?: { sourceLabel?: string; sourceTitle?: string }
): HTMLElement {
	const row = doc.createElement('div');
	row.className = 'wayfinder-task-row';

	const checkbox = doc.createElement('input');
	checkbox.type = 'checkbox';
	checkbox.className = 'wayfinder-task-checkbox';
	checkbox.checked = task.status === 'done';
	checkbox.addEventListener('click', () => handlers.onToggle(task));

	// A <div> (not <button>) so it inherits none of the theme's button chrome;
	// role + tabindex + key handler keep it keyboard-operable.
	const textEl = doc.createElement('div');
	textEl.className = 'wayfinder-task-text';
	textEl.setAttribute('role', 'button');
	textEl.setAttribute('tabindex', '0');
	textEl.textContent = task.text;
	textEl.addEventListener('click', () => handlers.onJump(task));
	textEl.addEventListener('keydown', (ev) => {
		if (ev.key === 'Enter' || ev.key === ' ') {
			ev.preventDefault();
			handlers.onJump(task);
		}
	});

	row.append(checkbox, textEl);

	if (task.priority) {
		const chip = doc.createElement('span');
		chip.className = 'wayfinder-task-chip wayfinder-task-priority';
		chip.textContent = PRIORITY_LABEL[task.priority];
		row.append(chip);
	}
	if (task.due) {
		const chip = doc.createElement('span');
		chip.className = 'wayfinder-task-chip wayfinder-task-due';
		chip.textContent = task.due;
		row.append(chip);
	}
	if (options?.sourceLabel) {
		const chip = doc.createElement('span');
		chip.className = 'wayfinder-task-chip wayfinder-task-source';
		chip.textContent = options.sourceLabel;
		if (options.sourceTitle) chip.setAttribute('title', options.sourceTitle);
		row.append(chip);
	}
	return row;
}

function groupHeader(doc: Document, label: string, count: number): HTMLElement {
	const header = doc.createElement('div');
	header.className = 'wayfinder-task-group-header';
	const labelEl = doc.createElement('span');
	labelEl.className = 'wayfinder-task-group-label';
	labelEl.textContent = label;
	const countEl = doc.createElement('span');
	countEl.className = 'wayfinder-task-group-count';
	countEl.textContent = String(count);
	header.append(labelEl, countEl);
	return header;
}

/** Replace `container` with the tasks grouped by status (current-note sidebar). */
export function renderTaskList(
	container: HTMLElement,
	tasks: readonly ExtractedTask[],
	handlers: TaskViewHandlers
): void {
	const doc = container.ownerDocument;
	container.replaceChildren();
	for (const { status, label } of GROUP_ORDER) {
		const inGroup = tasks.filter((t) => t.status === status);
		if (inGroup.length === 0) continue;
		const group = doc.createElement('div');
		group.className = 'wayfinder-task-group';
		group.append(groupHeader(doc, label, inGroup.length));
		for (const task of inGroup) group.append(renderTaskRow(doc, task, handlers));
		container.append(group);
	}
}

function basename(path: string): string {
	const parts = path.split('/');
	return parts[parts.length - 1] ?? path;
}

/** Replace `container` with pre-built groups (global pane). */
export function renderGroupedTasks<T extends ExtractedTask>(
	container: HTMLElement,
	groups: readonly RenderGroup<T>[],
	handlers: TaskViewHandlers<T>,
	options?: { showSource?: boolean }
): void {
	const doc = container.ownerDocument;
	container.replaceChildren();
	for (const g of groups) {
		const group = doc.createElement('div');
		group.className = 'wayfinder-task-group';
		group.append(groupHeader(doc, g.label, g.count));
		for (const task of g.tasks) {
			const path = (task as ExtractedTask & { path?: string }).path;
			const opts =
				options?.showSource && path
					? { sourceLabel: basename(path), sourceTitle: path }
					: undefined;
			group.append(renderTaskRow(doc, task, handlers, opts));
		}
		container.append(group);
	}
}
