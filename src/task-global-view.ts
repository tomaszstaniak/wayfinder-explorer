import { ItemView, Notice, TFile, WorkspaceLeaf } from 'obsidian';
import type WayfinderPlugin from './main';
import type { IndexedTask, TaskStatus } from './task-extract';
import type { TaskSnapshot, TaskIndex } from './task-index';
import {
	deriveView,
	OPEN_STATUSES,
	type Filters,
	type Grouping,
	type Sort,
	type DueFilter,
} from './task-filter';
import { renderGroupedTasks, type RenderGroup, type TaskViewHandlers } from './task-view';
import { toggleTaskStatus, type ToggleEnv } from './task-actions';
import { nextStatusChar } from './task-write';
import { markdownViewForPath, openTaskLocation } from './task-obsidian';
import { localToday, msUntilNextLocalMidnight } from './task-dates';

export const VIEW_TYPE_GLOBAL_TASKS = 'wayfinder-global-tasks';

const INCLUDE_DONE: ReadonlySet<TaskStatus> = new Set<TaskStatus>([
	'todo',
	'inProgress',
	'other',
	'done',
]);
const ALL_STATUSES: ReadonlySet<TaskStatus> = new Set<TaskStatus>([
	'todo',
	'inProgress',
	'done',
	'cancelled',
	'other',
]);

const PAGE = 200;

export class WayfinderGlobalTasksView extends ItemView {
	private listEl!: HTMLElement;
	private footerEl!: HTMLElement;
	private snap: TaskSnapshot = { state: 'idle', tasks: [] };
	private unsubscribe: (() => void) | null = null;
	private midnightTimer: number | null = null;
	private textDebounce: number | null = null;

