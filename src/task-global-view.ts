import { ItemView, MarkdownView, Notice, TFile, TFolder, WorkspaceLeaf } from 'obsidian';
import type WayfinderPlugin from './main';
import { extractTasks, type ExtractedTask, type IndexedTask, type TaskStatus } from './task-extract';
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
	private scopeMode: 'vault' | 'folder' | 'note' = 'vault';
	private grouping: Grouping = 'note';
	private sort: Sort = 'due';
	private statusMode: 'open' | 'done' | 'all' = 'open';
	private minPriority: Filters['minPriority'] = undefined;
	private due: DueFilter = 'any';
	private text = '';
	private pathScope = '';
	private limit = PAGE;

	// Pane-local overlay: the active editor's live (possibly unsaved) tasks,
	// substituted for that note only at render time. The shared index stays
	// persisted-only; this never writes into it.
	private overlay: { path: string; tasks: readonly ExtractedTask[] } | null = null;
	private editorDebounce: number | null = null;

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

		const ws = this.plugin.app.workspace;
		this.registerEvent(ws.on('active-leaf-change', () => this.onActiveChange()));
		this.registerEvent(ws.on('file-open', () => this.onActiveChange()));
		this.registerEvent(ws.on('editor-change', () => this.scheduleOverlayRefresh()));
		// A save reconciles persisted content, so drop the overlay for that note.
		this.registerEvent(
			this.plugin.app.vault.on('modify', (f) => {
				if (this.overlay && f.path === this.overlay.path) {
					this.overlay = null;
					this.render();
				}
			})
		);
		this.armMidnightTimer();
	}

	async onClose(): Promise<void> {
		this.unsubscribe?.();
		this.unsubscribe = null;
		if (this.midnightTimer !== null) window.clearTimeout(this.midnightTimer);
		if (this.textDebounce !== null) window.clearTimeout(this.textDebounce);
		if (this.editorDebounce !== null) window.clearTimeout(this.editorDebounce);
	}

	/** The active Markdown note, or null. Falls back to the last active file so
	 *  it still resolves when the pane itself holds focus (getActiveViewOfType
	 *  returns null then). */
	private activeMdFile(): TFile | null {
		const ws = this.plugin.app.workspace;
		const f = ws.getActiveViewOfType(MarkdownView)?.file ?? ws.getActiveFile();
		return f && f.extension === 'md' ? f : null;
	}

	private onActiveChange(): void {
		// In note/folder scope the target follows the active note; re-render.
		if (this.scopeMode !== 'vault') this.render();
	}

	private scheduleOverlayRefresh(): void {
		if (this.editorDebounce !== null) window.clearTimeout(this.editorDebounce);
		this.editorDebounce = window.setTimeout(() => this.refreshOverlay(), 150);
	}

	private refreshOverlay(): void {
		const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
		const file = view?.file;
		if (!view || !file || file.extension !== 'md') return;
		this.overlay = { path: file.path, tasks: extractTasks(view.editor.getValue()) };
		this.render();
	}

	/** Snapshot tasks with the active editor's live tasks substituted for its note. */
	private effectiveTasks(): readonly IndexedTask[] {
		if (!this.overlay) return this.snap.tasks;
		const path = this.overlay.path;
		const others = this.snap.tasks.filter((t) => t.path !== path);
		const overlaid = this.overlay.tasks.map((t) => ({ ...t, path }));
		return [...others, ...overlaid];
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

		const scopeMode = root.createEl('select', { cls: 'wayfinder-global-scope' });
		for (const [val, label] of [
			['vault', 'Scope: Vault'],
			['folder', 'Scope: This folder'],
			['note', 'Scope: This note'],
		] as const) {
			scopeMode.createEl('option', { value: val, text: label });
		}
		scopeMode.addEventListener('change', () => {
			this.scopeMode = scopeMode.value as 'vault' | 'folder' | 'note';
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

		const scope = panel.createEl('select');
		scope.createEl('option', { value: '', text: 'Folder: All' });
		const folders = this.plugin.app.vault
			.getAllLoadedFiles()
			.filter((f): f is TFolder => f instanceof TFolder && f.path !== '/')
			.map((f) => f.path)
			.sort((a, b) => a.localeCompare(b));
		for (const path of folders) scope.createEl('option', { value: path, text: `Folder: ${path}` });
		scope.addEventListener('change', () => {
			this.pathScope = scope.value;
			this.resetLimit();
			this.render();
		});
	}

	private render(): void {
		// Guard on existence, NOT isConnected: the first paint during onOpen can run
		// before the container attaches to the DOM; writing into listEl is still
		// correct (it shows when it attaches). onClose unsubscribes + clears timers,
		// so no render is triggered after close.
		if (!this.listEl) return;
		if (this.snap.state === 'indexing') {
			this.listEl.replaceChildren();
			this.listEl.createDiv({ cls: 'wayfinder-task-empty', text: 'Indexing…' });
			this.footerEl.replaceChildren();
			return;
		}

		let pathScope = this.pathScope;
		if (this.scopeMode !== 'vault') {
			const active = this.activeMdFile();
			if (!active) {
				this.listEl.replaceChildren();
				this.listEl.createDiv({ cls: 'wayfinder-task-empty', text: 'No note open.' });
				this.footerEl.replaceChildren();
				return;
			}
			if (this.scopeMode === 'note') {
				// An exact file path is a folder-boundary match for only that file.
				pathScope = active.path;
			} else {
				// Folder scope: the active note's folder (root → whole vault).
				const folder = active.parent?.path ?? '';
				pathScope = folder === '/' ? '' : folder;
			}
		}

		const filters: Filters = {
			pathScope,
			statuses: this.statuses(),
			minPriority: this.minPriority,
			due: this.due,
			text: this.text,
		};
		const view = deriveView(
			this.effectiveTasks(),
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
			onRecurring: (t) => {
				new Notice('Recurring task: complete it in the note to create the next occurrence.');
				void this.jump(t);
			},
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
				// If this note has a live overlay (open, unsaved editor), rebuild it
				// from the buffer we just wrote so the row reflects the toggle now.
				if (editorView && this.overlay?.path === task.path) {
					this.overlay = { path: task.path, tasks: extractTasks(editorView.editor.getValue()) };
				}
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
