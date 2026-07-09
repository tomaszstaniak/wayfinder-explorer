import type { ExtractedTask, TaskStatus } from './task-extract';
import type { Priority } from './task-parser';

export interface TaskViewHandlers {
	onToggle(task: ExtractedTask): void;
	onJump(task: ExtractedTask): void;
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

/** Replace `container` with the tasks grouped by status. Standard DOM only. */
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

		const header = doc.createElement('div');
		header.className = 'wayfinder-task-group-header';
		const labelEl = doc.createElement('span');
		labelEl.className = 'wayfinder-task-group-label';
		labelEl.textContent = label;
		const countEl = doc.createElement('span');
		countEl.className = 'wayfinder-task-group-count';
		countEl.textContent = String(inGroup.length);
		header.append(labelEl, countEl);
		group.append(header);

		for (const task of inGroup) {
			group.append(renderRow(doc, task, handlers));
		}
		container.append(group);
	}
}

function renderRow(
	doc: Document,
	task: ExtractedTask,
	handlers: TaskViewHandlers
): HTMLElement {
	const row = doc.createElement('div');
	row.className = 'wayfinder-task-row';

	const checkbox = doc.createElement('input');
	checkbox.type = 'checkbox';
	checkbox.className = 'wayfinder-task-checkbox';
	checkbox.checked = task.status === 'done';
	checkbox.addEventListener('click', () => handlers.onToggle(task));

	const textEl = doc.createElement('button');
	textEl.type = 'button';
	textEl.className = 'wayfinder-task-text';
	textEl.textContent = task.text;
	textEl.addEventListener('click', () => handlers.onJump(task));

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
	return row;
}