	// UI state
	private grouping: Grouping = 'note';
	private sort: Sort = 'due';
	private statusMode: 'open' | 'done' | 'all' = 'open';
	private minPriority: Filters['minPriority'] = undefined;
	private due: DueFilter = 'any';
	private text = '';
	private pathScope = '';
	private limit = PAGE;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly plugin: WayfinderPlugin,
		private readonly index: TaskIndex
	) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_GLOBAL_TASKS;
	}
	getDisplayText(): string {
		return 'Vault tasks';
	}
	getIcon(): string {
		return 'list-checks';
	}

	async onOpen(): Promise<void> {
		this.contentEl.addClass('wayfinder-global-tasks');
		this.buildHeader(this.contentEl.createDiv({ cls: 'wayfinder-global-header' }));
		this.listEl = this.contentEl.createDiv({ cls: 'wayfinder-task-list' });
		this.footerEl = this.contentEl.createDiv({ cls: 'wayfinder-global-footer' });

		this.unsubscribe = this.index.subscribe((s) => {
			this.snap = s;
			this.render();
		});
		this.armMidnightTimer();
	}

	async onClose(): Promise<void> {
		this.unsubscribe?.();
		this.unsubscribe = null;
		if (this.midnightTimer !== null) window.clearTimeout(this.midnightTimer);
		if (this.textDebounce !== null) window.clearTimeout(this.textDebounce);
	}

	private armMidnightTimer(): void {
		if (this.midnightTimer !== null) window.clearTimeout(this.midnightTimer);
		this.midnightTimer = window.setTimeout(
			() => {
				this.render();
				this.armMidnightTimer();
			},
			msUntilNextLocalMidnight(new Date()) + 1000
		);
	}

	private statuses(): ReadonlySet<TaskStatus> {
		return this.statusMode === 'all'
			? ALL_STATUSES
			: this.statusMode === 'done'
				? INCLUDE_DONE
				: OPEN_STATUSES;
	}

	private resetLimit(): void {
		this.limit = PAGE;
	}

	private buildHeader(root: HTMLElement): void {
		const search = root.createEl('input', {
			cls: 'wayfinder-global-search',
			attr: { type: 'search', placeholder: 'Search tasks…' },
		});
		search.addEventListener('input', () => {
			if (this.textDebounce !== null) window.clearTimeout(this.textDebounce);
			this.textDebounce = window.setTimeout(() => {
				this.text = search.value;
				this.resetLimit();
				this.render();
			}, 120);
		});

		const grouping = root.createEl('select', { cls: 'wayfinder-global-grouping' });
		for (const [val, label] of [
			['note', 'Group: Note'],
			['due', 'Group: Due'],
			['priority', 'Group: Priority'],
			['status', 'Group: Status'],
		] as const) {
			grouping.createEl('option', { value: val, text: label });
		}
		grouping.addEventListener('change', () => {
			this.grouping = grouping.value as Grouping;
			this.resetLimit();
			this.render();
		});

		const filterBtn = root.createEl('button', {
			cls: 'wayfinder-global-filter-toggle',
			text: 'Filters',
		});
		const panel = root.createDiv({ cls: 'wayfinder-global-filter-panel' });
		panel.hide();
		filterBtn.addEventListener('click', () => (panel.isShown() ? panel.hide() : panel.show()));

		const sort = panel.createEl('select');
		for (const [val, label] of [
			['due', 'Sort: Due'],
			['priority', 'Sort: Priority'],
		] as const) {
			sort.createEl('option', { value: val, text: label });
		}
		sort.addEventListener('change', () => {
			this.sort = sort.value as Sort;
			this.resetLimit();
			this.render();
		});

		const status = panel.createEl('select');
		for (const [val, label] of [
			['open', 'Status: Open'],
			['done', 'Status: Include done'],
			['all', 'Status: All'],
		] as const) {
			status.createEl('option', { value: val, text: label });
		}
		status.addEventListener('change', () => {
			this.statusMode = status.value as 'open' | 'done' | 'all';
			this.resetLimit();
			this.render();
		});

		const priority = panel.createEl('select');
		for (const [val, label] of [
			['', 'Priority: Any'],
			['highest', '≥ Highest'],
			['high', '≥ High'],
			['medium', '≥ Medium'],
			['low', '≥ Low'],
			['lowest', '≥ Lowest'],
		] as const) {
			priority.createEl('option', { value: val, text: label });
		}
		priority.addEventListener('change', () => {
			this.minPriority = (priority.value || undefined) as Filters['minPriority'];
			this.resetLimit();
			this.render();
		});

		const due = panel.createEl('select');
		for (const [val, label] of [
			['any', 'Due: Any'],
			['overdue', 'Due: Overdue'],
			['today', 'Due: Today'],
			['next7', 'Due: Next 7 days'],
			['hasDate', 'Due: Has date'],
			['noDate', 'Due: No date'],
		] as const) {
			due.createEl('option', { value: val, text: label });
		}
		due.addEventListener('change', () => {
			this.due = due.value as DueFilter;
			this.resetLimit();
			this.render();
		});

		const scope = panel.createEl('input', {
			attr: { type: 'text', placeholder: 'Path scope (folder)' },
		});
		scope.addEventListener('change', () => {
			this.pathScope = scope.value;
			this.resetLimit();
			this.render();
		});
		panel.createEl('button', { text: 'This folder' }).addEventListener('click', () => {
			const f = this.plugin.app.workspace.getActiveFile();
			const folder = f?.parent?.path ?? '';
			scope.value = folder === '/' ? '' : folder;
			this.pathScope = scope.value;
			this.resetLimit();
			this.render();
		});
	}

	private render(): void {
		if (!this.listEl?.isConnected) return;
		if (this.snap.state === 'indexing') {
			this.listEl.replaceChildren();
			this.listEl.createDiv({ cls: 'wayfinder-task-empty', text: 'Indexing…' });
			this.footerEl.replaceChildren();
			return;
		}
		const filters: Filters = {
			pathScope: this.pathScope,
			statuses: this.statuses(),
			minPriority: this.minPriority,
			due: this.due,
			text: this.text,
		};
		const view = deriveView(
			this.snap.tasks,
			{ filters, grouping: this.grouping, sort: this.sort, limit: this.limit },
			localToday(new Date())
		);

		if (view.total === 0) {
			this.listEl.replaceChildren();
			this.listEl.createDiv({ cls: 'wayfinder-task-empty', text: 'No matching tasks.' });
			this.footerEl.replaceChildren();
			return;
		}

		const handlers: TaskViewHandlers<IndexedTask> = {
			onToggle: (t) => void this.toggle(t),
			onJump: (t) => void this.jump(t),
		};
		const groups: RenderGroup<IndexedTask>[] = view.groups.map((g) => ({
			key: g.key,
			label: g.label,
			count: g.visibleCount,
			tasks: g.tasks,
		}));
		renderGroupedTasks(this.listEl, groups, handlers, { showSource: this.grouping !== 'note' });

		this.footerEl.replaceChildren();
		this.footerEl.createSpan({ text: `Showing ${view.shown} of ${view.total} tasks` });
		if (view.shown < view.total) {
			const more = this.footerEl.createEl('button', { text: 'Show more' });
			more.addEventListener('click', () => {
				this.limit += PAGE;
				this.render();
			});
		}
	}

	private async toggle(task: IndexedTask): Promise<void> {
		const file = this.plugin.app.vault.getAbstractFileByPath(task.path);
		if (!(file instanceof TFile)) return;
		const editorView = markdownViewForPath(this.plugin.app, task.path);
		const editor = editorView?.editor ?? null;
		const env: ToggleEnv = {
			editor: editor
				? {
						getLine: (line) =>
							line >= 0 && line < editor.lineCount() ? editor.getLine(line) : null,
						replaceRange: (line, s, e, text) =>
							editor.replaceRange(text, { line, ch: s }, { line, ch: e }),
					}
				: null,
			disk: {
				process: async (transform) => {
					const abort = new Error('wayfinder-task-abort');
					try {
						await this.plugin.app.vault.process(file, (content) => {
							const next = transform(content);
							if (next === null) throw abort;
							return next;
						});
						return 'wrote';
					} catch (error) {
						if (error === abort) return 'aborted';
						throw error instanceof Error ? error : new Error(String(error));
					}
				},
			},
			notify: () => {}, // pane owns messaging below
		};
		try {
			const outcome = await toggleTaskStatus(env, task);
			if (outcome !== 'aborted') {
				this.index.patchTaskStatus(task.path, task, nextStatusChar(task.statusChar));
			} else if (editorView) {
				new Notice('Task differs from the open editor; save the note and retry.');
			} else {
				await this.index.updateFile(task.path); // disk changed under us; self-heal
			}
		} catch (err) {
			console.error('[wayfinder] task toggle failed', err);
			new Notice('Could not toggle the task; see console.');
		}
		this.render();
	}

	private async jump(task: IndexedTask): Promise<void> {
		const file = this.plugin.app.vault.getAbstractFileByPath(task.path);
		if (file instanceof TFile) await openTaskLocation(this.plugin.app, file, task.line);
	}
}
